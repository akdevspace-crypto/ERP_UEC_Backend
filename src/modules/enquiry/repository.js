import { prisma } from '../../app/prisma.js';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';
import { resolveAssignableStaffContext } from '../tasks/service.js';

const ENQUIRY_STATUS_MAP = {
    Open: 'NEW',
    'In Progress': 'IN_PROGRESS',
    Converted: 'CLOSED',
    Lost: 'CLOSED',
    Emergency: 'NEW',
    Important: 'NEW',
    'Just Enquiry': 'NEW'
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mapEnquiryStatus = (statusLabel) => {
    if (!statusLabel) return undefined;
    return ENQUIRY_STATUS_MAP[statusLabel] ?? undefined;
};

const buildEnquiryMeta = (data = {}) => ({
    patientName: data.patientName || '',
    patientAge: data.patientAge || '',
    patientGender: data.patientGender || '',
    patientHealthCondition: data.patientHealthCondition || '',
    clientLocation: data.clientLocation || '',
    remarks: data.remarks || ''
});

const parseEnquiryMeta = (rawMessage) => {
    if (!rawMessage) return {};

    try {
        const parsed = JSON.parse(rawMessage);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const admissionWithRelationsSelect = {
    id: true,
    status: true,
    admittedAt: true,
    dischargedAt: true,
    createdAt: true,
    unitId: true,
    tenantId: true,
    patient: {
        select: {
            id: true,
            name: true
        }
    },
    enquiry: {
        select: {
            id: true,
            refNo: true,
            status: true,
            isConverted: true,
            convertedAt: true,
            rawMessage: true,
            description: true,
            mode: true,
            client: {
                select: {
                    id: true,
                    name: true,
                    mobile: true,
                    email: true,
                    address: true
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
    }
};

const enquiryWithRelationsSelect = {
    id: true,
    refNo: true,
    createdAt: true,
    unitId: true,
    tenantId: true,
    serviceId: true,
    mode: true,
    source: true,
    description: true,
    rawMessage: true,
    status: true,
    isConverted: true,
    convertedAt: true,
    serviceRequirements: true,
    client: {
        select: {
            id: true,
            name: true,
            mobile: true,
            email: true,
            address: true
        }
    },
    service: {
        select: {
            id: true,
            name: true,
            category: true
        }
    },
    admission: {
        select: {
            id: true,
            status: true,
            admittedAt: true,
            patient: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    }
};

const resolveClientServiceId = async (tx, serviceValue, tenantId, unitId) => {
    if (serviceValue === undefined || serviceValue === null) return undefined;

    const normalizedValue = String(serviceValue).trim();
    if (!normalizedValue) return undefined;

    if (UUID_PATTERN.test(normalizedValue)) {
        const serviceById = await tx.clientService.findFirst({
            where: {
                id: normalizedValue,
                tenantId,
                unitId,
                isDeleted: false
            },
            select: { id: true }
        });
        return serviceById?.id;
    }

    const serviceByName = await tx.clientService.findFirst({
        where: {
            tenantId,
            unitId,
            isDeleted: false,
            name: {
                equals: normalizedValue,
                mode: 'insensitive'
            }
        },
        select: { id: true }
    });

    return serviceByName?.id;
};

const createEnquiryRecord = async (tx, data, clientId, serviceId, tenantId, unitId) => {
    const enquiryRef = await generateRefNumber('ENQ', tenantId, unitId, tx);
    const mappedStatus = mapEnquiryStatus(data.status);

    const payload = {
        refNo: enquiryRef,
        clientId,
        serviceId: serviceId || null,
        description: data.comments,
        rawMessage: JSON.stringify(buildEnquiryMeta(data)),
        mode: data.mode,
        status: mappedStatus || 'NEW',
        isConverted: data.status === 'Converted' ? true : false,
        convertedAt: data.status === 'Converted' ? new Date() : null,
        tenantId,
        unitId
    };

    try {
        return await tx.enquiry.create({
            data: payload,
            select: enquiryWithRelationsSelect
        });
    } catch (error) {
        const failedTarget = JSON.stringify(error?.meta?.field_name || error?.meta?.target || '');
        const isOptionalServiceConstraint = error?.code === 'P2003' && serviceId && failedTarget.includes('service');

        if (!isOptionalServiceConstraint) throw error;

        return tx.enquiry.create({
            data: {
                ...payload,
                serviceId: null
            },
            select: enquiryWithRelationsSelect
        });
    }
};

const buildFallbackScore = (enquiry) => {
    let score = 50;
    const factors = { base: 50 };

    const mode = String(enquiry.mode || '').toUpperCase();
    if (mode === 'WHATSAPP') {
        score += 10;
        factors.channel = 10;
    } else if (mode === 'WEBSITE') {
        score += 5;
        factors.channel = 5;
    }

    if (enquiry.client?.mobile && enquiry.client?.email) {
        score += 5;
        factors.contactInfo = 5;
    }

    const leadText = `${enquiry.description || ''} ${enquiry.rawMessage || ''}`.toLowerCase();
    if (/(urgent|immediate|emergency|critical|asap|hot lead)/.test(leadText)) {
        score += 30;
        factors.urgency = 30;
    } else if (/(follow up|callback|soon|priority)/.test(leadText)) {
        score += 15;
        factors.urgency = 15;
    }

    if (/(price|cost|quotation|budget)/.test(leadText)) {
        score += 5;
        factors.intent = 5;
    }

    score = Math.min(100, Math.max(0, score));
    const label = score > 80 ? 'HOT' : score > 40 ? 'WARM' : 'COLD';

    return {
        score,
        label,
        probability: score / 100,
        confidence: 0.6,
        factors
    };
};

const normalizeFollowUpChannel = (channel) => {
    const normalized = String(channel || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!normalized) return 'CALL';
    if (normalized === 'PHONE_CALL') return 'CALL';
    return normalized;
};

const normalizeFollowUpOutcome = (outcome) => {
    const normalized = String(outcome || '').trim().toUpperCase().replace(/\s+/g, '_');
    return normalized || 'PENDING';
};

export const createClientAndEnquiryQuery = async (data, tenantId, unitId) => {
    return prisma.$transaction(async (tx) => {
        const resolvedUnitId = unitId;

        try {
        let client = await tx.client.findFirst({
            where: { mobile: data.mobile, tenantId, unitId: resolvedUnitId, isDeleted: false }
        });

        // 🛡️ Duplicate Mobile Detection: Block creation if an active enquiry exists for this client
        if (client) {
            const activeEnquiry = await tx.enquiry.findFirst({
                where: {
                    clientId: client.id,
                    tenantId,
                    unitId: resolvedUnitId,
                    isDeleted: false,
                    status: { in: ['NEW', 'IN_PROGRESS', 'FOLLOW_UP'] }
                },
                select: { refNo: true }
            });

            if (activeEnquiry) {
                const error = new Error(`An active enquiry (${activeEnquiry.refNo}) already exists for this mobile number.`);
                error.status = 400;
                throw error;
            }
        }

        if (!client) {
            const clientRef = await generateRefNumber('CLI', tenantId, resolvedUnitId, tx);
            client = await tx.client.create({
                data: {
                    refNo: clientRef,
                    name: data.clientName,
                    mobile: data.mobile,
                    email: data.email,
                    address: data.clientAddress || null,
                    tenantId,
                    unitId: resolvedUnitId
                }
            });
        } else if (data.clientAddress !== undefined) {
            client = await tx.client.update({
                where: { id: client.id },
                data: {
                    address: data.clientAddress || null
                }
            });
        }

        const serviceId = await resolveClientServiceId(tx, data.service, tenantId, resolvedUnitId);
        const enquiry = await createEnquiryRecord(tx, data, client.id, serviceId, tenantId, resolvedUnitId);

        return enquiry;
        } catch (error) {
            console.error('[ENQUIRY_CREATE] Failed', {
                code: error?.code,
                message: error?.message,
                meta: error?.meta,
                tenantId,
                unitId: resolvedUnitId,
                submittedUnitId: data?.unitId || null,
                mobile: data?.mobile || null,
                email: data?.email || null,
                service: data?.service || null,
                status: data?.status || null
            });
            throw error;
        }
    });
};

export const listEnquiriesQuery = async ({ tenantId, unitId, skip, take, search, status }) => {
    const where = {
        tenantId,
        isDeleted: false,
        ...(unitId && unitId !== 'ALL' ? { unitId } : {})
    };

    if (status) where.status = status;
    if (search) {
        where.OR = [
            { refNo: { contains: search, mode: 'insensitive' } },
            { client: { name: { contains: search, mode: 'insensitive' } } },
            { client: { mobile: { contains: search } } }
        ];
    }

    const [count, rawData] = await prisma.$transaction([
        prisma.enquiry.count({ where }),
        prisma.enquiry.findMany({
            where,
            select: {
                ...enquiryWithRelationsSelect,
                followUps: {
                    select: {
                        id: true,
                        scheduledAt: true,
                        createdAt: true,
                        notes: true,
                        outcome: true,
                        channel: true,
                        clientInterest: true,
                        nextFollowupStatus: true
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                },
                allocation: {
                    select: {
                        staff: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                empId: true
                            }
                        }
                    }
                }
            },
            skip,
            take,
            orderBy: { createdAt: 'desc' }
        })
    ]);

    // Fetch persisted automation scores using a narrow select so partially-migrated databases can still list enquiries.
    const scores = await prisma.automationScore.findMany({
        where: {
            module: 'enquiry',
            entityId: { in: rawData.map(e => e.id) }
        },
        select: {
            entityId: true,
            score: true,
            label: true,
            factors: true
        }
    });

    const scoreMap = new Map(scores.map((score) => [score.entityId, score]));

    // Backfill missing or stale scores for historical enquiries so UI always receives a usable value.
    const staleOrMissingScores = rawData.filter((enquiry) => {
        const existing = scoreMap.get(enquiry.id);
        if (!existing) return true;

        const factors = existing.factors;
        const hasFactors = Array.isArray(factors)
            ? factors.length > 0
            : !!(factors && typeof factors === 'object' && Object.keys(factors).length > 0);

        return Number(existing.score || 0) <= 0 && !hasFactors;
    });

    if (staleOrMissingScores.length > 0) {
        const backfilledScores = await Promise.all(
            staleOrMissingScores.map(async (enquiry) => {
                const fallback = buildFallbackScore(enquiry);
                return prisma.automationScore.upsert({
                    where: {
                        entityId_module: {
                            entityId: enquiry.id,
                            module: 'enquiry'
                        }
                    },
                    update: fallback,
                    create: {
                        entityId: enquiry.id,
                        module: 'enquiry',
                        tenantId: enquiry.tenantId,
                        unitId: enquiry.unitId,
                        ...fallback
                    }
                });
            })
        );

        for (const score of backfilledScores) {
            scoreMap.set(score.entityId, score);
        }
    }

    const data = rawData.map(enquiry => {
        const scoreRecord = scoreMap.get(enquiry.id);
        const meta = parseEnquiryMeta(enquiry.rawMessage);
        return {
            ...enquiry,
            patientName: meta.patientName || '',
            patientAge: meta.patientAge || '',
            patientGender: meta.patientGender || '',
            patientHealthCondition: meta.patientHealthCondition || '',
            clientAddress: enquiry.client?.address || '',
            clientLocation: meta.clientLocation || '',
            remarks: meta.remarks || '',
            automationScore: scoreRecord ? scoreRecord.score : 0,
            automationPriority: scoreRecord ? scoreRecord.label : 'COLD'
        };
    });

    return { count, data };
};

export const getEnquiryQuery = async (id, tenantId, unitId) => {
    const enquiry = await prisma.enquiry.findFirst({
        where: {
            id,
            tenantId,
            ...(unitId && unitId !== 'ALL' ? { unitId } : {}),
            isDeleted: false
        },
        select: {
            ...enquiryWithRelationsSelect,
            followUps: {
                select: {
                    id: true,
                    scheduledAt: true,
                    notes: true,
                    outcome: true,
                    channel: true,
                    clientInterest: true,
                    nextFollowupStatus: true,
                    createdAt: true
                },
                orderBy: { createdAt: 'desc' },
                take: 10
            },
            allocation: {
                select: {
                    staff: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            empId: true
                        }
                    }
                }
            }
        }
    });

    if (!enquiry) return null;

    const scoreRecord = await prisma.automationScore.findFirst({
        where: { module: 'enquiry', entityId: id },
        select: { score: true, label: true, factors: true }
    });

    const meta = parseEnquiryMeta(enquiry.rawMessage);
    return {
        ...enquiry,
        patientName: meta.patientName || '',
        patientAge: meta.patientAge || '',
        patientGender: meta.patientGender || '',
        patientHealthCondition: meta.patientHealthCondition || '',
        clientAddress: enquiry.client?.address || '',
        clientLocation: meta.clientLocation || '',
        remarks: meta.remarks || '',
        automationScore: scoreRecord ? scoreRecord.score : 0,
        automationPriority: scoreRecord ? scoreRecord.label : 'COLD',
        automationFactors: scoreRecord ? scoreRecord.factors : {}
    };
};

export const updateEnquiryQuery = async (id, data, user) => {
    const tenantId = user.tenantId;
    const unitId = user.unitId;
    const unitAccess = user.unitAccess;
    return prisma.$transaction(async (tx) => {
        const resolvedServiceId = await resolveClientServiceId(tx, data.service, tenantId, unitId);
        const resolvedStatus = mapEnquiryStatus(data.status);

        const shouldUpdateClient =
            data.clientName !== undefined ||
            data.mobile !== undefined ||
            data.email !== undefined;

        const clientUpdateData = {};
        if (data.clientName !== undefined) clientUpdateData.name = data.clientName;
        if (data.mobile !== undefined) clientUpdateData.mobile = data.mobile;
        if (data.email !== undefined) clientUpdateData.email = data.email;
        if (data.clientAddress !== undefined) clientUpdateData.address = data.clientAddress || null;

        const canReadAll = ['admin', 'super admin', 'superadmin', 'customer relations manager'].includes(String(user?.role || '').trim().toLowerCase());
        const hasFacilityWideAccess = canReadAll || (user.unitAccess && user.unitAccess.includes('*'));
        const accessibleUnits = hasFacilityWideAccess ? undefined : [user.unitId, ...(user.unitAccess || [])].filter(Boolean);

        const existing = await tx.enquiry.findFirst({
            where: { 
                id, 
                tenantId: user.tenantId, 
                ...(accessibleUnits ? { unitId: { in: accessibleUnits } } : {}) 
            },
            select: { id: true }
        });
        if (!existing) {
            const error = new Error('Enquiry not found or access denied');
            error.status = 404;
            throw error;
        }

        return tx.enquiry.update({
            where: { id },
            data: {
                description: data.comments !== undefined ? data.comments : undefined,
                rawMessage: JSON.stringify(buildEnquiryMeta(data)),
                mode: data.mode !== undefined ? data.mode : undefined,
                status: resolvedStatus,
                serviceId: resolvedServiceId !== undefined ? resolvedServiceId : undefined,
                serviceRequirements: data.serviceRequirements !== undefined ? data.serviceRequirements : undefined,
                ...(data.status === 'Converted'
                    ? { isConverted: true, convertedAt: new Date() }
                    : {}),
                ...(data.status === 'Lost'
                    ? { isConverted: false, convertedAt: null }
                    : {}),
                ...(shouldUpdateClient
                    ? {
                        client: {
                            update: clientUpdateData
                        }
                    }
                    : {})
            },
            select: enquiryWithRelationsSelect
        });
    });
};

export const deleteEnquiryQuery = async (id, tenantId, unitId) => {
    const existing = await prisma.enquiry.findFirst({
        where: { id, tenantId, unitId },
        select: { id: true }
    });
    if (!existing) {
        const error = new Error('Enquiry not found or access denied');
        error.status = 404;
        throw error;
    }

    return prisma.enquiry.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() }
    });
}

export const addFollowUpQuery = async (enquiryId, data, tenantId, unitId, userId) => {
    const scheduledAt = data.nextDate ? new Date(data.nextDate) : null;
    const channel = normalizeFollowUpChannel(data.channel);
    const outcome = normalizeFollowUpOutcome(data.outcome);

    console.log('[ENQUIRY_FOLLOW_UP] Incoming assignment payload:', {
        enquiryId,
        tenantId,
        unitId,
        userId,
        staffId: data.staffId,
        channel,
        outcome
    });

    let staffAssignment = null;
    if (data.staffId) {
        try {
            staffAssignment = await resolveAssignableStaffContext(tenantId, unitId, data.staffId);
        } catch (error) {
            console.error('[ENQUIRY_FOLLOW_UP] Primary staff resolution failed:', {
                enquiryId,
                tenantId,
                unitId,
                staffId: data.staffId,
                error: error?.message || error
            });
            const normalizedId = data.staffId ? String(data.staffId).trim() : null;
            // Frontend may pass the display label instead of the underlying id, so recover EMP-ID / user linkage safely.
            const textToSearch = `${normalizedId} ${data.notes || ''}`;
            const parsedEmpMatch = textToSearch.match(/EMP-\d+/);
            const extractedEmpId = parsedEmpMatch ? parsedEmpMatch[0] : normalizedId;

            const fallbackStaff = await prisma.staff.findFirst({
                where: {
                    OR: [
                        { id: normalizedId },
                        { userId: normalizedId },
                        { empId: normalizedId },
                        { empId: extractedEmpId }
                    ],
                    tenantId,
                    isDeleted: false
                },
                include: {
                    user: {
                        include: {
                            role: true
                        }
                    }
                }
            });

            console.log('[ENQUIRY_FOLLOW_UP] Fallback staff lookup result:', {
                enquiryId,
                tenantId,
                normalizedId,
                extractedEmpId,
                fallbackStaffId: fallbackStaff?.id || null,
                fallbackUserId: fallbackStaff?.user?.id || null
            });

            if (fallbackStaff) {
                const linkedUser = fallbackStaff.user?.isActive && fallbackStaff.user?.roleId
                    ? fallbackStaff.user
                    : null;
                staffAssignment = {
                    staffId: fallbackStaff.id,
                    userId: linkedUser?.id || null,
                    user: linkedUser
                };
            } else {
                // If neither primary nor fallback found anything, throw the original error if it's relevant, or a generic one
                if (error?.status && error?.message && !error.message.includes('not found')) {
                    throw error;
                }
                const assignmentError = new Error(`Assigned staff member not found. Searched for: ${data.staffId}`);
                assignmentError.status = 400;
                throw assignmentError;
            }
        }
    }

    return prisma.$transaction(async (tx) => {
        const enquiry = await tx.enquiry.findFirst({
            where: {
                id: enquiryId,
                tenantId,
                isDeleted: false
            },
            select: {
                id: true,
                refNo: true,
                description: true,
                client: {
                    select: {
                        name: true
                    }
                }
            }
        });

        if (!enquiry) {
            const error = new Error('Enquiry not found (Tenant mismatch or deleted)');
            error.status = 404;
            throw error;
        }

        const followUp = await tx.followUp.create({
            data: {
                enquiryId,
                notes: data.notes,
                scheduledAt,
                channel,
                outcome,
                tenantId,
                unitId,
                clientInterest: data.clientInterest,
                readyToPayAmount: typeof data.readyToPayAmount === 'string' ? parseFloat(data.readyToPayAmount) : data.readyToPayAmount,
                paymentMode: data.paymentMode,
                nextFollowupStatus: data.nextFollowupStatus
            }
        });

        let task = null;

        await tx.task.updateMany({
            where: {
                enquiryId,
                type: 'SCHEDULED',
                title: { startsWith: 'Client follow-up' },
                status: { in: ['ASSIGNED', 'IN_PROGRESS'] }
            },
            data: {
                status: 'COMPLETED',
                completedAt: new Date()
            }
        });

        const requiresNextAction = outcome !== 'LOST' && outcome !== 'FOLLOWUP_NOT_REQUIRED';

        if (staffAssignment && requiresNextAction && scheduledAt) {
            task = await tx.task.create({
                data: {
                    refNo: `TSK-${Date.now()}`,
                    title: `Client follow-up for ${enquiry.client?.name || enquiry.refNo}`,
                    description: data.notes,
                    type: 'SCHEDULED',
                    priority: outcome === 'INTERESTED' || outcome === 'VISIT_PLANNED' ? 'HIGH' : 'MEDIUM',
                    enquiryId,
                    assigneeId: staffAssignment.userId,
                    assignedStaffId: staffAssignment.staffId,
                    dueDate: scheduledAt,
                    tenantId,
                    unitId,
                    status: 'ASSIGNED'
                }
            });
        }

        let targetStatus = 'IN_PROGRESS';
        if (['FOLLOWUP_REQUIRED', 'CALL_LATER', 'PENDING'].includes(outcome)) {
            targetStatus = 'FOLLOW_UP';
        } else if (['LOST', 'FOLLOWUP_NOT_REQUIRED', 'NOT_INTERESTED'].includes(outcome)) {
            targetStatus = 'CLOSED';
        }

        await tx.enquiry.update({
            where: { id: enquiryId },
            data: {
                status: targetStatus
            },
            select: { id: true }
        });

        return {
            ...followUp,
            taskId: task?.id || null,
            allocationId: null,
            assignedStaffId: staffAssignment?.staffId || null,
            assignedUserId: staffAssignment?.userId || null,
            enquiryRefNo: enquiry.refNo,
            clientName: enquiry.client?.name || null
        };
    });
}

export const listAdmissionsQuery = async ({ tenantId, unitId, skip, take, search, status }) => {
    const where = {
        tenantId,
        ...(unitId && unitId !== 'ALL' ? { unitId } : {}),
        ...(status ? { status } : {})
    };

    if (search) {
        where.OR = [
            { patient: { name: { contains: search, mode: 'insensitive' } } },
            { enquiry: { refNo: { contains: search, mode: 'insensitive' } } },
            { enquiry: { client: { name: { contains: search, mode: 'insensitive' } } } },
            { enquiry: { client: { mobile: { contains: search } } } }
        ];
    }

    const [count, data] = await prisma.$transaction([
        prisma.admission.count({ where }),
        prisma.admission.findMany({
            where,
            select: admissionWithRelationsSelect,
            skip,
            take,
            orderBy: { admittedAt: 'desc' }
        })
    ]);

    return { count, data };
};

export const convertEnquiryToAdmissionQuery = async (enquiryId, data, user) => {
    const tenantId = user.tenantId;
    return prisma.$transaction(async (tx) => {
        const enquiry = await tx.enquiry.findFirst({
            where: {
                id: enquiryId,
                tenantId,
                isDeleted: false
            },
            include: {
                client: true,
                admission: {
                    select: { id: true }
                },
                followUps: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        if (!enquiry) {
            const error = new Error('Enquiry not found or access denied');
            error.status = 404;
            throw error;
        }

        if (enquiry.isConverted || enquiry.status === 'CLOSED') {
            const error = new Error('Enquiry is closed or already converted');
            error.status = 400;
            throw error;
        }

        const latestOutcome = enquiry.followUps?.[0]?.outcome;
        if (latestOutcome !== 'ADMISSION_PLANNED' && latestOutcome !== 'READY_TO_CONVERT') {
            const error = new Error('Enquiry is not ready for admission conversion');
            error.status = 400;
            throw error;
        }

        if (enquiry.admission) {
            return tx.admission.findUnique({
                where: { id: enquiry.admission.id },
                select: admissionWithRelationsSelect
            });
        }

        const meta = parseEnquiryMeta(enquiry.rawMessage);
        const patientName = String(data.patientName || meta.patientName || enquiry.client?.name || '').trim();
        if (!patientName) {
            const error = new Error('Patient name is required before converting enquiry to admission');
            error.status = 400;
            throw error;
        }

        if (!data.unitId) {
            const error = new Error('Destination Care Facility (unitId) is required');
            error.status = 400;
            throw error;
        }

        const destinationUnit = await tx.unit.findFirst({
            where: {
                id: data.unitId,
                tenantId: tenantId,
                isDeleted: false,
                status: true
            }
        });

        if (!destinationUnit) {
            const error = new Error('Invalid or inactive Destination Care Facility');
            error.status = 400;
            throw error;
        }

        if (user.unitAccess && user.unitAccess.length > 0 && !user.unitAccess.includes('*') && !user.unitAccess.includes(data.unitId)) {
            const error = new Error('Not authorized to admit patients to this facility');
            error.status = 403;
            throw error;
        }

        const currentYear = new Date().getFullYear();
        const elderId = await generateRefNumber(`UEC-ELD-${currentYear}`, tenantId, data.unitId, tx);

        const patient = await tx.patient.create({
            data: {
                elderId,
                name: patientName,
                dob: data.dob,
                age: data.age,
                gender: data.gender,
                bloodGroup: data.bloodGroup,
                primaryContact: data.primaryContact || data.phone,
                emergencyContact: data.emergencyContact,
                email: data.email,
                phone: data.phone,
                address: data.address,
                tenantId,
                unitId: data.unitId
            }
        });

        const admission = await tx.admission.create({
            data: {
                enquiryId,
                patientId: patient.id,
                tenantId,
                unitId: data.unitId,
                status: data.status || 'ACTIVE',
                admissionPriority: data.admissionPriority,
                healthCondition: data.healthCondition,
                clinicalStatus: data.clinicalStatus,
                floor: data.floor,
                room: data.room,
                bed: data.bed
            },
            select: admissionWithRelationsSelect
        });

        await tx.enquiry.update({
            where: { id: enquiryId },
            data: {
                status: 'CLOSED',
                isConverted: true,
                convertedAt: new Date()
            },
            select: { id: true }
        });

        return admission;
    }, {
        maxWait: 15000,
        timeout: 30000
    });
};
