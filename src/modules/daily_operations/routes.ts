import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../app/prisma.js';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { generateRefNumber as generateRef } from '../../shared/utils/refGenerator.js';
import { createPatientLedgerEntryForAllocation, ensurePatientBillingTables } from '../patient_billing/ledger.js';
import { verifyStaffAssignment } from '../medical/service.js';

const router = Router();

const departments = ['Patient Care', 'Nursing', 'Housekeeping', 'Kitchen', 'Inventory', 'Administration'] as const;
const statuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'MISSED'] as const;
type RoutinePhase = 'MORNING_OPERATIONS' | 'DEPARTMENT_UPDATES' | 'ADMIN_REVIEW' | 'END_OF_DAY_REPORT';
type RoutineTask = { title: string; phase: RoutinePhase };

const defaultTasks: Record<typeof departments[number], RoutineTask[]> = {
    'Patient Care': [
        { title: 'Patient wake-up routine', phase: 'MORNING_OPERATIONS' },
        { title: 'Hygiene check', phase: 'MORNING_OPERATIONS' },
        { title: 'Comfort check', phase: 'MORNING_OPERATIONS' },
        { title: 'Patient requests follow-up', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Special care needs update', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Resident engagement support', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Final patient comfort check', phase: 'END_OF_DAY_REPORT' }
    ],
    Nursing: [
        { title: 'Morning medicine administration', phase: 'MORNING_OPERATIONS' },
        { title: 'Vitals check', phase: 'MORNING_OPERATIONS' },
        { title: 'Doctor requirement review', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Medicine administration during day', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Evening medicine administration', phase: 'ADMIN_REVIEW' },
        { title: 'Final nursing checks', phase: 'END_OF_DAY_REPORT' }
    ],
    Housekeeping: [
        { title: 'Room and washroom cleaning', phase: 'MORNING_OPERATIONS' },
        { title: 'Laundry collection', phase: 'MORNING_OPERATIONS' },
        { title: 'Housekeeping activity rounds', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Evening cleaning follow-up', phase: 'ADMIN_REVIEW' }
    ],
    Kitchen: [
        { title: 'Hot water preparation', phase: 'MORNING_OPERATIONS' },
        { title: 'Breakfast preparation', phase: 'MORNING_OPERATIONS' },
        { title: 'Food service', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Diet and special food requirement check', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Next day kitchen stock planning', phase: 'END_OF_DAY_REPORT' }
    ],
    Inventory: [
        { title: 'Daily essentials stock availability check', phase: 'MORNING_OPERATIONS' },
        { title: 'Medicine and care item stock support', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Incoming and outgoing item verification', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Low stock and tomorrow requirement update', phase: 'END_OF_DAY_REPORT' }
    ],
    Administration: [
        { title: 'Department update collection', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Maintenance issue follow-up', phase: 'DEPARTMENT_UPDATES' },
        { title: 'Bhajans and activity coordination', phase: 'ADMIN_REVIEW' },
        { title: 'What got completed review', phase: 'END_OF_DAY_REPORT' },
        { title: 'What got missed review', phase: 'END_OF_DAY_REPORT' },
        { title: 'Tomorrow follow-up planning', phase: 'END_OF_DAY_REPORT' }
    ]
};

const activeDefaultTitles = new Set(
    departments.flatMap((department) => defaultTasks[department].map((task) => task.title))
);
const activeDefaultTitleList = Array.from(activeDefaultTitles);
const seedLocks = new Map<string, Promise<void>>();
const staffTaskSyncLocks = new Map<string, Promise<void>>();
let staffTaskSyncQueue = Promise.resolve();

const taskSchema = z.object({
    taskDate: z.string().min(1),
    department: z.enum(departments),
    title: z.string().min(2),
    assignedStaffId: z.string().optional().nullable(),
    assignedTo: z.string().optional().nullable(),
    remarks: z.string().optional().nullable()
});

const updateTaskSchema = z.object({
    assignedStaffId: z.string().optional().nullable(),
    assignedTo: z.string().optional().nullable(),
    status: z.enum(statuses).optional(),
    remarks: z.string().optional().nullable()
});

const nursingLedgerSchema = z.object({
    allocationId: z.string().uuid(),
    productId: z.string().optional().nullable(),
    medicineName: z.string().min(1),
    quantity: z.coerce.number().positive(),
    rate: z.coerce.number().min(0),
    notes: z.string().optional().nullable()
});

const patientExpenseSchema = z.object({
    allocationId: z.string().uuid(),
    taskDate: z.string().optional().nullable(),
    department: z.enum(['Patient Care', 'Nursing']).optional().default('Patient Care'),
    category: z.string().min(1),
    description: z.string().min(1),
    quantity: z.coerce.number().positive(),
    rate: z.coerce.number().min(0),
    notes: z.string().optional().nullable()
});

let dailyOperationsReady = false;

const scope = (req: any) => ({
    tenantId: req.user.tenantId,
    unitId: req.user.unitId
});

const ensureDailyOperationsTable = async () => {
    if (dailyOperationsReady) return;

    await (prisma as any).$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "DailyOperationTask" (
            "id" TEXT NOT NULL,
            "taskNo" TEXT NOT NULL,
            "taskDate" DATE NOT NULL,
            "phase" TEXT NOT NULL DEFAULT 'MORNING_OPERATIONS',
            "department" TEXT NOT NULL,
            "title" TEXT NOT NULL,
            "assignedStaffId" TEXT,
            "assignedTo" TEXT,
            "status" TEXT NOT NULL DEFAULT 'PENDING',
            "completedAt" TIMESTAMP(3),
            "remarks" TEXT,
            "source" TEXT NOT NULL DEFAULT 'MANUAL',
            "tenantId" TEXT NOT NULL,
            "unitId" TEXT NOT NULL,
            "createdBy" TEXT,
            "isDeleted" BOOLEAN NOT NULL DEFAULT false,
            "deletedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "DailyOperationTask_pkey" PRIMARY KEY ("id")
        )
    `);
    await (prisma as any).$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "DailyOperationTask_taskNo_key" ON "DailyOperationTask"("taskNo")');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DailyOperationTask_scope_date_idx" ON "DailyOperationTask"("tenantId", "unitId", "taskDate")');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DailyOperationTask_department_idx" ON "DailyOperationTask"("department")');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DailyOperationTask_status_idx" ON "DailyOperationTask"("status")');

    dailyOperationsReady = true;
};

const normalizeDate = (value?: string) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return new Date();
    return new Date(date.toISOString().split('T')[0]);
};

const dailyOperationTaskMarker = (taskId: string) => `DailyOperationTask:${taskId}`;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const dailyOperationStaffTaskRef = (dailyTaskId: string) => (
    `DOP-TSK-${createHash('sha1').update(dailyTaskId).digest('hex').slice(0, 12).toUpperCase()}`
);

const isTransactionStartTimeout = (error: any) => (
    String(error?.message || error || '').includes('Unable to start a transaction')
    || String(error?.message || error || '').includes('Transaction API error')
);

const mapDailyOperationStatusToTaskStatus = (status?: string) => {
    switch (String(status || '').toUpperCase()) {
        case 'IN_PROGRESS':
            return 'IN_PROGRESS';
        case 'COMPLETED':
            return 'COMPLETED';
        default:
            return 'ASSIGNED';
    }
};

const resolveDailyOperationStaffContext = async (tenantId: string, _unitId: string, staffId: string) => {
    const staff = await (prisma as any).staff.findFirst({
        where: {
            id: staffId,
            tenantId,
            isDeleted: false
        },
        include: {
            user: true
        }
    });

    if (!staff) {
        const error: any = new Error('Selected staff was not found. Refresh staff list and assign again.');
        error.status = 400;
        throw error;
    }

    const staffStatus = String(staff.status || '').trim().toUpperCase();
    if (staffStatus === 'RESIGNED' || staffStatus === 'TERMINATED') {
        const error: any = new Error('Inactive staff cannot be assigned daily operation tasks.');
        error.status = 400;
        throw error;
    }

    if (!staff.userId || !staff.user || !staff.user.isActive || staff.user.isDeleted) {
        const error: any = new Error('Selected staff has no active login. Create/enable staff login before assigning daily operation tasks.');
        error.status = 400;
        throw error;
    }

    return {
        userId: staff.userId,
        staffId: staff.id
    };
};

const syncStaffFacingTask = async (dailyTask: any) => {
    const marker = dailyOperationTaskMarker(dailyTask.id);
    const existingTasks = await (prisma as any).task.findMany({
        where: {
            tenantId: dailyTask.tenantId,
            description: { contains: marker },
            isDeleted: false
        },
        select: { id: true },
        orderBy: { updatedAt: 'desc' }
    });
    const existingTask = existingTasks[0];
    const duplicateTasks = existingTasks.slice(1);

    if (!dailyTask.assignedStaffId) {
        if (existingTasks.length) {
            await (prisma as any).task.updateMany({
                where: { id: { in: existingTasks.map((task: any) => task.id) } },
                data: {
                    isDeleted: true,
                    deletedAt: new Date()
                }
            });
        }
        return;
    }

    const assigneeContext = await resolveDailyOperationStaffContext(
        dailyTask.tenantId,
        dailyTask.unitId,
        dailyTask.assignedStaffId
    );
    const status = mapDailyOperationStatusToTaskStatus(dailyTask.status);
    const description = [
        `${dailyTask.department} daily operation: ${dailyTask.title}`,
        `Phase: ${dailyTask.phase}`,
        `Source: ${dailyTask.source}`,
        marker
    ].join('\n');

    if (existingTask) {
        if (duplicateTasks.length) {
            await (prisma as any).task.updateMany({
                where: { id: { in: duplicateTasks.map((task: any) => task.id) } },
                data: {
                    isDeleted: true,
                    deletedAt: new Date()
                }
            });
        }

        await (prisma as any).task.update({
            where: { id: existingTask.id },
            data: {
                title: dailyTask.title,
                description,
                assigneeId: assigneeContext?.userId || null,
                assignedStaffId: assigneeContext?.staffId || null,
                dueDate: dailyTask.taskDate ? new Date(dailyTask.taskDate) : null,
                status,
                completedAt: status === 'COMPLETED' ? (dailyTask.completedAt || new Date()) : null,
                updatedAt: new Date()
            }
        });
        return;
    }

    await (prisma as any).task.create({
        data: {
            refNo: dailyOperationStaffTaskRef(dailyTask.id),
            title: dailyTask.title,
            description,
            type: 'DAILY',
            priority: dailyTask.department === 'Nursing' ? 'HIGH' : 'MEDIUM',
            assigneeId: assigneeContext?.userId || null,
            assignedStaffId: assigneeContext?.staffId || null,
            dueDate: dailyTask.taskDate ? new Date(dailyTask.taskDate) : null,
            tenantId: dailyTask.tenantId,
            unitId: dailyTask.unitId,
            status
        }
    });
};

const syncStaffFacingTaskWithRetry = async (dailyTask: any) => {
    try {
        await syncStaffFacingTask(dailyTask);
    } catch (error: any) {
        if (!isTransactionStartTimeout(error)) throw error;
        await wait(350);
        await syncStaffFacingTask(dailyTask);
    }
};

const enqueueStaffFacingTaskSync = (dailyTask: any) => {
    if (!dailyTask?.id) return Promise.resolve();

    const existingSync = staffTaskSyncLocks.get(dailyTask.id);
    if (existingSync) return existingSync;

    let syncPromise!: Promise<void>;
    syncPromise = staffTaskSyncQueue
        .catch(() => undefined)
        .then(() => syncStaffFacingTaskWithRetry(dailyTask))
        .finally(() => {
            if (staffTaskSyncLocks.get(dailyTask.id) === syncPromise) {
                staffTaskSyncLocks.delete(dailyTask.id);
            }
        });

    staffTaskSyncLocks.set(dailyTask.id, syncPromise);
    staffTaskSyncQueue = syncPromise.catch(() => undefined);
    return syncPromise;
};

const syncAssignedDailyOperationTasks = async (tasks: any[]) => {
    const assignedTasks = tasks.filter((task) => task?.assignedStaffId);
    if (!assignedTasks.length) return;

    for (const task of assignedTasks) {
        try {
            await enqueueStaffFacingTaskSync(task);
        } catch (error: any) {
            console.warn('Daily operation staff task sync skipped:', {
                dailyTaskId: task?.id,
                message: error?.message || error
            });
        }
    }
};

const syncStaffFacingTaskInBackground = (dailyTask: any) => {
    if (!dailyTask?.assignedStaffId) return;

    setTimeout(() => {
        enqueueStaffFacingTaskSync(dailyTask).catch((error: any) => {
            console.warn('Daily operation staff task background sync skipped:', {
                dailyTaskId: dailyTask?.id,
                message: error?.message || error
            });
        });
    }, 0);
};

const staffDisplayName = (staff: any) => (
    `${staff?.firstName || ''} ${staff?.lastName || ''}`.trim() || staff?.empId || staff?.id || 'Staff'
);

const staffProfileText = (staff: any) => (
    [
        staff?.designation,
        staff?.department,
        ...(Array.isArray(staff?.skills) ? staff.skills : [])
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
);

const hasAnyText = (value: string, terms: string[]) => terms.some((term) => value.includes(term));

const getAutoAssignmentPools = async (tenantId: string, unitId: string) => {
    const staff = await (prisma as any).staff.findMany({
        where: {
            tenantId,
            isDeleted: false,
            userId: { not: null },
            user: {
                isActive: true,
                isDeleted: false
            }
        },
        include: { user: true }
    });

    const activeStaff = staff
        .filter((member: any) => {
            const status = String(member?.status || '').trim().toUpperCase();
            return status !== 'RESIGNED' && status !== 'TERMINATED';
        })
        .sort((a: any, b: any) => {
            const aUnitRank = a.unitId === unitId ? 0 : 1;
            const bUnitRank = b.unitId === unitId ? 0 : 1;
            if (aUnitRank !== bUnitRank) return aUnitRank - bUnitRank;
            const aLoad = Number(a.currentWorkload || a.workload || 0);
            const bLoad = Number(b.currentWorkload || b.workload || 0);
            if (aLoad !== bLoad) return aLoad - bLoad;
            return staffDisplayName(a).localeCompare(staffDisplayName(b));
        });

    const doctors = activeStaff.filter((member: any) => {
        const text = staffProfileText(member);
        return hasAnyText(text, ['doctor', 'physician', 'medical officer', 'consultant']);
    });

    const nurses = activeStaff.filter((member: any) => {
        const text = staffProfileText(member);
        return hasAnyText(text, ['nurse', 'nursing', 'staff nurse', 'gnm', 'anm', 'clinical']);
    });

    const housekeepers = activeStaff.filter((member: any) => {
        const text = staffProfileText(member);
        return hasAnyText(text, [
            'housekeeper',
            'housekeeping',
            'caregiver',
            'care giver',
            'patient care',
            'caretaker',
            'care taker',
            'attender',
            'ward',
            'care assistant'
        ]);
    });

    const kitchenStaff = activeStaff.filter((member: any) => {
        const text = staffProfileText(member);
        return hasAnyText(text, ['chef', 'cook', 'kitchen', 'food', 'dietitian']);
    });

    const adminStaff = activeStaff.filter((member: any) => {
        const text = staffProfileText(member);
        return hasAnyText(text, ['admin', 'manager', 'coordinator', 'director', 'supervisor', 'hr']);
    });

    const inventoryStaff = activeStaff.filter((member: any) => {
        const text = staffProfileText(member);
        return hasAnyText(text, ['inventory', 'store', 'stock', 'procurement', 'purchase']);
    });

    return { all: activeStaff, doctors, nurses, housekeepers, kitchenStaff, adminStaff, inventoryStaff };
};

const pickAutoStaff = (
    pools: { all: any[]; doctors: any[]; nurses: any[]; housekeepers: any[]; kitchenStaff?: any[]; adminStaff?: any[]; inventoryStaff?: any[] },
    counters: Record<string, number>,
    keys: Array<keyof typeof pools>
) => {
    for (const key of keys) {
        const pool = pools[key];
        if (!pool || !pool.length) continue;
        const index = counters[key] % pool.length;
        counters[key] += 1;
        return pool[index];
    }
    return null;
};

const selectAutoStaffForTask = (
    task: any,
    pools: { all: any[]; doctors: any[]; nurses: any[]; housekeepers: any[]; kitchenStaff: any[]; adminStaff: any[]; inventoryStaff: any[] },
    counters: Record<string, number>
) => {
    const department = String(task?.department || '');
    const title = String(task?.title || '').toLowerCase();

    if (department === 'Nursing') {
        if (title.includes('doctor')) {
            return pickAutoStaff(pools, counters, ['doctors', 'nurses', 'all']);
        }
        return pickAutoStaff(pools, counters, ['nurses', 'doctors', 'all']);
    }

    if (department === 'Patient Care') {
        if (hasAnyText(title, ['special care', 'request', 'follow-up', 'clinical', 'medicine', 'vitals', 'doctor'])) {
            return pickAutoStaff(pools, counters, ['nurses', 'housekeepers', 'doctors', 'all']);
        }
        return pickAutoStaff(pools, counters, ['housekeepers', 'nurses', 'all']);
    }

    if (department === 'Housekeeping') {
        return pickAutoStaff(pools, counters, ['housekeepers', 'all']);
    }

    if (department === 'Kitchen') {
        return pickAutoStaff(pools, counters, ['kitchenStaff', 'housekeepers', 'all']);
    }

    if (department === 'Inventory') {
        return pickAutoStaff(pools, counters, ['inventoryStaff', 'adminStaff', 'all']);
    }

    if (department === 'Administration') {
        return pickAutoStaff(pools, counters, ['adminStaff', 'all']);
    }

    return null;
};

const autoAssignRoutineCareTasks = async (tenantId: string, unitId: string, taskDate: Date) => {
    const pools = await getAutoAssignmentPools(tenantId, unitId);
    if (!pools.all.length) return;

    const tasks = await (prisma as any).$queryRaw`
        SELECT "id", "department", "title", "phase"
        FROM "DailyOperationTask"
        WHERE "tenantId" = ${tenantId}
          AND "unitId" = ${unitId}
          AND "taskDate" = ${taskDate}
          AND "isDeleted" = false
          AND "source" = 'DEFAULT'
          AND "assignedStaffId" IS NULL
          AND "department" = ANY(${['Patient Care', 'Nursing', 'Housekeeping', 'Kitchen', 'Inventory', 'Administration']}::text[])
        ORDER BY
            CASE "phase"
                WHEN 'MORNING_OPERATIONS' THEN 1
                WHEN 'DEPARTMENT_UPDATES' THEN 2
                WHEN 'ADMIN_REVIEW' THEN 3
                WHEN 'END_OF_DAY_REPORT' THEN 4
                ELSE 5
            END,
            "createdAt" ASC
    `;

    const counters: Record<string, number> = {
        all: 0,
        doctors: 0,
        nurses: 0,
        housekeepers: 0,
        kitchenStaff: 0,
        adminStaff: 0,
        inventoryStaff: 0
    };

    for (const task of tasks) {
        const staff = selectAutoStaffForTask(task, pools, counters);
        if (!staff?.id) continue;

        await (prisma as any).$executeRaw`
            UPDATE "DailyOperationTask"
            SET "assignedStaffId" = ${staff.id},
                "assignedTo" = ${staffDisplayName(staff)},
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${task.id}
              AND "assignedStaffId" IS NULL
        `;
    }
};

const seedDefaultTasks = async (tenantId: string, unitId: string, taskDate: Date, userId?: string) => {
    const dateKey = taskDate.toISOString().split('T')[0];
    const lockKey = `${tenantId}:${unitId}:${dateKey}`;
    const existingLock = seedLocks.get(lockKey);
    if (existingLock) return existingLock;

    const seedPromise = (async () => {
        const rows = departments.flatMap((department) => (
            defaultTasks[department].map((routineTask) => {
                const seedKey = `${tenantId}:${unitId}:${dateKey}:${department}:${routineTask.title}`;
                const encoded = Buffer.from(seedKey).toString('base64url');
                const shortHash = createHash('sha1').update(seedKey).digest('hex').slice(0, 12).toUpperCase();
                return {
                    id: `daily-default-${encoded}`,
                    taskNo: `DOP-${shortHash}`,
                    taskDate: dateKey,
                    phase: routineTask.phase,
                    department,
                    title: routineTask.title,
                    tenantId,
                    unitId,
                    createdBy: userId || null
                };
            })
        ));

        await (prisma as any).$executeRaw`
            INSERT INTO "DailyOperationTask" (
                "id", "taskNo", "taskDate", "phase", "department", "title", "status", "source",
                "tenantId", "unitId", "createdBy", "createdAt", "updatedAt"
            )
            SELECT
                payload."id",
                payload."taskNo",
                payload."taskDate"::date,
                payload."phase",
                payload."department",
                payload."title",
                'PENDING',
                'DEFAULT',
                payload."tenantId",
                payload."unitId",
                payload."createdBy",
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS payload(
                "id" text,
                "taskNo" text,
                "taskDate" text,
                "phase" text,
                "department" text,
                "title" text,
                "tenantId" text,
                "unitId" text,
                "createdBy" text
            )
            ON CONFLICT ("id") DO NOTHING
        `;
    })();

    seedLocks.set(lockKey, seedPromise);
    try {
        await seedPromise;
    } finally {
        seedLocks.delete(lockKey);
    }
};

const listTasks = async (tenantId: string, unitId: string, taskDate: Date) => {
    return (prisma as any).$queryRaw`
        WITH ranked_tasks AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                       PARTITION BY
                           CASE
                               WHEN "source" = 'DEFAULT'
                                   THEN "tenantId" || ':' || "unitId" || ':' || "taskDate" || ':' || "department" || ':' || "title" || ':' || "source"
                               ELSE "id"
                           END
                       ORDER BY "createdAt" ASC
                   ) AS "routineRank"
            FROM "DailyOperationTask"
            WHERE "tenantId" = ${tenantId}
              AND "unitId" = ${unitId}
              AND "taskDate" = ${taskDate}
              AND "isDeleted" = false
              AND ("source" <> 'DEFAULT' OR "title" = ANY(${activeDefaultTitleList}::text[]))
        )
        SELECT
            "id", "taskNo", "taskDate", "phase", "department", "title", "assignedStaffId", "assignedTo",
            "status", "completedAt", "remarks", "source", "tenantId", "unitId", "createdBy", "isDeleted",
            "deletedAt", "createdAt", "updatedAt"
        FROM ranked_tasks
        WHERE "routineRank" = 1
        ORDER BY
            CASE "phase"
                WHEN 'MORNING_OPERATIONS' THEN 1
                WHEN 'DEPARTMENT_UPDATES' THEN 2
                WHEN 'ADMIN_REVIEW' THEN 3
                WHEN 'END_OF_DAY_REPORT' THEN 4
                ELSE 5
            END,
            CASE "department"
                WHEN 'Patient Care' THEN 1
                WHEN 'Nursing' THEN 2
                WHEN 'Housekeeping' THEN 3
                WHEN 'Kitchen' THEN 4
                WHEN 'Inventory' THEN 5
                WHEN 'Administration' THEN 6
                ELSE 7
            END,
            "createdAt" ASC
    `;
};

router.get('/tasks', auth, enforceTenant, async (req: any, res: any) => {
    try {
        await ensureDailyOperationsTable();
        const { tenantId, unitId } = scope(req);
        const taskDate = normalizeDate(req.query.date as string);
        await seedDefaultTasks(tenantId, unitId, taskDate, req.user?.id);
        await autoAssignRoutineCareTasks(tenantId, unitId, taskDate);
        const tasks = await listTasks(tenantId, unitId, taskDate);
        setTimeout(() => syncAssignedDailyOperationTasks(tasks), 0);

        res.json({ success: true, data: tasks });
    } catch (error: any) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

router.post('/tasks', auth, enforceTenant, async (req: any, res: any) => {
    try {
        await ensureDailyOperationsTable();
        const data = taskSchema.parse(req.body);
        const { tenantId, unitId } = scope(req);
        const taskDate = normalizeDate(data.taskDate);

        const rows = await (prisma as any).$queryRaw`
            INSERT INTO "DailyOperationTask" (
                "id", "taskNo", "taskDate", "phase", "department", "title", "assignedStaffId", "assignedTo",
                "status", "remarks", "source", "tenantId", "unitId", "createdBy", "createdAt", "updatedAt"
            )
            VALUES (
                ${randomUUID()}, ${await generateRef('DOP', tenantId, unitId)}, ${taskDate}, 'DEPARTMENT_UPDATES',
                ${data.department}, ${data.title}, ${data.assignedStaffId || null}, ${data.assignedTo || null},
                'PENDING', ${data.remarks || null}, 'MANUAL', ${tenantId}, ${unitId}, ${req.user?.id || null},
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING *
        `;

        syncStaffFacingTaskInBackground(rows?.[0]);

        res.status(201).json({ success: true, data: rows?.[0], message: 'Daily operation task added' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.patch('/tasks/:id', auth, enforceTenant, async (req: any, res: any) => {
    try {
        await ensureDailyOperationsTable();
        const data = updateTaskSchema.parse(req.body);
        const { tenantId, unitId } = scope(req);
        const currentRows = await (prisma as any).$queryRaw`
            SELECT *
            FROM "DailyOperationTask"
            WHERE "id" = ${req.params.id}
              AND "tenantId" = ${tenantId}
              AND "isDeleted" = false
            LIMIT 1
        `;

        const current = currentRows?.[0];
        if (!current) {
            return res.status(404).json({ success: false, message: 'Daily operation task not found' });
        }

        const userRole = String(req.user.role || req.user.roleName || '').trim().toUpperCase();
        const privilegedRoles = ['SUPER_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'ELDER_OPERATIONS_MANAGER', 'CARE_ALLOCATION_MANAGER', 'HOME_CARE_MANAGER'];
        if (!privilegedRoles.includes(userRole) && !(req.user.permissions || []).includes('ALL_ACCESS')) {
            if (!current.patientId) {
                // Visit/External duty - Authorize via direct Staff ownership across tenant
                const staff = await (prisma as any).staff.findFirst({
                    where: { userId: req.user.id, tenantId, isDeleted: false }
                });
                if (!staff || staff.id !== current.assignedStaffId) {
                    return res.status(403).json({ success: false, message: 'Not authorized: Visit task does not belong to your shift.' });
                }
            } else {
                if (!current.assignmentId) {
                    return res.status(403).json({ success: false, message: 'Not authorized: Task lacks required assignment context.' });
                }
                const authCheck = await verifyStaffAssignment(tenantId, unitId, req.user, current.patientId);
                if (!authCheck.authorized || authCheck.assignmentId !== current.assignmentId) {
                    return res.status(403).json({ success: false, message: 'Not authorized to modify this clinical task.' });
                }
            }
        }

        const nextStatus = data.status || current.status;
        const completedAt = nextStatus === 'COMPLETED'
            ? (current.completedAt || new Date())
            : null;

        const rows = await (prisma as any).$queryRaw`
            UPDATE "DailyOperationTask"
            SET "assignedStaffId" = ${data.assignedStaffId !== undefined ? data.assignedStaffId : current.assignedStaffId},
                "assignedTo" = ${data.assignedTo !== undefined ? data.assignedTo : current.assignedTo},
                "status" = ${nextStatus},
                "completedAt" = ${completedAt},
                "remarks" = ${data.remarks !== undefined ? data.remarks : current.remarks},
                "phase" = ${nextStatus === 'COMPLETED' ? 'ADMIN_REVIEW' : 'DEPARTMENT_UPDATES'},
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${current.id}
            RETURNING *
        `;

        syncStaffFacingTaskInBackground(rows?.[0]);

        res.json({ success: true, data: rows?.[0], message: 'Daily operation task updated' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.post('/tasks/:id/nursing-ledger', auth, enforceTenant, async (_req: any, res: any) => {
    res.status(410).json({
        success: false,
        message: 'Routine nursing task ledger posting has been retired. Use Patient Chargeable Expenses instead.'
    });
});

router.post('/tasks/:id/patient-expense', auth, enforceTenant, async (_req: any, res: any) => {
    res.status(410).json({
        success: false,
        message: 'Routine patient care task expense posting has been retired. Use Patient Chargeable Expenses instead.'
    });
});

router.post('/tasks/:id/nursing-ledger/legacy', auth, enforceTenant, async (req: any, res: any) => {
    try {
        await ensureDailyOperationsTable();
        await ensurePatientBillingTables();
        const data = nursingLedgerSchema.parse(req.body);
        const { tenantId, unitId } = scope(req);

        const result = await (prisma as any).$transaction(async (tx: any) => {
            const currentRows = await tx.$queryRaw`
                SELECT *
                FROM "DailyOperationTask"
                WHERE "id" = ${req.params.id}
                  AND "tenantId" = ${tenantId}
                  AND "unitId" = ${unitId}
                  AND "isDeleted" = false
                LIMIT 1
            `;

            const current = currentRows?.[0];
            if (!current) {
                const error: any = new Error('Nursing task not found');
                error.status = 404;
                throw error;
            }

            if (current.department !== 'Nursing') {
                const error: any = new Error('Medicine ledger posting is allowed only from Nursing Register tasks');
                error.status = 400;
                throw error;
            }

            const quantity = Number(data.quantity || 0);
            const rate = Number(data.rate || 0);
            const amount = Number((quantity * rate).toFixed(2));
            const medicineNote = [
                current.remarks || '',
                '--- Nursing Medicine Ledger ---',
                `Allocation: ${data.allocationId}`,
                data.productId ? `Medicine Product: ${data.productId}` : '',
                `Medicine: ${data.medicineName}`,
                `Quantity: ${quantity}`,
                `Rate: ${rate}`,
                `Amount: ${amount}`,
                data.notes ? `Notes: ${data.notes}` : ''
            ].filter(Boolean).join('\n');

            const updatedRows = await tx.$queryRaw`
                UPDATE "DailyOperationTask"
                SET "status" = 'COMPLETED',
                    "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP),
                    "remarks" = ${medicineNote},
                    "phase" = 'ADMIN_REVIEW',
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = ${current.id}
                RETURNING *
            `;

            const ledgerEntry = await createPatientLedgerEntryForAllocation(tx, {
                tenantId,
                allocationId: data.allocationId,
                costDate: current.taskDate || new Date(),
                category: 'Medicine',
                description: `${data.medicineName} - ${current.title}`,
                quantity,
                rate,
                sourceType: 'NURSING_REGISTER',
                sourceId: `${current.id}:${data.productId || data.medicineName}`,
                createdBy: req.user?.id || null
            });

            return { task: updatedRows?.[0], ledgerEntry };
        }, { timeout: 15000 });

        syncStaffFacingTaskInBackground(result.task);

        res.json({
            success: true,
            data: result,
            message: result.ledgerEntry ? 'Nursing medicine cost posted to patient ledger' : 'Task completed, but patient ledger entry was not created'
        });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.post('/tasks/:id/patient-expense/legacy', auth, enforceTenant, async (req: any, res: any) => {
    try {
        await ensureDailyOperationsTable();
        await ensurePatientBillingTables();
        const data = patientExpenseSchema.parse(req.body);
        const { tenantId, unitId } = scope(req);

        const result = await (prisma as any).$transaction(async (tx: any) => {
            const currentRows = await tx.$queryRaw`
                SELECT *
                FROM "DailyOperationTask"
                WHERE "id" = ${req.params.id}
                  AND "tenantId" = ${tenantId}
                  AND "unitId" = ${unitId}
                  AND "isDeleted" = false
                LIMIT 1
            `;

            const current = currentRows?.[0];
            if (!current) {
                const error: any = new Error('Daily operation task not found');
                error.status = 404;
                throw error;
            }

            const quantity = Number(data.quantity || 0);
            const rate = Number(data.rate || 0);
            const amount = Number((quantity * rate).toFixed(2));
            const expenseHash = createHash('sha1')
                .update(`${current.id}:${data.allocationId}:${data.category}:${data.description}:${quantity}:${rate}`)
                .digest('hex')
                .slice(0, 12);
            const expenseNote = [
                current.remarks || '',
                '--- Daily Patient Expense ---',
                `Allocation: ${data.allocationId}`,
                `Category: ${data.category}`,
                `Item: ${data.description}`,
                `Quantity: ${quantity}`,
                `Rate: ${rate}`,
                `Amount: ${amount}`,
                data.notes ? `Notes: ${data.notes}` : ''
            ].filter(Boolean).join('\n');

            const updatedRows = await tx.$queryRaw`
                UPDATE "DailyOperationTask"
                SET "status" = 'COMPLETED',
                    "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP),
                    "remarks" = ${expenseNote},
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = ${current.id}
                RETURNING *
            `;

            const ledgerEntry = await createPatientLedgerEntryForAllocation(tx, {
                tenantId,
                allocationId: data.allocationId,
                costDate: current.taskDate || new Date(),
                category: data.category,
                description: `${data.description} - ${current.title}`,
                quantity,
                rate,
                sourceType: 'DAILY_OPERATIONS',
                sourceId: `${current.id}:${expenseHash}`,
                createdBy: req.user?.id || null
            });

            return { task: updatedRows?.[0], ledgerEntry };
        }, { timeout: 15000 });

        syncStaffFacingTaskInBackground(result.task);

        res.json({
            success: true,
            data: result,
            message: result.ledgerEntry ? 'Daily patient expense posted to patient ledger' : 'Task completed, but patient ledger entry was not created'
        });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.post('/chargeable-expense', auth, enforceTenant, async (req: any, res: any) => {
    try {
        await ensureDailyOperationsTable();
        await ensurePatientBillingTables();
        const data = patientExpenseSchema.parse(req.body);
        const { tenantId } = scope(req);

        const quantity = Number(data.quantity || 0);
        const rate = Number(data.rate || 0);
        const costDate = data.taskDate ? normalizeDate(data.taskDate) : new Date();
        const sourceHash = createHash('sha1')
            .update(`${data.allocationId}:${costDate.toISOString().split('T')[0]}:${data.department}:${data.category}:${data.description}:${quantity}:${rate}:${data.notes || ''}`)
            .digest('hex')
            .slice(0, 16);

        const ledgerEntry = await (prisma as any).$transaction(async (tx: any) => (
            createPatientLedgerEntryForAllocation(tx, {
                tenantId,
                allocationId: data.allocationId,
                costDate,
                category: data.category,
                description: data.notes ? `${data.description} - ${data.notes}` : data.description,
                quantity,
                rate,
                sourceType: 'DAILY_OPERATIONS_CHARGEABLE',
                sourceId: `chargeable:${sourceHash}`,
                createdBy: req.user?.id || null
            })
        ), { timeout: 15000 });

        res.status(201).json({
            success: true,
            data: { ledgerEntry },
            message: ledgerEntry ? 'Chargeable patient expense posted to patient ledger' : 'Chargeable expense was not created'
        });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.get('/report', auth, enforceTenant, async (req: any, res: any) => {
    try {
        await ensureDailyOperationsTable();
        const { tenantId, unitId } = scope(req);
        const taskDate = normalizeDate(req.query.date as string);
        await seedDefaultTasks(tenantId, unitId, taskDate, req.user?.id);
        await autoAssignRoutineCareTasks(tenantId, unitId, taskDate);
        const tasks = await listTasks(tenantId, unitId, taskDate);

        const byDepartment = departments.map((department) => {
            const departmentTasks = tasks.filter((task: any) => task.department === department);
            return {
                department,
                total: departmentTasks.length,
                completed: departmentTasks.filter((task: any) => task.status === 'COMPLETED').length,
                pending: departmentTasks.filter((task: any) => task.status === 'PENDING').length,
                inProgress: departmentTasks.filter((task: any) => task.status === 'IN_PROGRESS').length,
                missed: departmentTasks.filter((task: any) => task.status === 'MISSED').length
            };
        });

        res.json({
            success: true,
            data: {
                taskDate,
                total: tasks.length,
                completed: tasks.filter((task: any) => task.status === 'COMPLETED').length,
                pending: tasks.filter((task: any) => task.status === 'PENDING').length,
                inProgress: tasks.filter((task: any) => task.status === 'IN_PROGRESS').length,
                missed: tasks.filter((task: any) => task.status === 'MISSED').length,
                byDepartment,
                issues: tasks.filter((task: any) => task.status === 'MISSED' || String(task.remarks || '').trim())
            }
        });
    } catch (error: any) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

export default router;
