import { Router } from 'express';
import { auth, enforceTenant, authorizeRoles } from '../../shared/middleware/auth.middleware.js';
import * as controller from './controller.js';

// Previous routes kept for temporary backward compatibility
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../../app/prisma.js';

const adminRoles = ['admin', 'super admin', 'super_admin', 'superadmin'];

const router = Router();

// --- NEW AMBULANCE ROUTES ---

// VEHICLE ROUTES
router.get('/vehicles', auth, enforceTenant, controller.getVehicles);
router.post('/vehicles', auth, enforceTenant, authorizeRoles(...adminRoles, 'fleet manager'), controller.createVehicle);
router.get('/vehicles/:id', auth, enforceTenant, controller.getVehicleById);
router.patch('/vehicles/:id', auth, enforceTenant, authorizeRoles(...adminRoles, 'fleet manager'), controller.updateVehicle);
router.patch('/vehicles/:id/status', auth, enforceTenant, authorizeRoles(...adminRoles, 'fleet manager'), controller.updateVehicleStatus);

// TRIP ROUTES
router.get('/trips', auth, enforceTenant, controller.getTrips);
router.post('/trips', auth, enforceTenant, authorizeRoles(...adminRoles, 'ambulance booking coordinator'), controller.createTrip);
router.get('/trips/:id', auth, enforceTenant, controller.getTripById);
router.patch('/trips/:id', auth, enforceTenant, authorizeRoles(...adminRoles, 'ambulance booking coordinator'), controller.updateTrip);
router.patch('/trips/:id/status', auth, enforceTenant, authorizeRoles(...adminRoles, 'dispatch manager', 'ambulance billing manager'), controller.updateTripStatus);
router.post('/trips/:id/invoice', auth, enforceTenant, authorizeRoles(...adminRoles, 'ambulance billing manager'), controller.generateInvoice);


// --- OLD MOCK ROUTES (TEMPORARILY RETAINED) ---
// Retained to prevent breaking existing UI before Phase 3B-3

const ambulanceEntityType = 'AMBULANCE_RECORD';
const createRecordSchema = z.object({
    type: z.string(),
    status: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional().default({})
});
const updateStatusSchema = z.object({ status: z.string().min(1) });

const parseNotes = (notes?: string | null) => {
    if (!notes) return {};
    try { return JSON.parse(notes); } catch { return { remarks: notes }; }
};

const getRecords = async (scope: { tenantId: string; unitId: string }, type?: string) => {
    const logs = await (prisma as any).workflowLog.findMany({
        where: {
            entityType: ambulanceEntityType,
            tenantId: scope.tenantId,
            unitId: scope.unitId,
            isDeleted: false
        },
        orderBy: { createdAt: 'desc' }
    });

    const latestByEntity = new Map<string, any>();
    for (const log of logs) {
        if (!latestByEntity.has(log.entityId)) latestByEntity.set(log.entityId, log);
    }

    return Array.from(latestByEntity.values())
        .map((log: any) => {
            const notes = parseNotes(log.notes);
            return {
                id: log.id,
                entityId: log.entityId,
                type: notes.type || 'BOOKING',
                status: log.toState,
                actionBy: log.actionBy,
                tenantId: log.tenantId,
                unitId: log.unitId,
                createdAt: log.createdAt,
                updatedAt: log.updatedAt,
                ...(notes.data || {})
            };
        })
        .filter((record: any) => !type || record.type === type);
};

router.get('/records', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const type = typeof req.query.type === 'string' ? req.query.type : undefined;
        const records = await getRecords({ tenantId: req.user.tenantId, unitId: req.context?.unitId || req.user.unitId }, type);
        res.json({ success: true, data: records });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/records', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = { tenantId: req.user.tenantId, unitId: req.context?.unitId || req.user.unitId };
        const validated = createRecordSchema.parse(req.body);
        const entityId = randomUUID();
        const status = validated.status || 'OPEN';

        await (prisma as any).workflowLog.create({
            data: {
                entityType: ambulanceEntityType,
                entityId,
                fromState: null,
                toState: status,
                actionBy: req.user.id || req.user.email || 'System',
                notes: JSON.stringify({ type: validated.type, data: validated.data }),
                ...scope
            }
        });

        const records = await getRecords(scope, validated.type);
        const record = records.find((item: any) => item.entityId === entityId);
        res.status(201).json({ success: true, data: record });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.patch('/records/:entityId/status', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = { tenantId: req.user.tenantId, unitId: req.context?.unitId || req.user.unitId };
        const validated = updateStatusSchema.parse(req.body);
        const current = await (prisma as any).workflowLog.findFirst({
            where: {
                entityType: ambulanceEntityType,
                entityId: req.params.entityId,
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                isDeleted: false
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!current) return res.status(404).json({ success: false, message: 'Not found' });

        await (prisma as any).workflowLog.create({
            data: {
                entityType: ambulanceEntityType,
                entityId: req.params.entityId,
                fromState: current.toState,
                toState: validated.status,
                actionBy: req.user.id || req.user.email || 'System',
                notes: current.notes,
                ...scope
            }
        });

        const notes = parseNotes(current.notes);
        const records = await getRecords(scope, notes.type);
        const record = records.find((item: any) => item.entityId === req.params.entityId);
        res.json({ success: true, data: record });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

export default router;
