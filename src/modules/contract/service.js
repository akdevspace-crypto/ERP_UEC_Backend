import { prisma } from '../../app/prisma.js';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';

export const getContractByAdmissionId = async (user, admissionId) => {
    const canReadAll = ['admin', 'super admin', 'superadmin', 'finance manager', 'home_care_manager', 'home care manager', 'care_allocation_manager', 'care allocation manager'].includes(String(user?.role || '').trim().toLowerCase());
    const hasFacilityWideAccess = canReadAll || (user.unitAccess && user.unitAccess.includes('*'));
    const accessibleUnits = hasFacilityWideAccess ? undefined : [user.unitId, ...(user.unitAccess || [])].filter(Boolean);
    return await prisma.serviceContract.findFirst({
        where: {
            tenantId: user.tenantId,
            ...(accessibleUnits ? { unitId: { in: accessibleUnits } } : {}),
            admissionId,
            isDeleted: false
        },
        include: {
            termsAcceptedBy: {
                select: { id: true, firstName: true, lastName: true }
            }
        }
    });
};

export const createDraftContract = async (user, data) => {
    const tenantId = user.tenantId;
    let unitId = user.unitId;

    let admission = null;
    if (data.admissionId) {
        admission = await prisma.admission.findFirst({
            where: { id: data.admissionId, tenantId },
            include: {
                enquiry: {
                    include: {
                        service: true,
                        client: true
                    }
                },
                patient: true
            }
        });
    }

    if (!admission && data.enquiryId) {
        // Check if admission already exists for this enquiry
        admission = await prisma.admission.findFirst({
            where: { enquiryId: data.enquiryId, tenantId },
            include: {
                enquiry: {
                    include: {
                        service: true,
                        client: true
                    }
                },
                patient: true
            }
        });

        if (!admission) {
            // Find enquiry
            const enquiry = await prisma.enquiry.findFirst({
                where: { id: data.enquiryId, tenantId, isDeleted: false },
                include: { client: true, service: true }
            });

            if (!enquiry) {
                throw new Error('Enquiry not found or unauthorized');
            }

            const targetUnitId = enquiry.unitId || unitId || (user.unitAccess && user.unitAccess[0] !== '*' ? user.unitAccess[0] : null);
            unitId = targetUnitId || unitId;

            let meta = {};
            if (typeof enquiry.rawMessage === 'string') {
                try { meta = JSON.parse(enquiry.rawMessage); } catch (e) {}
            } else if (enquiry.rawMessage && typeof enquiry.rawMessage === 'object') {
                meta = enquiry.rawMessage;
            }

            const patientName = String(meta.patientName || enquiry.client?.name || 'Home Care Client').trim();
            const currentYear = new Date().getFullYear();
            const elderId = await generateRefNumber(`UEC-ELD-${currentYear}`, tenantId, targetUnitId, prisma);

            const patient = await prisma.patient.create({
                data: {
                    elderId,
                    name: patientName,
                    age: meta.patientAge ? parseInt(meta.patientAge, 10) : undefined,
                    gender: meta.patientGender || undefined,
                    primaryContact: enquiry.client?.mobile || undefined,
                    phone: enquiry.client?.mobile || undefined,
                    address: meta.clientLocation || enquiry.client?.address || undefined,
                    tenantId,
                    unitId: targetUnitId
                }
            });

            admission = await prisma.admission.create({
                data: {
                    enquiryId: enquiry.id,
                    patientId: patient.id,
                    tenantId,
                    unitId: targetUnitId,
                    status: 'ACTIVE',
                    healthCondition: meta.patientHealthCondition || undefined
                },
                include: {
                    enquiry: {
                        include: {
                            service: true,
                            client: true
                        }
                    },
                    patient: true
                }
            });
        }
    }

    if (!admission) {
        throw new Error('Admission not found or unauthorized');
    }

    // Check if contract already exists
    const existingContract = await prisma.serviceContract.findFirst({
        where: { admissionId: admission.id, isDeleted: false }
    });

    if (existingContract) {
        throw new Error('Service contract already exists for this admission');
    }

    const contractUnitId = admission.unitId || unitId;

    // Generate contract number
    const contractNumber = await generateRefNumber('SC', tenantId, contractUnitId, prisma);

    // Extract Req 1 data and pricing
    const serviceReqs = admission.enquiry?.serviceRequirements || {};
    
    // Normalize staffRequired safely to prevent Prisma Int vs String errors
    const normalizedStaffReq = serviceReqs.staffRequired != null 
        ? Number(serviceReqs.staffRequired) 
        : null;
    const finalStaffRequired = data.staffRequired ?? (!Number.isNaN(normalizedStaffReq) ? normalizedStaffReq : null);
    
    // Create DRAFT contract
    return await prisma.serviceContract.create({
        data: {
            contractNumber,
            admissionId: admission.id,
            tenantId,
            unitId: contractUnitId,
            startDate: new Date(data.startDate),
            endDate: data.endDate ? new Date(data.endDate) : null,
            status: 'DRAFT',
            staffRequired: finalStaffRequired,
            shift: data.shift ?? serviceReqs.shift ?? null,
            frequency: data.frequency ?? serviceReqs.frequency ?? null,
            careRequirements: data.careRequirements ?? serviceReqs.careRequirements ?? null,
            specialInstructions: data.specialInstructions ?? serviceReqs.specialInstructions ?? null,
            servicePrice: data.servicePrice ?? admission.enquiry?.service?.price ?? null,
            billingCycle: data.billingCycle ?? null
        }
    });
};

export const updateDraftContract = async (user, contractId, data) => {
    const canReadAll = ['admin', 'super admin', 'superadmin', 'finance manager', 'home_care_manager', 'home care manager', 'care_allocation_manager', 'care allocation manager'].includes(String(user?.role || '').trim().toLowerCase());
    const hasFacilityWideAccess = canReadAll || (user.unitAccess && user.unitAccess.includes('*'));
    const accessibleUnits = hasFacilityWideAccess ? undefined : [user.unitId, ...(user.unitAccess || [])].filter(Boolean);
    const contract = await prisma.serviceContract.findFirst({
        where: {
            id: contractId,
            tenantId: user.tenantId,
            ...(accessibleUnits ? { unitId: { in: accessibleUnits } } : {}),
            isDeleted: false
        }
    });

    if (!contract) {
        throw new Error('Service contract not found');
    }

    // Allow modifying DRAFT contracts as well as amending/renewing/cancelling ACTIVE contracts
    if (contract.status !== 'DRAFT' && contract.status !== 'ACTIVE') {
        throw new Error(`Contracts in status ${contract.status} cannot be modified`);
    }

    const nextStatus = data.status && ['ACTIVE', 'CANCELLED', 'COMPLETED', 'EXPIRED'].includes(data.status)
        ? data.status
        : undefined;

    let updatedSnapshot = contract.termsSnapshot || {};
    if (typeof updatedSnapshot === 'string') {
        try { updatedSnapshot = JSON.parse(updatedSnapshot); } catch (e) { updatedSnapshot = {}; }
    }

    if (contract.status === 'ACTIVE' || nextStatus) {
        const amendments = Array.isArray(updatedSnapshot.amendments) ? updatedSnapshot.amendments : [];
        amendments.push({
            modifiedAt: new Date().toISOString(),
            modifiedBy: user.id,
            modifiedByName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Supervisor',
            changes: {
                ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
                ...(data.servicePrice !== undefined ? { servicePrice: data.servicePrice } : {}),
                ...(data.billingCycle !== undefined ? { billingCycle: data.billingCycle } : {}),
                ...(data.shift !== undefined ? { shift: data.shift } : {}),
                ...(data.frequency !== undefined ? { frequency: data.frequency } : {}),
                ...(data.status !== undefined ? { status: data.status } : {}),
                reason: data.amendmentReason || data.reason || 'Contract terms update'
            }
        });
        updatedSnapshot = { ...updatedSnapshot, amendments, lastReason: data.amendmentReason || data.reason };
    }

    return await prisma.serviceContract.update({
        where: { id: contractId },
        data: {
            ...(data.startDate && { startDate: new Date(data.startDate) }),
            ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
            ...(data.staffRequired !== undefined && { staffRequired: data.staffRequired }),
            ...(data.shift !== undefined && { shift: data.shift }),
            ...(data.frequency !== undefined && { frequency: data.frequency }),
            ...(data.careRequirements !== undefined && { careRequirements: data.careRequirements }),
            ...(data.specialInstructions !== undefined && { specialInstructions: data.specialInstructions }),
            ...(data.servicePrice !== undefined && { servicePrice: data.servicePrice }),
            ...(data.billingCycle !== undefined && { billingCycle: data.billingCycle }),
            ...(nextStatus && { status: nextStatus }),
            termsSnapshot: updatedSnapshot
        }
    });
};

export const activateContract = async (user, contractId, userId) => {
    const canReadAll = ['admin', 'super admin', 'superadmin', 'finance manager', 'home_care_manager', 'home care manager', 'care_allocation_manager', 'care allocation manager'].includes(String(user?.role || '').trim().toLowerCase());
    const hasFacilityWideAccess = canReadAll || (user.unitAccess && user.unitAccess.includes('*'));
    const accessibleUnits = hasFacilityWideAccess ? undefined : [user.unitId, ...(user.unitAccess || [])].filter(Boolean);
    const contract = await prisma.serviceContract.findFirst({
        where: {
            id: contractId,
            tenantId: user.tenantId,
            ...(accessibleUnits ? { unitId: { in: accessibleUnits } } : {}),
            isDeleted: false
        }
    });

    if (!contract) {
        throw new Error('Service contract not found');
    }

    if (contract.status !== 'DRAFT') {
        throw new Error('Only DRAFT contracts can be activated');
    }

    return await prisma.serviceContract.update({
        where: { id: contractId },
        data: {
            status: 'ACTIVE',
            termsAcceptedAt: new Date(),
            termsAcceptedById: userId
        }
    });
};
