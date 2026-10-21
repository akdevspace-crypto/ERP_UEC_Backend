import { Router } from 'express';
import { prisma } from '../../app/prisma.js';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { getReadScope } from '../../shared/utils/rbac.js';
import { z } from 'zod';
import { success, errorResponse } from '../../shared/utils/response.js';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';

const router = Router();

const getScope = (req: any) => ({
    tenantId: req.user.tenantId,
    unitId: req.user.unitId
});

// Helper for 6-month windows
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

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

const countInWindow = async (model: any, scope: any, window: any) => {
    return model.count({
        where: {
            ...scope,
            createdAt: {
                gte: window.start,
                lt: window.end
            }
        }
    });
};

// ==========================================
// 1. DASHBOARDS
// ==========================================

router.get('/dashboard/admin', auth, enforceTenant, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const windows = buildMonthWindows();
        const taskScope = { ...scope, status: { notIn: ['COMPLETED', 'CANCELLED'] } };

        const [patientsCount, tasksCount, vitalsCount] = await Promise.all([
            prisma.patient.count({ where: scope }),
            prisma.task.count({ where: taskScope }),
            prisma.vitalSign.count({ where: scope })
        ]);

        const residentsData = await Promise.all(windows.map(w => countInWindow(prisma.patient, scope, w)));
        const tasksData = await Promise.all(windows.map(w => countInWindow(prisma.task, taskScope, w)));
        const vitalsData = await Promise.all(windows.map(w => countInWindow(prisma.vitalSign, scope, w)));

        return success(res, {
            trend: {
                labels: windows.map(w => w.label),
                datasets: [
                    { label: 'Residents', data: residentsData },
                    { label: 'Active Tasks', data: tasksData },
                    { label: 'Vitals Logged', data: vitalsData }
                ]
            },
            summary: {
                totalResidents: patientsCount,
                pendingTasks: tasksCount,
                vitalsToday: vitalsCount
            }
        });
    } catch (error) {
        next(error);
    }
});

router.get('/dashboard/finance', auth, enforceTenant, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const windows = buildMonthWindows();

        const expensesCount = await prisma.expense.count({ where: scope });
        const invoicesCount = await prisma.invoice.count({ where: scope });
        const costCount = await prisma.patientDailyCost.count({ where: scope });

        const expensesData = await Promise.all(windows.map(async w => {
            const count = await countInWindow(prisma.expense, scope, w);
            return count * 1000;
        }));
        
        const invoicesData = await Promise.all(windows.map(w => countInWindow(prisma.invoice, scope, w)));
        
        const costData = await Promise.all(windows.map(async w => {
            const count = await countInWindow(prisma.patientDailyCost, scope, w);
            return count * 500;
        }));

        return success(res, {
            trend: {
                labels: windows.map(w => w.label),
                datasets: [
                    { label: 'Expense Volume', data: expensesData },
                    { label: 'Invoices Generated', data: invoicesData },
                    { label: 'Care Spend', data: costData }
                ]
            }
        });
    } catch (error) {
        next(error);
    }
});

// ==========================================
// 2. ELDER ADL
// ==========================================

const adlSchema = z.object({
    patientId: z.string().uuid(),
    status: z.string().min(1),
    mood: z.string().optional(),
    socialActivity: z.string().optional(),
    sleepQuality: z.string().optional(),
    notes: z.string().optional()
});

router.post('/adl', auth, enforceTenant, async (req, res, next) => {
    try {
        const payload = adlSchema.parse(req.body);
        const scope = getScope(req);
        
        // We inject the extra Elder-specific metadata into a JSON field or use the basic ADL if present.
        // For simplicity we create a Task or store it in CaregiverVitalChart if the table is missing.
        // Let's use a standard Task type for Elder ADL.
        const record = await prisma.aDLRecord.create({
            data: {
                notes: `Mood: ${payload.mood || 'N/A'}, Social: ${payload.socialActivity || 'N/A'}, Sleep: ${payload.sleepQuality || 'N/A'}. Notes: ${payload.notes || ''}`,
                patientId: payload.patientId,
                status: payload.status,
                recordedById: (req as any).user.id,
                tenantId: scope.tenantId,
                unitId: scope.unitId
            }
        });

        return success(res, record, { message: 'Elder ADL saved successfully' });
    } catch (error) {
        next(error);
    }
});

router.get('/adl', auth, enforceTenant, async (req, res, next) => {
    try {
        const scope = getReadScope(req);
        const patientId = req.query.patientId ? String(req.query.patientId).trim() : undefined;
        const records = await prisma.aDLRecord.findMany({
            where: { 
                ...scope,
                ...(patientId ? { patientId } : {})
            },
            orderBy: { createdAt: 'desc' },
            include: {
                patient: { select: { id: true, name: true } }
            }
        });
        return success(res, records);
    } catch (error) {
        next(error);
    }
});

// ==========================================
// 3. ELDER BILLING
// ==========================================

const billingSchema = z.object({
    patientId: z.string().uuid(),
    amount: z.number().positive(),
    type: z.string(),
    description: z.string().optional()
});

router.post('/billing/generate', auth, enforceTenant, async (req, res, next) => {
    try {
        const payload = billingSchema.parse(req.body);
        const scope = getScope(req);
        
        const year = new Date().getFullYear();
        const refPrefix = `UEC-INV-${year}`;
        const refNo = await generateRefNumber(refPrefix, scope.tenantId, scope.unitId);

        // Generate an invoice for the Elder Care resident
        // Using existing Invoice model, assuming it has these fields.
        const invoice = await prisma.invoice.create({
            data: {
                refNo,
                clientId: payload.patientId, // Reusing clientId for patientId 
                amount: payload.amount,
                status: 'CREATED',
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                metadata: {
                    type: payload.type,
                    description: payload.description || 'Monthly Boarding Fee',
                    isElderCare: true,
                    balanceAmount: payload.amount,
                    paidAmount: 0
                }
            }
        });

        return success(res, invoice, { message: 'Elder billing invoice generated successfully' });
    } catch (error) {
        next(error);
    }
});

router.post('/billing/manual-generate', auth, enforceTenant, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const body = req.body;

        // HOME CARE SUBSIDY PROTECTION
        // Ensure no subsidy data is stored if bill type is Home Care.
        if (body.billType === 'HOME_CARE') {
            if (body.homeFields) {
                Object.keys(body.homeFields).forEach(key => {
                    if (body.homeFields[key] && body.homeFields[key].subsidy !== undefined) {
                        delete body.homeFields[key].subsidy;
                    }
                });
            }
        }

        const year = new Date().getFullYear();
        const refPrefix = `UEC-INV-${year}`;
        const refNo = await generateRefNumber(refPrefix, scope.tenantId, scope.unitId);

        const invoice = await prisma.invoice.create({
            data: {
                refNo,
                patientId: body.patientId || null,
                contractStartDate: body.contractStartDate ? new Date(body.contractStartDate) : null,
                contractEndDate: body.contractEndDate ? new Date(body.contractEndDate) : null,
                amount: body.totalAmount || 0,
                status: 'FINALIZED',
                isFinalized: true, // "NO Correcting NO" requirement
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                metadata: body, // Save the entire huge JSON payload for records
            }
        });

        return success(res, invoice, { message: 'Manual billing invoice finalized and saved successfully' });
    } catch (error) {
        next(error);
    }
});

router.get('/billing/history', auth, enforceTenant, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const { refNo } = req.query;

        if (!refNo || typeof refNo !== 'string') {
            return res.status(400).json({ success: false, message: 'Bill ID (refNo) is required' });
        }

        const invoice = await prisma.invoice.findUnique({
            where: { refNo }
        });

        if (!invoice || invoice.tenantId !== scope.tenantId) {
            return res.status(404).json({ success: false, message: 'Bill not found.' });
        }

        return success(res, invoice, { message: 'Invoice retrieved successfully' });
    } catch (err) {
        next(err);
    }
});

router.patch('/billing/:id/mark-sent', auth, enforceTenant, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const { id } = req.params;

        const invoice = await prisma.invoice.update({
            where: {
                id,
                tenantId: scope.tenantId
            },
            data: {
                isSent: true,
                sentAt: new Date()
            }
        });

        return success(res, invoice, { message: 'Invoice marked as sent successfully' });
    } catch (error) {
        next(error);
    }
});

// ==========================================
// 4. UEC EVENTS
// ==========================================

const eventSchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.string(), // YYYY-MM-DD format expected
    startTime: z.string(),
    endTime: z.string(),
    category: z.string(), // e.g. RECREATION, THERAPY
    location: z.string().optional()
});

router.get('/events', auth, enforceTenant, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const { start, end } = req.query; // Optional date filters

        const where: any = {
            ...scope,
            type: 'UEC_EVENT'
        };

        if (start && end) {
            where.scheduledAt = {
                gte: new Date(start as string),
                lte: new Date(end as string)
            };
        }

        const events = await prisma.task.findMany({
            where,
            orderBy: { scheduledAt: 'asc' }
        });

        // Map them to a more frontend-friendly event shape
        const formattedEvents = events.map((event: any) => ({
            id: event.id,
            title: event.title,
            description: event.description,
            date: event.scheduledAt ? event.scheduledAt.toISOString().split('T')[0] : null,
            startTime: event.metadata && typeof event.metadata === 'object' && 'startTime' in event.metadata ? (event.metadata as any).startTime : '',
            endTime: event.metadata && typeof event.metadata === 'object' && 'endTime' in event.metadata ? (event.metadata as any).endTime : '',
            category: event.metadata && typeof event.metadata === 'object' && 'category' in event.metadata ? (event.metadata as any).category : 'OTHER',
            location: event.metadata && typeof event.metadata === 'object' && 'location' in event.metadata ? (event.metadata as any).location : ''
        }));

        return success(res, formattedEvents);
    } catch (error) {
        next(error);
    }
});

router.post('/events', auth, enforceTenant, async (req, res, next) => {
    try {
        const payload = eventSchema.parse(req.body);
        const scope = getScope(req);
        
        const scheduledAt = new Date(`${payload.date}T${payload.startTime}:00`);

        const event = await prisma.task.create({
            data: {
                title: payload.title,
                description: payload.description || '',
                type: 'UEC_EVENT',
                status: 'SCHEDULED',
                scheduledAt,
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                metadata: {
                    startTime: payload.startTime,
                    endTime: payload.endTime,
                    category: payload.category,
                    location: payload.location || ''
                }
            }
        });

        return success(res, event, { message: 'UEC Event created successfully' });
    } catch (error) {
        next(error);
    }
});

// ==========================================
// 5. UEC INCIDENTS
// ==========================================

const incidentSchema = z.object({
    patientId: z.string().uuid(),
    title: z.string(),
    description: z.string(),
    severity: z.string(), // e.g. LOW, MEDIUM, HIGH, CRITICAL
    date: z.string(), // ISO string
    witnesses: z.string().optional(),
    actionTaken: z.string().optional()
});

router.get('/incidents', auth, enforceTenant, async (req, res, next) => {
    try {
        const scope = getReadScope(req);
        const patientId = req.query.patientId ? String(req.query.patientId).trim() : undefined;

        const where: any = {
            ...scope
        };

        if (patientId) {
            where.patientId = patientId;
        }

        const incidents = await prisma.incident.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                patient: {
                    select: {
                        name: true
                    }
                }
            }
        });

        // Map them to a frontend-friendly incident shape
        const formattedIncidents = incidents.map((incident: any) => {
            return {
                id: incident.id,
                patientId: incident.patientId,
                patientName: incident.patient?.name || 'Unknown Patient',
                title: incident.title,
                description: incident.description,
                date: incident.date,
                severity: incident.severity,
                witnesses: incident.witnesses || '',
                actionTaken: incident.actionTaken || ''
            };
        });

        return success(res, formattedIncidents);
    } catch (error) {
        next(error);
    }
});

router.patch('/incidents/:id/status', auth, enforceTenant, async (req: any, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const scope = getScope(req);
        const userRole = String(req.user.role || '').toUpperCase();

        if (status === 'CLOSED') {
            const allowedRoles = ['SUPER_ADMIN', 'PATIENT_CARE_MANAGER', 'NURSING_MANAGER', 'MEDICAL_MANAGER'];
            if (!allowedRoles.some(role => userRole.includes(role))) {
                return res.status(403).json({ success: false, message: 'Only authorized managers can close incidents.' });
            }
        }

        const incident = await prisma.incident.update({
            where: { id, tenantId: scope.tenantId },
            data: {
                status,
                ...(status === 'CLOSED' ? { closedBy: req.user.id } : {})
            }
        });

        return success(res, incident, { message: `Incident status updated to ${status}` });
    } catch (error) {
        next(error);
    }
});

router.post('/incidents', auth, enforceTenant, async (req, res, next) => {
    try {
        const payload = incidentSchema.parse(req.body);
        const scope = getScope(req);
        
        const incident = await prisma.incident.create({
            data: {
                patientId: payload.patientId,
                title: payload.title,
                description: payload.description,
                date: new Date(payload.date),
                severity: payload.severity,
                witnesses: payload.witnesses || null,
                actionTaken: payload.actionTaken || null,
                tenantId: scope.tenantId,
                unitId: scope.unitId
            }
        });

        return success(res, incident, { message: 'UEC Incident reported successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;
