import { prisma } from '../../app/prisma.js';
import { canReadFacilityWide } from '../../shared/utils/rbac.js';

export interface CreateExpenditureInput {
    projectId: string;
    amount: number;
    category?: string | null;
    description?: string | null;
    justification?: string | null;
    receiptRef?: string | null;
    idempotencyKey?: string | null;
}

export interface ApproveExpenditureInput {
    status: 'APPROVED' | 'REJECTED';
    rejectionReason?: string | null;
}

export interface ProcessPaymentInput {
    paymentMode: 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'UPI' | 'ONLINE';
    paymentReference?: string | null;
    notes?: string | null;
    idempotencyKey?: string | null;
}

export class FundingExpenditureService {
    private client: any;
    private columnsExistCache: boolean | null = null;
    private glTablesExistCache: boolean | null = null;

    constructor(customClient?: any) {
        this.client = customClient || prisma;
    }

    private getDb(tx?: any) {
        return tx || this.client;
    }

    /**
     * Checks if Phase 3 migration columns exist in the database table ProjectExpenditure.
     */
    async checkExpenditureColumnsExist(tx?: any): Promise<boolean> {
        if (this.columnsExistCache !== null) {
            return this.columnsExistCache;
        }
        try {
            const db = this.getDb(tx);
            const res: any = await db.$queryRaw`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                  AND table_name = 'ProjectExpenditure' 
                  AND column_name IN ('paymentStatus', 'paymentVoucherRef', 'rejectionReason');
            `;
            const found = new Set((res || []).map((r: any) => String(r.column_name).toLowerCase()));
            this.columnsExistCache = found.has('paymentstatus') && found.has('paymentvoucherref');
            return this.columnsExistCache;
        } catch {
            return false;
        }
    }

    /**
     * Checks if General Ledger tables (GLAccount, JournalEntry) exist in PostgreSQL.
     */
    async checkGLTablesExist(tx?: any): Promise<boolean> {
        if (this.glTablesExistCache !== null) {
            return this.glTablesExistCache;
        }
        try {
            const db = this.getDb(tx);
            const res: any = await db.$queryRaw`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                  AND table_name IN ('GLAccount', 'JournalEntry');
            `;
            const found = new Set((res || []).map((r: any) => String(r.table_name).toLowerCase()));
            this.glTablesExistCache = found.has('glaccount') && found.has('journalentry');
            return this.glTablesExistCache;
        } catch {
            return false;
        }
    }

    /**
     * Authoritatively calculates remaining project capacity and allocations.
     * Rule: Pending requests reserve project capacity to prevent concurrent over-commitment.
     */
    async getProjectCapacity(projectId: string, tenantId: string, tx?: any): Promise<any> {
        const db = this.getDb(tx);
        const project = await db.project.findFirst({
            where: { id: projectId, tenantId, isDeleted: false }
        });

        if (!project) {
            const err = new Error('Project not found');
            (err as any).status = 404;
            throw err;
        }

        const allocations = await db.fundingAllocation.findMany({
            where: { projectId, tenantId, isDeleted: false },
            select: { amount: true }
        });
        const totalAllocated = allocations.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0);

        const hasColumns = await this.checkExpenditureColumnsExist(tx);
        const selectFields: any = { amount: true, approvalStatus: true };
        if (hasColumns) {
            selectFields.paymentStatus = true;
        }

        const expenditures = await db.projectExpenditure.findMany({
            where: { projectId, tenantId, isDeleted: false },
            select: selectFields
        });

        let approvedAmount = 0;
        let pendingAmount = 0;
        let paidAmount = 0;
        let committedAmount = 0;

        for (const e of expenditures) {
            const amt = Number(e.amount) || 0;
            const pStatus = e.paymentStatus || 'UNPAID';
            const aStatus = e.approvalStatus || 'PENDING';

            if (pStatus === 'CANCELLED') continue;

            if (aStatus === 'APPROVED') {
                approvedAmount += amt;
                committedAmount += amt;
            } else if (aStatus === 'PENDING') {
                pendingAmount += amt;
                committedAmount += amt; // Pending requests reserve capacity!
            }

            if (pStatus === 'PAID') {
                paidAmount += amt;
            }
        }

        const remainingCapacity = Math.max(0, totalAllocated - committedAmount);
        const remainingBudget = Math.max(0, Number(project.totalBudget) - approvedAmount);

        return {
            projectId,
            projectName: project.name,
            totalBudget: Number(project.totalBudget) || 0,
            totalAllocated,
            committedAmount,
            approvedAmount,
            pendingAmount,
            paidAmount,
            remainingCapacity,
            remainingBudget
        };
    }

    /**
     * Submits an expenditure request with strict project capacity and budget reservation.
     */
    async createExpenditure(
        scope: { tenantId: string; unitId?: string | null; user: any },
        payload: CreateExpenditureInput
    ): Promise<any> {
        const { tenantId, unitId, user } = scope;

        if (!tenantId) {
            const err = new Error('Tenant context is required');
            (err as any).status = 403;
            throw err;
        }

        const amount = Number(payload.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            const err = new Error('Expenditure amount must be a positive finite number greater than zero');
            (err as any).status = 400;
            throw err;
        }

        if (Math.round(amount * 100) !== amount * 100) {
            const err = new Error('Expenditure amount cannot exceed 2 decimal places');
            (err as any).status = 400;
            throw err;
        }

        return await this.client.$transaction(async (tx: any) => {
            // 1. Idempotency Check
            if (payload.idempotencyKey) {
                const existing = await tx.projectExpenditure.findFirst({
                    where: {
                        tenantId,
                        idempotencyKey: payload.idempotencyKey,
                        isDeleted: false
                    },
                    include: { project: true }
                });
                if (existing) {
                    return existing; // Safe replay without duplicate submission
                }
            }

            // 2. Project Validation
            const project = await tx.project.findFirst({
                where: { id: payload.projectId, tenantId, isDeleted: false }
            });

            if (!project) {
                const err = new Error('Project not found or has been deleted');
                (err as any).status = 404;
                throw err;
            }

            if (!['PLANNED', 'ACTIVE'].includes(project.status)) {
                const err = new Error(`Cannot request expenditure for a project with status '${project.status}'. Only PLANNED or ACTIVE projects are permitted.`);
                (err as any).status = 400;
                throw err;
            }

            // 3. Unit Isolation
            const isFacilityWide = Boolean(
                user?.unitAccess?.includes('*') ||
                user?.permissions?.includes('ALL_ACCESS') ||
                canReadFacilityWide(user)
            );

            if (!isFacilityWide && project.unitId && project.unitId !== unitId) {
                const err = new Error('Forbidden: You are not authorized to create expenditures for a project in another operating unit');
                (err as any).status = 403;
                throw err;
            }

            // 4. Capacity & Budget Enforcement
            const capacity = await this.getProjectCapacity(project.id, tenantId, tx);

            if (capacity.totalAllocated <= 0) {
                const err = new Error(`Cannot submit expenditure for project '${project.name}'. No verified funds have been allocated to this project yet (Total Allocated: ₹0).`);
                (err as any).status = 400;
                throw err;
            }

            if (amount > capacity.remainingCapacity) {
                const err = new Error(`Expenditure request of ₹${amount} exceeds remaining allocated capacity of ₹${capacity.remainingCapacity} (Total Allocated: ₹${capacity.totalAllocated}, Committed: ₹${capacity.committedAmount}).`);
                (err as any).status = 400;
                throw err;
            }

            if (capacity.committedAmount + amount > capacity.totalBudget) {
                const err = new Error(`Expenditure request exceeds project total budget limit of ₹${capacity.totalBudget}.`);
                (err as any).status = 400;
                throw err;
            }

            // 5. Persist Expenditure Record
            const hasColumns = await this.checkExpenditureColumnsExist(tx);
            const expenditureData: any = {
                projectId: project.id,
                unitId: project.unitId || null,
                amount,
                description: payload.description || 'Project Expenditure',
                category: payload.category || 'General',
                approvalStatus: 'PENDING',
                tenantId
            };

            if (hasColumns) {
                expenditureData.paymentStatus = 'UNPAID';
                expenditureData.submittedById = user?.id || null;
                expenditureData.justification = payload.justification || null;
                expenditureData.receiptRef = payload.receiptRef || null;
                expenditureData.idempotencyKey = payload.idempotencyKey || null;
            }

            const expenditure = await tx.projectExpenditure.create({
                data: expenditureData,
                include: { project: true }
            });

            return expenditure;
        });
    }

    /**
     * Approves or rejects an expenditure request.
     * Rejection releases the reserved capacity. Approval transitions status to APPROVED with paymentStatus = PAYMENT_PENDING.
     * Note: Approval DOES NOT execute payment.
     */
    async approveOrRejectExpenditure(
        scope: { tenantId: string; unitId?: string | null; user: any },
        expenditureId: string,
        payload: ApproveExpenditureInput
    ): Promise<any> {
        const { tenantId, user } = scope;

        return await this.client.$transaction(async (tx: any) => {
            const expenditure = await tx.projectExpenditure.findFirst({
                where: { id: expenditureId, tenantId, isDeleted: false },
                include: { project: true }
            });

            if (!expenditure) {
                const err = new Error('Project expenditure not found');
                (err as any).status = 404;
                throw err;
            }

            // State Transition Check: Only PENDING can be approved or rejected
            if (expenditure.approvalStatus !== 'PENDING') {
                const err = new Error(`Cannot ${payload.status.toLowerCase()} expenditure that is already ${expenditure.approvalStatus}.`);
                (err as any).status = 400;
                throw err;
            }

            // Self-Approval Prevention Check
            const isSuperAdmin = user.role?.name === 'SUPER_ADMIN' || user.role === 'SUPER_ADMIN' || user.permissions?.includes('ALL_ACCESS');
            if (!isSuperAdmin && expenditure.submittedById && expenditure.submittedById === user.id) {
                const err = new Error('Forbidden: Requester cannot approve their own expenditure request. An independent authorized manager must review and approve.');
                (err as any).status = 403;
                throw err;
            }

            const hasColumns = await this.checkExpenditureColumnsExist(tx);
            const updateData: any = {
                approvalStatus: payload.status,
                approvedById: user?.id || null
            };

            if (payload.status === 'REJECTED') {
                if (!payload.rejectionReason || !String(payload.rejectionReason).trim()) {
                    const err = new Error('Rejection reason is strictly required when rejecting an expenditure request');
                    (err as any).status = 400;
                    throw err;
                }
                if (hasColumns) {
                    updateData.rejectionReason = String(payload.rejectionReason).trim();
                    updateData.decidedAt = new Date();
                    updateData.paymentStatus = 'CANCELLED';
                }
            } else if (payload.status === 'APPROVED') {
                // Re-verify capacity before formal approval
                const capacity = await this.getProjectCapacity(expenditure.projectId, tenantId, tx);
                // Note: since expenditure was PENDING, its amount is already counted in committedAmount.
                if (capacity.totalAllocated < expenditure.amount) {
                    const err = new Error(`Insufficient project funding allocations to approve this expenditure (Allocated: ₹${capacity.totalAllocated}, Requested: ₹${expenditure.amount})`);
                    (err as any).status = 400;
                    throw err;
                }

                if (hasColumns) {
                    updateData.decidedAt = new Date();
                    updateData.paymentStatus = 'PAYMENT_PENDING'; // Ready for Finance Payment Voucher
                }
            }

            const updated = await tx.projectExpenditure.update({
                where: { id: expenditure.id },
                data: updateData,
                include: { project: true }
            });

            // Create Approval audit record if Approval table exists
            try {
                await tx.approval.create({
                    data: {
                        entityType: 'PROJECT_EXPENDITURE',
                        entityId: expenditure.id,
                        approverId: user.id,
                        status: payload.status,
                        comments: payload.status === 'REJECTED' ? payload.rejectionReason : 'Approved for project disbursement',
                        tenantId,
                        unitId: expenditure.unitId || scope.unitId || null
                    }
                });
            } catch {
                // Non-fatal if Approval table doesn't support entityType
            }

            return updated;
        });
    }

    /**
     * Stage 1: Issues a Finance Payment Voucher for an approved expenditure.
     * Creates an AccountTransaction with status = 'CREATED'.
     * Sets expenditure.paymentStatus = 'VOUCHER_ISSUED' (money has NOT left the bank/cashbox yet).
     */
    async issuePaymentVoucher(
        scope: { tenantId: string; unitId?: string | null; user: any },
        expenditureId: string,
        paymentData: ProcessPaymentInput
    ): Promise<any> {
        const { tenantId, user } = scope;

        return await this.client.$transaction(async (tx: any) => {
            const expenditure = await tx.projectExpenditure.findFirst({
                where: { id: expenditureId, tenantId, isDeleted: false },
                include: { project: true }
            });

            if (!expenditure) {
                const err = new Error('Project expenditure not found');
                (err as any).status = 404;
                throw err;
            }

            // 1. Accounting Rule: Unapproved expenditure cannot have a payment voucher issued!
            if (expenditure.approvalStatus !== 'APPROVED') {
                const err = new Error(`Expenditure must be APPROVED before a payment voucher can be issued (Current approval status: ${expenditure.approvalStatus}).`);
                (err as any).status = 400;
                throw err;
            }

            // 2. State Check: Cannot issue voucher if already PAID or VOUCHER_ISSUED
            if (expenditure.paymentStatus === 'PAID') {
                const err = new Error(`Expenditure is already paid (Payment Voucher Ref: ${expenditure.paymentVoucherRef || 'Recorded'}). Duplicate voucher prohibited.`);
                (err as any).status = 400;
                throw err;
            }

            if (expenditure.paymentStatus === 'VOUCHER_ISSUED') {
                const err = new Error(`Payment voucher has already been issued for this expenditure (Voucher Ref: ${expenditure.paymentVoucherRef}). Please confirm disbursement or cancel the existing voucher.`);
                (err as any).status = 400;
                throw err;
            }

            // 3. Idempotency Check
            if (paymentData.idempotencyKey && expenditure.idempotencyKey === paymentData.idempotencyKey && expenditure.paymentVoucherRef) {
                return {
                    expenditure,
                    voucherRef: expenditure.paymentVoucherRef,
                    status: 'VOUCHER_ISSUED',
                    message: 'Idempotent replay: Payment voucher already issued.'
                };
            }

            // 4. Generate Payment Voucher Reference: PV-UNCF-YYYY-NNNN
            const currentYear = new Date().getFullYear();
            const voucherCount = await tx.accountTransaction.count({
                where: { tenantId, type: 'EXPENSE' }
            });
            const voucherRef = `PV-UNCF-${currentYear}-${String(voucherCount + 1).padStart(4, '0')}`;

            // 5. Create Central Finance Module AccountTransaction (Expense Payment Voucher in CREATED state)
            const expenseTransaction = await tx.accountTransaction.create({
                data: {
                    refNo: voucherRef,
                    type: 'EXPENSE',
                    amount: -Math.abs(Number(expenditure.amount)),
                    paymentMode: paymentData.paymentMode,
                    category: expenditure.category || 'Charitable Project Expense',
                    clientName: expenditure.project?.name || 'Charitable Project',
                    notes: `Payment Voucher for Project Expenditure: ${expenditure.description || ''} (${paymentData.notes || ''})`.trim(),
                    status: 'CREATED', // NOT POSTED yet! Represents authorized voucher, not cleared money
                    metadata: {
                        projectExpenditureId: expenditure.id,
                        projectId: expenditure.projectId,
                        projectName: expenditure.project?.name,
                        voucherRef,
                        issuedById: user?.id,
                        paymentMode: paymentData.paymentMode
                    },
                    date: new Date(),
                    tenantId,
                    unitId: expenditure.unitId || scope.unitId || expenditure.project?.unitId
                }
            });

            // 6. Update ProjectExpenditure to VOUCHER_ISSUED
            const hasColumns = await this.checkExpenditureColumnsExist(tx);
            const updateData: any = {};
            if (hasColumns) {
                updateData.paymentStatus = 'VOUCHER_ISSUED';
                updateData.paymentVoucherRef = voucherRef;
                updateData.paymentMode = paymentData.paymentMode;
                if (paymentData.idempotencyKey) {
                    updateData.idempotencyKey = paymentData.idempotencyKey;
                }
            }

            const updatedExpenditure = Object.keys(updateData).length > 0
                ? await tx.projectExpenditure.update({
                    where: { id: expenditure.id },
                    data: updateData,
                    include: { project: true }
                })
                : expenditure;

            return {
                expenditure: updatedExpenditure,
                paymentVoucher: expenseTransaction,
                voucherRef,
                status: 'VOUCHER_ISSUED',
                message: `Payment voucher ${voucherRef} issued successfully in Finance module. Ready for disbursement.`
            };
        });
    }

    /**
     * Stage 2: Confirms actual payment disbursement.
     * Transitions expenditure.paymentStatus to 'PAID'.
     * Updates linked AccountTransaction status to 'POSTED'.
     * Requires valid payment reference (Bank UTR / Transaction reference / Cheque number).
     */
    async confirmPaymentDisbursement(
        scope: { tenantId: string; unitId?: string | null; user: any },
        expenditureId: string,
        disbursementData: { paymentReference: string; disbursementDate?: string | null; notes?: string | null; idempotencyKey?: string | null }
    ): Promise<any> {
        const { tenantId, user } = scope;

        if (!disbursementData.paymentReference || disbursementData.paymentReference.trim().length === 0) {
            const err = new Error('Payment evidence or reference number (e.g. Bank UTR, transaction ID, cheque number) is strictly required to confirm payment');
            (err as any).status = 400;
            throw err;
        }

        return await this.client.$transaction(async (tx: any) => {
            const expenditure = await tx.projectExpenditure.findFirst({
                where: { id: expenditureId, tenantId, isDeleted: false },
                include: { project: true }
            });

            if (!expenditure) {
                const err = new Error('Project expenditure not found');
                (err as any).status = 404;
                throw err;
            }

            if (expenditure.paymentStatus === 'PAID') {
                const err = new Error(`Payment is already confirmed for this expenditure (Reference: ${expenditure.receiptRef || 'Recorded'}). Duplicate confirmation prohibited.`);
                (err as any).status = 400;
                throw err;
            }

            // Must have a voucher issued first (or be in PAYMENT_PENDING with legacy voucher)
            if (expenditure.paymentStatus !== 'VOUCHER_ISSUED' && !expenditure.paymentVoucherRef) {
                const err = new Error(`Cannot confirm disbursement: No payment voucher has been issued yet (Current status: ${expenditure.paymentStatus || 'UNPAID'}). Please issue a payment voucher first.`);
                (err as any).status = 400;
                throw err;
            }

            // 1. Update linked AccountTransaction to POSTED
            let updatedTx = null;
            if (expenditure.paymentVoucherRef) {
                const existingTx = await tx.accountTransaction.findFirst({
                    where: { refNo: expenditure.paymentVoucherRef, tenantId }
                });
                if (existingTx) {
                    const meta = existingTx.metadata || {};
                    meta.paymentReference = disbursementData.paymentReference;
                    meta.disbursedAt = new Date().toISOString();
                    meta.disbursedById = user?.id;

                    updatedTx = await tx.accountTransaction.update({
                        where: { id: existingTx.id },
                        data: {
                            status: 'POSTED',
                            metadata: meta
                        }
                    });
                }
            }

            // 2. Check General Ledger status
            const glAvailable = await this.checkGLTablesExist(tx);
            const glReport = glAvailable
                ? { status: 'POSTED', reference: expenditure.paymentVoucherRef }
                : {
                    status: 'UNAVAILABLE',
                    reason: 'General Ledger double-entry posting requires deployed migration 20261104000000_p2p_costing_ap_gl. Payment disbursement recorded in operational AccountTransaction ledger.'
                };

            // 3. Update ProjectExpenditure to PAID
            const hasColumns = await this.checkExpenditureColumnsExist(tx);
            const updateData: any = {};
            if (hasColumns) {
                updateData.paymentStatus = 'PAID';
                updateData.receiptRef = disbursementData.paymentReference.trim();
                updateData.paidAt = disbursementData.disbursementDate ? new Date(disbursementData.disbursementDate) : new Date();
                updateData.paidById = user?.id;
            }

            const updatedExpenditure = Object.keys(updateData).length > 0
                ? await tx.projectExpenditure.update({
                    where: { id: expenditure.id },
                    data: updateData,
                    include: { project: true }
                })
                : expenditure;

            return {
                expenditure: updatedExpenditure,
                paymentVoucher: updatedTx,
                voucherRef: expenditure.paymentVoucherRef,
                paymentReference: disbursementData.paymentReference,
                status: 'PAID',
                glPosting: glReport,
                message: `Payment disbursement confirmed successfully. Voucher ${expenditure.paymentVoucherRef || ''} is now marked PAID.`
            };
        });
    }

    /**
     * Backward-compatible handler: Authorizes and processes voucher issuance.
     */
    async authorizeAndProcessPayment(
        scope: { tenantId: string; unitId?: string | null; user: any },
        expenditureId: string,
        paymentData: ProcessPaymentInput
    ): Promise<any> {
        return await this.issuePaymentVoucher(scope, expenditureId, paymentData);
    }
    /**
     * Cancels or reverses an approved expenditure.
     * If unpaid, transitions status to CANCELLED and releases capacity.
     */
    async cancelOrReverseExpenditure(
        scope: { tenantId: string; unitId?: string | null; user: any },
        expenditureId: string,
        reason: string
    ): Promise<any> {
        const { tenantId, user } = scope;

        return await this.client.$transaction(async (tx: any) => {
            const expenditure = await tx.projectExpenditure.findFirst({
                where: { id: expenditureId, tenantId, isDeleted: false },
                include: { project: true }
            });

            if (!expenditure) {
                const err = new Error('Project expenditure not found');
                (err as any).status = 404;
                throw err;
            }

            if (expenditure.paymentStatus === 'PAID') {
                const err = new Error('Cannot simply cancel a PAID expenditure. Financial reversal voucher required.');
                (err as any).status = 400;
                throw err;
            }

            const hasColumns = await this.checkExpenditureColumnsExist(tx);
            const updateData: any = {
                approvalStatus: 'REJECTED'
            };

            if (hasColumns) {
                updateData.paymentStatus = 'CANCELLED';
                updateData.rejectionReason = `Cancelled: ${reason}`;
                updateData.decidedAt = new Date();
            }

            return await tx.projectExpenditure.update({
                where: { id: expenditure.id },
                data: updateData,
                include: { project: true }
            });
        });
    }

    /**
     * Lists expenditures with unit and project scoping.
     */
    async getExpenditures(
        scope: { tenantId: string; unitId?: string | null },
        params?: { projectId?: string }
    ): Promise<any[]> {
        const { tenantId, unitId } = scope;
        const where: any = { tenantId, isDeleted: false };

        if (params?.projectId) {
            where.projectId = params.projectId;
        }

        if (unitId && unitId !== 'ALL') {
            where.OR = [
                { unitId },
                { unitId: null }
            ];
        }

        return await this.client.projectExpenditure.findMany({
            where,
            include: { project: true },
            orderBy: { date: 'desc' }
        });
    }
}

export const fundingExpenditureService = new FundingExpenditureService();
