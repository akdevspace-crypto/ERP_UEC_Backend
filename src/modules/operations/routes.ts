import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../app/prisma.js';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';

const router = Router();

const getScope = (req: any) => ({
    tenantId: req.user.tenantId,
    unitId: req.user.unitId
});

const laundrySchema = z.object({
    patientId: z.string().uuid(),
    status: z.string().min(1).optional().default('COLLECTED')
});

const laundryStatusSchema = z.object({
    status: z.string().min(1)
});

const maintenanceSchema = z.object({
    type: z.string().min(1),
    status: z.string().min(1).optional().default('PENDING')
});

const maintenanceStatusSchema = z.object({
    status: z.string().min(1)
});

const mealPrepSchema = z.object({
    nutritionId: z.string().uuid()
});

const mealPrepStatusSchema = z.object({
    status: z.enum(['PENDING', 'PREPARING', 'PREPARED', 'SERVED'])
});

const wasteSchema = z.object({
    category: z.string().min(1),
    source: z.string().min(1),
    quantity: z.coerce.number().min(0).optional().default(0),
    disposalMethod: z.string().min(1).optional().default('Pending disposal'),
    remarks: z.string().optional().default('')
});

const wasteStatusSchema = z.object({
    status: z.enum(['COLLECTED', 'SEGREGATED', 'DISPOSED', 'COMPLETED'])
});

const mealPrepEntityType = 'MEAL_PREP';
const wasteEntityType = 'WASTE_MANAGEMENT';

const parseNotes = (notes?: string | null) => {
    if (!notes) return {};
    try {
        return JSON.parse(notes);
    } catch {
        return { remarks: notes };
    }
};

const ensurePatientInScope = async (patientId: string, scope: { tenantId: string; unitId: string }) => {
    const patient = await (prisma as any).patient.findFirst({
        where: {
            id: patientId,
            tenantId: scope.tenantId
        },
        select: { id: true }
    });

    if (!patient) {
        const error: any = new Error('Patient not found for this unit');
        error.status = 404;
        throw error;
    }
};

const getMealPrepRecords = async (tenantId: string, unitId?: string) => {
    const logs = await (prisma as any).workflowLog.findMany({
        where: {
            entityType: mealPrepEntityType,
            tenantId,
            isDeleted: false
        },
        orderBy: { createdAt: 'desc' }
    });

    const latestByNutrition = new Map<string, any>();
    for (const log of logs) {
        if (!latestByNutrition.has(log.entityId)) {
            latestByNutrition.set(log.entityId, log);
        }
    }

    const nutritionIds = Array.from(latestByNutrition.keys());
    if (!nutritionIds.length) return [];

    const plans = await (prisma as any).nutrition.findMany({
        where: {
            id: { in: nutritionIds },
            patient: { tenantId }
        },
        include: { patient: true }
    });

    const planById = new Map(plans.map((plan: any) => [plan.id, plan]));

    return nutritionIds
        .map((nutritionId) => {
            const log = latestByNutrition.get(nutritionId);
            const nutrition = planById.get(nutritionId);
            if (!nutrition) return null;

            return {
                id: log.id,
                nutritionId,
                status: log.toState,
                actionBy: log.actionBy,
                notes: log.notes,
                tenantId: log.tenantId,
                unitId: log.unitId || unitId,
                createdAt: log.createdAt,
                updatedAt: log.updatedAt,
                nutrition
            };
        })
        .filter(Boolean);
};

const getWorkflowRecords = async (entityType: string, tenantId: string) => {
    const logs = await (prisma as any).workflowLog.findMany({
        where: {
            entityType,
            tenantId,
            isDeleted: false
        },
        orderBy: { createdAt: 'desc' }
    });

    const latestByEntity = new Map<string, any>();
    for (const log of logs) {
        if (!latestByEntity.has(log.entityId)) {
            latestByEntity.set(log.entityId, log);
        }
    }

    return Array.from(latestByEntity.values()).map((log: any) => ({
        id: log.id,
        entityId: log.entityId,
        status: log.toState,
        actionBy: log.actionBy,
        tenantId: log.tenantId,
        unitId: log.unitId,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt,
        ...parseNotes(log.notes)
    }));
};

router.get('/patients', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const patients = await (prisma as any).patient.findMany({
            where: {
                tenantId: req.user.tenantId
            },
            select: {
                id: true,
                name: true,
                unitId: true,
                createdAt: true
            },
            orderBy: [
                { createdAt: 'desc' },
                { name: 'asc' }
            ]
        });

        res.json({ success: true, data: patients });
    } catch (error: any) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

router.get('/nutrition-plans', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const plans = await (prisma as any).nutrition.findMany({
            where: {
                patient: {
                    tenantId: req.user.tenantId
                }
            },
            include: { patient: true },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: plans });
    } catch (error: any) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

router.patch('/nutrition-plans/:id/diet', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const { restrictions, texture, notes } = req.body;
        
        const plan = await (prisma as any).nutrition.findUnique({ where: { id } });
        if (!plan) return res.status(404).json({ success: false, message: 'Nutrition plan not found' });

        const updatedPlan = await (prisma as any).nutrition.update({
            where: { id },
            data: {
                metadata: {
                    ...(typeof plan.metadata === 'object' ? plan.metadata : {}),
                    dietaryRestrictions: restrictions,
                    textureModification: texture,
                    dietaryNotes: notes
                }
            }
        });

        res.json({ success: true, data: updatedPlan });
    } catch (error: any) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

router.get('/meal-preps', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const records = await getMealPrepRecords(req.user.tenantId, req.user.unitId);
        res.json({ success: true, data: records });
    } catch (error: any) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

router.post('/meal-preps', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const validated = mealPrepSchema.parse(req.body);
        const plan = await (prisma as any).nutrition.findFirst({
            where: {
                id: validated.nutritionId,
                patient: { tenantId: scope.tenantId }
            },
            include: { patient: true }
        });

        if (!plan) {
            return res.status(404).json({ success: false, message: 'Nutrition plan not found' });
        }

        const existing = await (prisma as any).workflowLog.findFirst({
            where: {
                entityType: mealPrepEntityType,
                entityId: validated.nutritionId,
                tenantId: scope.tenantId,
                isDeleted: false
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!existing) {
            await (prisma as any).workflowLog.create({
                data: {
                    entityType: mealPrepEntityType,
                    entityId: validated.nutritionId,
                    fromState: null,
                    toState: 'PENDING',
                    actionBy: req.user.id || req.user.email || 'System',
                    notes: `Meal preparation created for ${plan.patient?.name || 'patient'}`,
                    ...scope
                }
            });
        }

        const records = await getMealPrepRecords(scope.tenantId, scope.unitId);
        const record = records.find((item: any) => item.nutritionId === validated.nutritionId);
        res.status(existing ? 200 : 201).json({ success: true, data: record, message: existing ? 'Meal prep already exists' : 'Meal prep created successfully' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.patch('/meal-preps/:nutritionId/status', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const validated = mealPrepStatusSchema.parse(req.body);
        const current = await (prisma as any).workflowLog.findFirst({
            where: {
                entityType: mealPrepEntityType,
                entityId: req.params.nutritionId,
                tenantId: scope.tenantId,
                isDeleted: false
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!current) {
            return res.status(404).json({ success: false, message: 'Meal prep not found' });
        }

        await (prisma as any).workflowLog.create({
            data: {
                entityType: mealPrepEntityType,
                entityId: req.params.nutritionId,
                fromState: current.toState,
                toState: validated.status,
                actionBy: req.user.id || req.user.email || 'System',
                notes: `Meal prep moved to ${validated.status}`,
                ...scope
            }
        });

        const records = await getMealPrepRecords(scope.tenantId, scope.unitId);
        const record = records.find((item: any) => item.nutritionId === req.params.nutritionId);
        res.json({ success: true, data: record, message: 'Meal prep status updated successfully' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.get('/waste-records', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const records = await getWorkflowRecords(wasteEntityType, req.user.tenantId);
        res.json({ success: true, data: records });
    } catch (error: any) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

router.post('/waste-records', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const validated = wasteSchema.parse(req.body);
        const entityId = randomUUID();

        await (prisma as any).workflowLog.create({
            data: {
                entityType: wasteEntityType,
                entityId,
                fromState: null,
                toState: 'COLLECTED',
                actionBy: req.user.id || req.user.email || 'System',
                notes: JSON.stringify(validated),
                ...scope
            }
        });

        const records = await getWorkflowRecords(wasteEntityType, scope.tenantId);
        const record = records.find((item: any) => item.entityId === entityId);
        res.status(201).json({ success: true, data: record, message: 'Waste record created successfully' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.patch('/waste-records/:entityId/status', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const validated = wasteStatusSchema.parse(req.body);
        const current = await (prisma as any).workflowLog.findFirst({
            where: {
                entityType: wasteEntityType,
                entityId: req.params.entityId,
                tenantId: scope.tenantId,
                isDeleted: false
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!current) {
            return res.status(404).json({ success: false, message: 'Waste record not found' });
        }

        await (prisma as any).workflowLog.create({
            data: {
                entityType: wasteEntityType,
                entityId: req.params.entityId,
                fromState: current.toState,
                toState: validated.status,
                actionBy: req.user.id || req.user.email || 'System',
                notes: current.notes,
                ...scope
            }
        });

        const records = await getWorkflowRecords(wasteEntityType, scope.tenantId);
        const record = records.find((item: any) => item.entityId === req.params.entityId);
        res.json({ success: true, data: record, message: 'Waste status updated successfully' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.get('/laundry', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const records = await (prisma as any).laundry.findMany({
            where: getScope(req),
            include: { patient: true },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: records });
    } catch (error: any) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

router.post('/laundry', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const validated = laundrySchema.parse(req.body);
        await ensurePatientInScope(validated.patientId, scope);

        const record = await (prisma as any).laundry.create({
            data: {
                patientId: validated.patientId,
                status: validated.status,
                ...scope
            },
            include: { patient: true }
        });

        res.status(201).json({ success: true, data: record, message: 'Laundry record created successfully' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.patch('/laundry/:id', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const validated = laundryStatusSchema.parse(req.body);
        const existing = await (prisma as any).laundry.findFirst({
            where: {
                id: req.params.id,
                ...scope
            },
            select: { id: true }
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: 'Laundry record not found' });
        }

        const record = await (prisma as any).laundry.update({
            where: { id: existing.id },
            data: { status: validated.status },
            include: { patient: true }
        });

        res.json({ success: true, data: record, message: 'Laundry status updated successfully' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.get('/maintenance', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const records = await (prisma as any).maintenance.findMany({
            where: getScope(req),
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: records });
    } catch (error: any) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

router.post('/maintenance', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const validated = maintenanceSchema.parse(req.body);
        const record = await (prisma as any).maintenance.create({
            data: {
                type: validated.type,
                status: validated.status,
                ...scope
            }
        });

        res.status(201).json({ success: true, data: record, message: 'Maintenance ticket created successfully' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.patch('/maintenance/:id', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const validated = maintenanceStatusSchema.parse(req.body);
        const existing = await (prisma as any).maintenance.findFirst({
            where: {
                id: req.params.id,
                ...scope
            },
            select: { id: true }
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: 'Maintenance ticket not found' });
        }

        const record = await (prisma as any).maintenance.update({
            where: { id: existing.id },
            data: { status: validated.status }
        });

        res.json({ success: true, data: record, message: 'Maintenance status updated successfully' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

// POST /patients - Patient Registration
router.post('/patients', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const { name, dob, age, gender, bloodGroup, primaryContact, emergencyContact, email, phone, address, unitId } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        // Duplicate check based on phone or email
        if (phone) {
            const existing = await (prisma as any).patient.findFirst({
                where: { tenantId: req.user.tenantId, phone }
            });
            if (existing) return res.status(409).json({ success: false, message: 'Patient with this phone already exists' });
        }

        const currentYear = new Date().getFullYear();
        const resolvedUnitId = unitId || req.context?.unitId || req.user.unitId;
        const elderId = await generateRefNumber(`UEC-ELD-${currentYear}`, req.user.tenantId, resolvedUnitId);

        const newPatient = await (prisma as any).patient.create({
            data: {
                elderId,
                name, dob, age: age ? parseInt(age) : null, gender, bloodGroup, primaryContact, emergencyContact, email, phone, address,
                unitId: unitId || req.context?.unitId || req.user.unitId,
                tenantId: req.user.tenantId
            }
        });

        res.status(201).json({ success: true, data: newPatient });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /patients/:id
router.get('/patients/:id', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const patient = await (prisma as any).patient.findUnique({
            where: { id: req.params.id, tenantId: req.user.tenantId }
        });
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
        res.json({ success: true, data: patient });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /patients/:id
router.put('/patients/:id', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const { name, dob, age, gender, bloodGroup, primaryContact, emergencyContact, email, phone, address, unitId } = req.body;
        
        const existing = await (prisma as any).patient.findUnique({
            where: { id: req.params.id, tenantId: req.user.tenantId }
        });
        if (!existing) return res.status(404).json({ success: false, message: 'Patient not found' });

        const updatedPatient = await (prisma as any).patient.update({
            where: { id: req.params.id },
            data: {
                name, dob, age: age ? parseInt(age) : null, gender, bloodGroup, primaryContact, emergencyContact, email, phone, address,
                unitId: unitId || existing.unitId
            }
        });

        res.json({ success: true, data: updatedPatient });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// POST /admissions - Admission
router.post('/admissions', auth, enforceTenant, async (req: any, res: any) => {
    try {
        console.log('ADMISSION PAYLOAD:', req.body);
        const { enquiryId, patientId, admissionPriority, healthCondition, clinicalStatus, floor, room, bed, unitId } = req.body;
        
        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }

        let actualEnquiryId = enquiryId;
        if (enquiryId) {
            // Check if it's a refNo (e.g., ENQ-12345) rather than a UUID
            if (enquiryId.startsWith('ENQ-')) {
                const enquiry = await (prisma as any).enquiry.findUnique({
                    where: { refNo: enquiryId }
                });
                if (!enquiry) {
                    return res.status(400).json({ success: false, message: 'Invalid Enquiry Reference Number' });
                }
                actualEnquiryId = enquiry.id;
            }
        }

        const newAdmission = await (prisma as any).admission.create({
            data: {
                ...(actualEnquiryId ? { enquiryId: actualEnquiryId } : {}),
                patientId, admissionPriority, healthCondition, clinicalStatus, floor, room, bed,
                unitId: unitId || req.context?.unitId || req.user.unitId,
                tenantId: req.user.tenantId,
                status: 'ACTIVE'
            }
        });

        // Automatically create a Clinical Care Allocation
        const allocationRef = await generateRefNumber('ALC', req.user.tenantId, newAdmission.unitId, prisma);
        await (prisma as any).allocation.create({
            data: {
                refNo: allocationRef,
                ...(actualEnquiryId ? { enquiryId: actualEnquiryId } : {}),
                admissionId: newAdmission.id,
                type: 'CLINICAL',
                status: 'ALLOCATED',
                tenantId: req.user.tenantId,
                unitId: newAdmission.unitId,
                metadata: {
                    handoffSource: 'ADMISSION_SYSTEM'
                }
            }
        });

        res.status(201).json({ success: true, data: newAdmission });
    } catch (error: any) {
        console.error("ADMISSION CREATION ERROR:", error);
        res.status(500).json({ 
            success: false, 
            message: error instanceof Error ? error.message : (error?.message || String(error)),
            error: error
        });
    }
});

// POST /admissions/:id/discharge - Discharge [DEPRECATED]
router.post('/admissions/:id/discharge', auth, enforceTenant, async (req: any, res: any) => {
    return res.status(400).json({
        success: false,
        message: 'This route is deprecated. Please use the Service Closing Agreement workflow (/api/v1/closing-agreements).'
    });
});

// GET /admissions - List all active admissions
router.get('/admissions', auth, enforceTenant, async (req: any, res: any) => {
    try {
        const admissions = await (prisma as any).admission.findMany({
            where: { 
                tenantId: req.user.tenantId,
                unitId: req.context?.unitId || req.user.unitId,
                status: { not: 'DISCHARGED' } 
            },
            include: {
                patient: { select: { name: true, phone: true } }
            },
            orderBy: { admittedAt: 'desc' }
        });
        res.json({ success: true, data: admissions });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});
export default router;



