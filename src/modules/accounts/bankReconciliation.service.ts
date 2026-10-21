import { prisma } from '../../app/prisma.js';
import { randomUUID } from 'crypto';

export interface BankStatementLine {
    id?: string;
    date: string;
    description: string;
    utr: string;
    amount: number;
    type: 'CR' | 'DR';
}

export interface MatchCandidate {
    lineId: string;
    statementLine: BankStatementLine;
    matchType: 'EXACT_REF' | 'AMOUNT_AND_PARTY' | 'AMOUNT_ONLY' | 'NO_MATCH';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    matchedRecord?: {
        id: string;
        refNo: string;
        partyName: string;
        expectedAmount: number;
        balanceAmount: number;
        recordType: 'INVOICE' | 'VENDOR_BILL';
        status: string;
    };
}

export class BankReconciliationService {
    /**
     * Parse raw statement text (CSV or tab-delimited) into structured lines
     */
    parseStatement(rawText: string): BankStatementLine[] {
        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const parsed: BankStatementLine[] = [];

        let startIndex = 0;
        if (lines.length > 0 && /date|utr|ref|amount|description/i.test(lines[0])) {
            startIndex = 1;
        }

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            const parts = line.includes(',') ? line.split(',').map(p => p.trim().replace(/^["']|["']$/g, '')) : line.split(/\s{2,}|\t/).map(p => p.trim());
            if (parts.length >= 4) {
                const date = parts[0];
                const description = parts[1];
                const utr = parts[2] || 'UTR-' + Math.random().toString(36).substring(2, 9).toUpperCase();
                const rawAmount = parts[3].replace(/[^0-9.-]/g, '');
                const amount = Math.abs(parseFloat(rawAmount) || 0);
                const rawType = (parts[4] || '').toUpperCase();
                const type: 'CR' | 'DR' = rawType.includes('DR') || rawAmount.startsWith('-') ? 'DR' : 'CR';

                if (amount > 0) {
                    parsed.push({
                        id: randomUUID(),
                        date,
                        description,
                        utr,
                        amount,
                        type
                    });
                }
            }
        }
        return parsed;
    }

    /**
     * Auto-match statement lines against open Invoices (for CR) and Vendor Bills (for DR)
     */
    async matchStatementLines(
        scope: { tenantId: string; unitId?: string | null },
        lines: BankStatementLine[],
        tx?: any
    ): Promise<MatchCandidate[]> {
        const db = tx || prisma;

        // Fetch active Invoices (TransactionStatus: APPROVED or CREATED or POSTED)
        const invoiceWhere: any = {
            tenantId: scope.tenantId,
            type: 'INVOICE',
            isDeleted: false
        };
        if (scope.unitId && scope.unitId !== 'ALL_UNITS') {
            invoiceWhere.unitId = scope.unitId;
        }
        const openInvoices = await db.accountTransaction.findMany({
            where: invoiceWhere,
            orderBy: { createdAt: 'desc' }
        });

        // Fetch open Vendor Bills
        let openBills: any[] = [];
        try {
            const billWhere: any = {
                tenantId: scope.tenantId,
                status: { in: ['APPROVED', 'PARTIALLY_PAID'] },
                isDeleted: false
            };
            if (scope.unitId && scope.unitId !== 'ALL_UNITS') {
                billWhere.unitId = scope.unitId;
            }
            openBills = await db.vendorBill.findMany({
                where: billWhere,
                include: { vendor: true },
                orderBy: { createdAt: 'desc' }
            });
        } catch {
            openBills = [];
        }

        const candidates: MatchCandidate[] = [];

        for (const line of lines) {
            const lineId = line.id || randomUUID();
            const descUpper = (line.description + ' ' + line.utr).toUpperCase();

            if (line.type === 'CR') {
                let matchedInv: any = null;
                let matchType: MatchCandidate['matchType'] = 'NO_MATCH';
                let confidence: MatchCandidate['confidence'] = 'NONE';

                // Rule 1: Exact invoice ref match (e.g. INV-202610-0001)
                for (const inv of openInvoices) {
                    if (inv.refNo && descUpper.includes(inv.refNo.toUpperCase())) {
                        matchedInv = inv;
                        matchType = 'EXACT_REF';
                        confidence = 'HIGH';
                        break;
                    }
                }

                // Rule 2: Client Name and Amount match
                if (!matchedInv) {
                    for (const inv of openInvoices) {
                        const partyMatch = inv.clientName && descUpper.includes(inv.clientName.toUpperCase());
                        const amountMatch = Math.abs(Number(inv.amount) - line.amount) < 0.01;
                        if (partyMatch && amountMatch) {
                            matchedInv = inv;
                            matchType = 'AMOUNT_AND_PARTY';
                            confidence = 'HIGH';
                            break;
                        }
                    }
                }

                // Rule 3: Exact amount match alone
                if (!matchedInv) {
                    for (const inv of openInvoices) {
                        if (Math.abs(Number(inv.amount) - line.amount) < 0.01) {
                            matchedInv = inv;
                            matchType = 'AMOUNT_ONLY';
                            confidence = 'MEDIUM';
                            break;
                        }
                    }
                }

                if (matchedInv) {
                    candidates.push({
                        lineId,
                        statementLine: line,
                        matchType,
                        confidence,
                        matchedRecord: {
                            id: matchedInv.id,
                            refNo: matchedInv.refNo,
                            partyName: matchedInv.clientName || 'Customer',
                            expectedAmount: Number(matchedInv.amount),
                            balanceAmount: Number(matchedInv.amount),
                            recordType: 'INVOICE',
                            status: matchedInv.status
                        }
                    });
                } else {
                    candidates.push({
                        lineId,
                        statementLine: line,
                        matchType: 'NO_MATCH',
                        confidence: 'NONE'
                    });
                }
            } else {
                let matchedBill: any = null;
                let matchType: MatchCandidate['matchType'] = 'NO_MATCH';
                let confidence: MatchCandidate['confidence'] = 'NONE';

                for (const bill of openBills) {
                    if (bill.billNumber && descUpper.includes(bill.billNumber.toUpperCase())) {
                        matchedBill = bill;
                        matchType = 'EXACT_REF';
                        confidence = 'HIGH';
                        break;
                    }
                }

                if (!matchedBill) {
                    for (const bill of openBills) {
                        const vendorMatch = bill.vendor?.name && descUpper.includes(bill.vendor.name.toUpperCase());
                        const amountMatch = Math.abs(Number(bill.balanceAmount || bill.totalAmount) - line.amount) < 0.01;
                        if (vendorMatch && amountMatch) {
                            matchedBill = bill;
                            matchType = 'AMOUNT_AND_PARTY';
                            confidence = 'HIGH';
                            break;
                        }
                    }
                }

                if (!matchedBill) {
                    for (const bill of openBills) {
                        if (Math.abs(Number(bill.balanceAmount || bill.totalAmount) - line.amount) < 0.01) {
                            matchedBill = bill;
                            matchType = 'AMOUNT_ONLY';
                            confidence = 'MEDIUM';
                            break;
                        }
                    }
                }

                if (matchedBill) {
                    candidates.push({
                        lineId,
                        statementLine: line,
                        matchType,
                        confidence,
                        matchedRecord: {
                            id: matchedBill.id,
                            refNo: matchedBill.billNumber,
                            partyName: matchedBill.vendor?.name || 'Vendor',
                            expectedAmount: Number(bill.totalAmount),
                            balanceAmount: Number(bill.balanceAmount),
                            recordType: 'VENDOR_BILL',
                            status: matchedBill.status
                        }
                    });
                } else {
                    candidates.push({
                        lineId,
                        statementLine: line,
                        matchType: 'NO_MATCH',
                        confidence: 'NONE'
                    });
                }
            }
        }

        return candidates;
    }

    /**
     * Apply reconciliation: records payment/receipt, clears invoice or bill, stamps audit trail
     */
    async reconcileRecord(
        scope: { tenantId: string; unitId: string },
        user: { id: string; email?: string },
        payload: {
            statementLine: BankStatementLine;
            targetRecordId: string;
            recordType: 'INVOICE' | 'VENDOR_BILL';
        },
        tx?: any
    ): Promise<any> {
        const db = tx || prisma;
        const { statementLine, targetRecordId, recordType } = payload;

        if (recordType === 'INVOICE') {
            const invoice = await db.accountTransaction.findFirst({
                where: {
                    id: targetRecordId,
                    tenantId: scope.tenantId,
                    isDeleted: false
                }
            });
            if (!invoice) throw new Error('Target invoice not found for reconciliation');

            // Update invoice status to POSTED with bank reference
            const updated = await db.accountTransaction.update({
                where: { id: targetRecordId },
                data: {
                    status: 'POSTED',
                    paymentMode: 'BANK_TRANSFER',
                    metadata: {
                        ...(typeof invoice.metadata === 'object' && invoice.metadata ? invoice.metadata : {}),
                        bankReconciledAt: new Date().toISOString(),
                        bankReconciledBy: user.id,
                        bankReconciliationUtr: statementLine.utr,
                        bankReconciliationStatementDate: statementLine.date
                    }
                }
            });

            return {
                success: true,
                reconciledId: updated.id,
                recordType: 'INVOICE',
                refNo: updated.refNo,
                status: 'POSTED',
                utr: statementLine.utr,
                reconciledAt: new Date().toISOString()
            };
        } else {
            const bill = await db.vendorBill.findFirst({
                where: {
                    id: targetRecordId,
                    tenantId: scope.tenantId,
                    isDeleted: false
                }
            });
            if (!bill) throw new Error('Target vendor bill not found for reconciliation');

            const newPaid = Math.round((Number(bill.paidAmount || 0) + statementLine.amount) * 100) / 100;
            const newBalance = Math.max(0, Math.round((Number(bill.totalAmount) - newPaid) * 100) / 100);
            const newStatus = newBalance <= 0.001 ? 'PAID' : 'PARTIALLY_PAID';

            const updatedBill = await db.vendorBill.update({
                where: { id: targetRecordId },
                data: {
                    paidAmount: newPaid,
                    balanceAmount: newBalance,
                    status: newStatus,
                    notes: (bill.notes ? bill.notes + ' | ' : '') + `Bank Reconciled UTR: ${statementLine.utr}`
                }
            });

            return {
                success: true,
                reconciledId: updatedBill.id,
                recordType: 'VENDOR_BILL',
                refNo: updatedBill.billNumber,
                status: newStatus,
                utr: statementLine.utr,
                reconciledAt: new Date().toISOString()
            };
        }
    }
}

export const bankReconciliationService = new BankReconciliationService();
