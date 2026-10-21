import { prisma } from '../../app/prisma.js';
import { sendNotification } from '../notification/service.js';
import { resolveNursingStaffAssignment } from './service.js';

export interface MonitoringSlot {
    timeStr: string;      // e.g. "10:00"
    hour: number;         // e.g. 10
    status: 'COMPLETED' | 'DUE' | 'OVERDUE' | 'UPCOMING';
    vital?: any;
}

export const getScheduledHoursForFrequency = (frequency: string, customIntervalMinutes?: number | null): number[] => {
    switch (frequency) {
        case 'HOURLY':
            return Array.from({ length: 24 }, (_, i) => i);
        case 'EVERY_2_HOURS':
            return [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
        case 'EVERY_4_HOURS':
            return [0, 4, 8, 12, 16, 20];
        case 'EVERY_6_HOURS':
            return [0, 6, 12, 18];
        case 'EVERY_8_HOURS':
            return [0, 8, 16];
        case 'CUSTOM': {
            const intervalHours = Math.max(1, Math.floor((customIntervalMinutes || 120) / 60));
            const hours: number[] = [];
            for (let h = 0; h < 24; h += intervalHours) {
                hours.push(h);
            }
            return hours;
        }
        default:
            return [0, 4, 8, 12, 16, 20];
    }
};

export const findPatientInUnitScope = async (patientId: string, scope: { tenantId: string; unitId: string }) => {
    return (prisma as any).patient.findFirst({
        where: {
            id: patientId,
            tenantId: scope.tenantId,
            OR: [
                { unitId: scope.unitId },
                { admissions: { some: { unitId: scope.unitId, status: 'ACTIVE' } } },
                { MedicalAssignment: { some: { unitId: scope.unitId, status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] } } } }
            ]
        },
        select: { id: true, name: true, tenantId: true, unitId: true }
    });
};

/**
 * Configure / Create a Care Plan Monitoring Requirement for a patient.
 * Restrict to Manager / Clinical leadership roles.
 */
export const upsertVitalMonitoringRequirementService = async (
    patientId: string,
    payload: {
        frequency: string;
        customIntervalMinutes?: number;
        startAt?: string;
        endAt?: string;
        notes?: string;
        assignmentId?: string;
    },
    scope: { tenantId: string; unitId: string },
    user: any
) => {
    const userRole = String(user.role || user.roleName || '').trim().toUpperCase();
    const privilegedRoles = ['SUPER_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'MEDICAL_DOCTOR'];
    if (!privilegedRoles.includes(userRole) && !user.permissions?.includes('ALL_ACCESS')) {
        throw new Error('Only authorized clinical management can configure vital monitoring requirements');
    }

    // Verify patient exists (admission/assignment-aware scope check)
    const patient = await findPatientInUnitScope(patientId, scope);
    if (!patient) {
        throw new Error('Patient not found');
    }


    // Deactivate existing active requirements
    await (prisma as any).vitalMonitoringRequirement.updateMany({
        where: {
            patientId,
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            isActive: true
        },
        data: { isActive: false }
    });

    const newReq = await (prisma as any).vitalMonitoringRequirement.create({
        data: {
            patientId,
            assignmentId: payload.assignmentId || null,
            monitoringType: 'VITALS',
            frequency: payload.frequency,
            customIntervalMinutes: payload.customIntervalMinutes || null,
            startAt: payload.startAt ? new Date(payload.startAt) : new Date(),
            endAt: payload.endAt ? new Date(payload.endAt) : null,
            isActive: true,
            notes: payload.notes || '',
            createdBy: user.id,
            tenantId: scope.tenantId,
            unitId: scope.unitId
        }
    });

    return newReq;
};

/**
 * Fetch active Vital Monitoring Requirement for a patient
 */
export const getVitalMonitoringRequirementService = async (patientId: string, scope: { tenantId: string; unitId: string }) => {
    return (prisma as any).vitalMonitoringRequirement.findFirst({
        where: {
            patientId,
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            isActive: true,
            isDeleted: false
        },
        orderBy: { createdAt: 'desc' }
    });
};

/**
 * Calculates current Monitoring Status (UPCOMING / DUE / OVERDUE / COMPLETED) for a given patient.
 * Respects configured Care-Plan frequency.
 */
export const getPatientMonitoringStatusService = async (
    patientId: string,
    scope: { tenantId: string; unitId: string },
    user?: any,
    dateStr?: string
) => {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch active monitoring requirement for patient
    const requirement = await (prisma as any).vitalMonitoringRequirement.findFirst({
        where: {
            patientId,
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            isActive: true,
            isDeleted: false
        },
        orderBy: { createdAt: 'desc' }
    });

    const frequency = requirement ? requirement.frequency : 'EVERY_4_HOURS';
    const customIntervalMinutes = requirement ? requirement.customIntervalMinutes : null;
    const scheduledHours = getScheduledHoursForFrequency(frequency, customIntervalMinutes);

    // Fetch vitals recorded for patient on target date
    const vitals = await (prisma as any).vitalSign.findMany({
        where: {
            patientId,
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            isDeleted: false,
            recordedAt: { gte: startOfDay, lte: endOfDay }
        },
        orderBy: { recordedAt: 'asc' }
    });

    const now = new Date();
    const currentHour = now.getHours();
    const isToday = targetDate.toDateString() === now.toDateString();

    const slots: MonitoringSlot[] = scheduledHours.map(hour => {
        const hourStr = `${String(hour).padStart(2, '0')}:00`;
        const vital = vitals.find((v: any) => {
            const recDate = new Date(v.recordedAt || v.createdAt);
            return recDate.getHours() === hour || recDate.getHours() === hour + 1;
        });

        let status: 'COMPLETED' | 'DUE' | 'OVERDUE' | 'UPCOMING' = 'UPCOMING';

        if (vital) {
            status = 'COMPLETED';
        } else if (isToday) {
            if (currentHour === hour || currentHour === hour + 1) {
                status = 'DUE';
            } else if (currentHour > hour + 1) {
                status = 'OVERDUE';
            } else {
                status = 'UPCOMING';
            }
        } else if (targetDate < startOfDay) {
            status = 'OVERDUE';
        }

        return {
            timeStr: hourStr,
            hour,
            status,
            vital: vital ? {
                id: vital.id,
                temp: vital.temp,
                spO2: vital.spO2,
                bp: vital.bp,
                pulse: vital.pulse,
                recordedAt: vital.recordedAt || vital.createdAt,
                recordedById: vital.recordedById
            } : undefined
        };
    });

    const completedCount = slots.filter(s => s.status === 'COMPLETED').length;
    const dueCount = slots.filter(s => s.status === 'DUE').length;
    const overdueCount = slots.filter(s => s.status === 'OVERDUE').length;
    const nextDue = slots.find(s => s.status === 'DUE' || s.status === 'OVERDUE');

    return {
        patientId,
        isConfigured: !!requirement,
        requirement: requirement ? {
            id: requirement.id,
            frequency: requirement.frequency,
            customIntervalMinutes: requirement.customIntervalMinutes,
            notes: requirement.notes,
            startAt: requirement.startAt
        } : null,
        date: targetDate.toISOString(),
        completedCount,
        dueCount,
        overdueCount,
        nextDueSlot: nextDue ? nextDue.timeStr : null,
        slots
    };
};

/**
 * Record a Patient Attention / Observation item.
 */
export const recordPatientAttentionService = async (
    patientId: string,
    payload: {
        category?: string;
        priority?: 'LOW' | 'MEDIUM' | 'HIGH';
        observation: string;
        notes?: string;
    },
    scope: { tenantId: string; unitId: string },
    user: any
) => {
    // Auth Check: Nurse must be assigned or privileged role
    const authCheck = await resolveNursingStaffAssignment(scope.tenantId, user, patientId);
    if (!authCheck.authorized) {
        throw new Error(`Not authorized: ${authCheck.reason}`);
    }

    const patient = await findPatientInUnitScope(patientId, scope);
    if (!patient) throw new Error('Patient not found');


    const category = payload.category || 'GENERAL_OBSERVATION';
    const priority = payload.priority || 'MEDIUM';
    const observation = payload.observation || payload.notes || '';

    if (!observation.trim()) {
        throw new Error('Observation text is required');
    }

    const attentionRecord = await (prisma as any).patientAttention.create({
        data: {
            patientId,
            assignmentId: authCheck.assignmentId || null,
            category,
            priority,
            observation,
            status: 'OPEN',
            createdBy: user.id,
            tenantId: scope.tenantId,
            unitId: scope.unitId
        }
    });

    // Dispatch notification if HIGH priority
    if (priority === 'HIGH') {
        await sendNotification({
            title: `High Priority Patient Concern: ${patient.name}`,
            body: `High priority observation recorded for ${patient.name}: ${observation.slice(0, 100)}`,
            type: 'PATIENT_ATTENTION_ALERT',
            role: 'NURSING_MANAGER',
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            entityType: 'PATIENT_ATTENTION',
            entityId: attentionRecord.id
        });
    }

    return attentionRecord;
};

/**
 * Resolve a Patient Attention item.
 */
export const resolvePatientAttentionService = async (
    attentionId: string,
    payload: { resolutionNotes?: string },
    scope: { tenantId: string; unitId: string },
    user: any
) => {
    const existing = await (prisma as any).patientAttention.findFirst({
        where: { id: attentionId, tenantId: scope.tenantId, unitId: scope.unitId }
    });
    if (!existing) throw new Error('Patient attention record not found');

    const updated = await (prisma as any).patientAttention.update({
        where: { id: attentionId },
        data: {
            status: 'RESOLVED',
            resolvedById: user.id,
            resolvedAt: new Date(),
            resolutionNotes: payload.resolutionNotes || 'Resolved by nursing staff'
        }
    });

    return updated;
};

/**
 * Fetch Attention Logs (filtered by patient, status, priority)
 */
export const getAttentionLogsService = async (
    patientId: string | undefined,
    scope: { tenantId: string; unitId: string },
    filters?: { status?: string; priority?: string }
) => {
    const where: any = {
        tenantId: scope.tenantId,
        unitId: scope.unitId,
        isDeleted: false
    };
    if (patientId) where.patientId = patientId;
    if (filters?.status) where.status = filters.status;
    if (filters?.priority) where.priority = filters.priority;

    return (prisma as any).patientAttention.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
            patient: { select: { id: true, name: true } }
        }
    });
};

/**
 * Manager Monitoring Overview: Retrieves monitoring requirement status for all patients.
 */
export const getAllPatientsMonitoringStatusService = async (scope: { tenantId: string; unitId: string }, user: any) => {
    const activePatients = await (prisma as any).patient.findMany({
        where: {
            tenantId: scope.tenantId,
            OR: [
                { unitId: scope.unitId },
                { admissions: { some: { unitId: scope.unitId } } },
                { MedicalAssignment: { some: { unitId: scope.unitId } } }
            ]
        },
        select: {
            id: true,
            name: true,
            elderId: true,
            MedicalAssignment: {
                where: {
                    unitId: scope.unitId,
                    isDeleted: false
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                    id: true,
                    status: true,
                    Staff: { select: { id: true, firstName: true, lastName: true } }
                }
            },
            vitalMonitoringRequirements: {
                where: { isActive: true, isDeleted: false },
                select: { id: true, frequency: true, customIntervalMinutes: true, startAt: true, notes: true }
            },
            patientAttentions: {
                where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, isDeleted: false },
                select: { id: true, category: true, priority: true, observation: true, createdAt: true }
            },
            vitals: {
                where: { isDeleted: false },
                orderBy: { recordedAt: 'desc' },
                take: 1,
                select: { id: true, recordedAt: true, temp: true, spO2: true, bp: true, pulse: true }
            }
        }
    });

    const results = await Promise.all(
        activePatients.map(async (patient: any) => {
            const statusData = await getPatientMonitoringStatusService(patient.id, scope, user);
            const activeAssignment = patient.MedicalAssignment?.[0];
            const assignedNurseName = activeAssignment?.Staff
                ? `${activeAssignment.Staff.firstName} ${activeAssignment.Staff.lastName || ''}`.trim()
                : 'Unassigned';

            return {
                patientId: patient.id,
                patientName: patient.name,
                assignedNurseName,
                monitoringRequirement: patient.vitalMonitoringRequirements?.[0] || null,
                monitoringStatus: {
                    isConfigured: statusData.isConfigured,
                    dueCount: statusData.dueCount,
                    overdueCount: statusData.overdueCount,
                    completedCount: statusData.completedCount,
                    nextDueSlot: statusData.nextDueSlot
                },
                lastVital: patient.vitals?.[0] || null,
                openAttentionCount: patient.patientAttentions?.length || 0,
                patientAttentions: patient.patientAttentions || []
            };
        })
    );

    return results;
};

/**
 * Idempotent Persistent Scheduler Evaluation.
 * Evaluates active requirements and sends reminders safely without duplication across server restarts / instances.
 */
export const evaluateAndSendMonitoringNotifications = async () => {
    try {
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        // Fetch active assignments with patients
        const activeAssignments = await (prisma as any).medicalAssignment.findMany({
            where: {
                status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] },
                isDeleted: false,
                startAt: { lte: now },
                OR: [{ endAt: null }, { endAt: { gte: now } }]
            },
            select: {
                id: true,
                patientId: true,
                staffId: true,
                tenantId: true,
                unitId: true,
                Patient: { select: { id: true, name: true } },
                Staff: { select: { id: true, userId: true } }
            }
        });

        for (const assignment of activeAssignments) {
            if (!assignment.patientId || !assignment.Staff?.userId) continue;

            const scope = { tenantId: assignment.tenantId, unitId: assignment.unitId };
            const statusData = await getPatientMonitoringStatusService(assignment.patientId, scope);

            // If there's a due slot or overdue slot
            if (statusData.dueCount > 0 || statusData.overdueCount > 0) {
                const currentHour = now.getHours();
                const isOverdue = statusData.overdueCount > 0;
                const notificationType = isOverdue ? 'VITAL_OVERDUE_ALERT' : 'VITAL_DUE_REMINDER';
                const patientName = assignment.Patient?.name || 'Patient';

                // Idempotency check: check if notification was already sent today for this patient and type
                const existingNotification = await (prisma as any).notification.findFirst({
                    where: {
                        userId: assignment.Staff.userId,
                        tenantId: assignment.tenantId,
                        unitId: assignment.unitId,
                        type: notificationType,
                        entityType: 'PATIENT',
                        entityId: assignment.patientId,
                        createdAt: { gte: startOfDay }
                    }
                });

                if (!existingNotification) {
                    await sendNotification({
                        userId: assignment.Staff.userId,
                        title: isOverdue ? 'Vital Signs Overdue' : 'Vital Signs Due',
                        body: isOverdue
                            ? `Vitals overdue for ${patientName}. Please record vitals as soon as possible.`
                            : `Vitals due for ${patientName}. Please record vitals.`,
                        type: notificationType,
                        tenantId: assignment.tenantId,
                        unitId: assignment.unitId,
                        entityType: 'PATIENT',
                        entityId: assignment.patientId
                    });
                }
            }
        }
    } catch (err) {
        console.error('[MONITORING EVALUATION ERROR]:', err);
    }
};

let schedulerRunning = false;

export const startVitalMonitoringScheduler = () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    console.log('[MONITORING SCHEDULER] Persistent Idempotent Vital Monitoring Scheduler initialized');

    setInterval(() => {
        evaluateAndSendMonitoringNotifications().catch(err => {
            console.error('[SCHEDULER TIMER ERROR]:', err);
        });
    }, 300000); // Evaluates every 5 minutes safely
};
