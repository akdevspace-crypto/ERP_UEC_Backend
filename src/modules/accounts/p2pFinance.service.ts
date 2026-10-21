import { randomUUID } from 'crypto';
import { prisma } from '../../app/prisma.js';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';

export interface ChartOfAccountDef {
    code: string;
    name: string;
    accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    normalBalance: 'DEBIT' | 'CREDIT';
    description: string;
}

export const STANDARD_CHART_OF_ACCOUNTS: ChartOfAccountDef[] = [
    { code: '1010', name: 'Cash & Bank Account', accountType: 'ASSET', normalBalance: 'DEBIT', description: 'Primary liquid bank and cash operating account' },
    { code: '1300', name: 'Medical Inventory Asset', accountType: 'ASSET', normalBalance: 'DEBIT', description: 'On-hand physical medical products and pharmaceuticals' },
    { code: '1310', name: 'Food & Ration Inventory Asset', accountType: 'ASSET', normalBalance: 'DEBIT', description: 'On-hand physical food, kitchen supplies, and rations' },
    { code: '1400', name: 'Input Tax / GST Asset', accountType: 'ASSET', normalBalance: 'DEBIT', description: 'Recoverable input goods and services tax on supplier purchases' },
    { code: '2000', name: 'Trade Accounts Payable', accountType: 'LIABILITY', normalBalance: 'CREDIT', description: 'Approved supplier invoice liabilities due for payment' },
    { code: '2100', name: 'GRNI Accrued Liability', accountType: 'LIABILITY', normalBalance: 'CREDIT', description: 'Goods Received Not Invoiced clearing account' },
    { code: '5000', name: 'Cost of Medical Goods Issued', accountType: 'EXPENSE', normalBalance: 'DEBIT', description: 'Consumption expense for medical items issued to patients/care' },
    { code: '5010', name: 'Purchase Price Variance (PPV)', accountType: 'EXPENSE', normalBalance: 'DEBIT', description: 'Variance between agreed PO/GRN receipt cost and billed invoice price' },
    { code: '5020', name: 'Inventory Adjustment Variance', accountType: 'EXPENSE', normalBalance: 'DEBIT', description: 'Gain or loss recognized from physical cycle count discrepancies' }
];

export interface JournalLineInput {
    accountCode: string;
    debit?: number;
    credit?: number;
    description?: string;
}

export interface PostJournalEntryInput {
    entryNumber?: string;
    entryDate?: Date | string;
    sourceModule: string;
    sourceReference: string;
    description: string;
    lines: JournalLineInput[];
    idempotencyKey?: string;
    tenantId: string;
    unitId: string;
    createdById?: string;
}

export class P2PFinanceService {
    private client: any;

    constructor(customClient?: any) {
        this.client = customClient || prisma;
    }

    private getDb(tx?: any) {
        return tx || this.client;
    }

    /**
     * Initializes or verifies the standard hospital Chart of Accounts for a tenant.
     * Returns a dictionary of accountCode -> GLAccount record.
     */
    async ensureStandardChartOfAccounts(tenantId: string, unitId?: string, tx?: any): Promise<Map<string, any>> {
        const db = this.getDb(tx);
        const accountMap = new Map<string, any>();

        const existing = await db.gLAccount.findMany({
            where: { tenantId }
        });

        existing.forEach((acc: any) => {
            accountMap.set(acc.code, acc);
        });

        for (const def of STANDARD_CHART_OF_ACCOUNTS) {
            if (!accountMap.has(def.code)) {
                const created = await db.gLAccount.create({
                    data: {
                        id: randomUUID(),
                        code: def.code,
                        name: def.name,
                        accountType: def.accountType,
                        normalBalance: def.normalBalance,
                        description: def.description,
                        isActive: true,
                        tenantId,
                        unitId: unitId || null
                    }
                });
                accountMap.set(def.code, created);
            }
        }

        return accountMap;
    }

    /**
     * Posts a strictly balanced, idempotent Double-Entry General Ledger journal entry.
     */
    async postJournalEntry(input: PostJournalEntryInput, tx?: any): Promise<any> {
        const db = this.getDb(tx);

        if (!input.tenantId) {
            throw new Error('Tenant context is required for GL journal posting');
        }

        // 1. Idempotency Check
        if (input.idempotencyKey) {
            const existing = await db.journalEntry.findFirst({
                where: {
                    idempotencyKey: input.idempotencyKey,
                    tenantId: input.tenantId
                },
                include: { lines: { include: { account: true } } }
            });
            if (existing) {
                return existing;
            }
        }

        if (!input.lines || input.lines.length < 2) {
            throw new Error('A journal entry must contain at least two line items (debit and credit)');
        }

        // 2. Resolve Chart of Accounts
        const accountMap = await this.ensureStandardChartOfAccounts(input.tenantId, input.unitId, db);

        let totalDebit = 0;
        let totalCredit = 0;
        const validatedLines: any[] = [];

        for (const line of input.lines) {
            const account = accountMap.get(line.accountCode);
            if (!account) {
                throw new Error(`Chart of Accounts code '${line.accountCode}' not found`);
            }

            const debit = Math.round((Number(line.debit) || 0) * 100) / 100;
            const credit = Math.round((Number(line.credit) || 0) * 100) / 100;

            if (debit < 0 || credit < 0) {
                throw new Error('Debit and credit amounts must be non-negative');
            }
            if (debit > 0 && credit > 0) {
                throw new Error('A journal line cannot contain both debit and credit amounts simultaneously');
            }
            if (debit === 0 && credit === 0) {
                continue; // Skip zero line
            }

            totalDebit += debit;
            totalCredit += credit;

            validatedLines.push({
                id: randomUUID(),
                accountId: account.id,
                debit,
                credit,
                description: line.description || input.description,
                tenantId: input.tenantId,
                unitId: input.unitId
            });
        }

        totalDebit = Math.round(totalDebit * 100) / 100;
        totalCredit = Math.round(totalCredit * 100) / 100;

        // 3. Strict Balancing Invariant Assertion
        if (Math.abs(totalDebit - totalCredit) > 0.001) {
            throw new Error(`Journal entry does not balance: Total Debits (${totalDebit.toFixed(2)}) must equal Total Credits (${totalCredit.toFixed(2)})`);
        }

        // 4. Generate entryNumber if needed
        let entryNumber = input.entryNumber;
        if (!entryNumber) {
            try {
                entryNumber = await generateRefNumber('JE', input.tenantId, input.unitId);
            } catch {
                entryNumber = `JE-${Date.now().toString().slice(-6)}`;
            }
        }

        // 5. Atomic Creation
        return await db.journalEntry.create({
            data: {
                id: randomUUID(),
                entryNumber,
                entryDate: input.entryDate ? new Date(input.entryDate) : new Date(),
                sourceModule: input.sourceModule,
                sourceReference: input.sourceReference,
                description: input.description,
                status: 'POSTED',
                isReversed: false,
                idempotencyKey: input.idempotencyKey || null,
                tenantId: input.tenantId,
                unitId: input.unitId,
                createdById: input.createdById || null,
                lines: {
                    create: validatedLines
                }
            },
            include: {
                lines: {
                    include: { account: true }
                }
            }
        });
    }

    /**
     * Reverses a posted journal entry with balanced offsetting lines.
     */
    async reverseJournalEntry(entryId: string, reason: string, scope: { tenantId: string; unitId: string }, user: any, tx?: any): Promise<any> {
        const db = this.getDb(tx);

        const original = await db.journalEntry.findFirst({
            where: {
                id: entryId,
                tenantId: scope.tenantId
            },
            include: {
                lines: {
                    include: { account: true }
                }
            }
        });

        if (!original) {
            throw new Error(`Journal entry '${entryId}' not found`);
        }
        if (original.isReversed) {
            throw new Error(`Journal entry '${original.entryNumber}' has already been reversed`);
        }

        const reversalLines: JournalLineInput[] = original.lines.map((line: any) => ({
            accountCode: line.account.code,
            debit: line.credit, // Swap credit to debit
            credit: line.debit, // Swap debit to credit
            description: `Reversal: ${line.description || original.description}`
        }));

        let reversalEntryNumber: string;
        try {
            reversalEntryNumber = await generateRefNumber('REV', scope.tenantId, scope.unitId);
        } catch {
            reversalEntryNumber = `REV-${Date.now().toString().slice(-6)}`;
        }

        const reversalEntry = await this.postJournalEntry({
            entryNumber: reversalEntryNumber,
            sourceModule: original.sourceModule,
            sourceReference: original.sourceReference,
            description: `Reversal of ${original.entryNumber}: ${reason}`,
            lines: reversalLines,
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            createdById: user?.id,
            idempotencyKey: `REV-${original.id}`
        }, db);

        await db.journalEntry.update({
            where: { id: original.id },
            data: {
                isReversed: true,
                reversalOfId: reversalEntry.id
            }
        });

        return reversalEntry;
    }

    /**
     * Creates a Vendor Bill (Supplier Invoice) with Three-Way Matching against PO and GRN.
     */
    async createVendorBill(payload: any, scope: { tenantId: string; unitId: string }, user: any, tx?: any): Promise<any> {
        const db = this.getDb(tx);
        if (!await this.checkP2PTablesExist(db)) {
            throw new Error('P2P_MIGRATION_PENDING: Cannot create Vendor Bill until database migration 20261104000000_p2p_costing_ap_gl is deployed.');
        }

        if (!payload.vendorId) throw new Error('Vendor ID is required');
        if (!payload.billNumber || !String(payload.billNumber).trim()) throw new Error('Bill / Invoice Number is required');
        if (!Array.isArray(payload.items) || payload.items.length === 0) throw new Error('Bill must contain at least one line item');

        const billNumber = String(payload.billNumber).trim();

        // 1. Idempotency / Duplicate Check
        const existingBill = await db.vendorBill.findFirst({
            where: {
                billNumber,
                tenantId: scope.tenantId,
                isDeleted: false
            }
        });
        if (existingBill) {
            if (payload.idempotencyKey && existingBill.idempotencyKey === payload.idempotencyKey) {
                return existingBill;
            }
            throw new Error(`Duplicate bill error: Invoice number '${billNumber}' already exists for this vendor/tenant`);
        }

        // 2. Verify Vendor
        const vendor = await db.vendor.findFirst({
            where: { id: payload.vendorId, tenantId: scope.tenantId, isDeleted: false }
        });
        if (!vendor) {
            throw new Error(`Vendor '${payload.vendorId}' not found`);
        }

        // 3. Three-Way Matching against Goods Receipt Note (GRN)
        let grn: any = null;
        if (payload.goodsReceiptNoteId) {
            grn = await db.goodsReceiptNote.findFirst({
                where: {
                    id: payload.goodsReceiptNoteId,
                    tenantId: scope.tenantId,
                    isDeleted: false
                },
                include: { items: true }
            });
            if (!grn) {
                throw new Error(`Goods Receipt Note '${payload.goodsReceiptNoteId}' not found`);
            }
            if (grn.vendorId !== vendor.id) {
                throw new Error(`Vendor mismatch: GRN '${grn.grnNumber}' belongs to another vendor`);
            }
        }

        // 4. Validate Line Items and calculate totals
        let subtotal = 0;
        let taxAmount = 0;
        const billItemsData: any[] = [];

        for (const item of payload.items) {
            const qty = Number(item.quantity);
            const unitPrice = Number(item.unitPrice);
            const taxRate = Number(item.taxRate || 0);

            if (!Number.isInteger(qty) || qty <= 0) {
                throw new Error('Line item quantity must be a positive integer');
            }
            if (isNaN(unitPrice) || unitPrice < 0) {
                throw new Error('Line item unit price must be a non-negative number');
            }

            // Matching check against GRN item if provided
            if (grn) {
                const grnItem = grn.items.find((gi: any) =>
                    gi.id === item.goodsReceiptItemId ||
                    gi.productId === item.productId
                );
                if (!grnItem) {
                    throw new Error(`Product '${item.productId}' was not received on GRN '${grn.grnNumber}'`);
                }

                const acceptedQty = grnItem.receivedQuantity - (grnItem.rejectedQuantity || 0);

                // Check prior billed quantity across existing bills for this GRN item
                const priorBilled = await db.vendorBillItem.aggregate({
                    where: {
                        goodsReceiptItemId: grnItem.id,
                        tenantId: scope.tenantId,
                        vendorBill: { isDeleted: false, status: { not: 'CANCELLED' } }
                    },
                    _sum: { quantity: true }
                });
                const totalBilledSoFar = priorBilled._sum.quantity || 0;
                const remainingBilledQty = acceptedQty - totalBilledSoFar;

                if (qty > remainingBilledQty) {
                    throw new Error(`Billed quantity (${qty}) exceeds remaining unbilled GRN accepted quantity (${remainingBilledQty}) for product '${item.productId}'`);
                }
            }

            const lineTotalBeforeTax = Math.round(qty * unitPrice * 100) / 100;
            const lineTax = Math.round(lineTotalBeforeTax * (taxRate / 100) * 100) / 100;
            const lineTotal = Math.round((lineTotalBeforeTax + lineTax) * 100) / 100;

            subtotal += lineTotalBeforeTax;
            taxAmount += lineTax;

            billItemsData.push({
                id: randomUUID(),
                productId: item.productId,
                goodsReceiptItemId: item.goodsReceiptItemId || null,
                quantity: qty,
                unitPrice,
                taxRate,
                taxAmount: lineTax,
                totalAmount: lineTotal,
                tenantId: scope.tenantId,
                unitId: scope.unitId
            });
        }

        const discountAmount = Math.max(0, Number(payload.discountAmount || 0));
        const totalAmount = Math.round((subtotal + taxAmount - discountAmount) * 100) / 100;

        return await db.vendorBill.create({
            data: {
                id: randomUUID(),
                billNumber,
                vendorId: vendor.id,
                purchaseOrderId: payload.purchaseOrderId || grn?.purchaseOrderId || null,
                goodsReceiptNoteId: grn?.id || null,
                billDate: payload.billDate ? new Date(payload.billDate) : new Date(),
                dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
                status: 'PENDING_APPROVAL',
                subtotal: Math.round(subtotal * 100) / 100,
                taxAmount: Math.round(taxAmount * 100) / 100,
                discountAmount,
                totalAmount,
                paidAmount: 0,
                balanceAmount: totalAmount,
                notes: payload.notes || null,
                idempotencyKey: payload.idempotencyKey || null,
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                items: {
                    create: billItemsData
                }
            },
            include: {
                items: true,
                vendor: true
            }
        });
    }

    /**
     * Approves a Vendor Bill, posting the liability to General Ledger and creating an AccountTransaction voucher.
     */
    async approveVendorBill(billId: string, scope: { tenantId: string; unitId: string }, user: any, tx?: any): Promise<any> {
        const db = this.getDb(tx);
        if (!await this.checkP2PTablesExist(db)) {
            throw new Error('P2P_MIGRATION_PENDING: Cannot approve Vendor Bill until database migration 20261104000000_p2p_costing_ap_gl is deployed.');
        }

        const bill = await db.vendorBill.findFirst({
            where: {
                id: billId,
                tenantId: scope.tenantId,
                isDeleted: false
            },
            include: {
                items: true,
                vendor: true
            }
        });

        if (!bill) {
            throw new Error(`Vendor bill '${billId}' not found`);
        }
        if (bill.status !== 'PENDING_APPROVAL' && bill.status !== 'DRAFT') {
            throw new Error(`Bill '${bill.billNumber}' cannot be approved because status is '${bill.status}'`);
        }

        // 1. Post General Ledger Entry
        // Postings:
        // Debit: 2100 GRNI Accrued Liability (Subtotal)
        // Debit: 1400 Input Tax / GST Asset (Tax Amount)
        // Credit: 2000 Trade Accounts Payable (Total Amount)
        const glLines: JournalLineInput[] = [];

        if (bill.subtotal > 0) {
            glLines.push({
                accountCode: '2100',
                debit: bill.subtotal,
                description: `GRNI clearance for Bill ${bill.billNumber}`
            });
        }
        if (bill.taxAmount > 0) {
            glLines.push({
                accountCode: '1400',
                debit: bill.taxAmount,
                description: `Input Tax for Bill ${bill.billNumber}`
            });
        }
        if (bill.discountAmount > 0) {
            glLines.push({
                accountCode: '5010', // Discount variance credit
                credit: bill.discountAmount,
                description: `Supplier discount on Bill ${bill.billNumber}`
            });
        }

        glLines.push({
            accountCode: '2000',
            credit: bill.totalAmount,
            description: `Trade AP liability for Vendor ${bill.vendor.name} (Bill ${bill.billNumber})`
        });

        const je = await this.postJournalEntry({
            sourceModule: 'AP_BILL',
            sourceReference: bill.billNumber,
            description: `Supplier Bill ${bill.billNumber} from ${bill.vendor.name}`,
            lines: glLines,
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            createdById: user?.id,
            idempotencyKey: `JE-BILL-${bill.id}`
        }, db);

        // 2. Post AccountTransaction subledger voucher (type: EXPENSE, status: APPROVED)
        let refNo: string;
        try {
            refNo = await generateRefNumber('EXP', scope.tenantId, scope.unitId);
        } catch {
            refNo = `EXP-${Date.now().toString().slice(-6)}`;
        }

        const accountTx = await db.accountTransaction.create({
            data: {
                id: randomUUID(),
                refNo,
                type: 'EXPENSE',
                amount: -Math.abs(bill.totalAmount),
                paymentMode: 'Credit',
                category: 'Vendor Invoice',
                clientName: bill.vendor.name,
                status: 'APPROVED',
                notes: `Vendor Bill ${bill.billNumber}: ${bill.notes || 'Procurement payment liability'}`,
                metadata: {
                    vendorBillId: bill.id,
                    billNumber: bill.billNumber,
                    vendorId: bill.vendorId,
                    vendorName: bill.vendor.name,
                    journalEntryId: je.id,
                    isVendorBill: true
                },
                date: bill.billDate,
                tenantId: scope.tenantId,
                unitId: scope.unitId
            }
        });

        // 3. Update Bill status
        return await db.vendorBill.update({
            where: { id: bill.id },
            data: {
                status: 'APPROVED',
                accountTransactionId: accountTx.id
            },
            include: {
                items: true,
                vendor: true
            }
        });
    }

    /**
     * Records a payment against an approved Vendor Bill, posting to GL and updating outstanding balances.
     */
    async recordVendorBillPayment(billId: string, paymentData: any, scope: { tenantId: string; unitId: string }, user: any, tx?: any): Promise<any> {
        const db = this.getDb(tx);
        if (!await this.checkP2PTablesExist(db)) {
            throw new Error('P2P_MIGRATION_PENDING: Cannot record payment until database migration 20261104000000_p2p_costing_ap_gl is deployed.');
        }

        const bill = await db.vendorBill.findFirst({
            where: {
                id: billId,
                tenantId: scope.tenantId,
                isDeleted: false
            },
            include: { vendor: true }
        });

        if (!bill) {
            throw new Error(`Vendor bill '${billId}' not found`);
        }
        if (bill.status !== 'APPROVED' && bill.status !== 'PARTIALLY_PAID') {
            throw new Error(`Cannot record payment on bill in '${bill.status}' status. Bill must be APPROVED.`);
        }

        const paymentAmount = Math.round(Number(paymentData.amount) * 100) / 100;
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            throw new Error('Payment amount must be a positive number');
        }
        if (paymentAmount > bill.balanceAmount + 0.001) {
            throw new Error(`Payment amount (${paymentAmount.toFixed(2)}) exceeds outstanding balance (${bill.balanceAmount.toFixed(2)})`);
        }

        const newPaidAmount = Math.round((bill.paidAmount + paymentAmount) * 100) / 100;
        const newBalanceAmount = Math.max(0, Math.round((bill.totalAmount - newPaidAmount) * 100) / 100);
        const newStatus = newBalanceAmount <= 0.001 ? 'PAID' : 'PARTIALLY_PAID';

        // 1. Post General Ledger Payment Journal
        // Debit: 2000 Trade Accounts Payable (reduction in liability)
        // Credit: 1010 Cash & Bank Account (cash outflow)
        const paymentMode = paymentData.paymentMode || 'Bank Transfer';
        const paymentReference = paymentData.paymentReference || `PMT-${Date.now().toString().slice(-6)}`;

        const je = await this.postJournalEntry({
            sourceModule: 'AP_PAYMENT',
            sourceReference: paymentReference,
            description: `Payment of ${paymentAmount.toFixed(2)} to ${bill.vendor.name} for Bill ${bill.billNumber} via ${paymentMode}`,
            lines: [
                {
                    accountCode: '2000',
                    debit: paymentAmount,
                    description: `Settlement of AP for Bill ${bill.billNumber}`
                },
                {
                    accountCode: '1010',
                    credit: paymentAmount,
                    description: `Cash/Bank disbursement via ${paymentMode}`
                }
            ],
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            createdById: user?.id,
            idempotencyKey: paymentData.idempotencyKey || `JE-PMT-${bill.id}-${Date.now()}`
        }, db);

        // 2. Post AccountTransaction Cashbox entry
        let txRef: string;
        try {
            txRef = await generateRefNumber('EXP', scope.tenantId, scope.unitId);
        } catch {
            txRef = `EXP-${Date.now().toString().slice(-6)}`;
        }

        await db.accountTransaction.create({
            data: {
                id: randomUUID(),
                refNo: txRef,
                type: 'EXPENSE',
                amount: -paymentAmount,
                paymentMode,
                category: 'Vendor Payment',
                clientName: bill.vendor.name,
                status: 'POSTED',
                notes: `Vendor payment for ${bill.billNumber}: ${paymentData.notes || 'Settlement'}`,
                metadata: {
                    vendorBillId: bill.id,
                    billNumber: bill.billNumber,
                    vendorId: bill.vendorId,
                    paymentReference,
                    journalEntryId: je.id,
                    isBillPayment: true
                },
                date: paymentData.paymentDate ? new Date(paymentData.paymentDate) : new Date(),
                tenantId: scope.tenantId,
                unitId: scope.unitId
            }
        });

        // 3. Update VendorBill
        return await db.vendorBill.update({
            where: { id: bill.id },
            data: {
                paidAmount: newPaidAmount,
                balanceAmount: newBalanceAmount,
                status: newStatus
            },
            include: {
                items: true,
                vendor: true
            }
        });
    }

    /**
     * Posts a GRN Receipt Accrual Journal entry:
     * Debit: 1300 Medical Inventory Asset (Cost of Goods Accepted)
     * Credit: 2100 GRNI Accrued Liability (Goods Received Not Invoiced)
     */
    async postGRNReceiptAccrual(grn: any, scope: { tenantId: string; unitId: string }, user: any, tx?: any): Promise<any> {
        const db = this.getDb(tx);

        let totalReceiptCost = 0;
        for (const item of grn.items || []) {
            const acceptedQty = Number(item.receivedQuantity || 0) - Number(item.rejectedQuantity || 0);
            const unitCost = Number(item.unitCost || 0);
            if (acceptedQty > 0 && unitCost > 0) {
                totalReceiptCost += Math.round(acceptedQty * unitCost * 100) / 100;
            }
        }

        if (totalReceiptCost <= 0) {
            return null; // Zero cost receipt, skip financial accrual
        }

        return await this.postJournalEntry({
            sourceModule: 'INVENTORY_GRN',
            sourceReference: grn.grnNumber,
            description: `Inventory receipt accrual for GRN ${grn.grnNumber}`,
            lines: [
                {
                    accountCode: '1300',
                    debit: totalReceiptCost,
                    description: `Inventory asset addition on GRN ${grn.grnNumber}`
                },
                {
                    accountCode: '2100',
                    credit: totalReceiptCost,
                    description: `GRNI accrual on receipt of GRN ${grn.grnNumber}`
                }
            ],
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            createdById: user?.id,
            idempotencyKey: `JE-GRN-${grn.id}`
        }, db);
    }

    /**
     * Posts a Supplier Return Journal entry:
     * Debit: 2100 GRNI Accrued Liability (Reversal of GRNI accrual)
     * Credit: 1300 Medical Inventory Asset (Reduction of inventory asset)
     */
    async postSupplierReturnJournal(supplierReturn: any, scope: { tenantId: string; unitId: string }, user: any, tx?: any): Promise<any> {
        const db = this.getDb(tx);

        let totalReturnCost = 0;
        for (const item of supplierReturn.items || []) {
            const returnQty = Number(item.returnQuantity || 0);
            const unitCost = Number(item.unitCost || 0);
            if (returnQty > 0 && unitCost > 0) {
                totalReturnCost += Math.round(returnQty * unitCost * 100) / 100;
            }
        }

        if (totalReturnCost <= 0) {
            return null;
        }

        return await this.postJournalEntry({
            sourceModule: 'SUPPLIER_RETURN',
            sourceReference: supplierReturn.returnNumber,
            description: `Inventory deduction for Supplier Return ${supplierReturn.returnNumber}`,
            lines: [
                {
                    accountCode: '2100',
                    debit: totalReturnCost,
                    description: `GRNI liability reversal on Return ${supplierReturn.returnNumber}`
                },
                {
                    accountCode: '1300',
                    credit: totalReturnCost,
                    description: `Inventory asset deduction on Return ${supplierReturn.returnNumber}`
                }
            ],
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            createdById: user?.id,
            idempotencyKey: `JE-RET-${supplierReturn.id}`
        }, db);
    }

    /**
     * Checks if P2P financial tables (VendorBill, JournalEntry, GLAccount) exist in the database.
     * Caches the result to avoid repeated schema queries.
     */
    private p2pTablesExistCache: boolean | null = null;
    async checkP2PTablesExist(tx?: any): Promise<boolean> {
        if (this.p2pTablesExistCache === true) {
            return true;
        }
        try {
            const db = this.getDb(tx);
            const res: any = await db.$queryRaw`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                  AND table_name IN ('VendorBill', 'JournalEntry', 'GLAccount');
            `;
            const found = new Set((res || []).map((r: any) => String(r.table_name).toLowerCase()));
            this.p2pTablesExistCache = found.has('vendorbill') && found.has('journalentry');
            return this.p2pTablesExistCache;
        } catch {
            return false;
        }
    }

    /**
     * Read-only summary of the Procure-to-Pay pipeline, including purchase orders,
     * goods receipts, vendor bills, and GL accrual clearing status.
     * Accurately distinguishes between migrated and unmigrated environments.
     */
    async getP2PSummary(scope: { tenantId: string; unitId?: string }, tx?: any): Promise<any> {
        const db = this.getDb(tx);
        if (!scope.tenantId) {
            throw new Error('Tenant context is required for P2P summary');
        }

        const isMigrated = await this.checkP2PTablesExist(db);

        // 1. Procurement PO aggregation (Physical columns only)
        const poWhere: any = {
            tenantId: scope.tenantId,
            isDeleted: false
        };
        if (scope.unitId) {
            poWhere.unitId = scope.unitId;
        }

        const poCounts = await db.purchaseOrder.groupBy({
            by: ['status'],
            where: poWhere,
            _count: { id: true }
        });

        const totalPOs = poCounts.reduce((sum: number, c: any) => sum + (c._count?.id || 0), 0);
        const poStatusMap: Record<string, number> = {};
        poCounts.forEach((c: any) => {
            poStatusMap[c.status] = c._count?.id || 0;
        });

        // 2. Procurement GRN aggregation
        const grnWhere: any = {
            tenantId: scope.tenantId,
            isDeleted: false
        };
        if (scope.unitId) {
            grnWhere.unitId = scope.unitId;
        }

        const totalGRNs = await db.goodsReceiptNote.count({
            where: grnWhere
        });

        // 3. Accounts Payable & Accrual Clearing
        if (isMigrated) {
            const billWhere: any = {
                tenantId: scope.tenantId,
                isDeleted: false
            };
            if (scope.unitId) {
                billWhere.unitId = scope.unitId;
            }

            const billCounts = await db.vendorBill.groupBy({
                by: ['status'],
                where: billWhere,
                _count: { id: true },
                _sum: { totalAmount: true, paidAmount: true, balanceAmount: true }
            });

            let totalBills = 0;
            let totalBilledAmount = 0;
            let totalPaidAmount = 0;
            let totalOutstandingAmount = 0;
            const billStatusMap: Record<string, number> = {};

            billCounts.forEach((c: any) => {
                const count = c._count?.id || 0;
                totalBills += count;
                totalBilledAmount += Number(c._sum?.totalAmount || 0);
                totalPaidAmount += Number(c._sum?.paidAmount || 0);
                totalOutstandingAmount += Number(c._sum?.balanceAmount || 0);
                billStatusMap[c.status] = count;
            });

            return {
                schemaParity: {
                    p2pFinanceMigrated: true,
                    operationalStatus: 'FULLY_INTEGRATED'
                },
                procurement: {
                    totalPurchaseOrders: totalPOs,
                    purchaseOrdersByStatus: poStatusMap,
                    totalGoodsReceipts: totalGRNs
                },
                accountsPayable: {
                    available: true,
                    totalVendorBills: totalBills,
                    vendorBillsByStatus: billStatusMap,
                    totalBilledAmount: Math.round(totalBilledAmount * 100) / 100,
                    totalPaidAmount: Math.round(totalPaidAmount * 100) / 100,
                    totalOutstandingAmount: Math.round(totalOutstandingAmount * 100) / 100
                },
                grnAccruals: {
                    available: true,
                    totalUnbilledGRNs: Math.max(0, totalGRNs - totalBills)
                }
            };
        }

        // Unmigrated operational schema (truthful compatibility response)
        return {
            schemaParity: {
                p2pFinanceMigrated: false,
                operationalStatus: 'COMPATIBILITY_MODE',
                missingTables: ['VendorBill', 'VendorBillItem', 'GLAccount', 'JournalEntry', 'JournalEntryLine'],
                missingColumns: {
                    PurchaseOrder: ['subtotal', 'taxAmount', 'totalAmount', 'currency'],
                    PurchaseOrderItem: ['unitPrice', 'taxRate', 'taxAmount', 'totalAmount'],
                    GoodsReceiptNote: ['invoiceNo', 'invoiceDate', 'totalAmount'],
                    GoodsReceiptItem: ['unitCost', 'taxRate', 'taxAmount', 'totalCost']
                }
            },
            procurement: {
                totalPurchaseOrders: totalPOs,
                purchaseOrdersByStatus: poStatusMap,
                totalGoodsReceipts: totalGRNs
            },
            accountsPayable: {
                available: false,
                status: 'UNAVAILABLE_PENDING_MIGRATION',
                message: 'P2P financial schema migration (20261104000000_p2p_costing_ap_gl) has not been applied to the operational database'
            },
            grnAccruals: {
                available: false,
                status: 'UNAVAILABLE_PENDING_MIGRATION',
                message: 'Item acquisition costs and General Ledger clearing accounts (GL 2100) are not present in current operational database'
            }
        };
    }

    /**
     * Read-only listing of Goods Receipt Notes with their P2P accrual clearing status.
     * Scoped strictly by tenant/unit, supports pagination and search.
     */
    async getGRNAccruals(
        scope: { tenantId: string; unitId?: string },
        params?: { page?: number; limit?: number; search?: string },
        tx?: any
    ): Promise<any> {
        const db = this.getDb(tx);
        if (!scope.tenantId) {
            throw new Error('Tenant context is required for GRN accruals listing');
        }

        const page = Math.max(1, Number(params?.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
        const skip = (page - 1) * limit;

        const where: any = {
            tenantId: scope.tenantId,
            isDeleted: false
        };
        if (scope.unitId) {
            where.unitId = scope.unitId;
        }

        if (params?.search && String(params.search).trim()) {
            const query = String(params.search).trim();
            where.OR = [
                { grnNumber: { contains: query, mode: 'insensitive' } },
                { deliveryChallanNo: { contains: query, mode: 'insensitive' } },
                { supplierInvoiceNo: { contains: query, mode: 'insensitive' } }
            ];
        }

        const isMigrated = await this.checkP2PTablesExist(db);
        const total = await db.goodsReceiptNote.count({ where });

        const grns = await db.goodsReceiptNote.findMany({
            where,
            skip,
            take: limit,
            orderBy: { receivedDate: 'desc' },
            select: {
                id: true,
                grnNumber: true,
                purchaseOrderId: true,
                vendorId: true,
                receivedDate: true,
                deliveryChallanNo: true,
                supplierInvoiceNo: true,
                notes: true,
                receivedByName: true,
                createdAt: true,
                vendor: {
                    select: { id: true, name: true, code: true }
                },
                purchaseOrder: {
                    select: { id: true, orderNumber: true, status: true }
                },
                items: {
                    where: { isDeleted: false },
                    select: {
                        id: true,
                        productId: true,
                        receivedQuantity: true,
                        rejectedQuantity: true,
                        batchNumber: true,
                        expiryDate: true,
                        product: {
                            select: { id: true, code: true, name: true, category: true, unit: true }
                        }
                    }
                }
            }
        });

        const items = grns.map((g: any) => {
            const totalReceived = (g.items || []).reduce((acc: number, item: any) => acc + (Number(item.receivedQuantity) || 0), 0);
            const totalRejected = (g.items || []).reduce((acc: number, item: any) => acc + (Number(item.rejectedQuantity) || 0), 0);
            const acceptedQuantity = Math.max(0, totalReceived - totalRejected);

            return {
                id: g.id,
                grnNumber: g.grnNumber,
                purchaseOrderId: g.purchaseOrderId,
                poNumber: g.purchaseOrder?.orderNumber || null,
                poStatus: g.purchaseOrder?.status || null,
                vendor: g.vendor ? { id: g.vendor.id, name: g.vendor.name, code: g.vendor.code } : null,
                receivedDate: g.receivedDate,
                deliveryChallanNo: g.deliveryChallanNo || null,
                supplierInvoiceNo: g.supplierInvoiceNo || null,
                receivedByName: g.receivedByName || null,
                itemsCount: g.items?.length || 0,
                totalReceivedQuantity: totalReceived,
                totalRejectedQuantity: totalRejected,
                totalAcceptedQuantity: acceptedQuantity,
                costAvailable: false,
                accrualStatus: isMigrated ? 'ACCRUED' : 'UNACCRUED_PENDING_MIGRATION',
                accrualAmount: null,
                journalEntryNumber: null,
                notes: g.notes || null,
                createdAt: g.createdAt
            };
        });

        return {
            data: items,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            schemaStatus: {
                p2pMigrationApplied: isMigrated,
                costTrackingAvailable: false
            }
        };
    }

    /**
     * Read-only listing of Vendor Bills with status filter, vendor filter, and pagination.
     */
    async getVendorBills(
        scope: { tenantId: string; unitId?: string },
        params?: { page?: number; limit?: number; status?: string; vendorId?: string; search?: string },
        tx?: any
    ): Promise<any> {
        const db = this.getDb(tx);
        if (!scope.tenantId) {
            throw new Error('Tenant context is required for Vendor Bills listing');
        }

        const isMigrated = await this.checkP2PTablesExist(db);
        if (!isMigrated) {
            return {
                data: [],
                pagination: { total: 0, page: 1, limit: 20, totalPages: 1 },
                schemaStatus: { p2pMigrationApplied: false, reason: 'VendorBill table unmigrated' }
            };
        }

        const page = Math.max(1, Number(params?.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));
        const skip = (page - 1) * limit;

        const where: any = {
            tenantId: scope.tenantId,
            isDeleted: false
        };
        if (scope.unitId) {
            where.unitId = scope.unitId;
        }
        if (params?.status && params.status !== 'ALL') {
            where.status = params.status;
        }
        if (params?.vendorId) {
            where.vendorId = params.vendorId;
        }
        if (params?.search && String(params.search).trim()) {
            const query = String(params.search).trim();
            where.OR = [
                { billNumber: { contains: query, mode: 'insensitive' } },
                { notes: { contains: query, mode: 'insensitive' } }
            ];
        }

        const total = await db.vendorBill.count({ where });
        const bills = await db.vendorBill.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                vendor: { select: { id: true, name: true, code: true } },
                items: {
                    include: {
                        product: { select: { id: true, name: true, code: true, unit: true } }
                    }
                }
            }
        });

        return {
            data: bills,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            schemaStatus: { p2pMigrationApplied: true }
        };
    }

    /**
     * Read-only lookup of a single Vendor Bill by ID.
     */
    async getVendorBillById(billId: string, scope: { tenantId: string; unitId?: string }, tx?: any): Promise<any> {
        const db = this.getDb(tx);
        if (!scope.tenantId) {
            throw new Error('Tenant context is required for Vendor Bill lookup');
        }

        const isMigrated = await this.checkP2PTablesExist(db);
        if (!isMigrated) {
            return null;
        }

        return await db.vendorBill.findFirst({
            where: {
                id: billId,
                tenantId: scope.tenantId,
                isDeleted: false
            },
            include: {
                vendor: true,
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });
    }

}

export const p2pFinanceService = new P2PFinanceService();
