import { prisma } from '../../app/prisma.js';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';

const buildAllocationDutyDescription = (allocation, notes) => {
    const clientName = allocation.enquiry?.client?.name || 'Client pending';
    const patientName = allocation.admission?.patient?.name || allocation.enquiry?.admission?.patient?.name || allocation.metadata?.patientName || allocation.enquiry?.client?.name || 'Patient pending';
    return [
        `Allocation:${allocation.id}`,
        `Reference: ${allocation.refNo}`,
        `Client: ${clientName}`,
        `Patient: ${patientName}`,
        `Care Type: ${allocation.type}`,
        notes ? `Notes: ${notes}` : null
    ].filter(Boolean).join('\n');
};

const syncMedicalAssignment = async (allocation) => {
    if (!allocation?.staffId || allocation.status !== 'ALLOCATED') return;

    try {
        const existingAssignment = await prisma.medicalAssignment.findFirst({
            where: {
                allocationId: allocation.id,
                tenantId: allocation.tenantId,
                isDeleted: false
            }
        });

        const staff = allocation.staff || await prisma.staff.findFirst({
            where: { id: allocation.staffId, isDeleted: false }
        });

        let resolvedPatientId = allocation.admission?.patientId || allocation.enquiry?.admission?.patientId || allocation.enquiry?.admission?.patient?.id || null;
        if (!resolvedPatientId && allocation.enquiryId) {
            const enquiry = await prisma.enquiry.findUnique({
                where: { id: allocation.enquiryId },
                include: { admission: true }
            });
            resolvedPatientId = enquiry?.admission?.patientId || null;
        }

        const medData = {
            staffId: allocation.staffId,
            patientId: resolvedPatientId,
            admissionId: allocation.admissionId || null,
            enquiryId: allocation.enquiryId || null,
            allocationId: allocation.id,
            startAt: allocation.startDate || new Date(),
            endAt: allocation.endDate || null,
            status: 'ASSIGNED',
            dutyType: 'ROUND',
            role: staff?.designation || staff?.department || null,
            notes: allocation.metadata?.notes || null
        };

        let finalAssignment;
        if (existingAssignment) {
            finalAssignment = await prisma.medicalAssignment.update({
                where: { id: existingAssignment.id },
                data: {
                    ...medData,
                    startAt: medData.startAt || existingAssignment.startAt,
                    status: existingAssignment.status
                }
            });
        } else {
            console.log('Creating new MedicalAssignment for allocation', allocation.id);
            const { randomUUID } = await import('crypto');
            const { generateRefNumber } = await import('../../shared/utils/refGenerator.js');
            finalAssignment = await prisma.medicalAssignment.create({
                data: {
                    id: randomUUID(),
                    refNo: await generateRefNumber('MED', allocation.tenantId, allocation.unitId, prisma),
                    ...medData,
                    tenantId: allocation.tenantId,
                    unitId: allocation.unitId
                }
            });
            console.log('Created MedicalAssignment:', finalAssignment.id);
        }

        const staffName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim();
        console.log('Generating operational tasks for assignment...', finalAssignment.id);
        const { generateOperationalTasksForAssignment } = await import('../medical/service.js');
        await generateOperationalTasksForAssignment(prisma, finalAssignment, staffName);
        console.log('Successfully generated tasks');
    } catch (e) {
        console.error('Failed to sync MedicalAssignment from Allocation:', e);
    }
};

const syncAllocationDutyTask = async (allocation) => {
    if (!allocation?.staffId || allocation.status !== 'ALLOCATED') return;

    const staff = allocation.staff || await prisma.staff.findFirst({
        where: {
            id: allocation.staffId,
            tenantId: allocation.tenantId,
            isDeleted: false
        },
        select: {
            id: true,
            userId: true,
            firstName: true,
            lastName: true,
            empId: true
        }
    });

    if (!staff) return;

    const serviceName = allocation.enquiry?.service?.name || 'Care Duty';
    const clientName = allocation.enquiry?.client?.name || 'Client';
    const description = buildAllocationDutyDescription(allocation, allocation.metadata?.notes);
    const existingTask = await prisma.task.findFirst({
        where: {
            tenantId: allocation.tenantId,
            unitId: allocation.unitId,
            isDeleted: false,
            status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
            description: { contains: `Allocation:${allocation.id}` }
        },
        select: { id: true }
    });

    const taskData = {
        title: `${serviceName} duty - ${clientName}`,
        description,
        type: allocation.endDate ? 'SCHEDULED' : 'DAILY',
        priority: allocation.metadata?.priority || 'MEDIUM',
        assigneeId: staff.userId || null,
        assignedStaffId: staff.id,
        enquiryId: allocation.enquiryId,
        dueDate: allocation.startDate || new Date(),
        tenantId: allocation.tenantId,
        unitId: allocation.unitId,
        status: 'ASSIGNED'
    };

    if (existingTask) {
        await prisma.task.update({
            where: { id: existingTask.id },
            data: taskData
        });
        return;
    }

    await prisma.task.create({
        data: {
            refNo: await generateRefNumber('TSK', allocation.tenantId, allocation.unitId, prisma),
            ...taskData
        }
    });
};

export const createAllocation = async (tenantId, unitId, data) => {
    const enquiry = await prisma.enquiry.findFirst({
        where: {
            id: data.enquiryId,
            tenantId,
            isDeleted: false
        },
        select: { id: true, unitId: true }
    });

    if (!enquiry) {
        const error = new Error('Admission enquiry not found or access denied');
        error.status = 404;
        throw error;
    }

    const sourceUnitId = enquiry.unitId || unitId;
    const targetUnitId = data.targetUnitId || sourceUnitId;

    if (targetUnitId !== sourceUnitId) {
        const targetUnit = await prisma.unit.findFirst({
            where: {
                id: targetUnitId,
                tenantId,
                status: true,
                isDeleted: false
            },
            select: { id: true }
        });

        if (!targetUnit) {
            const error = new Error('Target care unit not found or access denied');
            error.status = 404;
            throw error;
        }
    }

    if (data.staffId) {
        const staff = await prisma.staff.findFirst({
            where: {
                id: data.staffId,
                tenantId,
                isDeleted: false
            },
            select: { id: true, unitId: true }
        });

        if (!staff) {
            const error = new Error('Selected staff not found in this organization');
            error.status = 404;
            throw error;
        }
    }

    const allocationRef = await generateRefNumber('ALC', tenantId, targetUnitId, prisma);
    const metadata = {
        ...(data.metadata || {}),
        handoffSource: data.metadata?.handoffSource || 'ADMISSION_TRACKING',
        sourceUnitId,
        targetUnitId
    };

    const allocation = await prisma.allocation.upsert({
        where: {
            enquiryId: data.enquiryId
        },
        update: {
            staffId: data.staffId,
            type: data.type || 'HOME_CARE',
            status: data.status || 'ALLOCATED',
            startDate: data.startDate ? new Date(data.startDate) : new Date(),
            endDate: data.endDate ? new Date(data.endDate) : null,
            metadata,
            unitId: targetUnitId,
            isDeleted: false,
            deletedAt: null
        },
        create: {
            refNo: allocationRef,
            enquiryId: data.enquiryId,
            staffId: data.staffId,
            type: data.type || 'HOME_CARE',
            status: data.status || 'ALLOCATED',
            startDate: data.startDate ? new Date(data.startDate) : new Date(),
            endDate: data.endDate ? new Date(data.endDate) : null,
            metadata,
            tenantId,
            unitId: targetUnitId,
        }
    }).then((allocation) => prisma.allocation.findUnique({
        where: { id: allocation.id },
        include: {
            enquiry: {
                select: {
                    id: true,
                    refNo: true,
                    mode: true,
                    client: {
                        select: {
                            id: true,
                            name: true,
                            mobile: true
                        }
                    },
                    service: {
                        select: {
                            id: true,
                            name: true,
                            category: true
                        }
                    }
                }
            },
            staff: {
                select: {
                    id: true,
                    userId: true,
                    firstName: true,
                    lastName: true,
                    empId: true
                }
            },
            admission: {
                select: {
                    id: true,
                    patientId: true,
                    patient: {
                        select: { id: true, name: true }
                    }
                }
            }
        }
    }));

    await syncMedicalAssignment(allocation);
    await syncAllocationDutyTask(allocation);

    return allocation;
};

export const getAllocationsByType = async (tenantId, unitId, type, user) => {
    const isDemoReference = (value) => {
        const normalized = String(value || '').toUpperCase();
        return normalized.startsWith('DEMO-') || normalized.startsWith('SEED-');
    };

    const staff = user?.id ? await prisma.staff.findFirst({
        where: { tenantId, userId: user.id, isDeleted: false },
        select: { id: true }
    }) : null;

    const unitFilter = (unitId && unitId !== 'ALL')
        ? (staff?.id ? { OR: [{ unitId }, { staffId: staff.id }] } : { unitId })
        : {};

    const allocations = await prisma.allocation.findMany({
        where: {
            tenantId,
            ...unitFilter,
            type,
            isDeleted: false
        },
        include: {
            enquiry: {
                select: {
                    id: true,
                    refNo: true,
                    rawMessage: true,
                    client: {
                        select: { id: true, name: true, mobile: true }
                    },
                    service: {
                        select: { id: true, name: true }
                    },
                    admission: {
                        select: {
                            id: true,
                            patient: { select: { id: true, name: true } }
                        }
                    }
                }
            },
            admission: {
                select: {
                    id: true,
                    patient: { select: { id: true, name: true, phone: true, age: true, gender: true } },
                    floor: true,
                    room: true,
                    bed: true
                }
            },
            staff: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    empId: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    return allocations.map((allocation) => {
        // Normalize patient information so frontend doesn't need to check both paths
        const patientName = allocation.admission?.patient?.name || allocation.enquiry?.admission?.patient?.name || 'Patient';
        const patientId = allocation.admission?.patient?.id || allocation.enquiry?.admission?.patient?.id || null;
        const phone = allocation.admission?.patient?.phone || allocation.enquiry?.client?.mobile || null;
        const age = allocation.admission?.patient?.age || null;
        const gender = allocation.admission?.patient?.gender || null;

        return {
            ...allocation,
            resolvedPatient: { id: patientId, name: patientName, phone, age, gender }
        };
    }).filter((allocation) => (
        !allocation.metadata?.demo &&
        !isDemoReference(allocation.refNo) &&
        !isDemoReference(allocation.enquiry?.refNo) &&
        !isDemoReference(allocation.staff?.empId)
    ));
};

export const updateAllocation = async (tenantId, unitId, id, data) => {
    const existing = await prisma.allocation.findFirst({
        where: { id, tenantId, isDeleted: false },
        select: { id: true, metadata: true, unitId: true }
    });
    if (!existing) {
        const error = new Error('Allocation not found');
        error.status = 404;
        throw error;
    }

    let assignmentUnitId = existing.unitId || unitId;

    if (data.staffId) {
        const staff = await prisma.staff.findFirst({
            where: {
                id: data.staffId,
                tenantId,
                isDeleted: false
            },
            select: { id: true, unitId: true }
        });

        if (!staff) {
            const error = new Error('Selected staff not found');
            error.status = 404;
            throw error;
        }

        assignmentUnitId = staff.unitId || assignmentUnitId;
    }

    const updateData = {
        ...data,
        unitId: assignmentUnitId,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : data.endDate === null ? null : undefined,
        metadata: data.metadata
            ? {
                ...(existing.metadata || {}),
                ...data.metadata
            }
            : undefined
    };

    const allocation = await prisma.allocation.update({
        where: { id },
        data: updateData,
        include: {
            enquiry: {
                select: {
                    id: true,
                    refNo: true,
                    rawMessage: true,
                    mode: true,
                    client: {
                        select: {
                            id: true,
                            name: true,
                            mobile: true
                        }
                    },
                    service: {
                        select: {
                            id: true,
                            name: true,
                            category: true
                        }
                    }
                }
            },
            staff: {
                select: {
                    id: true,
                    userId: true,
                    firstName: true,
                    lastName: true,
                    empId: true
                }
            },
            admission: {
                select: {
                    id: true,
                    patientId: true,
                    patient: {
                        select: { id: true, name: true }
                    }
                }
            }
        }
    });

    await syncMedicalAssignment(allocation);
    await syncAllocationDutyTask(allocation);

    return allocation;
};
