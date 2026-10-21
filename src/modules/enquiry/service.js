import { createClientAndEnquiryQuery, listEnquiriesQuery, updateEnquiryQuery, deleteEnquiryQuery, addFollowUpQuery, getEnquiryQuery, listAdmissionsQuery, convertEnquiryToAdmissionQuery } from './repository.js';
import { prisma } from '../../app/prisma.js';
import bcrypt from 'bcrypt';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';
import { emitEvent, EVENTS } from '../event/service.js';
import { logWorkflow } from '../workflow/service.js';
import { sendNotification } from '../notification/service.js';
import { FeedbackLearningService } from '../../intelligence/services/feedback-learning.service.js';
import { ScoringEngine } from '../../intelligence/services/scoring.engine.js';

const canReadAllUnits = (user) => {
    const normalizedRole = String(user?.role || '').trim().toLowerCase();
    return ['admin', 'super admin', 'superadmin', 'customer relations manager'].includes(normalizedRole);
};

const resolveWritableUnitId = async (requestedUnitId, user) => {
    const candidateUnitId = String(requestedUnitId || '').trim();
    if (!candidateUnitId || candidateUnitId === user.unitId) return user.unitId;
    if (!canReadAllUnits(user)) return user.unitId;

    const unit = await prisma.unit.findFirst({
        where: {
            id: candidateUnitId,
            tenantId: user.tenantId,
            status: true,
            isDeleted: false
        },
        select: { id: true }
    });

    return unit?.id || user.unitId;
};

const PORTAL_ROLE_NAMES = ['Family Member', 'Client Family Member', 'Client'];

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeText = (value) => String(value || '').trim();
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const buildError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const splitClientName = (name) => {
    const nameParts = String(name || 'Family Member').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() || 'Family';
    return {
        firstName,
        lastName: nameParts.join(' ') || 'Member'
    };
};

const toClientPortalAccess = (user) => {
    if (!user) return null;

    return {
        id: user.id,
        email: user.email || '',
        mobile: user.mobile || '',
        roleName: user.role?.name || '',
        isActive: Boolean(user.isActive),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
};

const phoneMatches = (left, right) => {
    if (!left || !right) return false;
    return left === right || left.endsWith(right) || right.endsWith(left);
};

const findMatchingPortalUser = (users, client) => {
    const clientEmail = normalizeEmail(client?.email);
    const clientPhone = normalizePhone(client?.mobile);

    return users.find((user) => clientEmail && normalizeEmail(user.email) === clientEmail)
        || users.find((user) => phoneMatches(normalizePhone(user.mobile), clientPhone))
        || null;
};

const getPortalRole = async (tx, tenantId, roleName) => {
    const description = roleName === 'Family Member'
        ? 'Client and family member portal access'
        : 'Family access to client services, feedback, and complaints';

    return tx.role.upsert({
        where: {
            name_tenantId: {
                name: roleName,
                tenantId
            }
        },
        update: {
            isDeleted: false,
            deletedAt: null,
            description
        },
        create: {
            name: roleName,
            description,
            tenantId
        }
    });
};

const findPortalUsersForClientContacts = async (tx, tenantId, clients) => {
    const OR = [];

    clients.forEach((client) => {
        const email = normalizeEmail(client?.email);
        const mobile = normalizePhone(client?.mobile);

        if (email) {
            OR.push({ email: { equals: email, mode: 'insensitive' } });
        }
        if (mobile) {
            OR.push({ mobile: { contains: mobile } });
        }
    });

    if (!OR.length) return [];

    return tx.user.findMany({
        where: {
            tenantId,
            isDeleted: false,
            role: {
                is: {
                    tenantId,
                    isDeleted: false,
                    name: { in: PORTAL_ROLE_NAMES }
                }
            },
            OR
        },
        include: { role: true },
        orderBy: [
            { updatedAt: 'desc' },
            { createdAt: 'desc' }
        ]
    });
};

const findPortalUserForClient = async (tx, tenantId, client) => {
    const users = await findPortalUsersForClientContacts(tx, tenantId, [client]);
    return findMatchingPortalUser(users, client);
};

const attachClientPortalAccess = async (records, tenantId) => {
    if (!Array.isArray(records) || records.length === 0) return records;

    const clients = records.map((record) => record.client).filter(Boolean);
    const portalUsers = await findPortalUsersForClientContacts(prisma, tenantId, clients);

    return records.map((record) => ({
        ...record,
        clientPortalAccess: toClientPortalAccess(findMatchingPortalUser(portalUsers, record.client))
    }));
};

export const createEnquiry = async (data, user) => {
    const targetUnitId = await resolveWritableUnitId(data.unitId, user);
    const enquiry = await createClientAndEnquiryQuery(data, user.tenantId, targetUnitId);

    try {
        emitEvent(EVENTS.ENQUIRY_CREATED, { enquiry, user });
    } catch (eventError) {
        console.error('Enquiry created but event dispatch failed:', eventError);
    }

    // 🧠 AI Automation: Generate initial lead score
    try {
        await ScoringEngine.calculateScore(enquiry.id, 'enquiry', {
            tenantId: user.tenantId,
            unitId: targetUnitId
        });
    } catch (scoreError) {
        console.error('Initial lead scoring failed:', scoreError);
    }

    try {
        await logWorkflow({
            entityType: 'ENQUIRY',
            entityId: enquiry.id,
            toState: 'NEW',
            actionBy: user.id,
            tenantId: user.tenantId,
            unitId: targetUnitId
        });
    } catch (workflowError) {
        console.error('Enquiry created but workflow log failed:', workflowError);
    }

    return enquiry;
};

export const listEnquiries = async (query, user) => {
    const result = await listEnquiriesQuery({
        tenantId: user.tenantId,
        unitId: query.unitId || user.unitId,
        skip: query.skip,
        take: query.take,
        search: query.search,
        status: query.status
    });

    return {
        ...result,
        data: await attachClientPortalAccess(result.data, user.tenantId)
    };
};

export const getEnquiry = async (id, user) => {
    const hasFacilityWideAccess = canReadAllUnits(user) || (user.unitAccess && user.unitAccess.includes('*'));
    const accessibleUnits = hasFacilityWideAccess 
        ? 'ALL' 
        : { in: [user.unitId, ...(user.unitAccess || [])].filter(Boolean) };
        
    const enquiry = await getEnquiryQuery(id, user.tenantId, accessibleUnits);
    if (!enquiry) return null;

    const [enriched] = await attachClientPortalAccess([enquiry], user.tenantId);
    return enriched;
};

export const updateEnquiry = async (id, data, user) => {
    const updated = await updateEnquiryQuery(id, data, user);

    // 🚀 Feedback Loop: Capture signals if converted or lost
    if (updated.status === 'CONVERTED' || updated.status === 'LOST') {
        const isConverted = updated.status === 'CONVERTED';
        await FeedbackLearningService.captureModuleFeedback({
            tenantId: user.tenantId,
            unitId: user.unitId,
            module: 'enquiry',
            entityId: id,
            event: `ENQUIRY_${updated.status}`,
            signals: {
                conversionRate: isConverted ? 1 : 0,
                completionRate: 1,
                responseRate: 1 // If converted/lost, at least they responded
            }
        });
    }

    return updated;
};

export const deleteEnquiry = async (id, user) => {
    const deleted = await deleteEnquiryQuery(id, user.tenantId, user.unitId);
    return deleted;
};

export const addFollowUp = async (id, data, user) => {
    const followUp = await addFollowUpQuery(id, data, user.tenantId, user.unitId, user.id);

    if (followUp.assignedUserId) {
        try {
            await sendNotification({
                userId: followUp.assignedUserId,
                type: 'ENQUIRY_FOLLOW_UP_ASSIGNED',
                message: `You are allocated to enquiry ${followUp.enquiryRefNo || id}${followUp.clientName ? ` for ${followUp.clientName}` : ''}. Please follow up with this client and update the enquiry progress.`,
                tenantId: user.tenantId,
                unitId: user.unitId
            });
        } catch (notificationError) {
            console.error('Follow-up saved but notification dispatch failed:', notificationError);
        }
    }

    emitEvent(EVENTS.ENQUIRY_FOLLOW_UP, { enquiryId: id, followUp, user });

    return followUp;
};

export const recordRenewalFollowUpOutcome = async (id, data, user) => {
    return prisma.$transaction(async (tx) => {
        const where = {
            id,
            tenantId: user.tenantId,
            isDeleted: false
        };

        if (user.unitId && !canReadAllUnits(user)) {
            where.unitId = user.unitId;
        }

        const enquiry = await tx.enquiry.findFirst({
            where,
            include: {
                client: true,
                service: true,
                followUps: {
                    where: { isDeleted: false },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                }
            }
        });

        if (!enquiry) {
            const error = new Error('Enquiry not found or unauthorized');
            error.status = 404;
            throw error;
        }

        const followUpId = String(data.followUpId || '').trim();
        const exactFollowUp = followUpId
            ? await tx.followUp.findFirst({
                where: {
                    id: followUpId,
                    enquiryId: enquiry.id,
                    tenantId: user.tenantId,
                    isDeleted: false
                }
            })
            : null;

        const renewalFollowUp = exactFollowUp || enquiry.followUps?.find((followUp) => (
            String(followUp.nextFollowupStatus || '').startsWith('RENEWAL') ||
            String(followUp.clientInterest || '').toLowerCase() === 'renewal follow-up'
        )) || enquiry.followUps?.[0];

        if (!renewalFollowUp) {
            const error = new Error('No follow-up found for this enquiry');
            error.status = 404;
            throw error;
        }

        const notes = String(data.notes || '').trim();
        const nextDate = data.nextDate ? new Date(data.nextDate) : renewalFollowUp.scheduledAt;
        if (data.nextDate && Number.isNaN(nextDate.getTime())) {
            const error = new Error('Invalid next follow-up date');
            error.status = 400;
            throw error;
        }

        const updatedFollowUp = await tx.followUp.update({
            where: { id: renewalFollowUp.id },
            data: {
                outcome: data.outcome,
                notes: [renewalFollowUp.notes, notes ? `Outcome: ${data.outcome} | ${notes}` : `Outcome: ${data.outcome}`]
                    .filter(Boolean)
                    .join('\n'),
                scheduledAt: data.outcome === 'CALL_LATER' && nextDate ? nextDate : renewalFollowUp.scheduledAt,
                nextFollowupStatus: data.outcome === 'CALL_LATER' ? 'RENEWAL_CALL_LATER' : `RENEWAL_${data.outcome}`,
                clientInterest: data.outcome === 'INTERESTED' || data.outcome === 'CONVERTED_TO_NEW_SERVICE'
                    ? 'Interested'
                    : (data.outcome === 'CALL_LATER' ? 'Call Later' : 'Not Interested')
            }
        });

        let newEnquiry = null;
        if (data.outcome === 'CONVERTED_TO_NEW_SERVICE') {
            const enquiryRef = await generateRefNumber('ENQ', user.tenantId, enquiry.unitId, tx);
            newEnquiry = await tx.enquiry.create({
                data: {
                    refNo: enquiryRef,
                    clientId: enquiry.clientId,
                    serviceId: enquiry.serviceId || null,
                    description: notes || `Renewal converted from ${enquiry.refNo}`,
                    rawMessage: JSON.stringify({
                        patientName: enquiry.client?.name || '',
                        remarks: `Created from renewal follow-up ${enquiry.refNo}`,
                        renewalSourceEnquiryId: enquiry.id
                    }),
                    mode: 'Call',
                    source: 'Renewal Follow-up',
                    status: 'NEW',
                    tenantId: user.tenantId,
                    unitId: enquiry.unitId
                }
            });
        }

        await tx.workflowLog.create({
            data: {
                entityType: 'FOLLOW_UP',
                entityId: renewalFollowUp.id,
                fromState: renewalFollowUp.nextFollowupStatus || 'RENEWAL',
                toState: updatedFollowUp.nextFollowupStatus,
                actionBy: user.id,
                notes: newEnquiry
                    ? `Renewal converted to new enquiry ${newEnquiry.refNo}`
                    : (notes || `Renewal outcome marked as ${data.outcome}`),
                tenantId: user.tenantId,
                unitId: enquiry.unitId
            }
        });

        if (newEnquiry) {
            await tx.workflowLog.create({
                data: {
                    entityType: 'ENQUIRY',
                    entityId: newEnquiry.id,
                    fromState: 'RENEWAL_FOLLOW_UP',
                    toState: 'NEW',
                    actionBy: user.id,
                    notes: `New enquiry created from renewal follow-up ${enquiry.refNo}`,
                    tenantId: user.tenantId,
                    unitId: enquiry.unitId
                }
            });
        }

        return {
            followUp: updatedFollowUp,
            newEnquiry
        };
    });
};

export const listAdmissions = async (query, user) => {
    return listAdmissionsQuery({
        tenantId: user.tenantId,
        unitId: query.unitId || user.unitId,
        skip: query.skip,
        take: query.take,
        search: query.search,
        status: query.status
    });
};

export const convertEnquiryToAdmission = async (id, data, user) => {
    const admission = await convertEnquiryToAdmissionQuery(id, data, user);

    try {
        await logWorkflow({
            entityType: 'ADMISSION',
            entityId: admission.id,
            toState: admission.status,
            actionBy: user.id,
            tenantId: user.tenantId,
            unitId: admission.unitId || user.unitId
        });
    } catch (workflowError) {
        console.error('Admission created but workflow log failed:', workflowError);
    }

    return admission;
};

const parseOptionalDate = (value) => {
    if (!value) return new Date();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
};

const findMatchingService = async (tx, data, tenantId, unitId) => {
    const explicitName = String(data.serviceName || '').trim();
    const careTypeLabel = String(data.careType || '').replace(/_/g, ' ');
    const candidates = [explicitName, careTypeLabel].filter(Boolean);

    for (const candidate of candidates) {
        const service = await tx.clientService.findFirst({
            where: {
                tenantId,
                unitId,
                isDeleted: false,
                OR: [
                    { name: { contains: candidate, mode: 'insensitive' } },
                    { category: { contains: candidate, mode: 'insensitive' } }
                ]
            },
            select: { id: true, name: true, category: true, price: true }
        });
        if (service) return service;
    }

    return null;
};

export const createExistingPatientAdmission = async (data, user) => {
    const tenantId = user.tenantId;
    const unitId = user.unitId;
    const admittedAt = parseOptionalDate(data.admissionDate);

    return prisma.$transaction(async (tx) => {
        let client = await tx.client.findFirst({
            where: {
                tenantId,
                unitId,
                mobile: data.mobile,
                isDeleted: false
            }
        });

        if (!client) {
            const clientRef = await generateRefNumber('CLI', tenantId, unitId, tx);
            client = await tx.client.create({
                data: {
                    refNo: clientRef,
                    name: data.clientName,
                    mobile: data.mobile,
                    email: data.email || null,
                    address: data.address || null,
                    tenantId,
                    unitId
                }
            });
        } else {
            client = await tx.client.update({
                where: { id: client.id },
                data: {
                    name: data.clientName || client.name,
                    email: data.email || client.email,
                    address: data.address || client.address
                }
            });
        }

        const service = await findMatchingService(tx, data, tenantId, unitId);
        const enquiryRef = await generateRefNumber('ENQ', tenantId, unitId, tx);
        const allocationRef = await generateRefNumber('ALC', tenantId, unitId, tx);
        const serviceName = data.serviceName || service?.name || data.careType.replace(/_/g, ' ');

        const enquiry = await tx.enquiry.create({
            data: {
                refNo: enquiryRef,
                clientId: client.id,
                serviceId: service?.id || null,
                description: `Existing patient onboarded directly into ERP for ${serviceName}`,
                rawMessage: JSON.stringify({
                    legacyAdmission: true,
                    source: 'EXISTING_PATIENT_ONBOARDING',
                    patientName: data.patientName,
                    patientHealthCondition: data.healthCondition || '',
                    clientLocation: data.address || '',
                    remarks: data.routineNotes || '',
                    roomNo: data.roomNo || '',
                    currentMedicines: data.currentMedicines || '',
                    serviceAmount: data.serviceAmount || service?.price || 0,
                    openingBalance: data.openingBalance || 0
                }),
                mode: 'Existing Patient',
                source: 'Existing Patient Onboarding',
                status: 'CLOSED',
                isConverted: true,
                convertedAt: admittedAt,
                tenantId,
                unitId
            }
        });

        const currentYear = new Date().getFullYear();
        const elderId = await generateRefNumber(`UEC-ELD-${currentYear}`, tenantId, unitId, tx);

        const patient = await tx.patient.create({
            data: {
                elderId,
                name: data.patientName,
                tenantId,
                unitId
            }
        });

        const admission = await tx.admission.create({
            data: {
                enquiryId: enquiry.id,
                patientId: patient.id,
                tenantId,
                unitId,
                status: 'ACTIVE',
                admittedAt
            },
            select: {
                id: true,
                status: true,
                admittedAt: true,
                unitId: true,
                patient: { select: { id: true, name: true } },
                enquiry: {
                    select: {
                        id: true,
                        refNo: true,
                        client: { select: { id: true, name: true, mobile: true, email: true } },
                        service: { select: { id: true, name: true, category: true } }
                    }
                }
            }
        });

        const allocation = await tx.allocation.create({
            data: {
                refNo: allocationRef,
                enquiryId: enquiry.id,
                type: data.careType,
                startDate: admittedAt,
                status: 'PENDING',
                metadata: {
                    legacyAdmission: true,
                    source: 'EXISTING_PATIENT_ONBOARDING',
                    patientName: data.patientName,
                    clientName: client.name,
                    serviceName,
                    serviceAmount: data.serviceAmount || service?.price || 0,
                    openingBalance: data.openingBalance || 0,
                    roomNo: data.roomNo || '',
                    healthCondition: data.healthCondition || '',
                    currentMedicines: data.currentMedicines || '',
                    routineNotes: data.routineNotes || ''
                },
                tenantId,
                unitId
            }
        });

        await tx.workflowLog.createMany({
            data: [
                {
                    entityType: 'ENQUIRY',
                    entityId: enquiry.id,
                    fromState: 'EXISTING_PATIENT',
                    toState: 'ADMISSION_CREATED',
                    actionBy: user.id,
                    notes: 'Existing patient added directly without new enquiry follow-up',
                    tenantId,
                    unitId
                },
                {
                    entityType: 'ADMISSION',
                    entityId: admission.id,
                    fromState: 'LEGACY_ONBOARDING',
                    toState: 'ACTIVE',
                    actionBy: user.id,
                    notes: `Admission created for existing patient ${data.patientName}`,
                    tenantId,
                    unitId
                },
                {
                    entityType: 'ALLOCATION',
                    entityId: allocation.id,
                    fromState: 'LEGACY_ONBOARDING',
                    toState: allocation.status,
                    actionBy: user.id,
                    notes: `Allocation ${allocation.refNo} created for ${serviceName}`,
                    tenantId,
                    unitId
                }
            ]
        });

        return {
            client,
            patient,
            enquiry,
            admission,
            allocation
        };
    }, {
        maxWait: 15000,
        timeout: 30000
    });
};

export const createAdmissionClientPortalAccess = async (admissionId, data, user) => {
    const normalizedEmail = String(data.email || '').trim().toLowerCase();
    const roleName = data.roleName || 'Family Member';

    return prisma.$transaction(async (tx) => {
        const admission = await tx.admission.findFirst({
            where: {
                id: admissionId,
                tenantId: user.tenantId
            },
            include: {
                enquiry: {
                    include: {
                        client: true
                    }
                }
            }
        });

        if (!admission) {
            const error = new Error('Admission not found or unauthorized');
            error.status = 404;
            throw error;
        }

        const client = admission.enquiry?.client;
        if (!client) {
            const error = new Error('Admission does not have a linked client');
            error.status = 400;
            throw error;
        }

        const existingUser = await tx.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: 'insensitive'
                },
                isDeleted: false
            },
            include: {
                role: true
            }
        });

        if (existingUser) {
            return {
                user: existingUser,
                client,
                alreadyExists: true
            };
        }

        const role = await tx.role.upsert({
            where: {
                name_tenantId: {
                    name: roleName,
                    tenantId: user.tenantId
                }
            },
            update: {
                isDeleted: false,
                deletedAt: null,
                description: roleName === 'Family Member'
                    ? 'Client and family member portal access'
                    : 'Family access to client services, feedback, and complaints'
            },
            create: {
                name: roleName,
                description: roleName === 'Family Member'
                    ? 'Client and family member portal access'
                    : 'Family access to client services, feedback, and complaints',
                tenantId: user.tenantId
            }
        });

        const passwordHash = await bcrypt.hash(data.password, 10);
        const nameParts = String(client.name || 'Family Member').trim().split(/\s+/);
        const firstName = nameParts.shift() || 'Family';
        const lastName = nameParts.join(' ') || 'Member';

        const portalUser = await tx.user.create({
            data: {
                email: normalizedEmail,
                mobile: data.mobile || client.mobile || null,
                firstName,
                lastName,
                passwordHash,
                roleId: role.id,
                tenantId: user.tenantId,
                unitId: client.unitId || admission.unitId,
                isActive: true
            },
            include: {
                role: true
            }
        });

        await tx.workflowLog.create({
            data: {
                entityType: 'ADMISSION',
                entityId: admission.id,
                fromState: admission.status,
                toState: 'CLIENT_PORTAL_ACCESS_CREATED',
                actionBy: user.id,
                notes: `Client portal access created for ${client.name} using ${normalizedEmail}`,
                tenantId: user.tenantId,
                unitId: admission.unitId
            }
        });

        return {
            user: portalUser,
            client,
            alreadyExists: false
        };
    });
};

export const upsertEnquiryClientPortalAccess = async (enquiryId, data, user) => {
    const normalizedEmail = normalizeEmail(data.email);
    const roleName = data.roleName || 'Family Member';
    const suppliedPassword = data.password ? String(data.password) : '';

    if (!normalizedEmail) {
        throw buildError('Valid login email is required');
    }
    if (suppliedPassword && suppliedPassword.length < 6) {
        throw buildError('Password must be at least 6 characters');
    }

    return prisma.$transaction(async (tx) => {
        const enquiry = await tx.enquiry.findFirst({
            where: {
                id: enquiryId,
                tenantId: user.tenantId,
                isDeleted: false,
                ...(canReadAllUnits(user) ? {} : { unitId: user.unitId })
            },
            include: {
                client: true
            }
        });

        if (!enquiry) {
            throw buildError('Enquiry not found or unauthorized', 404);
        }

        const client = enquiry.client;
        if (!client) {
            throw buildError('Enquiry does not have a linked client');
        }

        const existingPortalUser = await findPortalUserForClient(tx, user.tenantId, client);
        const emailOwner = await tx.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: 'insensitive'
                }
            },
            include: { role: true }
        });

        if (emailOwner && emailOwner.id !== existingPortalUser?.id) {
            throw buildError('This login email is already used by another user', 409);
        }

        const role = await getPortalRole(tx, user.tenantId, roleName);
        const mobile = normalizeText(data.mobile) || client.mobile || existingPortalUser?.mobile || null;
        const { firstName, lastName } = splitClientName(client.name);
        let portalUser;
        let created = false;

        if (existingPortalUser) {
            const updateData = {
                email: normalizedEmail,
                mobile,
                firstName: existingPortalUser.firstName || firstName,
                lastName: existingPortalUser.lastName || lastName,
                roleId: role.id,
                tenantId: user.tenantId,
                unitId: client.unitId || enquiry.unitId,
                isActive: true
            };

            if (suppliedPassword) {
                updateData.passwordHash = await bcrypt.hash(suppliedPassword, 10);
                updateData.tokenVersion = { increment: 1 };
            }

            portalUser = await tx.user.update({
                where: { id: existingPortalUser.id },
                data: updateData,
                include: { role: true }
            });
        } else {
            if (suppliedPassword.length < 6) {
                throw buildError('Password is required when enabling login credentials');
            }

            const passwordHash = await bcrypt.hash(suppliedPassword, 10);
            portalUser = await tx.user.create({
                data: {
                    email: normalizedEmail,
                    mobile,
                    firstName,
                    lastName,
                    passwordHash,
                    roleId: role.id,
                    tenantId: user.tenantId,
                    unitId: client.unitId || enquiry.unitId,
                    isActive: true
                },
                include: { role: true }
            });
            created = true;
        }

        await tx.workflowLog.create({
            data: {
                entityType: 'ENQUIRY',
                entityId: enquiry.id,
                fromState: enquiry.status,
                toState: created ? 'CLIENT_PORTAL_ACCESS_CREATED' : 'CLIENT_PORTAL_ACCESS_UPDATED',
                actionBy: user.id,
                notes: `Client portal access ${created ? 'created' : 'updated'} for ${client.name} using ${normalizedEmail}`,
                tenantId: user.tenantId,
                unitId: enquiry.unitId
            }
        });

        return {
            user: toClientPortalAccess(portalUser),
            client,
            created,
            updated: !created
        };
    });
};
