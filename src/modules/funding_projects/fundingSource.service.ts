import { prisma } from '../../app/prisma.js';

export interface FundingSourceItem {
    id: string;
    sourceType: 'DONATION' | 'GENERAL_FUND' | 'GRANT' | 'CSR_GRANT';
    sourceReference: string;
    donorName?: string;
    paymentMode?: string;
    reconciliationStatus: 'PENDING' | 'CLEARED' | 'RECONCILED' | 'REVERSED' | 'UNAVAILABLE';
    totalAmount: number;
    allocatedAmount: number;
    availableBalance: number;
    isEligible: boolean;
    unitId?: string | null;
    restrictions?: {
        category?: string | null;
        purpose?: string | null;
    } | null;
    ineligibilityReason?: string | null;
}

export class FundingSourceService {
    private client: any;
    private columnsExistCache: boolean | null = null;

    constructor(customClient?: any) {
        this.client = customClient || prisma;
    }

    private getDb(tx?: any) {
        return tx || this.client;
    }

    /**
     * Checks if the migration columns (reconciliationStatus, allocatedAmount) exist in the current database.
     */
    async checkColumnsExist(tx?: any): Promise<boolean> {
        if (this.columnsExistCache !== null) {
            return this.columnsExistCache;
        }
        try {
            const db = this.getDb(tx);
            const res: any = await db.$queryRaw`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                  AND table_name = 'Donation' 
                  AND column_name IN ('reconciliationStatus', 'allocatedAmount');
            `;
            const found = new Set((res || []).map((r: any) => String(r.column_name).toLowerCase()));
            this.columnsExistCache = found.has('reconciliationstatus') && found.has('allocatedamount');
            return this.columnsExistCache;
        } catch {
            return false;
        }
    }

    /**
     * Authoritatively evaluates all funding sources for a given tenant/unit scope and project.
     */
    async getEligibleFundingSources(
        scope: { tenantId: string; unitId?: string | null },
        params?: { projectId?: string },
        tx?: any
    ): Promise<FundingSourceItem[]> {
        const db = this.getDb(tx);
        const { tenantId, unitId } = scope;

        if (!tenantId) {
            throw new Error('Tenant context is strictly required to evaluate funding sources');
        }

        let targetProject: any = null;
        if (params?.projectId) {
            targetProject = await db.project.findFirst({
                where: { id: params.projectId, tenantId, isDeleted: false },
                include: { category: true, classification: true }
            });
        }

        const sources: FundingSourceItem[] = [];
        const hasColumns = await this.checkColumnsExist(tx);

        // 1. Evaluate Donations
        const donationWhere: any = {
            tenantId,
            isDeleted: false
        };

        if (unitId && unitId !== 'ALL') {
            donationWhere.OR = [
                { unitId: unitId },
                { unitId: null }
            ];
        }

        const donations = await db.donation.findMany({
            where: donationWhere,
            include: {
                donor: {
                    select: { id: true, name: true, donorNo: true }
                }
            },
            orderBy: { date: 'desc' }
        });

        for (const d of donations) {
            const totalAmount = Number(d.amount) || 0;
            const allocatedAmount = hasColumns ? (Number(d.allocatedAmount) || 0) : 0;
            const availableBalance = Math.max(0, totalAmount - allocatedAmount);
            const status = hasColumns ? (d.reconciliationStatus || 'PENDING') : 'PENDING';
            const isCleared = status === 'CLEARED' || status === 'RECONCILED';
            const isMaterial = String(d.paymentMode || '').toUpperCase() === 'MATERIAL';

            let isEligible = true;
            let ineligibilityReason: string | null = null;

            if (!hasColumns) {
                isEligible = false;
                ineligibilityReason = 'Awaiting operational deployment of migration 20261105000000_funding_source_integrity_and_unit_scoping to verify clearance.';
            } else if (!isCleared) {
                isEligible = false;
                ineligibilityReason = `Donation receipt '${d.receiptNo}' is unreconciled (status: ${status}). Only cleared donations are eligible for project allocation.`;
            } else if (isMaterial) {
                isEligible = false;
                ineligibilityReason = 'In-kind / material donations cannot fund cash project allocations.';
            } else if (availableBalance <= 0) {
                isEligible = false;
                ineligibilityReason = 'Funding source balance is fully exhausted.';
            } else if (targetProject && d.unitId && targetProject.unitId && d.unitId !== targetProject.unitId) {
                isEligible = false;
                ineligibilityReason = `Donation unit (${d.unitId}) does not match project operating unit (${targetProject.unitId}).`;
            }

            sources.push({
                id: d.id,
                sourceType: 'DONATION',
                sourceReference: d.receiptNo,
                donorName: d.donor?.name || 'Anonymous',
                paymentMode: d.paymentMode,
                reconciliationStatus: status,
                totalAmount,
                allocatedAmount,
                availableBalance,
                isEligible,
                unitId: d.unitId,
                restrictions: (d.category || d.purpose) ? {
                    category: d.category,
                    purpose: d.purpose
                } : null,
                ineligibilityReason
            });
        }

        // 2. Evaluate General Foundation Funds
        sources.push({
            id: 'GL-3100-UNRESTRICTED',
            sourceType: 'GENERAL_FUND',
            sourceReference: 'GL Account 3100 (Unrestricted Foundation Reserve)',
            reconciliationStatus: 'UNAVAILABLE',
            totalAmount: 0,
            allocatedAmount: 0,
            availableBalance: 0,
            isEligible: false,
            unitId: null,
            restrictions: null,
            ineligibilityReason: 'General Foundation Funds require deployed and reconciled General Ledger Chart of Accounts (GL Account 3100 Unrestricted Foundation Reserve). Currently unmigrated in database.'
        });

        // 3. Evaluate Donor-Restricted Grants
        sources.push({
            id: 'GRANT-RESTRICTED-RESERVE',
            sourceType: 'GRANT',
            sourceReference: 'Formal Donor Grant Contracts',
            reconciliationStatus: 'UNAVAILABLE',
            totalAmount: 0,
            allocatedAmount: 0,
            availableBalance: 0,
            isEligible: false,
            unitId: null,
            restrictions: null,
            ineligibilityReason: 'Formal Grant contract model is not yet established in the ERP database schema.'
        });

        // 4. Evaluate CSR Grants
        sources.push({
            id: 'CSR-GRANT-RESERVE',
            sourceType: 'CSR_GRANT',
            sourceReference: 'Corporate Social Responsibility (CSR) Agreements',
            reconciliationStatus: 'UNAVAILABLE',
            totalAmount: 0,
            allocatedAmount: 0,
            availableBalance: 0,
            isEligible: false,
            unitId: null,
            restrictions: null,
            ineligibilityReason: 'CSR Grants require verified corporate grant agreements, board resolutions, and tranche documentation.'
        });

        return sources;
    }
}

export const fundingSourceService = new FundingSourceService();
