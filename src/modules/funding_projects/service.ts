import { prisma } from '../../app/prisma.js';
import { fundingSourceService } from './fundingSource.service.js';
import { fundingAllocationService, CreateFundingAllocationInput } from './fundingAllocation.service.js';
import { fundingExpenditureService, CreateExpenditureInput, ApproveExpenditureInput, ProcessPaymentInput } from './fundingExpenditure.service.js';

export const getFundingCategories = async (tenantId: string) => {
    return await prisma.fundingCategory.findMany({ where: { tenantId, isDeleted: false } });
};

export const createFundingCategory = async (tenantId: string, unitId: string, data: any) => {
    return await prisma.fundingCategory.create({ data: { ...data, tenantId, unitId } });
};

export const getProjectClassifications = async (tenantId: string) => {
    return await prisma.projectClassification.findMany({ where: { tenantId, isDeleted: false } });
};

export const createProjectClassification = async (tenantId: string, unitId: string, data: any) => {
    return await prisma.projectClassification.create({ data: { ...data, tenantId, unitId } });
};

export const getProjects = async (tenantId: string, unitId?: string | null) => {
    const where: any = { tenantId, isDeleted: false };
    if (unitId && unitId !== 'ALL') {
        where.OR = [
            { unitId },
            { unitId: null }
        ];
    }
    const projects = await prisma.project.findMany({ 
        where,
        include: { 
            category: true, 
            classification: true,
            allocations: {
                where: { isDeleted: false },
                select: { id: true, amount: true, source: true, date: true }
            },
            expenditures: {
                where: { isDeleted: false },
                select: { id: true, amount: true, approvalStatus: true, date: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    return projects.map((p: any) => ({
        ...p,
        allocations: (p.allocations || []).map((a: any) => ({
            ...a,
            sourceType: a.source || 'GENERAL_FUND'
        })),
        expenditures: (p.expenditures || []).map((e: any) => ({
            ...e,
            paymentStatus: e.paymentStatus || 'UNPAID'
        }))
    }));
};

export const createProject = async (tenantId: string, unitId: string, data: any) => {
    return await prisma.project.create({ data: { ...data, tenantId, unitId } });
};

// --- Funding Sources ---
export const getFundingSources = async (scope: { tenantId: string; unitId?: string | null }, params?: { projectId?: string }) => {
    return await fundingSourceService.getEligibleFundingSources(scope, params);
};

// --- Funding Allocations ---
export const getFundingAllocations = async (scope: { tenantId: string; unitId?: string | null }, projectId?: string) => {
    return await fundingAllocationService.getAllocations(scope, { projectId });
};

export const createFundingAllocation = async (
    scope: { tenantId: string; unitId?: string | null; user: any },
    data: CreateFundingAllocationInput
) => {
    return await fundingAllocationService.createAllocation(scope, data);
};

// --- Project Expenditures ---
export const getProjectExpenditures = async (scope: { tenantId: string; unitId?: string | null }, projectId?: string) => {
    return await fundingExpenditureService.getExpenditures(scope, { projectId });
};

export const getProjectCapacity = async (projectId: string, tenantId: string) => {
    return await fundingExpenditureService.getProjectCapacity(projectId, tenantId);
};

export const createProjectExpenditure = async (
    scope: { tenantId: string; unitId?: string | null; user: any },
    data: CreateExpenditureInput
) => {
    return await fundingExpenditureService.createExpenditure(scope, data);
};

export const approveExpenditure = async (
    scope: { tenantId: string; unitId?: string | null; user: any },
    expenditureId: string,
    data: ApproveExpenditureInput
) => {
    return await fundingExpenditureService.approveOrRejectExpenditure(scope, expenditureId, data);
};


export const issuePaymentVoucher = async (
    scope: { tenantId: string; unitId?: string | null; user: any },
    expenditureId: string,
    data: any
) => {
    return await fundingExpenditureService.issuePaymentVoucher(scope, expenditureId, data);
};

export const confirmPaymentDisbursement = async (
    scope: { tenantId: string; unitId?: string | null; user: any },
    expenditureId: string,
    data: any
) => {
    return await fundingExpenditureService.confirmPaymentDisbursement(scope, expenditureId, data);
};

export const processExpenditurePayment = async (
    scope: { tenantId: string; unitId?: string | null; user: any },
    expenditureId: string,
    data: any
) => {
    return await fundingExpenditureService.issuePaymentVoucher(scope, expenditureId, data);
};


export const cancelExpenditure = async (
    scope: { tenantId: string; unitId?: string | null; user: any },
    expenditureId: string,
    reason: string
) => {
    return await fundingExpenditureService.cancelOrReverseExpenditure(scope, expenditureId, reason);
};

export { fundingSourceService, fundingAllocationService, fundingExpenditureService };
