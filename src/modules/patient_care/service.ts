import { prisma } from '../../app/prisma.js';
import { sendNotification } from '../notification/service.js';
import { resolveNursingStaffAssignment } from '../nursing_care/service.js';

const toAdlRecord = (row: any, patientMap = new Map<string, any>()) => {
    const patientId = String(row.patientId || '');
    return {
        id: row.id,
        patientId,
        patient: patientMap.get(patientId) || null,
        mobility: row.mobility || '',
        hygiene: row.hygiene || '',
        feeding: row.feeding || '',
        notes: row.notes || '',
        status: row.status || '',
        recordedBy: row.recordedById || '',
        activityCategory: row.activityCategory || '',
        isMandatory: row.isMandatory || false,
        assignedStaffId: row.assignedStaffId || null,
        scheduledDate: row.scheduledDate || null,
        requiresVerification: row.requiresVerification || false,
        verifiedBy: row.verifiedBy || null,
        verificationNotes: row.verificationNotes || '',
        isCompleted: row.isCompleted || false,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
};

const normalizePhone = (value: unknown) => String(value || '').replace(/\\D/g, '');

const resolveFamilyUserIdsForPatient = async (patientId: string, scope: { tenantId: string; unitId: string }) => {
    const userIds = new Set<string>();
    const admissions = await (prisma as any).admission.findMany({
        where: { patientId, tenantId: scope.tenantId },
        select: { enquiry: { select: { client: { select: { email: true, mobile: true } } } } }
    });

    const OR: any[] = [];
    admissions.forEach((adm: any) => {
        const client = adm.enquiry?.client;
        if (!client) return;
        const clientEmail = String(client.email || '').trim();
        const clientMobile = normalizePhone(client.mobile);
        if (clientEmail) OR.push({ email: { equals: clientEmail, mode: 'insensitive' } });
        if (clientMobile) OR.push({ mobile: { contains: clientMobile } });
    });

    if (OR.length) {
        const familyUsers = await (prisma as any).user.findMany({
            where: {
                tenantId: scope.tenantId,
                isDeleted: false,
                isActive: true,
                OR,
                role: { name: { in: ['Family Member', 'Client Family Member', 'Client'] } }
            },
            select: { id: true }
        });
        familyUsers.forEach((user: any) => userIds.add(user.id));
    }
    return Array.from(userIds);
};

const notifyDailyCareSummary = async (patientName: string, patientId: string, scope: { tenantId: string; unitId: string }) => {
    try {
        const userIds = await resolveFamilyUserIdsForPatient(patientId, scope);
        if (!userIds.length) return;

        const message = `Daily Care Summary: Activities of daily living (ADL) for ${patientName} have been marked as completed for today.`;

        await Promise.allSettled(userIds.map((userId) => sendNotification({
            userId, message, type: 'DAILY_CARE_SUMMARY', tenantId: scope.tenantId, unitId: scope.unitId
        })));
    } catch (error) {
        console.error('Failed to send daily care summary:', error);
    }
};

// ==========================================
// ADL Records
// ==========================================

export const getAdlRecordsService = async (patientId: string | undefined, scope: { tenantId: string; unitId?: string }, user?: any) => {
    const staff = user?.id
        ? await (prisma as any).staff.findFirst({
            where: { userId: user.id, tenantId: scope.tenantId, isDeleted: false },
            select: { unitId: true }
        })
        : null;
    const operationalScope = { tenantId: scope.tenantId, unitId: staff?.unitId || scope.unitId };
    const records = await (prisma as any).aDLRecord.findMany({
        where: {
            ...operationalScope,
            ...(patientId ? { patientId } : {})
        },
        orderBy: { createdAt: 'desc' }
    });

    const patientIds = Array.from(new Set(records.map((record: any) => record.patientId).filter(Boolean)));
    const patients = patientIds.length
        ? await (prisma as any).patient.findMany({
            where: { id: { in: patientIds as string[] }, tenantId: scope.tenantId },
            select: { id: true, name: true, tenantId: true, unitId: true, createdAt: true, updatedAt: true }
        })
        : [];
    const patientMap = new Map<string, any>(patients.map((patient: any) => [patient.id, patient]));

    return records.map((record: any) => toAdlRecord(record, patientMap));
};

export const createAdlRecordService = async (validated: any, scope: { tenantId: string; unitId: string }, user: any) => {
    const patient = await (prisma as any).patient.findFirst({
        where: { id: validated.patientId, tenantId: scope.tenantId },
        select: { id: true, name: true, tenantId: true, unitId: true, createdAt: true, updatedAt: true }
    });

    if (!patient) {
        throw new Error('Patient not found');
    }

    const authCheck = await resolveNursingStaffAssignment(scope.tenantId, user, patient.id, validated.assignmentId);
    if (!authCheck.authorized) {
        throw new Error(`Not authorized: ${authCheck.reason}`);
    }

    const record = await (prisma as any).aDLRecord.create({
        data: {
            patientId: validated.patientId,
            activityCategory: validated.activityCategory,
            isMandatory: validated.isMandatory,
            assignedStaffId: authCheck.staffId || validated.assignedStaffId || null,
            assignmentId: authCheck.assignmentId || null,
            scheduledDate: validated.scheduledDate ? new Date(validated.scheduledDate) : null,
            mobility: validated.mobility || '',
            hygiene: validated.hygiene || '',
            feeding: validated.feeding || '',
            notes: validated.notes || '',
            status: 'ASSIGNED',
            requiresVerification: true, 
            recordedById: user.id,
            tenantId: scope.tenantId,
            unitId: authCheck.staff?.unitId || scope.unitId
        }
    });

    return toAdlRecord(record, new Map([[patient.id, patient]]));
};

export const updateAdlStatusService = async (id: string, status: string, scope: { tenantId: string; unitId: string }) => {
    const existing = await (prisma as any).aDLRecord.findFirst({
        where: { id, ...scope }
    });

    if (!existing) {
        throw new Error('ADL record not found');
    }

    const validatedStatus = (status as any).status || status;
    const notes = (status as any).verificationNotes;

    const dataToUpdate: any = { status: validatedStatus };
    if (notes) dataToUpdate.verificationNotes = notes;
    if (validatedStatus === 'VERIFIED') dataToUpdate.isCompleted = true;
    if (validatedStatus === 'COMPLETED') dataToUpdate.isCompleted = true;
    
    const updated = await (prisma as any).aDLRecord.update({
        where: { id: existing.id },
        data: dataToUpdate
    });

    const patientId = String(updated.patientId || '');
    if (status === 'COMPLETED' && patientId) {
        const patient = await (prisma as any).patient.findUnique({ where: { id: patientId }, select: { name: true } });
        if (patient) {
            await notifyDailyCareSummary(patient.name, patientId, scope);
        }
    }

    const patientMap = new Map();
    if (patientId) {
        const patient = await (prisma as any).patient.findUnique({ where: { id: patientId } });
        if (patient) patientMap.set(patient.id, patient);
    }

    return toAdlRecord(updated, patientMap);
};

// ==========================================
// Nutrition
// ==========================================

export const getNutritionPlansService = async (patientId: string | undefined, scope: { tenantId: string; unitId?: string }) => {
    return (prisma as any).nutrition.findMany({
        where: {
            ...(patientId ? { patientId } : {}),
            patient: { ...scope }
        },
        include: { patient: true },
        orderBy: { createdAt: 'desc' }
    });
};

export const createNutritionPlanService = async (validated: any, scope: { tenantId: string; unitId: string }) => {
    // We assume the patient exists and is within scope
    return (prisma as any).nutrition.create({
        data: {
            ...validated,
            tenantId: scope.tenantId,
            unitId: scope.unitId || 'default'
        }
    });
};

// ==========================================
// Clinical Summary
// ==========================================

export const getClinicalSummaryService = async (patientId: string, scope: { tenantId: string; unitId?: string }) => {
    // We compose data from shared domains
    const [patient, adlRecords, nutritions, vitals, meds] = await Promise.all([
        (prisma as any).patient.findFirst({ where: { id: patientId, ...scope } }),
        (prisma as any).aDLRecord.findMany({ where: { patientId, ...scope }, orderBy: { createdAt: 'desc' }, take: 5 }),
        (prisma as any).nutrition.findMany({ where: { patientId, patient: { ...scope } }, orderBy: { createdAt: 'desc' }, take: 5 }),
        (prisma as any).vitalSign.findMany({ where: { patientId, tenantId: scope.tenantId }, orderBy: { createdAt: 'desc' }, take: 5 }),
        (prisma as any).auditLog.findMany({
            where: {
                ...scope, module: 'HEALTHCARE_MEDICATION', action: 'MEDICATION_SCHEDULE', isDeleted: false,
                payload: { path: ['patientId'], equals: patientId }
            },
            orderBy: { createdAt: 'desc' }, take: 5
        })
    ]);

    if (!patient) throw new Error('Patient not found');

    return {
        patient,
        latestAdls: adlRecords,
        latestNutrition: nutritions,
        latestVitals: vitals,
        medicationSchedules: meds
    };
};
