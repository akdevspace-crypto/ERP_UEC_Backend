import { prisma } from '../../app/prisma.js';
import * as repo from './repository.js';
import { AppError } from '../../shared/utils/response.js';
import { getFinancialClearance } from '../accounts/service.js';

export const startOrFetchClosure = async (admissionId, ctx) => {
    // Verify Admission belongs to tenant/unit
    const admission = await prisma.admission.findFirst({
        where: { id: admissionId, tenantId: ctx.tenantId, unitId: ctx.unitId }
    });
    
    if (!admission) throw new AppError('Admission not found or access denied', 404);
    if (admission.status === 'DISCHARGED') throw new AppError('Admission is already discharged', 400);

    let closure = await repo.getClosureByAdmissionId(admissionId, ctx);
    if (!closure) {
        closure = await repo.createClosure({
            admissionId,
            tenantId: ctx.tenantId,
            unitId: ctx.unitId,
            status: 'IN_PROGRESS'
        });
    }

    // Delegate financial calculation to Finance domain service
    const clearance = await getFinancialClearance(ctx.tenantId, admission.enquiryId, ctx.unitId);
    
    return { ...closure, outstandingBalance: clearance.outstandingBalance };
};

export const clearRequirement = async (id, { type, notes }, ctx) => {
    let closure = await repo.getClosureById(id, ctx);
    if (!closure) throw new AppError('Closure not found', 404);
    if (closure.tenantId !== ctx.tenantId) throw new AppError('Access denied', 403);
    if (ctx.unitId && ctx.unitId !== 'ALL' && closure.unitId !== ctx.unitId) throw new AppError('Access denied', 403);
    
    const updateData = {};
    if (type === 'MEDICAL') {
        updateData.medicalCleared = true;
        updateData.medicalClearedById = ctx.userId;
        updateData.medicalClearedAt = new Date();
    } else if (type === 'FINANCE') {
        // Enforce outstanding balance logic via Finance domain service
        const clearance = await getFinancialClearance(ctx.tenantId, closure.admission.enquiryId, ctx.unitId);

        if (!clearance.isCleared) {
            throw new AppError(`Cannot clear Finance: Outstanding balance is Rs. ${clearance.outstandingBalance.toFixed(2)}`, 400);
        }

        updateData.financeCleared = true;
        updateData.financeClearedById = ctx.userId;
        updateData.financeClearedAt = new Date();
    } else if (type === 'ASSET') {
        updateData.assetCleared = true;
        updateData.assetClearedById = ctx.userId;
        updateData.assetClearedAt = new Date();
    } else {
        throw new AppError('Invalid clearance type', 400);
    }
    
    closure = await repo.updateClosure(id, updateData);
    
    // Auto-transition to READY
    if (closure.medicalCleared && closure.financeCleared && closure.assetCleared && closure.status !== 'EXECUTED') {
        closure = await repo.updateClosure(id, { status: 'READY' });
    }
    
    return closure;
};

export const executeClosure = async (id, { closingRemarks }, ctx) => {
    const closure = await repo.getClosureById(id, ctx);
    if (!closure) throw new AppError('Closure not found', 404);
    if (closure.tenantId !== ctx.tenantId) throw new AppError('Access denied', 403);
    
    if (closure.status === 'EXECUTED') throw new AppError('Closure already executed', 400);
    if (!closure.medicalCleared || !closure.financeCleared || !closure.assetCleared) {
        throw new AppError('All clearances must be met before execution', 400);
    }
    
    // Transaction execution
    await prisma.$transaction(async (tx) => {
        // 1. Update closure
        await tx.serviceClosure.update({
            where: { id },
            data: { status: 'EXECUTED', closingRemarks }
        });
        
        // 2. Discharge admission
        await tx.admission.update({
            where: { id: closure.admissionId },
            data: { status: 'DISCHARGED', dischargedAt: new Date() }
        });
        
        // 3. Mark active ServiceContract as COMPLETED
        const contract = await tx.serviceContract.findFirst({
            where: { admissionId: closure.admissionId, status: 'ACTIVE' }
        });
        if (contract) {
            await tx.serviceContract.update({
                where: { id: contract.id },
                data: { status: 'COMPLETED' }
            });
        }
        
        // 4. Mark active allocations as COMPLETED
        await tx.allocation.updateMany({
            where: { enquiryId: closure.admission.enquiryId, status: { not: 'COMPLETED' } },
            data: { status: 'COMPLETED' }
        });
    });
    
    return await repo.getClosureById(id, ctx);
};

export const getClosures = async (filters, ctx) => {
    return await repo.findClosures(filters, ctx);
};
