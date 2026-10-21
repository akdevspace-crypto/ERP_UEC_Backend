import { prisma } from '../../app/prisma.js';
import { canReadFacilityWide } from '../../shared/utils/rbac.js';
import { fundingSourceService } from './fundingSource.service.js';

export interface CreateFundingAllocationInput {
    projectId: string;
    amount: number;
    sourceType?: 'DONATION' | 'GENERAL_FUND' | 'GRANT' | 'CSR_GRANT';
    sourceDonationId?: string | null;
    sourceAccountId?: string | null;
    sourceReference?: string | null;
    source?: string | null;
    notes?: string | null;
    idempotencyKey?: string | null;
}

export class FundingAllocationService {
    private client: any;
    private fundingSourceService: any;

    constructor(customClient?: any, customFundingSourceService?: any) {
        this.client = customClient || prisma;
        this.fundingSourceService = customFundingSourceService || fundingSourceService;
    }

    private getDb(tx?: any) {
        return tx || this.client;
    }

    /**
     * Atomically validates, reserves, and creates a project funding allocation.
     * Enforces strict budget ceilings, verified funding source clearance, and unit isolation.
     */
    async createAllocation(
        scope: { tenantId: string; unitId?: string | null; user: any },
        payload: CreateFundingAllocationInput
    ): Promise<any> {
        const { tenantId, unitId, user } = scope;

        if (!tenantId) {
            const err = new Error('Tenant context is required');
            (err as any).status = 403;
            throw err;
        }

        const amount = Number(payload.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            const err = new Error('Allocation amount must be a positive finite number greater than zero');
            (err as any).status = 400;
            throw err;
        }

        // Decimal precision check (max 2 decimals)
        if (Math.round(amount * 100) !== amount * 100) {
            const err = new Error('Allocation amount cannot exceed 2 decimal places');
            (err as any).status = 400;
            throw err;
        }

        const sourceType = payload.sourceType || 'DONATION';

        return await this.client.$transaction(async (tx: any) => {
            // 1. Idempotency Check
            if (payload.idempotencyKey) {
                const existing = await tx.fundingAllocation.findFirst({
                    where: {
                        tenantId,
                        idempotencyKey: payload.idempotencyKey,
                        isDeleted: false
                    },
                    include: { project: true }
                });
                if (existing) {
                    return existing; // Safe replay without double allocation
                }
            }

            // 2. Project Existence & Active Status Validation
            const project = await tx.project.findFirst({
                where: { id: payload.projectId, tenantId, isDeleted: false },
                include: { category: true, classification: true }
            });

            if (!project) {
                const err = new Error('Project not found or has been deleted');
                (err as any).status = 404;
                throw err;
            }

            if (!['PLANNED', 'ACTIVE'].includes(project.status)) {
                const err = new Error(`Cannot allocate funds to a project with status '${project.status}'. Only PLANNED or ACTIVE projects can receive allocations.`);
                (err as any).status = 400;
                throw err;
            }

            // 3. Unit Isolation & Authorization
            const isFacilityWide = Boolean(
                user?.unitAccess?.includes('*') ||
                user?.permissions?.includes('ALL_ACCESS') ||
                canReadFacilityWide(user)
            );

            if (!isFacilityWide && project.unitId && project.unitId !== unitId) {
                const err = new Error('Forbidden: You are not authorized to allocate funds to a project in another operating unit');
                (err as any).status = 403;
                throw err;
            }

            // 4. Project Budget Ceiling Enforcement
            const existingAllocations = await tx.fundingAllocation.findMany({
                where: { projectId: project.id, tenantId, isDeleted: false },
                select: { amount: true }
            });
            const currentAllocated = existingAllocations.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0);
            const remainingBudget = Math.max(0, Number(project.totalBudget) - currentAllocated);

            if (amount > remainingBudget) {
                const err = new Error(`Allocation of ₹${amount} exceeds remaining project budget of ₹${remainingBudget} (Total budget: ₹${project.totalBudget}, Already allocated: ₹${currentAllocated})`);
                (err as any).status = 400;
                throw err;
            }

            // 5. Funding Source Eligibility & Reservation
            let resolvedReference = payload.sourceReference || payload.source || null;

            if (sourceType === 'DONATION') {
                if (!payload.sourceDonationId) {
                    const err = new Error('sourceDonationId is strictly required when sourceType is DONATION');
                    (err as any).status = 400;
                    throw err;
                }

                const hasColumns = await this.fundingSourceService.checkColumnsExist(tx);
                if (!hasColumns) {
                    const err = new Error('FUNDING_MIGRATION_PENDING: Database migration 20261105000000_funding_source_integrity_and_unit_scoping is awaiting operational approval. Allocation cannot proceed until schema is deployed.');
                    (err as any).status = 503;
                    throw err;
                }

                // Query donation with lock in transaction
                const donation = await tx.donation.findFirst({
                    where: { id: payload.sourceDonationId, tenantId, isDeleted: false },
                    include: { donor: true }
                });

                if (!donation) {
                    const err = new Error('Funding source donation not found');
                    (err as any).status = 404;
                    throw err;
                }

                // Verify reconciliation clearance
                const recStatus = donation.reconciliationStatus || 'PENDING';
                if (recStatus !== 'CLEARED' && recStatus !== 'RECONCILED') {
                    const err = new Error(`Donation '${donation.receiptNo}' is unreconciled (status: ${recStatus}). Only cleared and reconciled donations can be allocated to projects.`);
                    (err as any).status = 400;
                    throw err;
                }

                // Verify non-material
                if (String(donation.paymentMode || '').toUpperCase() === 'MATERIAL') {
                    const err = new Error('In-kind or material donations cannot be allocated for financial expenditure');
                    (err as any).status = 400;
                    throw err;
                }

                // Verify unit compatibility
                if (donation.unitId && project.unitId && donation.unitId !== project.unitId) {
                    const err = new Error(`Funding source unit (${donation.unitId}) does not match project operating unit (${project.unitId}). Cross-unit allocation of unit-restricted donations is not permitted.`);
                    (err as any).status = 400;
                    throw err;
                }

                // Concurrency-safe atomic reservation via conditional update
                const updateCount = await tx.$executeRaw`
                    UPDATE "Donation"
                    SET "allocatedAmount" = "allocatedAmount" + ${amount}, "updatedAt" = NOW()
                    WHERE id = ${donation.id} 
                      AND ("amount" - "allocatedAmount") >= ${amount}
                `;

                if (updateCount === 0) {
                    const available = Math.max(0, Number(donation.amount) - Number(donation.allocatedAmount || 0));
                    const err = new Error(`Insufficient available balance on funding source '${donation.receiptNo}'. Available: ₹${available}, Requested: ₹${amount}. Concurrent allocation may have reduced available funds.`);
                    (err as any).status = 400;
                    throw err;
                }

                resolvedReference = donation.receiptNo;
            } else if (sourceType === 'GENERAL_FUND') {
                const err = new Error('General Foundation Funds require deployed and reconciled General Ledger Chart of Accounts (GL Account 3100 Unrestricted Foundation Reserve). Currently unmigrated.');
                (err as any).status = 400;
                throw err;
            } else if (sourceType === 'GRANT') {
                const err = new Error('Formal Grant contract model is not yet established in the ERP database schema.');
                (err as any).status = 400;
                throw err;
            } else if (sourceType === 'CSR_GRANT') {
                const err = new Error('CSR Grants require verified corporate grant agreements, board resolutions, and tranche documentation.');
                (err as any).status = 400;
                throw err;
            } else {
                const err = new Error(`Unsupported or invalid funding source type '${sourceType}'`);
                (err as any).status = 400;
                throw err;
            }

            // 6. Create the Allocation Record
            const allocation = await tx.fundingAllocation.create({
                data: {
                    projectId: project.id,
                    unitId: project.unitId || null,
                    amount,
                    sourceType,
                    sourceDonationId: payload.sourceDonationId || null,
                    sourceAccountId: payload.sourceAccountId || null,
                    sourceReference: resolvedReference,
                    source: resolvedReference || sourceType,
                    notes: payload.notes || null,
                    idempotencyKey: payload.idempotencyKey || null,
                    allocatedById: user?.id || null,
                    tenantId
                },
                include: {
                    project: true,
                    sourceDonation: {
                        select: { id: true, receiptNo: true, amount: true, paymentMode: true }
                    }
                }
            });

            return allocation;
        });
    }

    /**
     * Lists allocations with unit and project filtering.
     */
    async getAllocations(
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

        return await this.client.fundingAllocation.findMany({
            where,
            include: {
                project: true,
                sourceDonation: {
                    select: { id: true, receiptNo: true, amount: true, paymentMode: true }
                }
            },
            orderBy: { date: 'desc' }
        });
    }
}

export const fundingAllocationService = new FundingAllocationService();
