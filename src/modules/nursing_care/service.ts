import { randomUUID } from 'crypto';
import { prisma } from '../../app/prisma.js';
import { sendNotification } from '../notification/service.js';
import { ensurePatientBillingTables, postStockIssueToPatientLedger } from '../patient_billing/ledger.js';
import {
    caregiverVitalChartSchema,
    medicationScheduleSchema,
    administerDoseSchema,
    vitalSignSchema
} from './validation.js';
import { z } from 'zod';

const medicationScheduleModule = 'HEALTHCARE_MEDICATION';
const medicationScheduleAction = 'MEDICATION_SCHEDULE';
const activeAssignmentStatuses = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'];
const historicalVitalAccessRoles = ['NURSING_MANAGER', 'NURSING_SUPER_HEAD', 'SUPER_ADMIN', 'MEDICAL_MANAGER'];

export const resolveNursingStaffAssignment = async (tenantId: string, user: any, patientId: string, requestedAssignmentId?: string) => {
    if (!user) return { authorized: false, reason: 'Unauthenticated', staff: null, assignmentId: null, staffId: null };

    const userRole = String(user.role || user.roleName || '').trim().toUpperCase();
    const privilegedRoles = ['SUPER_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER'];
    const permissions = user.permissions || [];

    if (privilegedRoles.includes(userRole) || permissions.includes('ALL_ACCESS')) {
        return { authorized: true, reason: null, staff: null, assignmentId: null, staffId: null };
    }

    const staff = await (prisma as any).staff.findFirst({
        where: { userId: user.id, tenantId, isDeleted: false },
        select: { id: true, unitId: true, department: true }
    });

    if (!staff) {
        return { authorized: false, reason: 'No staff record linked to this user', staff: null, assignmentId: null, staffId: null };
    }

    const now = new Date();
    const assignment = await (prisma as any).medicalAssignment.findFirst({
        where: {
            ...(requestedAssignmentId ? { id: requestedAssignmentId } : {}),
            staffId: staff.id,
            patientId,
            tenantId,
            unitId: staff.unitId,
            isDeleted: false,
            status: { in: activeAssignmentStatuses },
            startAt: { lte: now },
            OR: [{ endAt: null }, { endAt: { gte: now } }]
        },
        orderBy: { startAt: 'desc' },
        select: { id: true }
    });

    if (!assignment) {
        return { authorized: false, reason: 'You do not have an active assignment for this patient', staff, assignmentId: null, staffId: staff.id };
    }

    return { authorized: true, reason: null, staff, assignmentId: assignment.id, staffId: staff.id };
};

let caregiverVitalChartReady = false;

const ensureCaregiverVitalChartTable = async () => {
    if (caregiverVitalChartReady) return;

    await (prisma as any).$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CaregiverVitalChart" (
            "id" TEXT NOT NULL,
            "patientId" TEXT NOT NULL,
            "patientName" TEXT NOT NULL,
            "age" TEXT,
            "sex" TEXT,
            "month" TEXT NOT NULL,
            "entries" JSONB NOT NULL DEFAULT '[]'::jsonb,
            "signatures" JSONB NOT NULL DEFAULT '{}'::jsonb,
            "status" TEXT NOT NULL DEFAULT 'DRAFT',
            "tenantId" TEXT NOT NULL,
            "unitId" TEXT NOT NULL,
            "createdBy" TEXT,
            "isDeleted" BOOLEAN NOT NULL DEFAULT false,
            "deletedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "CaregiverVitalChart_pkey" PRIMARY KEY ("id")
        )
    `);
    await (prisma as any).$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "CaregiverVitalChart_patient_month_key" ON "CaregiverVitalChart"("patientId", "month", "tenantId", "unitId") WHERE "isDeleted" = false');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CaregiverVitalChart_tenant_unit_idx" ON "CaregiverVitalChart"("tenantId", "unitId")');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CaregiverVitalChart_month_idx" ON "CaregiverVitalChart"("month")');

    caregiverVitalChartReady = true;
};

const toCaregiverVitalChart = (row: any) => ({
    ...row,
    entries: Array.isArray(row.entries) ? row.entries : [],
    signatures: row.signatures && typeof row.signatures === 'object' && !Array.isArray(row.signatures) ? row.signatures : {}
});

const toMedicationSchedule = (row: any) => {
    const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
    return {
        id: row.id,
        ...payload,
        times: Array.isArray(payload.times) ? payload.times : [],
        administeredSlots: Array.isArray(payload.administeredSlots) ? payload.administeredSlots : [],
        administeredHistory: Array.isArray(payload.administeredHistory) ? payload.administeredHistory : [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
};

// ... helper functions for resolving patient & notifications
const normalizePhone = (value: unknown) => String(value || '').replace(/\D/g, '');

const resolveFamilyUserIdsForPatient = async (patientId: string, scope: { tenantId: string; unitId: string }) => {
    const userIds = new Set<string>();
    
    const admissions = await (prisma as any).admission.findMany({
        where: { patientId, tenantId: scope.tenantId },
        select: {
            enquiry: {
                select: { client: { select: { email: true, mobile: true } } }
            }
        }
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

const notifyAbnormalVitals = async (patientName: string, patientId: string, abnormalEntries: any[], scope: { tenantId: string; unitId: string }) => {
    try {
        const userIds = await resolveFamilyUserIdsForPatient(patientId, scope);
        if (!userIds.length) return;

        const summary = abnormalEntries.map(e => Object.entries(e).map(([k, v]) => `${k}: ${v}`).join(', ')).join(' | ');
        const message = `Alert: Abnormal vitals detected for ${patientName}. Details: ${summary}`;

        await Promise.allSettled(userIds.map((userId) => sendNotification({
            userId, message, type: 'ABNORMAL_VITAL_ALERT', tenantId: scope.tenantId, unitId: scope.unitId
        })));
    } catch (error) {
        console.error('Failed to send abnormal vital alert:', error);
    }
};

const resolveCaregiverVitalChartPatient = async (validated: any, scope: { tenantId: string; unitId: string }) => {
    const patient = await (prisma as any).patient.findFirst({
        where: { id: validated.patientId, tenantId: scope.tenantId },
        select: { id: true, name: true, tenantId: true, unitId: true }
    });

    if (!patient) return null;
    if (patient.unitId === scope.unitId) return patient;

    const admission = await (prisma as any).admission.findFirst({
        where: {
            tenantId: scope.tenantId,
            patientId: patient.id,
            OR: [
                { unitId: scope.unitId },
                ...(validated.admissionId ? [{ id: validated.admissionId }] : []),
                ...(validated.enquiryId ? [{ enquiryId: validated.enquiryId }] : [])
            ]
        },
        select: { id: true, unitId: true, patient: { select: { id: true, name: true, tenantId: true, unitId: true } } }
    });

    if (admission?.patient) return admission.patient;

    const allocation = await (prisma as any).allocation.findFirst({
        where: {
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            type: 'IN_HOUSE',
            isDeleted: false,
            ...(validated.allocationId ? { id: validated.allocationId } : {}),
            ...(validated.enquiryId ? { enquiryId: validated.enquiryId } : {}),
            enquiry: { is: { admission: { is: { patientId: patient.id } } } }
        },
        select: {
            id: true, enquiryId: true,
            enquiry: { select: { admission: { select: { patient: { select: { id: true, name: true, tenantId: true, unitId: true } } } } } }
        }
    });

    return allocation?.enquiry?.admission?.patient || null;
};

// ==========================================
// Vitals Operations
// ==========================================

export const getCaregiverVitalChartsService = async (month: string, patientId: string, scope: { tenantId: string; unitId: string }, user?: any) => {
    if (!month || !patientId) return [];
    
    const [yearStr, monthStr] = month.split('-');
    if (!yearStr || !monthStr) return [];
    
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10) - 1; // 0-indexed month
    
    const authCheck = await resolveNursingStaffAssignment(scope.tenantId, user, patientId);
    if (!authCheck.authorized) {
        throw new Error(`Not authorized: ${authCheck.reason}`);
    }

    const operationalUnitId = authCheck.staff?.unitId || scope.unitId;
    const patient = await (prisma as any).patient.findFirst({ where: { id: patientId, tenantId: scope.tenantId } });
    if (!patient) return [];

    const start = new Date(Date.UTC(year, m, 1));
    const end = new Date(Date.UTC(year, m + 1, 0, 23, 59, 59, 999));

    const vitals = await (prisma as any).vitalSign.findMany({
        where: {
            patientId,
            tenantId: scope.tenantId,
            unitId: operationalUnitId,
            isDeleted: false,
            recordedAt: { gte: start, lte: end }
        },
        orderBy: { recordedAt: 'asc' }
    });

    const userIds = [...new Set(vitals.map((v: any) => v.recordedById))].filter(Boolean);
    const users = await (prisma as any).user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, staff: { select: { department: true } } }
    });
    const userMap = users.reduce((acc: any, u: any) => {
        acc[u.id] = {
            name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown',
            department: u.staff?.department || null
        };
        return acc;
    }, {});

    const entriesMap: Record<number, any> = {};
    for (let day = 1; day <= 31; day++) {
        entriesMap[day] = { day };
    }

    for (const v of vitals) {
        const d = v.recordedAt.getUTCDate();
        const entry = entriesMap[d];
        const recorder = userMap[v.recordedById] || { name: 'Unknown', department: v.department };
        
        if (v.shift === 'MORNING') {
            if (!entry.tempMor && v.temp !== null) entry.tempMor = String(v.temp);
            if (!entry.bpMor && v.bp !== null) entry.bpMor = v.bp;
            if (!entry.pulseMor && v.pulse !== null) entry.pulseMor = String(v.pulse);
            if (!entry.spo2Mor && v.spO2 !== null) entry.spo2Mor = String(v.spO2);
            entry.recordedByMor = recorder.name;
            entry.departmentMor = v.department || recorder.department;
        } else if (v.shift === 'EVENING') {
            if (!entry.tempEve && v.temp !== null) entry.tempEve = String(v.temp);
            if (!entry.bpEve && v.bp !== null) entry.bpEve = v.bp;
            if (!entry.pulseEve && v.pulse !== null) entry.pulseEve = String(v.pulse);
            if (!entry.spo2Eve && v.spO2 !== null) entry.spo2Eve = String(v.spO2);
            entry.recordedByEve = recorder.name;
            entry.departmentEve = v.department || recorder.department;
        }
    }

    let entries = Object.values(entriesMap).filter((e: any) => e.tempMor || e.tempEve || e.bpMor || e.bpEve || e.pulseMor || e.pulseEve || e.spo2Mor || e.spo2Eve);

    // Today-Only Enforcement for GET
    const roleName = String(typeof user?.role === 'object' ? user.role?.name : user?.role || '').trim().toUpperCase();
    if (user && !historicalVitalAccessRoles.includes(roleName)) {
        const now = new Date();
        const todayLocalDay = now.getDate();
        const todayMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        if (month !== todayMonthStr) {
            entries = [];
        } else {
            entries = entries.filter((e: any) => e.day === todayLocalDay);
        }
    }

    const chart = {
        id: `virtual-chart-${patientId}-${month}`,
        patientId,
        patientName: patient.name,
        month,
        entries,
        status: 'DRAFT',
        tenantId: scope.tenantId,
        unitId: operationalUnitId
    };

    return [chart];
};

export const saveCaregiverVitalChartService = async (validated: any, scope: { tenantId: string; unitId: string }, user: any) => {
    const patient = await resolveCaregiverVitalChartPatient(validated, scope);
    if (!patient) throw new Error('Patient not found');

    const [yearStr, monthStr] = validated.month.split('-');
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10) - 1;
    const newEntries = validated.entries || [];
    
    for (const entry of newEntries) {
        const day = parseInt(entry.day, 10);
        if (isNaN(day)) continue;
        
        // Today-Only Enforcement for normal nurses
        if (user?.role?.name !== 'Nursing Manager' && user?.role?.name !== 'Nursing Super Head' && user?.role?.name !== 'Super Admin' && user?.role?.name !== 'Medical Manager') {
            const today = new Date();
            if (year !== today.getFullYear() || m !== today.getMonth() || day !== today.getDate()) {
                continue; // Ignore inserts for past/future days silently
            }
        }

        // Process Morning
        const hasMor = entry.tempMor || entry.spo2Mor || entry.bpMor || entry.pulseMor;
        if (hasMor) {
            const recordedAt = new Date(Date.UTC(year, m, day, 8, 0, 0));
            const existing = await (prisma as any).vitalSign.findFirst({
                where: { patientId: patient.id, shift: 'MORNING', recordedAt, tenantId: scope.tenantId, unitId: scope.unitId, isDeleted: false }
            });
            if (!existing) {
                await (prisma as any).vitalSign.create({
                    data: {
                        patientId: patient.id,
                        shift: 'MORNING',
                        recordedAt,
                        temp: entry.tempMor ? parseFloat(entry.tempMor) : null,
                        spO2: entry.spo2Mor ? parseInt(entry.spo2Mor, 10) : null,
                        bp: entry.bpMor || null,
                        pulse: entry.pulseMor ? parseInt(entry.pulseMor, 10) : null,
                        recordedById: user.id,
                        department: user.staff?.department || null,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId,
                        notes: 'From Caregiver Flowsheet'
                    }
                });
            }
        }

        // Process Evening
        const hasEve = entry.tempEve || entry.spo2Eve || entry.bpEve || entry.pulseEve;
        if (hasEve) {
            const recordedAt = new Date(Date.UTC(year, m, day, 20, 0, 0));
            const existing = await (prisma as any).vitalSign.findFirst({
                where: { patientId: patient.id, shift: 'EVENING', recordedAt, tenantId: scope.tenantId, unitId: scope.unitId, isDeleted: false }
            });
            if (!existing) {
                await (prisma as any).vitalSign.create({
                    data: {
                        patientId: patient.id,
                        shift: 'EVENING',
                        recordedAt,
                        temp: entry.tempEve ? parseFloat(entry.tempEve) : null,
                        spO2: entry.spo2Eve ? parseInt(entry.spo2Eve, 10) : null,
                        bp: entry.bpEve || null,
                        pulse: entry.pulseEve ? parseInt(entry.pulseEve, 10) : null,
                        recordedById: user.id,
                        department: user.staff?.department || null,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId,
                        notes: 'From Caregiver Flowsheet'
                    }
                });
            }
        }
    }

    const abnormal = newEntries.filter((entry: any) => {
        let isAbnormal = false;
        const check = (val: string, min: number, max: number) => {
            const num = parseFloat(val);
            return !isNaN(num) && (num < min || num > max);
        };
        if (check(entry.tempMor, 95, 99) || check(entry.tempEve, 95, 99)) isAbnormal = true;
        if (check(entry.spo2Mor, 95, 100) || check(entry.spo2Eve, 95, 100)) isAbnormal = true;
        if (check(entry.bpMor?.split('/')[0], 90, 140) || check(entry.bpEve?.split('/')[0], 90, 140)) isAbnormal = true;
        if (check(entry.pulseMor, 60, 100) || check(entry.pulseEve, 60, 100)) isAbnormal = true;
        return isAbnormal;
    });

    if (abnormal.length > 0) {
        await notifyAbnormalVitals(validated.patientName || patient.name, patient.id, abnormal, scope);
    }

    return getCaregiverVitalChartsService(validated.month, patient.id, scope).then(res => res[0]);
};

// ==========================================
// Medication Schedules
// ==========================================

export const getMedicationSchedulesService = async (patientId: string | undefined, scope: { tenantId: string; unitId?: string }) => {
    const schedules = await (prisma as any).auditLog.findMany({
        where: {
            ...scope,
            module: medicationScheduleModule,
            action: medicationScheduleAction,
            isDeleted: false,
            ...(patientId ? { payload: { path: ['patientId'], equals: patientId } } : {})
        },
        orderBy: { createdAt: 'desc' }
    });
    return schedules.map(toMedicationSchedule);
};

export const createMedicationScheduleService = async (validated: any, scope: { tenantId: string; unitId: string }, userId: string) => {
    const schedule = await (prisma as any).auditLog.create({
        data: {
            userId,
            module: medicationScheduleModule,
            action: medicationScheduleAction,
            payload: {
                ...validated,
                status: 'SCHEDULED',
                administeredSlots: [],
                administeredHistory: []
            },
            ...scope
        }
    });
    return toMedicationSchedule(schedule);
};

const readNoteValue = (notes: unknown, label: string) => {
    const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.+)$`, 'im');
    return String(notes || '').match(pattern)?.[1]?.trim() || '';
};

const resolveDoseNotificationUserIds = async (payload: any, scope: { tenantId: string; unitId: string }) => {
    const userIds = new Set<string>();
    const medicineIssueId = String(payload?.medicineIssueId || '').trim();
    if (!medicineIssueId) return [];

    const issueRows = await (prisma as any).$queryRaw`
        SELECT "id", "notes", "issuedTo", "tenantId", "unitId"
        FROM "StockIssueRequest"
        WHERE "id" = ${medicineIssueId}
          AND "tenantId" = ${scope.tenantId}
          AND "unitId" = ${scope.unitId}
          AND "isDeleted" = false
        LIMIT 1
    `;
    const issue = issueRows?.[0];
    const allocationId = readNoteValue(issue?.notes || payload?.notes, 'Allocation');

    if (!allocationId) return [];

    const allocation = await (prisma as any).allocation.findFirst({
        where: { id: allocationId, tenantId: scope.tenantId, unitId: scope.unitId, isDeleted: false },
        select: {
            staff: { select: { userId: true } },
            enquiry: { select: { client: { select: { email: true, mobile: true } } } }
        }
    });

    if (allocation?.staff?.userId) userIds.add(allocation.staff.userId);

    const client = allocation?.enquiry?.client;
    const OR: any[] = [];
    const clientEmail = String(client?.email || '').trim();
    const clientMobile = normalizePhone(client?.mobile);
    if (clientEmail) OR.push({ email: { equals: clientEmail, mode: 'insensitive' } });
    if (clientMobile) OR.push({ mobile: { contains: clientMobile } });

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

const notifyDoseAdministration = async (payload: any, scope: { tenantId: string; unitId: string }) => {
    try {
        const userIds = await resolveDoseNotificationUserIds(payload, scope);
        if (!userIds.length) return;

        const latestHistory = Array.isArray(payload.administeredHistory)
            ? payload.administeredHistory[payload.administeredHistory.length - 1]
            : null;
        const slot = latestHistory?.slot || 'Scheduled';
        const administeredBy = latestHistory?.administeredBy || 'Care staff';
        const medicineName = payload?.medicineName || 'Medicine';
        const patientName = payload?.patientName || 'patient';
        const message = `${medicineName} ${slot} dose was given to ${patientName} by ${administeredBy}.`;

        await Promise.allSettled(userIds.map((userId) => sendNotification({
            userId, message, type: 'MEDICINE_DOSE_GIVEN', tenantId: scope.tenantId, unitId: scope.unitId
        })));
    } catch (error) {
        console.error('Medication dose saved but notification dispatch failed:', error);
    }
};

const backfillMedicineIssueLedgerEntry = async (payload: any, scope: { tenantId: string; unitId: string }, userId?: string | null) => {
    const medicineIssueId = String(payload?.medicineIssueId || '').trim();
    if (!medicineIssueId) return;

    try {
        await ensurePatientBillingTables();
        await (prisma as any).$transaction(async (tx: any) => {
            const rows = await tx.$queryRaw`
                SELECT *
                FROM "StockIssueRequest"
                WHERE "id" = ${medicineIssueId}
                  AND "tenantId" = ${scope.tenantId}
                  AND "unitId" = ${scope.unitId}
                  AND "status" = 'APPROVED'
                  AND "isDeleted" = false
                LIMIT 1
            `;
            const request = rows?.[0];
            if (!request) return null;

            return postStockIssueToPatientLedger(tx, request, userId || null);
        });
    } catch (error) {
        console.error('Medication dose saved but patient ledger backfill failed:', error);
    }
};

export const administerMedicationDoseService = async (id: string, validated: any, user: any, scope: { tenantId: string; unitId: string }) => {
    const existing = await (prisma as any).auditLog.findFirst({
        where: { id, ...scope, module: medicationScheduleModule, action: medicationScheduleAction, isDeleted: false }
    });

    if (!existing) {
        throw new Error('Medication schedule not found');
    }

    const payload = existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload) ? existing.payload : {};
    const previousSlots = Array.isArray(payload.administeredSlots) ? payload.administeredSlots : [];
    const previousHistory = Array.isArray(payload.administeredHistory) ? payload.administeredHistory : [];
    const administeredSlots = Array.from(new Set([...previousSlots, validated.slot]));
    const times = Array.isArray(payload.times) ? payload.times : [];
    const status = times.length > 0 && administeredSlots.length >= times.length ? 'COMPLETED' : 'IN_PROGRESS';

    const updated = await (prisma as any).auditLog.update({
        where: { id: existing.id },
        data: {
            userId: user.id,
            payload: {
                ...payload,
                status,
                administeredSlots,
                administeredHistory: [
                    ...previousHistory,
                    {
                        slot: validated.slot,
                        remarks: validated.remarks,
                        administeredBy: user.name || user.email || user.id,
                        administeredAt: new Date().toISOString()
                    }
                ]
            }
        }
    });

    const medicationSchedule = toMedicationSchedule(updated);
    await notifyDoseAdministration(medicationSchedule, scope);
    await backfillMedicineIssueLedgerEntry(medicationSchedule, scope, user?.id || null);

    return medicationSchedule;
};

export const getVitalsService = async (patientId: string, scope: { tenantId: string; unitId: string }) => {
    return (prisma as any).vitalSign.findMany({
        where: { patientId, tenantId: scope.tenantId, unitId: scope.unitId, isDeleted: false },
        orderBy: { createdAt: 'desc' }
    });
};

export const saveVitalService = async (validated: any, scope: { tenantId: string; unitId: string }, user: any) => {
    const authCheck = await resolveNursingStaffAssignment(scope.tenantId, user, validated.patientId);
    if (!authCheck.authorized) {
        throw new Error(`Not authorized: ${authCheck.reason}`);
    }

    const staff = authCheck.staff || await (prisma as any).staff.findFirst({
        where: { userId: user.id, tenantId: scope.tenantId, isDeleted: false },
        select: { id: true, unitId: true, department: true }
    });
    if (!staff?.department) {
        throw new Error('Authenticated staff department is required');
    }

    let assignmentId = authCheck.assignmentId || null;
    if (validated.assignmentId) {
        const now = new Date();
        const assignment = await (prisma as any).medicalAssignment.findFirst({
            where: {
                id: validated.assignmentId,
                patientId: validated.patientId,
                tenantId: scope.tenantId,
                unitId: staff.unitId,
                isDeleted: false,
                status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] },
                startAt: { lte: now },
                OR: [{ endAt: null }, { endAt: { gte: now } }]
            },
            select: { id: true, staffId: true }
        });
        if (!assignment || (authCheck.staffId && assignment.staffId !== authCheck.staffId)) {
            throw new Error('Not authorized: assignment does not belong to this staff member');
        }
        assignmentId = assignment.id;
    }

    return (prisma as any).vitalSign.create({
        data: {
            ...validated,
            recordedById: user.id,
            recordedAt: new Date(),
            department: staff.department,
            assignmentId,
            verified: false,
            tenantId: scope.tenantId,
            unitId: staff.unitId
        }
    });
};

export const verifyVitalService = async (id: string, notes: string | undefined, scope: { tenantId: string; unitId: string }, userId: string) => {
    return (prisma as any).vitalSign.update({
        where: { id, tenantId: scope.tenantId, unitId: scope.unitId },
        data: {
            verified: true,
            verifiedBy: userId,
            verificationNotes: notes || null
        }
    });
};

export const getPrescriptionsService = async (patientId: string | null, scope: { tenantId: string; unitId: string }) => {
    const where: any = { tenantId: scope.tenantId, unitId: scope.unitId };
    if (patientId) where.patientId = patientId;
    return (prisma as any).prescription.findMany({ where, orderBy: { createdAt: 'desc' } });
};

export const createPrescriptionService = async (validated: any, scope: { tenantId: string; unitId: string }, userId: string) => {
    return (prisma as any).prescription.create({
        data: {
            ...validated,
            doctorId: userId,
            startDate: new Date(validated.startDate),
            endDate: validated.endDate ? new Date(validated.endDate) : null,
            tenantId: scope.tenantId,
            unitId: scope.unitId
        }
    });
};

export const getMedicationLogsService = async (patientId: string | null, scope: { tenantId: string; unitId: string }) => {
    const where: any = { tenantId: scope.tenantId, unitId: scope.unitId };
    if (patientId) where.patientId = patientId;
    return (prisma as any).medicationLog.findMany({ where, orderBy: { administeredAt: 'desc' } });
};

export const administerMedicationLogService = async (validated: any, scope: { tenantId: string; unitId: string }, user: any) => {
    const authCheck = await resolveNursingStaffAssignment(scope.tenantId, user, validated.patientId);
    if (!authCheck.authorized) {
        throw new Error(`Not authorized: ${authCheck.reason}`);
    }

    const userName = user.name || user.email || user.id;

    return (prisma as any).medicationLog.create({
        data: {
            ...validated,
            administeredBy: userName,
            assignmentId: authCheck.assignmentId || null,
            tenantId: scope.tenantId,
            unitId: scope.unitId
        }
    });
};

export const verifyMedicationLogService = async (id: string, notes: string | undefined, scope: { tenantId: string; unitId: string }, userId: string) => {
    return (prisma as any).medicationLog.update({
        where: { id, tenantId: scope.tenantId, unitId: scope.unitId },
        data: {
            isVerified: true,
            verifiedBy: userId,
            notes: notes || null
        }
    });
};
