import { createHash } from 'crypto';
import { prisma } from '../../app/prisma.js';
import { sendNotification } from '../notification/service.js';
import { resolveNursingStaffAssignment } from '../nursing_care/service.js';
import { createPatientLedgerEntryForAllocation } from '../patient_billing/ledger.js';


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
    const patientFilter: any = { tenantId: scope.tenantId };
    
    if (scope.unitId) {
        patientFilter.OR = [
            { unitId: scope.unitId },
            { admissions: { some: { unitId: scope.unitId, status: 'ACTIVE' } } }
        ];
    }

    return (prisma as any).nutrition.findMany({
        where: {
            ...(patientId ? { patientId } : {}),
            patient: patientFilter
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

export const getNutritionRecordsService = async (patientId: string | undefined, careDate: string | undefined, scope: { tenantId: string; unitId?: string }) => {
    const where: any = {
        tenantId: scope.tenantId
    };
    if (patientId) where.patientId = patientId;
    if (careDate) {
        // Assume careDate is YYYY-MM-DD string, match exact Date in Prisma
        where.careDate = new Date(careDate);
    }
    const records = await (prisma as any).nutritionRecord.findMany({
        where,
        orderBy: { recordedAt: 'desc' }
    });
    
    if (!records.length) return records;

    const userIds = Array.from(new Set(records.map((r: any) => r.recordedBy).filter(Boolean)));
    const users = await (prisma as any).user.findMany({
        where: { id: { in: userIds as string[] } },
        select: { id: true, name: true }
    });
    const userMap = new Map<string, string>(users.map((u: any) => [u.id, u.name]));
    
    return records.map((r: any) => ({
        ...r,
        recordedByName: userMap.get(r.recordedBy) || 'Unknown User'
    }));
};

export const createNutritionRecordService = async (validated: any, scope: { tenantId: string; unitId: string }, user: any) => {
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

    // Duplicate protection rule
    const normalizedMeal = validated.meal.trim();
    const careDateObj = new Date(validated.careDate);
    
    // Attempt create (relies on DB unique constraint [patientId, meal, careDate])
    // Or we can findFirst to provide a better error message
    const existing = await (prisma as any).nutritionRecord.findFirst({
        where: {
            patientId: patient.id,
            meal: { equals: normalizedMeal, mode: 'insensitive' },
            careDate: careDateObj
        }
    });

    if (existing) {
        throw new Error(`Nutrition record for ${normalizedMeal} on this date already exists.`);
    }

    return (prisma as any).nutritionRecord.create({
        data: {
            patientId: patient.id,
            assignmentId: authCheck.assignmentId || null,
            meal: normalizedMeal,
            careDate: careDateObj,
            status: validated.status,
            remarks: validated.remarks || '',
            recordedBy: user.id,
            tenantId: scope.tenantId,
            unitId: authCheck.staff?.unitId || scope.unitId
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

// ==========================================
// Manual Revenue Entry
// ==========================================

const MANAGER_REVENUE_SOURCE_TYPES = {
    MANUAL: ['NURSING_MANUAL_ENTRY', 'CAREGIVER_REVENUE_SHEET'],
    INVENTORY: ['INVENTORY_ISSUE']
};

const MANAGER_REVENUE_ROLES = ['NURSING_MANAGER', 'SUPER_ADMIN', 'MEDICAL_MANAGER'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const buildError = (message: string, status = 400) => {
    const error: any = new Error(message);
    error.status = status;
    return error;
};

const normalizeRoleName = (user: any) => String(user?.role?.name || user?.role || user?.roleName || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

const assertManagerRevenueAccess = (user: any) => {
    const role = normalizeRoleName(user);
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];

    if (MANAGER_REVENUE_ROLES.includes(role) || permissions.includes('ALL_ACCESS')) {
        return;
    }

    throw buildError('Forbidden: Nursing Manager revenue access is required', 403);
};

const resolveManagerRevenueMonth = (month: string) => {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || '').trim());
    if (!match) {
        throw buildError('month query parameter must be in YYYY-MM format', 400);
    }

    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    const monthStart = `${match[1]}-${match[2]}-01`;
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);

    return { month: `${match[1]}-${match[2]}`, monthStart, nextMonth };
};

const resolveManagerRevenueSource = (source?: string) => {
    const normalized = String(source || 'ALL').trim().toUpperCase();
    if (!['ALL', 'MANUAL', 'INVENTORY'].includes(normalized)) {
        throw buildError('source query parameter must be ALL, MANUAL, or INVENTORY', 400);
    }

    if (normalized === 'MANUAL') return { source: normalized, sourceTypes: MANAGER_REVENUE_SOURCE_TYPES.MANUAL };
    if (normalized === 'INVENTORY') return { source: normalized, sourceTypes: MANAGER_REVENUE_SOURCE_TYPES.INVENTORY };

    return {
        source: normalized,
        sourceTypes: [...MANAGER_REVENUE_SOURCE_TYPES.MANUAL, ...MANAGER_REVENUE_SOURCE_TYPES.INVENTORY]
    };
};

const toMoney = (value: unknown) => Number(Number(value || 0).toFixed(2));

const toIsoStringOrNull = (value: unknown) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toSafeName = (user: any) => {
    const staffName = [user?.staff?.firstName, user?.staff?.lastName].filter(Boolean).join(' ').trim();
    const userName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return staffName || userName || user?.email || null;
};

const sanitizeSignatures = (value: any) => {
    const signatures = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        caregiverDay: String(signatures.caregiverDay || ''),
        caregiverNight: String(signatures.caregiverNight || ''),
        nurse: String(signatures.nurse || ''),
        manager: String(signatures.manager || '')
    };
};

const sanitizeSheetItems = (items: any) => {
    if (!Array.isArray(items)) return [];

    return items.map((item: any) => {
        const rawDays = item?.days && typeof item.days === 'object' && !Array.isArray(item.days) ? item.days : {};
        const days = Object.entries(rawDays).reduce((acc: Record<string, number>, [day, value]) => {
            const normalizedDay = String(day);
            const quantity = Number(value || 0);
            if (/^\d{1,2}$/.test(normalizedDay) && Number.isFinite(quantity) && quantity > 0) {
                acc[normalizedDay] = quantity;
            }
            return acc;
        }, {});

        const quantity = Object.values(days).reduce((sum, value) => sum + Number(value || 0), 0);
        const rate = Number(item?.rate || 0);

        return {
            label: String(item?.label || ''),
            category: item?.category ? String(item.category) : null,
            unit: String(item?.unit || 'Nos'),
            rate: toMoney(rate),
            days,
            totalAmount: toMoney(quantity * rate)
        };
    }).filter((item: any) => item.label || item.totalAmount > 0);
};

const sourceGroupFor = (sourceType: string) => sourceType === 'INVENTORY_ISSUE' ? 'INVENTORY' : 'MANUAL';

export const getNursingManagerRevenueService = async (
    query: { month: string; patientId?: string; source?: string },
    scope: { tenantId: string; unitId?: string },
    user: any
) => {
    assertManagerRevenueAccess(user);

    if (!scope.tenantId) {
        throw buildError('Authenticated tenant is required', 403);
    }
    if (!scope.unitId) {
        throw buildError('Active unit context is required', 400);
    }

    const { month, monthStart, nextMonth } = resolveManagerRevenueMonth(query.month);
    const { source, sourceTypes } = resolveManagerRevenueSource(query.source);
    const patientId = query.patientId ? String(query.patientId).trim() : undefined;

    if (patientId && !UUID_PATTERN.test(patientId)) {
        throw buildError('patientId query parameter must be a valid UUID', 400);
    }

    const admissions = await (prisma as any).admission.findMany({
        where: {
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            status: 'ACTIVE',
            ...(patientId ? { patientId } : {})
        },
        select: {
            patientId: true,
            admittedAt: true,
            createdAt: true,
            patient: {
                select: {
                    id: true,
                    name: true,
                    elderId: true
                }
            }
        },
        orderBy: [
            { admittedAt: 'desc' },
            { createdAt: 'desc' }
        ]
    });

    const patientMap = new Map<string, any>();
    for (const admission of admissions) {
        const patient = admission.patient;
        if (!patient?.id || patientMap.has(patient.id)) continue;

        patientMap.set(patient.id, {
            patientId: patient.id,
            patientName: patient.name || 'Patient',
            elderId: patient.elderId || null,
            entries: [],
            caregiverSheet: null,
            dailyTotals: [],
            totals: {
                manual: 0,
                inventory: 0,
                total: 0
            }
        });
    }

    const patientIds = Array.from(patientMap.keys());
    if (!patientIds.length) {
        return {
            month,
            source,
            patients: [],
            summary: {
                patientCount: 0,
                manualTotal: 0,
                inventoryTotal: 0,
                totalAmount: 0
            }
        };
    }

    const ledgerRows: any[] = await (prisma as any).$queryRaw`
        SELECT
            "patientId",
            to_char("costDate", 'YYYY-MM-DD') AS "date",
            "category",
            "description",
            "quantity",
            "rate",
            "amount",
            "sourceType",
            "createdBy",
            "createdAt"
        FROM "PatientDailyCost"
        WHERE "tenantId" = ${scope.tenantId}
          AND "isDeleted" = false
          AND "patientId" = ANY(${patientIds}::text[])
          AND "costDate" >= ${monthStart}::date
          AND "costDate" < ${nextMonth}::date
          AND "sourceType" = ANY(${sourceTypes}::text[])
        ORDER BY "costDate" ASC, "createdAt" ASC
    `;

    const caregiverSheetRows: any[] = source === 'INVENTORY'
        ? []
        : await (prisma as any).$queryRaw`
            SELECT
                "patientId",
                "items",
                "signatures",
                "totalAmount",
                "status",
                "createdBy",
                "createdAt",
                "updatedAt"
            FROM "CaregiverRevenueSheet"
            WHERE "tenantId" = ${scope.tenantId}
              AND "isDeleted" = false
              AND "month" = ${month}
              AND "patientId" = ANY(${patientIds}::text[])
            ORDER BY "updatedAt" DESC, "createdAt" DESC
        `;

    const userIds = Array.from(new Set([
        ...ledgerRows.map((row) => row.createdBy),
        ...caregiverSheetRows.map((row) => row.createdBy)
    ].filter(Boolean).map(String)));

    const users = userIds.length
        ? await (prisma as any).user.findMany({
            where: {
                id: { in: userIds },
                tenantId: scope.tenantId
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                staff: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                }
            }
        })
        : [];
    const userNameMap = new Map<string, string>(users.map((item: any) => [item.id, toSafeName(item) || 'Unknown User']));

    const sheetPatientIds = new Set<string>();
    for (const sheet of caregiverSheetRows) {
        const sheetPatientId = String(sheet.patientId || '');
        const patient = patientMap.get(sheetPatientId);
        if (!patient || sheetPatientIds.has(sheetPatientId)) continue;

        patient.caregiverSheet = {
            title: "Care Giver's Total Revenue Form",
            status: String(sheet.status || 'DRAFT'),
            totalAmount: toMoney(sheet.totalAmount),
            signatures: sanitizeSignatures(sheet.signatures),
            items: sanitizeSheetItems(sheet.items),
            createdAt: toIsoStringOrNull(sheet.createdAt),
            updatedAt: toIsoStringOrNull(sheet.updatedAt),
            createdByName: sheet.createdBy ? userNameMap.get(String(sheet.createdBy)) || null : null
        };
        sheetPatientIds.add(sheetPatientId);
    }

    const dailyTotalsByPatient = new Map<string, Map<string, any>>();
    for (const row of ledgerRows) {
        const rowPatientId = String(row.patientId || '');
        const patient = patientMap.get(rowPatientId);
        if (!patient) continue;

        const sourceType = String(row.sourceType || '');
        const sourceGroup = sourceGroupFor(sourceType);
        const amount = toMoney(row.amount);
        const entry = {
            date: String(row.date || ''),
            category: String(row.category || ''),
            description: String(row.description || ''),
            quantity: Number(row.quantity || 0),
            rate: toMoney(row.rate),
            amount,
            sourceType,
            sourceGroup,
            createdAt: toIsoStringOrNull(row.createdAt),
            createdByName: row.createdBy ? userNameMap.get(String(row.createdBy)) || null : null
        };

        patient.entries.push(entry);

        if (sourceGroup === 'INVENTORY') {
            patient.totals.inventory = toMoney(patient.totals.inventory + amount);
        } else {
            patient.totals.manual = toMoney(patient.totals.manual + amount);
        }
        patient.totals.total = toMoney(patient.totals.manual + patient.totals.inventory);

        if (!dailyTotalsByPatient.has(rowPatientId)) {
            dailyTotalsByPatient.set(rowPatientId, new Map<string, any>());
        }
        const dailyMap = dailyTotalsByPatient.get(rowPatientId)!;
        const date = entry.date;
        if (!dailyMap.has(date)) {
            dailyMap.set(date, { date, manual: 0, inventory: 0, total: 0 });
        }
        const dailyTotal = dailyMap.get(date);
        if (sourceGroup === 'INVENTORY') {
            dailyTotal.inventory = toMoney(dailyTotal.inventory + amount);
        } else {
            dailyTotal.manual = toMoney(dailyTotal.manual + amount);
        }
        dailyTotal.total = toMoney(dailyTotal.manual + dailyTotal.inventory);
    }

    let manualTotal = 0;
    let inventoryTotal = 0;
    const patients = Array.from(patientMap.values()).map((patient) => {
        patient.dailyTotals = Array.from((dailyTotalsByPatient.get(patient.patientId) || new Map()).values());
        manualTotal = toMoney(manualTotal + patient.totals.manual);
        inventoryTotal = toMoney(inventoryTotal + patient.totals.inventory);
        return patient;
    });

    return {
        month,
        source,
        patients,
        summary: {
            patientCount: patients.length,
            manualTotal,
            inventoryTotal,
            totalAmount: toMoney(manualTotal + inventoryTotal)
        }
    };
};

export const createNursingRevenueRecordService = async (
    patientId: string,
    validated: {
        assignmentId: string;
        careDate: string;
        category: string;
        description: string;
        quantity: number;
        rate: number;
    },
    scope: { tenantId: string; unitId?: string },
    user: any
) => {
    const authCheck = await resolveNursingStaffAssignment(scope.tenantId, user, patientId, validated.assignmentId);
    if (!authCheck.authorized) {
        const error: any = new Error(authCheck.reason || 'You do not have an active assignment for this patient');
        error.status = 403;
        throw error;
    }

    const activeAdmission = await (prisma as any).admission.findFirst({
        where: {
            patientId,
            tenantId: scope.tenantId,
            status: 'ACTIVE'
        },
        orderBy: { createdAt: 'desc' }
    });


    if (!activeAdmission) {
        const error: any = new Error('No active admission found for patient');
        error.status = 400;
        throw error;
    }

    const allocation = await (prisma as any).allocation.findFirst({
        where: {
            enquiryId: activeAdmission.enquiryId,
            tenantId: scope.tenantId,
            isDeleted: false
        },
        orderBy: { createdAt: 'desc' }
    });


    if (!allocation) {
        const error: any = new Error('No active billing allocation found for patient\'s admission');
        error.status = 400;
        throw error;
    }

    const rawDateStr = String(validated.careDate).split('T')[0];
    const careDateObj = new Date(`${rawDateStr}T00:00:00.000Z`);

    const categoryStr = String(validated.category).trim().toLowerCase();
    const descNormalized = String(validated.description).trim().toLowerCase();
    const descHash = createHash('sha256').update(descNormalized).digest('hex').slice(0, 12);
    const sourceId = `nursing:${patientId}:${rawDateStr}:${categoryStr}:${descHash}:${validated.quantity}:${validated.rate}`;

    const ledgerRow = await createPatientLedgerEntryForAllocation(prisma, {
        tenantId: scope.tenantId,
        allocationId: allocation.id,
        costDate: careDateObj,
        category: String(validated.category).trim(),
        description: String(validated.description).trim(),
        quantity: Number(validated.quantity),
        rate: Number(validated.rate),
        sourceType: 'NURSING_MANUAL_ENTRY',
        sourceId,
        createdBy: user?.id || null,
        metadata: {
            patientId,
            assignmentId: validated.assignmentId,
            nurseUserId: user?.id || null
        }
    });

    if (!ledgerRow) {
        const error: any = new Error('Failed to create revenue entry in patient ledger');
        error.status = 500;
        throw error;
    }

    return {
        id: ledgerRow.id,
        patientId,
        careDate: rawDateStr,
        category: ledgerRow.category,
        description: ledgerRow.description,
        quantity: Number(ledgerRow.quantity),
        rate: Number(ledgerRow.rate),
        amount: Number(ledgerRow.amount),
        sourceType: ledgerRow.sourceType
    };
};

export const getNursingPatientRevenueTodayService = async (
    patientId: string,
    assignmentId: string,
    scope: { tenantId: string; unitId?: string },
    user: any
) => {
    const authCheck = await resolveNursingStaffAssignment(scope.tenantId, user, patientId, assignmentId, true);
    if (!authCheck.authorized) {
        const error: any = new Error(authCheck.reason || 'You do not have an active assignment for this patient');
        error.status = 403;
        throw error;
    }

    const todayStr = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const todayDateObj = new Date(`${todayStr}T00:00:00.000Z`);

    const rows: any[] = await (prisma as any).$queryRaw`
        SELECT "id", "category", "description", "quantity", "rate", "amount", "sourceType", "createdAt"
        FROM "PatientDailyCost"
        WHERE "tenantId" = ${scope.tenantId}
          AND "patientId" = ${patientId}
          AND "isDeleted" = false
          AND "costDate" = ${todayDateObj}
        ORDER BY "createdAt" ASC
    `;

    const manualEntries: any[] = [];
    const inventoryEntries: any[] = [];

    (rows || []).forEach((row) => {
        const item = {
            id: row.id,
            category: String(row.category || ''),
            description: String(row.description || ''),
            quantity: Number(row.quantity || 0),
            rate: Number(row.rate || 0),
            amount: Number(row.amount || 0),
            sourceType: String(row.sourceType || ''),
            createdAt: row.createdAt
        };

        if (item.sourceType === 'INVENTORY_ISSUE') {
            inventoryEntries.push(item);
        } else if (item.sourceType === 'NURSING_MANUAL_ENTRY' || item.sourceType === 'CAREGIVER_REVENUE_SHEET') {
            manualEntries.push(item);
        }
    });

    const manualTotal = Number(manualEntries.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    const inventoryTotal = Number(inventoryEntries.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    const totalAmount = Number((manualTotal + inventoryTotal).toFixed(2));

    return {
        patientId,
        careDate: todayStr,
        manualEntries,
        inventoryEntries,
        summary: {
            manualTotal,
            inventoryTotal,
            totalAmount
        }
    };
};

