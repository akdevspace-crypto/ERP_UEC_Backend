import { prisma } from '../../app/prisma.js';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';
import { randomUUID } from 'crypto';

const defaultTasks = {
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
    ]
};

export const generateOperationalTasksForAssignment = async (tx, assignment, staffName) => {
    let department = 'Patient Care';
    if (assignment.role && assignment.role.toLowerCase().includes('nurs')) {
        department = 'Nursing';
    }

    let templates = [];
    if (assignment.patientId) {
        templates = defaultTasks[department] || [];
    } else if (assignment.allocationId || assignment.dutyType === 'VISIT') {
        templates = [{ title: 'Service Visit Execution', phase: 'MORNING_OPERATIONS' }];
        department = 'Field Service';
    }

    if (templates.length === 0) return;

    const existingTasks = await tx.dailyOperationTask.findMany({
        where: {
            assignmentId: assignment.id,
            tenantId: assignment.tenantId,
            unitId: assignment.unitId,
            isDeleted: false
        },
        select: { title: true }
    });

    const existingTitles = new Set(existingTasks.map(t => t.title));
    const tasksToCreate = templates.filter(t => !existingTitles.has(t.title));

    if (tasksToCreate.length === 0) return;

    const taskDate = new Date(assignment.startAt);
    
    for (const template of tasksToCreate) {
        await tx.dailyOperationTask.create({
            data: {
                id: randomUUID(),
                taskNo: await generateRefNumber('DOP', assignment.tenantId, assignment.unitId, tx),
                taskDate,
                phase: template.phase,
                department,
                title: template.title,
                assignedStaffId: assignment.staffId,
                assignedTo: staffName,
                status: 'PENDING',
                source: 'ASSIGNMENT_AUTO',
                patientId: assignment.patientId || null,
                assignmentId: assignment.id,
                tenantId: assignment.tenantId,
                unitId: assignment.unitId,
                createdBy: assignment.assignedById
            }
        });
    }
};

const ACTIVE_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'];
const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'WAITING_APPROVAL', 'APPROVED'];

const mapAssignmentResponse = (assignment) => {
    if (!assignment) return assignment;
    const { Staff, Patient, Allocation, ...rest } = assignment;
    return {
        ...rest,
        ...(Staff !== undefined && { staff: Staff }),
        ...(Patient !== undefined && { patient: Patient }),
        ...(Allocation !== undefined && { allocation: Allocation })
    };
};

const assignmentInclude = {
    Staff: {
        select: {
            id: true,
            empId: true,
            firstName: true,
            lastName: true,
            designation: true,
            department: true,
            status: true,
            isAvailable: true,
            currentWorkload: true,
            capacity: true,
            shiftStart: true,
            shiftEnd: true,
            lastActiveAt: true
        }
    },
    Patient: {
        select: {
            id: true,
            name: true
        }
    },
    Allocation: {
        select: {
            id: true,
            refNo: true,
            type: true,
            status: true,
            enquiryId: true
        }
    }
};

const medicalStaffFilters = [
    { designation: { contains: 'doctor', mode: 'insensitive' } },
    { designation: { contains: 'nurse', mode: 'insensitive' } },
    { designation: { contains: 'caregiver', mode: 'insensitive' } },
    { designation: { contains: 'care', mode: 'insensitive' } },
    { department: { contains: 'nursing', mode: 'insensitive' } },
    { department: { contains: 'patient care', mode: 'insensitive' } }
];

const medicalStaffSelect = {
    id: true,
    empId: true,
    firstName: true,
    lastName: true,
    designation: true,
    department: true,
    status: true,
    isAvailable: true,
    phone: true,
    email: true,
    unitId: true,
    userId: true,
    user: {
        select: {
            id: true,
            email: true,
            isActive: true,
            role: { select: { name: true } }
        }
    },
    currentWorkload: true,
    capacity: true,
    shiftStart: true,
    shiftEnd: true,
    lastActiveAt: true
};

const buildHttpError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const hasOwn = (source, key) => Object.prototype.hasOwnProperty.call(source, key);

const normalizeOptionalString = (value) => {
    if (typeof value !== 'string') return value ?? null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
};

const toDateOrNull = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw buildHttpError('Invalid date value');
    }
    return date;
};

const ensureStaff = async (db, tenantId, unitId, staffId) => {
    const staff = await db.staff.findFirst({
        where: {
            id: staffId,
            tenantId,
            isDeleted: false
        },
        select: {
            id: true,
            unitId: true,
            firstName: true,
            lastName: true,
            designation: true,
            department: true,
            capacity: true,
            currentWorkload: true
        }
    });

    if (!staff) {
        throw buildHttpError('Staff member not found in this organization', 404);
    }

    return staff;
};

const ensureScopedReference = async (db, modelName, tenantId, unitId, id, label, supportsSoftDelete = true) => {
    if (!id) return null;

    const where = { id, tenantId };
    if (unitId && unitId !== 'ALL' && unitId !== '*') {
        where.unitId = unitId;
    }
    if (supportsSoftDelete) where.isDeleted = false;

    const record = await db[modelName].findFirst({
        where,
        select: { id: true }
    });

    if (!record) {
        throw buildHttpError(`${label} was not found in this organization`, 404);
    }

    return record;
};

const validateAssignmentRelationships = async (db, tenantId, staff, data) => {
    if (data.patientId) {
        const patient = await db.patient.findFirst({
            where: { id: data.patientId, tenantId },
            select: { id: true, unitId: true }
        });
        if (!patient) {
            throw buildHttpError('Patient not found.', 404);
        }
        if (patient.unitId !== staff.unitId) {
            const activeAdmission = await db.admission.findFirst({
                where: {
                    patientId: patient.id,
                    tenantId,
                    status: 'ACTIVE'
                },
                select: { id: true }
            });
            if (!activeAdmission) {
                throw buildHttpError('Patient must have an active admission.', 400);
            }
        }
    }

    if (data.allocationId) {
        const allocation = await db.allocation.findFirst({
            where: { id: data.allocationId, tenantId, isDeleted: false },
            select: { id: true, unitId: true }
        });
        if (!allocation) {
            throw buildHttpError('Allocation not found.', 404);
        }
        if (allocation.unitId !== staff.unitId) {
            throw buildHttpError('Staff and allocation must belong to the same unit.', 400);
        }
    }

    await Promise.all([
        ensureScopedReference(db, 'admission', tenantId, null, data.admissionId, 'Admission', false),
        ensureScopedReference(db, 'enquiry', tenantId, null, data.enquiryId, 'Enquiry'),
        ensureScopedReference(db, 'task', tenantId, null, data.taskId, 'Task')
    ]);
};

const buildAssignmentData = (data, defaults = {}) => {
    const payload = {};

    if (hasOwn(data, 'staffId') && data.staffId) payload.staffId = data.staffId;
    if (hasOwn(data, 'patientId')) payload.patientId = data.patientId || null;
    if (hasOwn(data, 'admissionId')) payload.admissionId = data.admissionId || null;
    if (hasOwn(data, 'enquiryId')) payload.enquiryId = data.enquiryId || null;
    if (hasOwn(data, 'taskId')) payload.taskId = data.taskId || null;
    if (hasOwn(data, 'allocationId')) payload.allocationId = data.allocationId || null;
    if (hasOwn(data, 'dutyType')) payload.dutyType = normalizeOptionalString(data.dutyType) || defaults.dutyType || 'ROUND';
    if (hasOwn(data, 'role')) payload.role = normalizeOptionalString(data.role);
    if (hasOwn(data, 'location')) payload.location = normalizeOptionalString(data.location);
    if (hasOwn(data, 'startAt')) payload.startAt = toDateOrNull(data.startAt) || defaults.startAt || new Date();
    if (hasOwn(data, 'endAt')) payload.endAt = toDateOrNull(data.endAt);
    if (hasOwn(data, 'status')) payload.status = data.status;
    if (hasOwn(data, 'priority')) payload.priority = data.priority || defaults.priority || 'MEDIUM';
    if (hasOwn(data, 'notes')) payload.notes = normalizeOptionalString(data.notes);
    if (hasOwn(data, 'metadata')) payload.metadata = data.metadata ?? null;

    return payload;
};

const validateAssignmentConflicts = async (db, staffId, startAt, endAt, excludeAssignmentId = null) => {
    if (!startAt || !endAt) return;

    // Check shift overlap
    const existingAssignment = await db.medicalAssignment.findFirst({
        where: {
            staffId,
            isDeleted: false,
            status: { notIn: ['CANCELLED'] },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
            ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {})
        }
    });

    if (existingAssignment) {
        throw buildHttpError('Staff member already has another assignment during this time.', 409);
    }

    // Check leave conflict
    const approvedLeave = await db.leaveRequest.findFirst({
        where: {
            staffId,
            status: 'APPROVED',
            startDate: { lt: endAt },
            endDate: { gt: startAt }
        }
    });

    if (approvedLeave) {
        throw buildHttpError('Staff member is on approved leave during this time.', 409);
    }
};

const validateAssignmentDateRange = (payload) => {
    if (!payload.startAt || !payload.endAt) return;

    if (payload.endAt < payload.startAt) {
        throw buildHttpError('End time must be after start time');
    }
};

const recalculateStaffCurrentWorkload = async (db, staffId) => {
    if (!staffId) return;

    const [medicalCount, taskCount, allocationCount] = await Promise.all([
        db.medicalAssignment.count({
            where: {
                staffId,
                isDeleted: false,
                status: { in: ACTIVE_STATUSES }
            }
        }),
        db.task.count({
            where: {
                assignedStaffId: staffId,
                isDeleted: false,
                status: { in: ['ASSIGNED', 'IN_PROGRESS'] }
            }
        }),
        db.allocation.count({
            where: {
                staffId,
                isDeleted: false,
                status: { in: ['PENDING', 'ALLOCATED', 'ON_HOLD'] }
            }
        })
    ]);

    await db.staff.update({
        where: { id: staffId },
        data: {
            currentWorkload: medicalCount + taskCount + allocationCount
        }
    });
};

const withComputedStatusFields = (data, existing = {}) => {
    if (!hasOwn(data, 'status')) return data;

    const payload = { ...data };
    if (TERMINAL_STATUSES.includes(data.status) && !existing.endAt && !hasOwn(data, 'endAt')) {
        payload.endAt = new Date();
    }

    return payload;
};

export const createMedicalAssignment = async (tenantId, unitId, userId, data) => {
    return prisma.$transaction(async (tx) => {
        const staff = await ensureStaff(tx, tenantId, unitId, data.staffId);
        await validateAssignmentRelationships(tx, tenantId, staff, data);

        const refNo = await generateRefNumber('MED', tenantId, staff.unitId, tx);
        const payload = {
            startAt: new Date(),
            status: 'ASSIGNED',
            priority: 'MEDIUM',
            dutyType: 'ROUND',
            ...buildAssignmentData(data, {
                role: staff.designation || staff.department || null
            })
        };
        validateAssignmentDateRange(payload);
        await validateAssignmentConflicts(tx, staff.id, payload.startAt, payload.endAt);

        const assignment = await tx.medicalAssignment.create({
            data: {
                id: randomUUID(),
                ...payload,
                refNo,
                role: payload.role || staff.designation || staff.department || null,
                assignedById: userId || null,
                tenantId,
                unitId: staff.unitId
            },
            include: assignmentInclude
        });

        await recalculateStaffCurrentWorkload(tx, assignment.staffId);
        
        const staffName = `${staff.firstName} ${staff.lastName || ''}`.trim();
        await generateOperationalTasksForAssignment(tx, assignment, staffName);
        
        return mapAssignmentResponse(await tx.medicalAssignment.findUnique({
            where: { id: assignment.id },
            include: assignmentInclude
        }));
    }, {
        timeout: 15000,
        maxWait: 5000
    });
};

export const getMedicalStaff = async (tenantId, unitId) => {
    const baseWhere = {
        tenantId,
        isDeleted: false,
        userId: { not: null },
        NOT: [
            { empId: { startsWith: 'SEED' } },
            { empId: { startsWith: 'DEMO' } }
        ],
        OR: medicalStaffFilters
    };

    let staff = [];
    if (unitId && unitId !== 'ALL' && unitId !== '*') {
        staff = await prisma.staff.findMany({
            where: {
                ...baseWhere,
                unitId
            },
            select: medicalStaffSelect,
            orderBy: [
                { currentWorkload: 'asc' },
                { firstName: 'asc' }
            ]
        });
    }

    // If unit has no manual staff with login, or in facility-wide mode, return all manual staff with login
    if (staff.length === 0) {
        staff = await prisma.staff.findMany({
            where: baseWhere,
            select: medicalStaffSelect,
            orderBy: [
                { currentWorkload: 'asc' },
                { firstName: 'asc' }
            ]
        });
    }

    return staff;
};

export const getMedicalAssignments = async (tenantId, unitId, filters = {}) => {
    const where = {
        tenantId,
        isDeleted: false
    };
    if (unitId && unitId !== 'ALL' && unitId !== '*') {
        where.unitId = unitId;
    }

    if (filters.activeOnly && !filters.status) {
        where.status = { in: ACTIVE_STATUSES };
    } else if (filters.status) {
        where.status = filters.status;
    }

    if (filters.staffId) where.staffId = filters.staffId;
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.allocationId) where.allocationId = filters.allocationId;
    if (filters.dutyType) {
        where.dutyType = { contains: filters.dutyType, mode: 'insensitive' };
    }

    if (filters.homeCare) {
        where.OR = [
            { Allocation: { is: { type: 'HOME_CARE', isDeleted: false } } },
            { dutyType: { contains: 'HOME_CARE', mode: 'insensitive' } }
        ];
    }

    if (filters.from || filters.to) {
        where.startAt = {};
        if (filters.from) where.startAt.gte = toDateOrNull(filters.from);
        if (filters.to) where.startAt.lte = toDateOrNull(filters.to);
    }

    if (filters.search) {
        const search = filters.search;
        where.OR = [
            { refNo: { contains: search, mode: 'insensitive' } },
            { dutyType: { contains: search, mode: 'insensitive' } },
            { role: { contains: search, mode: 'insensitive' } },
            { location: { contains: search, mode: 'insensitive' } },
            { notes: { contains: search, mode: 'insensitive' } },
            {
                Staff: {
                    is: {
                        OR: [
                            { firstName: { contains: search, mode: 'insensitive' } },
                            { lastName: { contains: search, mode: 'insensitive' } },
                            { empId: { contains: search, mode: 'insensitive' } },
                            { designation: { contains: search, mode: 'insensitive' } },
                            { department: { contains: search, mode: 'insensitive' } }
                        ]
                    }
                }
            },
            {
                Patient: {
                    is: {
                        name: { contains: search, mode: 'insensitive' }
                    }
                }
            }
        ];
    }

    const assignments = await prisma.medicalAssignment.findMany({
        where,
        include: assignmentInclude,
        orderBy: [
            { status: 'asc' },
            { startAt: 'asc' },
            { createdAt: 'desc' }
        ]
    });
    return assignments.map(mapAssignmentResponse);
};

export const getMedicalAssignmentById = async (tenantId, unitId, id) => {
    const assignment = await prisma.medicalAssignment.findFirst({
        where: { id, tenantId, unitId, isDeleted: false },
        include: assignmentInclude
    });

    if (!assignment) {
        throw buildHttpError('Medical assignment not found', 404);
    }

    return mapAssignmentResponse(assignment);
};

export const getMedicalDashboard = async (tenantId, unitId) => {
    const [activeAssignments, statusGroups, medicalStaff] = await Promise.all([
        getMedicalAssignments(tenantId, unitId, { activeOnly: true }),
        prisma.medicalAssignment.groupBy({
            by: ['status'],
            where: { tenantId, unitId, isDeleted: false },
            _count: { status: true }
        }),
        prisma.staff.findMany({
            where: {
                tenantId,
                unitId,
                isDeleted: false,
                OR: medicalStaffFilters
            },
            select: {
                id: true,
                status: true,
                isAvailable: true,
                currentWorkload: true,
                capacity: true
            }
        })
    ]);

    const statusCounts = statusGroups.reduce((result, row) => ({
        ...result,
        [row.status]: row._count.status
    }), {});

    const staffSummary = medicalStaff.reduce((summary, staff) => {
        const isWorking = String(staff.status || '').toLowerCase() === 'working';
        const hasCapacity = staff.currentWorkload < staff.capacity;
        return {
            total: summary.total + 1,
            available: summary.available + (staff.isAvailable && isWorking && hasCapacity ? 1 : 0),
            busy: summary.busy + (staff.currentWorkload > 0 ? 1 : 0),
            offDuty: summary.offDuty + (!staff.isAvailable || !isWorking ? 1 : 0)
        };
    }, { total: 0, available: 0, busy: 0, offDuty: 0 });

    return {
        activeCount: activeAssignments.length,
        statusCounts,
        staffSummary,
        activeAssignments: activeAssignments.slice(0, 25)
    };
};

export const updateMedicalAssignment = async (tenantId, unitId, id, data) => {
    return prisma.$transaction(async (tx) => {
        const existing = await tx.medicalAssignment.findFirst({
            where: { id, tenantId, unitId, isDeleted: false }
        });

        if (!existing) {
            throw buildHttpError('Medical assignment not found', 404);
        }

        const nextStaffId = data.staffId || existing.staffId;
        const staff = await ensureStaff(tx, tenantId, unitId, nextStaffId);
        await validateAssignmentRelationships(tx, tenantId, staff, data);

        const payload = withComputedStatusFields(buildAssignmentData(data), existing);
        validateAssignmentDateRange({ ...existing, ...payload });
        await validateAssignmentConflicts(tx, payload.staffId || existing.staffId, payload.startAt || existing.startAt, payload.endAt || existing.endAt, id);

        const assignment = await tx.medicalAssignment.update({
            where: { id },
            data: {
                ...payload,
                unitId: staff.unitId
            },
            include: assignmentInclude
        });

        await recalculateStaffCurrentWorkload(tx, existing.staffId);
        if (assignment.staffId !== existing.staffId) {
            await recalculateStaffCurrentWorkload(tx, assignment.staffId);
        }

        const staffDetails = await tx.staff.findFirst({
            where: { id: assignment.staffId }
        });
        const staffName = staffDetails ? `${staffDetails.firstName} ${staffDetails.lastName || ''}`.trim() : 'Unknown';
        await generateOperationalTasksForAssignment(tx, assignment, staffName);

        return mapAssignmentResponse(await tx.medicalAssignment.findUnique({
            where: { id: assignment.id },
            include: assignmentInclude
        }));
    }, {
        timeout: 15000,
        maxWait: 5000
    });
};

export const updateMedicalAssignmentStatus = async (tenantId, unitId, id, data) => {
    return updateMedicalAssignment(tenantId, unitId, id, data);
};

export const deleteMedicalAssignment = async (tenantId, unitId, id) => {
    return prisma.$transaction(async (tx) => {
        const existing = await tx.medicalAssignment.findFirst({
            where: { id, tenantId, unitId, isDeleted: false }
        });

        if (!existing) {
            throw buildHttpError('Medical assignment not found', 404);
        }

        const assignment = await tx.medicalAssignment.update({
            where: { id },
            data: {
                isDeleted: true,
                deletedAt: new Date()
            },
            include: assignmentInclude
        });

        await recalculateStaffCurrentWorkload(tx, existing.staffId);
        return mapAssignmentResponse(assignment);
    });
};

export const getDoctorVisits = async (tenantId, unitId, filters = {}) => {
    const where = { tenantId, unitId };
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.doctorId) where.doctorId = filters.doctorId;
    return prisma.doctorVisit.findMany({
        where,
        orderBy: { visitDate: 'desc' },
        include: { patient: { select: { name: true } } }
    });
};

export const createDoctorVisit = async (tenantId, unitId, data) => {
    const visitDate = data.visitDate ? new Date(data.visitDate) : new Date();
    const nextFollowUp = data.nextFollowUp ? new Date(data.nextFollowUp) : null;
    return prisma.doctorVisit.create({
        data: {
            tenantId,
            unitId,
            patientId: data.patientId,
            doctorId: data.doctorId,
            visitDate,
            chiefComplaint: data.chiefComplaint || null,
            clinicalNotes: data.clinicalNotes || null,
            nextFollowUp,
            metadata: data.medicalOrders ? { medicalOrders: data.medicalOrders, chargeConsultation: data.chargeConsultation, consultationAmount: data.consultationAmount } : null
        },
        include: { patient: { select: { name: true } } }
    });
};

export const updateDoctorVisit = async (tenantId, unitId, id, data) => {
    return prisma.doctorVisit.update({
        where: { id, tenantId, unitId },
        data: {
            ...data,
            visitDate: data.visitDate ? new Date(data.visitDate) : undefined,
            nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : undefined
        },
        include: { patient: { select: { name: true } } }
    });
};

export const verifyStaffAssignment = async (tenantId, unitId, user, patientId) => {
    if (!user) return { authorized: false, reason: 'Unauthenticated' };
    
    const userRole = String(user.role || user.roleName || '').trim().toUpperCase();
    const privilegedRoles = ['SUPER_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'CARE_ALLOCATION_MANAGER', 'HOME_CARE_MANAGER'];
    const permissions = user.permissions || [];
    
    if (privilegedRoles.includes(userRole) || permissions.includes('ALL_ACCESS')) {
        return { authorized: true, assignmentId: null, staffId: null };
    }

    const staff = await prisma.staff.findFirst({
        where: { userId: user.id, tenantId, unitId, isDeleted: false }
    });

    if (!staff) {
        return { authorized: false, reason: 'No staff record linked to this user' };
    }

    const now = new Date();
    const assignment = await prisma.medicalAssignment.findFirst({
        where: {
            staffId: staff.id,
            patientId,
            tenantId,
            unitId,
            isDeleted: false,
            status: { in: ACTIVE_STATUSES },
            startAt: { lte: now },
            OR: [
                { endAt: null },
                { endAt: { gte: now } }
            ]
        },
        orderBy: { startAt: 'desc' }
    });

    if (!assignment) {
        return { authorized: false, reason: 'You do not have an active assignment for this patient' };
    }

    return { authorized: true, assignmentId: assignment.id, staffId: staff.id };
};

export const getMyShift = async (tenantId, unitId, user) => {
    const staff = await prisma.staff.findFirst({
        where: { userId: user.id, tenantId, isDeleted: false }
    });
    
    if (!staff) {
        return { assignments: [], tasks: [] };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const rawAssignments = await prisma.medicalAssignment.findMany({
        where: {
            staffId: staff.id,
            tenantId,
            isDeleted: false,
            startAt: { lte: todayEnd },
            OR: [
                { endAt: null },
                { endAt: { gte: todayStart } }
            ]
        },
        include: assignmentInclude,
        orderBy: { startAt: 'asc' }
    });
    
    const assignments = rawAssignments.map(mapAssignmentResponse);

    const assignmentIds = assignments.map(a => a.id);
    let tasks = [];
    if (assignmentIds.length > 0) {
        tasks = await prisma.dailyOperationTask.findMany({
            where: {
                assignmentId: { in: assignmentIds },
                tenantId,
                isDeleted: false
            },
            orderBy: { createdAt: 'asc' }
        });
    }

    return { assignments, tasks };
};
