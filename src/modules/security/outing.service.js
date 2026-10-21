import { prisma } from '../../app/prisma.js';

export const getSecurityOutings = async (tenantId, unitId) => {
    // Return APPROVED requests and any ACTIVE movements (OUTSIDE)
    const requests = await prisma.residentOutingRequest.findMany({
        where: {
            tenantId,
            unitId,
            isDeleted: false
        },
        include: {
            patient: {
                select: { id: true, name: true, elderId: true }
            },
            companionStaff: {
                select: { empId: true, user: { select: { firstName: true, lastName: true } } }
            },
            companionVisitorProfile: {
                select: { name: true, mobile: true }
            },
            requestedByUser: {
                select: { firstName: true, lastName: true, email: true, staff: { select: { empId: true } } }
            },
            movements: {
                where: { isDeleted: false },
                include: {
                    exitRecordedByUser: { select: { firstName: true, lastName: true, email: true, staff: { select: { empId: true } } } },
                    returnRecordedByUser: { select: { firstName: true, lastName: true, email: true, staff: { select: { empId: true } } } }
                },
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        },
        orderBy: { expectedExitAt: 'asc' }
    });

    const now = new Date();
    
    return requests.map(req => {
        const movement = req.movements[0];
        let isOverdue = false;
        
        if (movement?.status === 'OUTSIDE' && req.expectedReturnAt && new Date(req.expectedReturnAt) < now) {
            isOverdue = true;
        }

        return {
            ...req,
            isOverdue,
            displayStatus: isOverdue ? 'OVERDUE' : (movement?.status || req.status)
        };
    });
};

export const recordPhysicalExit = async (tenantId, unitId, userId, requestId) => {
    return await prisma.$transaction(async (tx) => {
        const request = await tx.residentOutingRequest.findFirst({
            where: { id: requestId, tenantId, unitId, isDeleted: false }
        });

        if (!request) throw new Error('Outing request not found or unauthorized');
        if (request.status !== 'APPROVED') throw new Error('Outing is not approved');

        // Check if there's already an active movement for this request
        const existingMovement = await tx.residentGateMovement.findFirst({
            where: { outingRequestId: requestId, isDeleted: false }
        });

        if (existingMovement) {
            throw new Error('A movement record already exists for this request');
        }

        // Active-outside protection: A resident shouldn't have another active physical outing simultaneously.
        const activeOutings = await tx.residentGateMovement.findFirst({
            where: {
                patientId: request.patientId,
                status: 'OUTSIDE',
                isDeleted: false
            }
        });

        if (activeOutings) {
            throw new Error('Resident is already outside on another outing');
        }

        const movement = await tx.residentGateMovement.create({
            data: {
                outingRequestId: requestId,
                patientId: request.patientId,
                tenantId,
                unitId,
                exitAt: new Date(),
                status: 'OUTSIDE',
                exitRecordedByUserId: userId
            }
        });

        return movement;
    });
};

export const recordPhysicalReturn = async (tenantId, unitId, userId, movementId) => {
    return await prisma.$transaction(async (tx) => {
        const movement = await tx.residentGateMovement.findFirst({
            where: {
                OR: [
                    { id: movementId },
                    { outingRequestId: movementId }
                ],
                tenantId,
                unitId,
                isDeleted: false
            }
        });

        if (!movement) throw new Error('Movement record not found or unauthorized');
        if (movement.status !== 'OUTSIDE') throw new Error('Resident is already returned or invalid status');

        const updatedMovement = await tx.residentGateMovement.update({
            where: { id: movement.id },
            data: {
                actualReturnAt: new Date(),
                status: 'RETURNED',
                returnRecordedByUserId: userId
            }
        });

        // Update request to COMPLETED
        await tx.residentOutingRequest.update({
            where: { id: movement.outingRequestId },
            data: { status: 'COMPLETED' }
        });

        return updatedMovement;
    });
};

export const createSecurityOuting = async (tenantId, unitId, userId, data) => {
    return await prisma.$transaction(async (tx) => {
        // Active-outside protection
        const activeMovement = await tx.residentGateMovement.findFirst({
            where: {
                patientId: data.patientId,
                status: 'OUTSIDE',
                isDeleted: false
            }
        });

        if (activeMovement) {
            throw new Error('Resident is already outside on another outing');
        }

        let normalizedCompanionType = null;
        if (data.companionType) {
            const rawType = String(data.companionType).toUpperCase();
            if (rawType === 'STAFF' || rawType.includes('STAFF') || rawType.includes('CAREGIVER')) {
                normalizedCompanionType = 'STAFF';
            } else if (rawType === 'VISITOR' || rawType.includes('VISITOR') || rawType.includes('FAMILY') || rawType.includes('FRIEND') || rawType.includes('RELATIVE')) {
                normalizedCompanionType = 'VISITOR';
            } else if (rawType === 'EXTERNAL' || rawType.includes('EXTERNAL')) {
                normalizedCompanionType = 'EXTERNAL';
            }
        }

        const request = await tx.residentOutingRequest.create({
            data: {
                patientId: data.patientId,
                tenantId,
                unitId,
                reason: data.reason,
                destination: data.destination,
                expectedExitAt: new Date(),
                expectedReturnAt: data.expectedReturnAt ? new Date(data.expectedReturnAt) : null,
                status: 'APPROVED', // Keep approved for internal consistency if needed
                requestedByUserId: userId,
                companionType: normalizedCompanionType,
                companionStaffId: data.companionStaffId || null,
                companionVisitorProfileId: data.companionVisitorProfileId || null,
                companionName: data.companionName || null,
                companionPhone: data.companionPhone || null,
                companionRelation: data.companionRelation || null,
                materials: data.materials || null
            }
        });

        // Immediately record physical exit
        await tx.residentGateMovement.create({
            data: {
                outingRequestId: request.id,
                patientId: request.patientId,
                tenantId,
                unitId,
                exitAt: new Date(),
                status: 'OUTSIDE',
                exitRecordedByUserId: userId
            }
        });

        // Fetch request with movement
        return await tx.residentOutingRequest.findUnique({
            where: { id: request.id },
            include: {
                patient: { select: { id: true, name: true, elderId: true } },
                movements: true
            }
        });
    });
};
