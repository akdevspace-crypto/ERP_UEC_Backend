import { prisma } from '../../app/prisma.js';

const isRecoverableAnalyticsError = (error) =>
    error?.code === "P2021" ||
    error?.code === "P2022" ||
    error?.code === "P2024" ||
    error?.name === "PrismaClientValidationError";

const readKPIValue = async (read, fallback) => {
    try {
        return await read();
    } catch (error) {
        if (isRecoverableAnalyticsError(error)) return fallback;
        throw error;
    }
};

export const getDashboardKPIs = async (tenantId, unitId) => {
    const [
        totalEnquiries,
        pendingFollowups,
        revenue,
        pendingApprovals,
        activeEnquiries,
        criticalPatients,
        lowStockAlerts,
        pendingPayments
    ] = await Promise.all([
        readKPIValue(() => prisma.enquiry.count({
            where: { tenantId, unitId, isDeleted: false }
        }), 0),
        readKPIValue(() => prisma.followUp.count({
            where: {
                tenantId,
                unitId,
                isDeleted: false,
                scheduledAt: { gte: new Date() }
            }
        }), 0),
        readKPIValue(() => prisma.accountTransaction.aggregate({
            _sum: { amount: true },
            where: {
                tenantId,
                unitId,
                status: "POSTED",
                type: "RECEIPT",
                isDeleted: false
            }
        }), { _sum: { amount: 0 } }),
        readKPIValue(() => prisma.approval.count({
            where: {
                tenantId,
                unitId,
                status: "PENDING",
                isDeleted: false
            }
        }), 0),
        readKPIValue(() => prisma.enquiry.count({
            where: {
                tenantId,
                unitId,
                isDeleted: false,
                status: { in: ["NEW", "FOLLOW_UP", "IN_PROGRESS"] }
            }
        }), 0),
        readKPIValue(() => prisma.vitalSign.count({
            where: {
                tenantId,
                unitId,
                isDeleted: false,
                OR: [
                    { spO2: { lt: 92 } },
                    { pulse: { gt: 110 } },
                    { temp: { gt: 100.4 } },
                    { notes: { contains: "Critical", mode: "insensitive" } }
                ]
            }
        }), 0),
        readKPIValue(() => prisma.stock.count({
            where: {
                tenantId,
                unitId,
                quantity: { lt: 12 }
            }
        }), 0),
        readKPIValue(() => prisma.accountTransaction.count({
            where: {
                tenantId,
                unitId,
                isDeleted: false,
                OR: [
                    { status: "PENDING_APPROVAL" },
                    { notes: { contains: "pending", mode: "insensitive" } },
                    { notes: { contains: "overdue", mode: "insensitive" } },
                    { notes: { contains: "partial", mode: "insensitive" } }
                ]
            }
        }), 0)
    ]);

    return {
        totalEnquiries,
        pendingFollowups,
        revenue: revenue._sum.amount || 0,
        pendingApprovals,
        activeEnquiries,
        criticalPatients,
        lowStockAlerts,
        pendingPayments
    };
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const buildMonthWindows = () => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
        const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - (5 - index), 1));
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        return {
            label: start.toLocaleString("en-US", { month: "short" }),
            start,
            end
        };
    });
};

const countInWindow = (model, where, window) => readKPIValue(() => model.count({
    where: {
        ...where,
        createdAt: {
            gte: window.start,
            lt: window.end
        }
    }
}), 0);

const baseWhere = (tenantId, unitId) => ({ tenantId, unitId });
const liveWhere = (tenantId, unitId) => ({ tenantId, unitId, isDeleted: false });

const organizationDefinitions = {
    UNCF: {
        title: "UNCF Dashboard",
        subtitle: "Foundation-wide administration, finance, HR, security, CMS, and profile monitoring.",
        accent: "#00A89D",
        kpis: async (tenantId, unitId) => {
            const where = liveWhere(tenantId, unitId);
            const [
                activeEnquiries,
                criticalPatients,
                lowStockAlerts,
                pendingPayments,
                totalIncome,
                scheduleTasks,
                complaints,
                recentActivities
            ] = await Promise.all([
                readKPIValue(() => prisma.enquiry.count({
                    where: { ...where, status: { in: ["NEW", "FOLLOW_UP", "IN_PROGRESS"] } }
                }), 0),
                readKPIValue(() => prisma.vitalSign.count({
                    where: {
                        ...where,
                        OR: [
                            { spO2: { lt: 92 } },
                            { pulse: { gt: 110 } },
                            { temp: { gt: 100.4 } },
                            { notes: { contains: "Critical", mode: "insensitive" } }
                        ]
                    }
                }), 0),
                readKPIValue(() => prisma.stock.count({
                    where: { ...baseWhere(tenantId, unitId), quantity: { lt: 12 } }
                }), 0),
                readKPIValue(() => prisma.accountTransaction.count({
                    where: {
                        ...where,
                        OR: [
                            { status: "PENDING_APPROVAL" },
                            { notes: { contains: "pending", mode: "insensitive" } },
                            { notes: { contains: "overdue", mode: "insensitive" } },
                            { notes: { contains: "partial", mode: "insensitive" } }
                        ]
                    }
                }), 0),
                readKPIValue(() => prisma.accountTransaction.aggregate({
                    _sum: { amount: true },
                    where: { ...where, type: "RECEIPT", status: { in: ["APPROVED", "POSTED"] } }
                }), { _sum: { amount: 0 } }),
                readKPIValue(() => prisma.task.count({
                    where: { ...where, type: "SCHEDULED" }
                }), 0),
                readKPIValue(() => prisma.complaint.count({
                    where: { ...where, status: { in: ["OPEN", "ASSIGNED"] } }
                }), 0),
                readKPIValue(() => prisma.workflowLog.count({ where }), 0)
            ]);

            return [
                { label: "Active Enquiries", value: activeEnquiries, tone: "teal" },
                { label: "Critical Patients", value: criticalPatients, tone: "rose" },
                { label: "Low Stock Alerts", value: lowStockAlerts, tone: "amber" },
                { label: "Pending Payments", value: pendingPayments, tone: "green" },
                { label: "Total Income", value: totalIncome._sum.amount || 0, format: "currency", tone: "teal" },
                { label: "Schedule Tasks", value: scheduleTasks, tone: "blue" },
                { label: "Complaints", value: complaints, tone: "violet" },
                { label: "Recent Activities", value: recentActivities, tone: "orange" }
            ];
        },
        trend: async (tenantId, unitId) => {
            const windows = buildMonthWindows();
            return Promise.all(windows.map(async (window) => ({
                name: window.label,
                enquiries: await countInWindow(prisma.enquiry, liveWhere(tenantId, unitId), window),
                income: (await readKPIValue(() => prisma.accountTransaction.aggregate({
                    _sum: { amount: true },
                    where: {
                        ...liveWhere(tenantId, unitId),
                        type: "RECEIPT",
                        status: { in: ["APPROVED", "POSTED"] },
                        createdAt: { gte: window.start, lt: window.end }
                    }
                }), { _sum: { amount: 0 } }))._sum.amount || 0,
                tasks: await countInWindow(prisma.task, liveWhere(tenantId, unitId), window)
            })));
        }
    },
    UEC: {
        title: "UEC Dashboard",
        subtitle: "Elder care operations, in-house revenue, tasks, and facility monitoring.",
        accent: "#00B3A4",
        kpis: async (tenantId, unitId) => {
            const where = liveWhere(tenantId, unitId);
            const [admissions, inHouseAllocations, dailyTasks, pendingTasks, revenue, laundryOpen, maintenanceOpen, lowStock] = await Promise.all([
                readKPIValue(() => prisma.admission.count({ where: { ...baseWhere(tenantId, unitId), status: "ACTIVE" } }), 0),
                readKPIValue(() => prisma.allocation.count({ where: { ...where, type: "IN_HOUSE" } }), 0),
                readKPIValue(() => prisma.task.count({ where: { ...where, type: "DAILY" } }), 0),
                readKPIValue(() => prisma.task.count({ where: { ...where, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }), 0),
                readKPIValue(() => prisma.accountTransaction.aggregate({ _sum: { amount: true }, where: { ...where, type: "RECEIPT", status: "POSTED" } }), { _sum: { amount: 0 } }),
                readKPIValue(() => prisma.laundry.count({ where: { ...baseWhere(tenantId, unitId), status: { not: "COMPLETED" } } }), 0),
                readKPIValue(() => prisma.maintenance.count({ where: { ...baseWhere(tenantId, unitId), status: { not: "COMPLETED" } } }), 0),
                readKPIValue(() => prisma.stock.count({ where: { ...baseWhere(tenantId, unitId), quantity: { lt: 12 } } }), 0)
            ]);

            return [
                { label: "Active Residents", value: admissions, tone: "teal" },
                { label: "In-House Care", value: inHouseAllocations, tone: "blue" },
                { label: "Daily Tasks", value: dailyTasks, tone: "green" },
                { label: "Pending Tasks", value: pendingTasks, tone: "amber" },
                { label: "Revenue", value: revenue._sum.amount || 0, format: "currency", tone: "teal" },
                { label: "Laundry Open", value: laundryOpen, tone: "violet" },
                { label: "Maintenance Open", value: maintenanceOpen, tone: "rose" },
                { label: "Low Stock", value: lowStock, tone: "amber" }
            ];
        },
        trend: async (tenantId, unitId) => {
            const windows = buildMonthWindows();
            return Promise.all(windows.map(async (window) => ({
                name: window.label,
                residents: await countInWindow(prisma.admission, baseWhere(tenantId, unitId), window),
                tasks: await countInWindow(prisma.task, liveWhere(tenantId, unitId), window),
                revenue: (await readKPIValue(() => prisma.accountTransaction.aggregate({
                    _sum: { amount: true },
                    where: { ...liveWhere(tenantId, unitId), type: "RECEIPT", status: "POSTED", createdAt: { gte: window.start, lt: window.end } }
                }), { _sum: { amount: 0 } }))._sum.amount || 0
            })));
        }
    },
    UHC: {
        title: "UHC Dashboard",
        subtitle: "Healthcare monitoring for patients, vitals, assignments, and medication workload.",
        accent: "#0B5D6B",
        kpis: async (tenantId, unitId) => {
            const where = baseWhere(tenantId, unitId);
            const [patients, activeAdmissions, criticalVitals, medicalAssignments, medications, nutritionPlans, clinicalAllocations, pendingApprovals] = await Promise.all([
                readKPIValue(() => prisma.patient.count({ where }), 0),
                readKPIValue(() => prisma.admission.count({ where: { ...where, status: "ACTIVE" } }), 0),
                readKPIValue(() => prisma.vitalSign.count({
                    where: {
                        ...liveWhere(tenantId, unitId),
                        OR: [{ spO2: { lt: 92 } }, { pulse: { gt: 110 } }, { temp: { gt: 100.4 } }, { notes: { contains: "Critical", mode: "insensitive" } }]
                    }
                }), 0),
                readKPIValue(() => prisma.medicalAssignment.count({ where: { ...where, status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } } }), 0),
                readKPIValue(() => prisma.medication.count({ where: { patient: { is: where } } }), 0),
                readKPIValue(() => prisma.nutrition.count({ where: { patient: { is: where } } }), 0),
                readKPIValue(() => prisma.allocation.count({ where: { ...liveWhere(tenantId, unitId), type: "CLINICAL" } }), 0),
                readKPIValue(() => prisma.approval.count({ where: { ...liveWhere(tenantId, unitId), status: "PENDING" } }), 0)
            ]);

            return [
                { label: "Patients", value: patients, tone: "blue" },
                { label: "Active Admissions", value: activeAdmissions, tone: "green" },
                { label: "Critical Vitals", value: criticalVitals, tone: "rose" },
                { label: "Medical Assignments", value: medicalAssignments, tone: "teal" },
                { label: "Medications", value: medications, tone: "violet" },
                { label: "Nutrition Plans", value: nutritionPlans, tone: "amber" },
                { label: "Clinical Care", value: clinicalAllocations, tone: "blue" },
                { label: "Pending Approvals", value: pendingApprovals, tone: "amber" }
            ];
        },
        trend: async (tenantId, unitId) => {
            const windows = buildMonthWindows();
            return Promise.all(windows.map(async (window) => ({
                name: window.label,
                patients: await countInWindow(prisma.patient, baseWhere(tenantId, unitId), window),
                vitals: await countInWindow(prisma.vitalSign, liveWhere(tenantId, unitId), window),
                assignments: await countInWindow(prisma.medicalAssignment, baseWhere(tenantId, unitId), window)
            })));
        }
    },
    UA: {
        title: "UA Dashboard",
        subtitle: "Ambulance service monitoring for bookings, dispatch, calls, billing, and field duty.",
        accent: "#F97316",
        kpis: async (tenantId, unitId) => {
            const where = liveWhere(tenantId, unitId);
            const [bookings, dispatchTasks, fieldDuty, emergencyCalls, missedCalls, billing, maintenance, staff] = await Promise.all([
                readKPIValue(() => prisma.ambulanceTrip.count({ where: baseWhere(tenantId, unitId) }), 0),
                readKPIValue(() => prisma.ambulanceTrip.count({ where: { ...baseWhere(tenantId, unitId), status: { in: ["REQUESTED", "DISPATCH_READY", "DISPATCHED"] } } }), 0),
                readKPIValue(() => prisma.ambulanceTrip.count({ where: { ...baseWhere(tenantId, unitId), status: { in: ["EN_ROUTE", "ARRIVED"] } } }), 0),
                readKPIValue(() => prisma.callHistory.count({ where: { ...baseWhere(tenantId, unitId), direction: "inbound" } }), 0),
                readKPIValue(() => prisma.callHistory.count({ where: { ...baseWhere(tenantId, unitId), status: "missed" } }), 0),
                readKPIValue(() => prisma.accountTransaction.aggregate({ _sum: { amount: true }, where: { ...where, type: "INVOICE", category: "Ambulance Services" } }), { _sum: { amount: 0 } }),
                readKPIValue(() => prisma.ambulanceVehicle.count({ where: { ...baseWhere(tenantId, unitId), status: "MAINTENANCE" } }), 0),
                readKPIValue(() => prisma.staff.count({ where: { tenantId, unitId, isAvailable: true } }), 0)
            ]);

            return [
                { label: "Bookings", value: bookings, tone: "orange" },
                { label: "Dispatch Active", value: dispatchTasks, tone: "blue" },
                { label: "Field Duty", value: fieldDuty, tone: "teal" },
                { label: "Emergency Calls", value: emergencyCalls, tone: "rose" },
                { label: "Missed Calls", value: missedCalls, tone: "amber" },
                { label: "Billing", value: billing._sum.amount || 0, format: "currency", tone: "green" },
                { label: "Maintenance", value: maintenance, tone: "violet" },
                { label: "Active Staff", value: staff, tone: "blue" }
            ];
        },
        trend: async (tenantId, unitId) => {
            const windows = buildMonthWindows();
            return Promise.all(windows.map(async (window) => ({
                name: window.label,
                calls: await countInWindow(prisma.callHistory, baseWhere(tenantId, unitId), window),
                bookings: await countInWindow(prisma.ambulanceTrip, baseWhere(tenantId, unitId), window),
                billing: (await readKPIValue(() => prisma.accountTransaction.aggregate({
                    _sum: { amount: true },
                    where: { ...liveWhere(tenantId, unitId), type: "INVOICE", category: "Ambulance Services", createdAt: { gte: window.start, lt: window.end } }
                }), { _sum: { amount: 0 } }))._sum.amount || 0
            })));
        }
    },
    UEO: {
        title: "UEO Dashboard",
        subtitle: "Enquiry office monitoring for leads, follow-ups, admissions, complaints, and omnichannel.",
        accent: "#14B8A6",
        kpis: async (tenantId, unitId) => {
            const where = liveWhere(tenantId, unitId);
            const [activeEnquiries, newEnquiries, followups, admissions, complaints, feedbacks, conversations, missedCalls] = await Promise.all([
                readKPIValue(() => prisma.enquiry.count({ where: { ...where, status: { in: ["NEW", "FOLLOW_UP", "IN_PROGRESS"] } } }), 0),
                readKPIValue(() => prisma.enquiry.count({ where: { ...where, status: "NEW" } }), 0),
                readKPIValue(() => prisma.followUp.count({ where: { ...where, outcome: "PENDING" } }), 0),
                readKPIValue(() => prisma.admission.count({ where: baseWhere(tenantId, unitId) }), 0),
                readKPIValue(() => prisma.complaint.count({ where: { ...where, status: { in: ["OPEN", "ASSIGNED"] } } }), 0),
                readKPIValue(() => prisma.feedback.count({ where }), 0),
                readKPIValue(() => prisma.conversation.count({ where: baseWhere(tenantId, unitId) }), 0),
                readKPIValue(() => prisma.callHistory.count({ where: { ...baseWhere(tenantId, unitId), status: "missed" } }), 0)
            ]);

            return [
                { label: "Active Enquiries", value: activeEnquiries, tone: "teal" },
                { label: "New Leads", value: newEnquiries, tone: "blue" },
                { label: "Follow-ups", value: followups, tone: "amber" },
                { label: "Admissions", value: admissions, tone: "green" },
                { label: "Complaints", value: complaints, tone: "rose" },
                { label: "Feedbacks", value: feedbacks, tone: "violet" },
                { label: "Conversations", value: conversations, tone: "blue" },
                { label: "Missed Calls", value: missedCalls, tone: "amber" }
            ];
        },
        trend: async (tenantId, unitId) => {
            const windows = buildMonthWindows();
            return Promise.all(windows.map(async (window) => ({
                name: window.label,
                enquiries: await countInWindow(prisma.enquiry, liveWhere(tenantId, unitId), window),
                followups: await countInWindow(prisma.followUp, liveWhere(tenantId, unitId), window),
                complaints: await countInWindow(prisma.complaint, liveWhere(tenantId, unitId), window)
            })));
        }
    }
};

export const getOrganizationDashboard = async (tenantId, unitId, orgCode) => {
    const normalizedCode = String(orgCode || "").toUpperCase();
    const definition = organizationDefinitions[normalizedCode];

    if (!definition) {
        const error = new Error("Unsupported organization dashboard");
        error.statusCode = 404;
        throw error;
    }

    const [kpis, trend, tasks, activities] = await Promise.all([
        definition.kpis(tenantId, unitId),
        definition.trend(tenantId, unitId),
        readKPIValue(() => prisma.task.groupBy({
            by: ["status"],
            _count: { _all: true },
            where: liveWhere(tenantId, unitId)
        }), []),
        readKPIValue(() => prisma.workflowLog.findMany({
            where: liveWhere(tenantId, unitId),
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, entityType: true, toState: true, notes: true, createdAt: true }
        }), [])
    ]);

    return {
        code: normalizedCode,
        title: definition.title,
        subtitle: definition.subtitle,
        accent: definition.accent,
        kpis,
        trend,
        taskStatus: tasks.map((item) => ({ name: item.status, value: item._count._all })),
        activities: activities.map((item) => ({
            id: item.id,
            title: `${item.entityType} moved to ${item.toState}`,
            description: item.notes || "Workflow activity updated",
            createdAt: item.createdAt
        }))
    };
};

// Caching layer for analytics
const cache = new Map();

export const cachedKPIs = async (key, fn) => {
    if (cache.has(key)) return cache.get(key);

    const data = await fn();
    cache.set(key, data);

    // Expiry after 5 minutes
    setTimeout(() => cache.delete(key), 5 * 60 * 1000);

    return data;
};


export const getGlobalActivities = async (tenantId, unitId) => {
    const where = liveWhere(tenantId, unitId);
    
    const [trips, admissions, transactions, workflows] = await Promise.all([
        readKPIValue(() => prisma.ambulanceTrip.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 10
        }), []),
        readKPIValue(() => prisma.admission.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 10
        }), []),
        readKPIValue(() => prisma.accountTransaction.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 10
        }), []),
        readKPIValue(() => prisma.workflowLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 10
        }), [])
    ]);

    const activities = [
        ...trips.map(t => ({
            id: t.id,
            type: 'AMBULANCE',
            title: `Ambulance Dispatch`,
            description: `Trip ${t.id.slice(-6).toUpperCase()}`,
            status: t.status || 'NEW',
            timestamp: t.createdAt,
            source: 'UA'
        })),
        ...admissions.map(a => ({
            id: a.id,
            type: 'ADMISSION',
            title: `New Admission`,
            description: `Admission ${a.id.slice(-6).toUpperCase()}`,
            status: a.status || 'NEW',
            timestamp: a.createdAt,
            source: 'UHC'
        })),
        ...transactions.map(t => ({
            id: t.id,
            type: 'FINANCE',
            title: `${t.type === 'INVOICE' ? 'Invoice Generated' : 'Payment Received'}`,
            description: `${t.category || 'Service'} - Rs ${t.amount || 0}`,
            status: t.status || 'NEW',
            timestamp: t.createdAt,
            source: 'FINANCE'
        })),
        ...workflows.map(w => ({
            id: w.id,
            type: 'WORKFLOW',
            title: `${w.entityType || 'Workflow'} Update`,
            description: w.notes || `Moved to ${w.toState}`,
            status: w.toState || 'NEW',
            timestamp: w.createdAt,
            source: 'WORKFLOW'
        }))
    ];

    return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);
};

