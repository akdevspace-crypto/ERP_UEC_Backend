import { prisma } from '../../app/prisma.js';

export const createOutingRequest = async (tenantId, unitId, requestedByUserId, data) => {
    // Verify patient exists and belongs to tenant
    const patient = await prisma.patient.findFirst({
        where: { id: data.patientId, tenantId, unitId }
    });

    if (!patient) {
        throw new Error('Patient not found or unauthorized');
    }

    // Verify companion if provided
    if (data.companionType === 'STAFF' && data.companionStaffId) {
        const staff = await prisma.staff.findFirst({
            where: { id: data.companionStaffId, tenantId, unitId, isDeleted: false }
        });
        if (!staff) throw new Error('Invalid companion staff');
    } else if (data.companionType === 'VISITOR' && data.companionVisitorProfileId) {
        const visitor = await prisma.visitorProfile.findFirst({
            where: { id: data.companionVisitorProfileId, tenantId }
        });
        if (!visitor) throw new Error('Invalid companion visitor profile');
    }

    return await prisma.$transaction(async (tx) => {
        const request = await tx.residentOutingRequest.create({
            data: {
                tenantId,
                unitId,
                patientId: data.patientId,
                requestedByUserId,
                reason: data.reason,
                destination: data.destination,
                expectedExitAt: new Date(data.expectedExitAt),
                expectedReturnAt: new Date(data.expectedReturnAt),
                companionType: data.companionType,
                companionStaffId: data.companionStaffId,
                companionVisitorProfileId: data.companionVisitorProfileId,
                companionName: data.companionName,
                companionPhone: data.companionPhone,
                companionRelation: data.companionRelation,
                materials: data.materials ? JSON.stringify(data.materials) : null,
                status: 'PENDING_APPROVAL'
            }
        });

        await tx.approval.create({
            data: {
                entityType: 'ResidentOutingRequest',
                entityId: request.id,
                status: 'PENDING',
                tenantId,
                unitId
            }
        });

        return request;
    });
};

export const getOutingRequests = async (tenantId, unitId, filters = {}) => {
    return await prisma.residentOutingRequest.findMany({
        where: {
            tenantId,
            unitId,
            isDeleted: false,
            ...(filters.patientId ? { patientId: filters.patientId } : {}),
            ...(filters.status ? { status: filters.status } : {})
        },
        include: {
            patient: {
                select: { id: true, name: true, elderId: true }
            },
            requestedByUser: {
                select: { id: true, firstName: true, lastName: true, email: true }
            },
            movements: true
        },
        orderBy: { createdAt: 'desc' }
    });
};

export const getOutingRequestById = async (tenantId, id, unitId) => {
    return await prisma.residentOutingRequest.findFirst({
        where: { id, tenantId, unitId, isDeleted: false },
        include: {
            patient: {
                select: { id: true, name: true, elderId: true }
            },
            requestedByUser: {
                select: { id: true, firstName: true, lastName: true, email: true }
            },
            companionStaff: {
                select: { id: true, empId: true, user: { select: { firstName: true, lastName: true } } }
            },
            companionVisitorProfile: {
                select: { id: true, name: true, mobile: true }
            },
            movements: true
        }
    });
};

export const processOutingApproval = async (tenantId, requestId, approverId, action, comments, unitId) => {
    return await prisma.$transaction(async (tx) => {
        const request = await tx.residentOutingRequest.findFirst({
            where: { id: requestId, tenantId, unitId, isDeleted: false }
        });

        if (!request) throw new Error('Outing request not found');
        if (request.status !== 'PENDING_APPROVAL') throw new Error('Request is already processed');

        const approval = await tx.approval.findFirst({
            where: { entityType: 'ResidentOutingRequest', entityId: requestId, tenantId, unitId, isDeleted: false }
        });

        if (!approval) throw new Error('Approval record not found');

        const updatedApproval = await tx.approval.update({
            where: { id: approval.id },
            data: {
                status: action,
                approverId,
                comments
            }
        });

        const updatedRequest = await tx.residentOutingRequest.update({
            where: { id: requestId },
            data: {
                status: action
            }
        });

        return { request: updatedRequest, approval: updatedApproval };
    });
};
