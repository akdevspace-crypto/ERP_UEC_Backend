import { prisma } from '../../app/prisma.js';
import { hasConfiguredMenuPrivilege } from '../hr/service.js';
import { StaffIntelligenceService } from '../../intelligence/services/staff-intelligence.service.js';
import { sendNotification } from '../notification/service.js';
import { postAccountInvoiceToPatientLedger, reconcileAllocationCompletionBilling } from '../patient_billing/ledger.js';
import { createInvoiceDraftForApprovedDuty } from '../accounts/service.js';

const buildHttpError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const taskStaffSelect = {
    id: true,
    empId: true,
    firstName: true,
    lastName: true,
    metadata: true,
    isDeleted: true
};

const taskListInclude = {
    assignee: {
        include: {
            staff: {
                select: taskStaffSelect
            }
        }
    },
    assignedStaff: {
        select: taskStaffSelect
    },
    approvalAuthority: {
        include: {
            staff: {
                select: taskStaffSelect
            }
        }
    },
    enquiry: {
        include: {
            client: true,
            admission: {
                include: {
                    patient: true
                }
            }
        }
    }
};

const normalizeIdentifier = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
};

const localDateKey = (date = new Date(), timeZone = 'Asia/Kolkata') => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const taskDateRangeForToday = (timeZone = 'Asia/Kolkata') => {
    const todayKey = localDateKey(new Date(), timeZone);
    const start = new Date(`${todayKey}T00:00:00.000+05:30`);
    const end = new Date(`${todayKey}T23:59:59.999+05:30`);
    return { start, end };
};

const extractAllocationIdFromTask = (task) => {
    const description = String(task?.description || '');
    const match = description.match(/Allocation:([0-9a-f-]{36})/i);
    return match?.[1] || null;
};

const extractDailyOperationTaskIdFromTask = (task) => {
    const description = String(task?.description || '');
    const match = description.match(/DailyOperationTask:([A-Za-z0-9_-]+)/i);
    return match?.[1] || null;
};

const extractStaffRemarksFromTask = (task) => {
    const description = String(task?.description || '');
    const match = description.match(/Staff Notes:\s*([\s\S]*?)(?:\n[A-Za-z][A-Za-z ]+:\s|$)/i);
    return match?.[1]?.trim() || '';
};

const upsertStaffRemarksInDescription = (description, remarks) => {
    const cleanDescription = String(description || '').replace(/\nStaff Notes:\s*[\s\S]*?(?=\n[A-Za-z][A-Za-z ]+:\s|$)/i, '').trim();
    const cleanRemarks = String(remarks || '').trim();
    return cleanRemarks ? `${cleanDescription}\nStaff Notes: ${cleanRemarks}` : cleanDescription;
};

const extractComplaintIdFromTask = (task) => {
    const description = String(task?.description || '');
    const match = description.match(/Complaint:([0-9a-f-]{36})/i);
    return match?.[1] || null;
};

const syncComplaintTaskStatus = async (tx, task, status) => {
    const complaintId = extractComplaintIdFromTask(task);
    if (!complaintId) return;

    const normalizedStatus = String(status || '').toUpperCase();
    const nextComplaintStatus = normalizedStatus === 'COMPLETED'
        ? 'RESOLVED'
        : normalizedStatus === 'APPROVED'
            ? 'CLOSED'
            : normalizedStatus === 'REJECTED'
                ? 'ASSIGNED'
                : normalizedStatus === 'IN_PROGRESS'
                    ? 'ASSIGNED'
                    : null;

    if (!nextComplaintStatus) return;

    const complaint = await tx.complaint.findFirst({
        where: {
            id: complaintId,
            tenantId: task.tenantId,
            unitId: task.unitId,
            isDeleted: false
        },
        select: {
            id: true,
            status: true,
            metadata: true
        }
    });

    if (!complaint || complaint.status === nextComplaintStatus) return;

    const metadata = complaint.metadata && typeof complaint.metadata === 'object'
        ? complaint.metadata
        : {};
    const now = new Date();

    await tx.complaint.update({
        where: { id: complaint.id },
        data: {
            status: nextComplaintStatus,
            metadata: {
                ...metadata,
                complaintTaskId: task.id,
                complaintTaskRefNo: task.refNo || metadata.complaintTaskRefNo || null,
                taskCompletedAt: normalizedStatus === 'COMPLETED' ? now : metadata.taskCompletedAt || null,
                taskApprovedAt: normalizedStatus === 'APPROVED' ? now : metadata.taskApprovedAt || null,
                resolvedAt: nextComplaintStatus === 'RESOLVED' ? now : metadata.resolvedAt || null,
                closedAt: nextComplaintStatus === 'CLOSED' ? now : metadata.closedAt || null,
                lastWorkflowActionAt: now
            }
        }
    });

    await tx.workflowLog.create({
        data: {
            entityType: 'COMPLAINT',
            entityId: complaint.id,
            fromState: complaint.status,
            toState: nextComplaintStatus,
            actionBy: task.assigneeId || task.assignedStaffId || null,
            notes: `Complaint synced from task ${task.refNo || task.id} status ${normalizedStatus}`,
            tenantId: task.tenantId,
            unitId: task.unitId
        }
    });
};

const syncDailyOperationTaskStatus = async (tx, task, status) => {
    const dailyOperationTaskId = extractDailyOperationTaskIdFromTask(task);
    if (!dailyOperationTaskId) return;

    const dailyStatus = status === 'COMPLETED' || status === 'APPROVED'
        ? 'COMPLETED'
        : status === 'IN_PROGRESS'
            ? 'IN_PROGRESS'
            : 'PENDING';
    const staffRemarks = extractStaffRemarksFromTask(task);
    const completedAt = dailyStatus === 'COMPLETED'
        ? (task.completedAt || new Date())
        : null;

    await tx.$executeRaw`
        UPDATE "DailyOperationTask"
        SET "status" = ${dailyStatus},
            "completedAt" = ${completedAt},
            "remarks" = ${staffRemarks || null},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${dailyOperationTaskId}
          AND "tenantId" = ${task.tenantId}
          AND "unitId" = ${task.unitId}
          AND "isDeleted" = false
    `;
};

const buildApprovedServiceHistoryEntry = ({ task, allocation }) => ({
    taskId: task.id,
    taskRefNo: task.refNo,
    title: task.title,
    status: 'APPROVED',
    approvedAt: new Date().toISOString(),
    completedAt: task.completedAt?.toISOString?.() || new Date().toISOString(),
    staffId: task.assignedStaffId || allocation.staffId || null,
    staffName: task.assignedStaff
        ? `${task.assignedStaff.firstName} ${task.assignedStaff.lastName || ''}`.trim()
        : null,
    careType: allocation.type,
    notes: allocation.metadata?.notes || null
});

const syncApprovedServiceInvoice = async (tx, task, allocation) => {
    return createInvoiceDraftForApprovedDuty(tx, task, allocation);
};

const syncApprovedAllocationDuty = async (tx, task) => {
    const allocationId = extractAllocationIdFromTask(task);
    if (!allocationId || task.status !== 'APPROVED') return;

    const allocation = await tx.allocation.findFirst({
        where: {
            id: allocationId,
            tenantId: task.tenantId,
            unitId: task.unitId,
            isDeleted: false
        },
        include: {
            staff: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true
                }
            },
            enquiry: {
                include: {
                    client: true,
                    service: true
                }
            }
        }
    });

    if (!allocation) return;

    const existingMetadata = allocation.metadata && typeof allocation.metadata === 'object'
        ? allocation.metadata
        : {};
    const serviceHistory = Array.isArray(existingMetadata.serviceHistory)
        ? existingMetadata.serviceHistory.filter((entry) => entry?.taskId !== task.id)
        : [];

    serviceHistory.unshift(buildApprovedServiceHistoryEntry({ task, allocation }));

    await tx.allocation.update({
        where: { id: allocation.id },
        data: {
            status: 'COMPLETED',
            endDate: allocation.endDate || new Date(),
            metadata: {
                ...existingMetadata,
                serviceHistory,
                serviceDeliveredAt: new Date().toISOString(),
                serviceDeliveredByTaskId: task.id,
                lastApprovedDutyTaskRef: task.refNo
            }
        }
    });

    if (task.assignedStaffId || allocation.staffId) {
        const staffId = task.assignedStaffId || allocation.staffId;
        await tx.staff.updateMany({
            where: {
                id: staffId,
                tenantId: task.tenantId,
                currentWorkload: { gt: 0 }
            },
            data: {
                currentWorkload: { decrement: 1 }
            }
        });
    }

    await syncApprovedServiceInvoice(tx, task, allocation);
    await reconcileAllocationCompletionBilling(tx, {
        tenantId: task.tenantId,
        allocationId: allocation.id,
        completedAt: task.completedAt || new Date(),
        createdBy: task.assignedStaffId || null
    });
};

const normalizeRoleName = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');

const resolveTaskApprovalNotificationRecipients = async (task) => {
    const recipients = new Set();

    if (task.approvalAuthorityId) {
        recipients.add(task.approvalAuthorityId);
    }

    const users = await prisma.user.findMany({
        where: {
            tenantId: task.tenantId,
            isActive: true,
            isDeleted: false
        },
        select: {
            id: true,
            unitId: true,
            role: {
                select: { name: true }
            }
        }
    });

    users.forEach((user) => {
        const roleName = normalizeRoleName(user.role?.name);
        const isSuperAdmin = roleName === 'super admin' || roleName === 'superadmin';
        const isAdmin = roleName === 'admin' || roleName.endsWith(' admin');
        const isSupervisor = roleName.includes('supervisor');

        if (isSuperAdmin || ((isAdmin || isSupervisor) && (!user.unitId || user.unitId === task.unitId))) {
            recipients.add(user.id);
        }
    });

    if (task.assigneeId) {
        recipients.delete(task.assigneeId);
    }

    return [...recipients];
};

const notifyTaskSubmittedForApproval = async (task) => {
    if (String(task.status).toUpperCase() !== 'COMPLETED') return;

    try {
        const recipientIds = await resolveTaskApprovalNotificationRecipients(task);
        if (!recipientIds.length) return;

        const staffName = task.assignedStaff
            ? `${task.assignedStaff.firstName} ${task.assignedStaff.lastName || ''}`.trim()
            : 'Assigned staff';
        const isScheduledTask = String(task.type || '').toUpperCase() === 'SCHEDULED';
        const approvalRoute = isScheduledTask ? '/task-log/schedule-approval' : '/task-log/daily-approval';

        await Promise.allSettled(recipientIds.map((userId) => sendNotification({
            userId,
            type: 'TASK_APPROVAL_REQUIRED',
            message: `${staffName} completed ${task.refNo || 'a task'}: ${task.title}. Please review it in ${isScheduledTask ? 'Scheduled Task Approval' : 'Daily Task Approval'}.`,
            targetUrl: `${approvalRoute}?taskId=${encodeURIComponent(task.id)}`,
            metadata: {
                taskId: task.id,
                taskRefNo: task.refNo,
                nextStep: isScheduledTask ? 'SCHEDULE_TASK_APPROVAL' : 'DAILY_TASK_APPROVAL'
            },
            tenantId: task.tenantId,
            unitId: task.unitId
        })));
    } catch (error) {
        console.error('Task completed but approval notification dispatch failed:', error);
    }
};

const findUserWithLinkedStaff = async (tenantId, unitId, normalizedIdentifier) => {
    const scopedUser = await prisma.user.findFirst({
        where: {
            id: normalizedIdentifier,
            tenantId,
            unitId,
            isDeleted: false,
            staff: {
                is: {
                    tenantId,
                    unitId,
                    isDeleted: false
                }
            }
        },
        include: {
            role: true,
            staff: {
                select: taskStaffSelect
            }
        }
    });

    if (scopedUser) {
        return scopedUser;
    }

    return prisma.user.findFirst({
        where: {
            id: normalizedIdentifier,
            tenantId,
            isDeleted: false,
            staff: {
                is: {
                    tenantId,
                    isDeleted: false
                }
            }
        },
        include: {
            role: true,
            staff: {
                select: taskStaffSelect
            }
        }
    });
};

const resolveStaffLinkedUser = async (tenantId, unitId, identifier) => {
    const normalizedIdentifier = normalizeIdentifier(identifier);
    if (!normalizedIdentifier) return null;

    const user = await findUserWithLinkedStaff(tenantId, unitId, normalizedIdentifier);

    if (user) {
        return user;
    }

    const userWithLinkedStaff = await prisma.user.findFirst({
        where: {
            id: normalizedIdentifier,
            tenantId,
            unitId,
            isDeleted: false
        },
        include: {
            role: true
        }
    });

    const crossUnitUserWithLinkedStaff = userWithLinkedStaff || await prisma.user.findFirst({
        where: {
            id: normalizedIdentifier,
            tenantId,
            isDeleted: false
        },
        include: {
            role: true
        }
    });

    if (crossUnitUserWithLinkedStaff) {
        const linkedStaff = await prisma.staff.findFirst({
            where: {
                userId: crossUnitUserWithLinkedStaff.id,
                tenantId,
                isDeleted: false
            },
            select: taskStaffSelect
        });

        if (linkedStaff) {
            return {
                ...crossUnitUserWithLinkedStaff,
                staff: linkedStaff
            };
        }
    }

    const staff = await prisma.staff.findFirst({
        where: {
            OR: [
                { id: normalizedIdentifier },
                { userId: normalizedIdentifier },
                { empId: normalizedIdentifier }
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

    return staff?.user
        ? {
            ...staff.user,
            staff
        }
        : null;
};

export const resolveAssignableStaffContext = async (tenantId, unitId, assigneeId) => {
    if (!assigneeId) return null;

    const staff = await prisma.staff.findFirst({
        where: {
            OR: [
                { id: assigneeId },
                { userId: assigneeId },
                { empId: assigneeId }
            ],
            tenantId,
            isDeleted: false
        },
        include: { user: true }
    });

    if (staff) {
        const staffStatus = String(staff.status || '').trim().toUpperCase();
        if (staffStatus === 'RESIGNED' || staffStatus === 'TERMINATED') {
            throw buildHttpError('Inactive staff cannot be assigned new tasks.');
        }
        return {
            userId: staff.userId || null,
            staffId: staff.id,
            user: staff.user || null
        };
    }

    const user = await prisma.user.findFirst({
        where: { id: assigneeId, tenantId, isDeleted: false },
        include: { staff: true }
    });

    if (user) {
        return {
            userId: user.id,
            staffId: user.staff?.id || null,
            user
        };
    }

    return null;
};

const ensureApprovalAuthorityUser = async (tenantId, unitId, approvalAuthorityId) => {
    if (!approvalAuthorityId) return null;

    const user = await resolveStaffLinkedUser(tenantId, unitId, approvalAuthorityId);

    if (!user || !user.isActive) {
        throw buildHttpError('Invalid approval authority selected');
    }

    return user.id;
};

export const createTask = async (tenantId, unitId, data) => {
    const targetAssignee = data.assignedStaffId || data.assigneeId;
    let assigneeUserId = null;
    let assignedStaffId = null;

    if (targetAssignee) {
        const staff = await prisma.staff.findFirst({
            where: {
                OR: [
                    { id: targetAssignee },
                    { userId: targetAssignee },
                    { empId: targetAssignee }
                ],
                tenantId,
                isDeleted: false
            },
            include: { user: true }
        });

        if (staff) {
            assignedStaffId = staff.id;
            assigneeUserId = staff.userId || null;
        } else {
            const user = await prisma.user.findFirst({
                where: { id: targetAssignee, tenantId, isDeleted: false }
            });
            if (user) {
                assigneeUserId = user.id;
            }
        }
    }

    const resolvedUnitId = data.unitId || unitId || '5c83400d-d805-4f7a-9629-9e370d7f4618';

    return prisma.task.create({
        data: {
            refNo: `TSK-${Date.now()}`,
            title: data.title,
            description: data.description || '',
            type: data.type || 'DAILY',
            priority: data.priority || 'MEDIUM',
            assigneeId: assigneeUserId,
            assignedStaffId: assignedStaffId,
            approvalAuthorityId: data.approvalAuthorityId || null,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            tenantId,
            unitId: resolvedUnitId,
            status: 'ASSIGNED'
        },
        include: taskListInclude
    });
};

export const createAITaskFromEnquiry = async (tenantId, unitId, data) => {
    if (!data?.enquiryId) {
        throw buildHttpError('enquiryId is required for AI task creation.');
    }

    if (!data?.title || !data?.type || !data?.priority) {
        throw buildHttpError('AI task generation failed');
    }

    await ensureApprovalAuthorityUser(tenantId, unitId, data.approvalAuthorityId);

    return prisma.task.create({
        data: {
            refNo: `TSK-${Date.now()}`,
            title: data.title,
            description: data.description || data.title,
            type: data.type,
            priority: data.priority,
            aiSummary: data.aiSummary || data.title,
            aiUrgency: data.aiUrgency || data.priority,
            enquiryId: data.enquiryId,
            approvalAuthorityId: data.approvalAuthorityId || null,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            tenantId,
            unitId,
            status: 'ASSIGNED'
        }
    });
};

export const getHomeCareTaskConditions = async (tenantId) => {
    const homeCareAllocations = await prisma.allocation.findMany({
        where: { tenantId, type: 'HOME_CARE', isDeleted: false },
        select: { id: true }
    });

    const allocationIds = homeCareAllocations.map(a => a.id);

    if (!allocationIds.length) {
        return [{ id: '00000000-0000-0000-0000-000000000000' }];
    }

    return allocationIds.map(id => ({
        description: { contains: `Allocation:${id}` }
    }));
};

export const getTasks = async (tenantId, unitId, filters = {}) => {
    const { approvalQueue, homeCareOnly, todayOnly, ...taskFilters } = filters;
    const where = { tenantId, isDeleted: false, ...taskFilters };

    // Staff self-service and approval queues may span units under the same tenant.
    // Default operational lists stay scoped to the active unit.
    // Staff self-service and approval queues may span units under the same tenant.
    // Default operational lists stay scoped to the active unit unless unitId is 'ALL' or viewing cross-unit Home Care duties.
    if (!taskFilters.assigneeId && !taskFilters.assignedStaffId && !taskFilters.approvalAuthorityId && !approvalQueue && unitId && unitId !== 'ALL' && !homeCareOnly) {
        where.unitId = unitId;
    }

    const andConditions = [];

    if (homeCareOnly) {
        const homeCareConditions = await getHomeCareTaskConditions(tenantId);
        andConditions.push({ OR: homeCareConditions });
    }

    if (todayOnly) {
        const { start: todayStart, end: todayEnd } = taskDateRangeForToday();
        andConditions.push({
            OR: [
                { dueDate: { gte: todayStart, lte: todayEnd } },
                { AND: [{ dueDate: null }, { completedAt: { gte: todayStart, lte: todayEnd } }] }
            ]
        });
    }

    if (andConditions.length > 0) {
        where.AND = [
            ...(where.AND || []),
            ...andConditions
        ];
    }

    return prisma.task.findMany({
        where,
        include: taskListInclude,
        orderBy: { createdAt: 'desc' }
    });
};

export const getMyTasks = async (tenantId, userId, filters = {}) => {
    const staff = await prisma.staff.findFirst({
        where: {
            tenantId,
            userId,
            isDeleted: false
        },
        select: { id: true }
    });
    const { start: todayStart, end: tomorrowStart } = taskDateRangeForToday();

    const andConditions = [
        {
            OR: [
                { assigneeId: userId },
                ...(staff?.id ? [{ assignedStaffId: staff.id }] : [])
            ]
        },
        {
            OR: [
                { description: { not: { contains: 'DailyOperationTask:' } } },
                {
                    AND: [
                        { description: { contains: 'DailyOperationTask:' } },
                        { dueDate: { gte: todayStart, lt: tomorrowStart } }
                    ]
                }
            ]
        }
    ];

    if (filters.homeCareOnly) {
        const homeCareConditions = await getHomeCareTaskConditions(tenantId);
        andConditions.push({ OR: homeCareConditions });
    }

    if (filters.todayOnly) {
        const { start: tStart, end: tEnd } = taskDateRangeForToday();
        andConditions.push({
            OR: [
                { dueDate: { gte: tStart, lte: tEnd } },
                { AND: [{ dueDate: null }, { completedAt: { gte: tStart, lte: tEnd } }] }
            ]
        });
    }

    return prisma.task.findMany({
        where: {
            tenantId,
            isDeleted: false,
            AND: andConditions
        },
        include: taskListInclude,
        orderBy: { createdAt: 'desc' }
    });
};

export const updateTaskStatus = async (id, tenantId, unitId, status, feedbackScore = null, options = {}) => {
    const existing = await prisma.task.findFirst({
        where: { id, tenantId, isDeleted: false },
        select: { id: true, assigneeId: true, unitId: true, description: true }
    });
    if (!existing) {
        const error = new Error('Task not found');
        error.status = 404;
        throw error;
    }

    const task = await prisma.$transaction(async (tx) => {
        const requestedCompletedAt = options.completedAt ? new Date(options.completedAt) : null;
        const safeCompletedAt = requestedCompletedAt && !Number.isNaN(requestedCompletedAt.getTime())
            ? requestedCompletedAt
            : new Date();
        const nextDescription = typeof options.remarks === 'string'
            ? upsertStaffRemarksInDescription(existing.description, options.remarks)
            : undefined;
        const updatedTask = await tx.task.update({
            where: { id },
            data: {
                status,
                feedbackScore: feedbackScore !== null ? feedbackScore : undefined,
                description: nextDescription,
                completedAt: (status === 'COMPLETED' || status === 'APPROVED') ? safeCompletedAt : undefined
            },
            include: {
                assignedStaff: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true
                    }
                },
                approvalAuthority: {
                    select: {
                        id: true
                    }
                }
            }
        });

        try {
            await syncApprovedAllocationDuty(tx, updatedTask);
        } catch (dutyErr) {
            console.warn('syncApprovedAllocationDuty warning:', dutyErr?.message || dutyErr);
        }
        try {
            await syncDailyOperationTaskStatus(tx, updatedTask, status);
        } catch (opErr) {
            console.warn('syncDailyOperationTaskStatus warning:', opErr?.message || opErr);
        }
        try {
            await syncComplaintTaskStatus(tx, updatedTask, status);
        } catch (cmpErr) {
            console.warn('syncComplaintTaskStatus warning:', cmpErr?.message || cmpErr);
        }

        return updatedTask;
    }, {
        maxWait: 10000,
        timeout: 30000
    });

    if (task.assigneeId) {
        await StaffIntelligenceService.updateStaffIntelligence(task.assigneeId);
    }

    await notifyTaskSubmittedForApproval(task);

    return task;
};
