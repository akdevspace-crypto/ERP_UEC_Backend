import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../app/prisma.js';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { requirePermission } from '../../shared/middleware/rbac.middleware.js';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';

const isUnitAuthorized = (reqUser: any, targetUnitId?: string) => {
    if (!targetUnitId) return true;
    if (!reqUser) return false;
    const unitAccess = reqUser.unitAccess || [];
    if (unitAccess.includes('*') || unitAccess.includes(targetUnitId) || reqUser.permissions?.includes('ALL_ACCESS') || reqUser.unitId === targetUnitId) {
        return true;
    }
    return false;
};

const hasExplicitPermission = (reqUser: any, module: string, action: string) => {
    const permissions = reqUser?.permissions || [];
    return permissions.includes('ALL_ACCESS') || permissions.includes(`${module}_${action}`.toUpperCase());
};

const getAuthorizedPatient = async (client: any, req: any, patientId: string) => {
    const patient = await client.patient.findFirst({
        where: { id: patientId, tenantId: req.user.tenantId },
        select: { id: true, tenantId: true, unitId: true }
    });

    if (!patient) {
        const error: any = new Error('Patient not found');
        error.status = 404;
        throw error;
    }
    if (!isUnitAuthorized(req.user, patient.unitId)) {
        const error: any = new Error('Not authorized for this patient unit');
        error.status = 403;
        throw error;
    }
    return patient;
};

const getAuthorizedAdmission = async (client: any, req: any, admissionId: string) => {
    const admission = await client.admission.findFirst({
        where: { id: admissionId, tenantId: req.user.tenantId },
        select: { id: true, patientId: true, tenantId: true, unitId: true }
    });

    if (!admission) {
        const error: any = new Error('Admission not found');
        error.status = 404;
        throw error;
    }
    if (!isUnitAuthorized(req.user, admission.unitId)) {
        const error: any = new Error('Not authorized for this admission unit');
        error.status = 403;
        throw error;
    }
    return admission;
};

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
    status: z.string().min(1).optional().default('PENDING'),
    description: z.string().optional().nullable(),
    vehicleId: z.string().optional().nullable(),
    attachments: z.any().optional().nullable(),
    resolvedBy: z.string().optional().nullable()
});

const maintenanceStatusSchema = z.object({
    status: z.string().min(1),
    resolvedBy: z.string().optional().nullable(),
    attachments: z.any().optional().nullable(),
    description: z.string().optional().nullable()
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
                description: req.body.description || null,
                vehicleId: req.body.vehicleId || null,
                attachments: req.body.attachments || null,
                resolvedBy: req.body.resolvedBy || null,
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

        const updateData: any = { status: validated.status };
        if (req.body.resolvedBy !== undefined) updateData.resolvedBy = req.body.resolvedBy;
        if (req.body.attachments !== undefined) updateData.attachments = req.body.attachments;
        if (req.body.description !== undefined) updateData.description = req.body.description;
        const record = await (prisma as any).maintenance.update({
            where: { id: existing.id },
            data: updateData
        });

        res.json({ success: true, data: record, message: 'Maintenance status updated successfully' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

// POST /patients - Patient Registration
router.post('/patients', auth, enforceTenant, requirePermission('PATIENT', 'CREATE', true), async (req: any, res: any) => {
    try {
        const { name, dob, age, gender, bloodGroup, primaryContact, emergencyContact, email, phone, address, unitId } = req.body;
        
        if (unitId && !isUnitAuthorized(req.user, unitId)) {
            return res.status(403).json({ success: false, message: 'Not authorized for this facility' });
        }

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
router.get('/patients/:id', auth, enforceTenant, requirePermission('PATIENT', 'READ', true), async (req: any, res: any) => {
    try {
        const patient = await (prisma as any).patient.findFirst({
            where: {
                id: req.params.id,
                tenantId: req.user.tenantId,
                unitId: req.context?.unitId || req.user.unitId
            }
        });
        if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
        res.json({ success: true, data: patient });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /patients/:id
router.put('/patients/:id', auth, enforceTenant, requirePermission('PATIENT', 'UPDATE', true), async (req: any, res: any) => {
    try {
        const { name, dob, age, gender, bloodGroup, primaryContact, emergencyContact, email, phone, address, unitId } = req.body;
        const activeUnitId = req.context?.unitId || req.user.unitId;
        
        if (unitId && !isUnitAuthorized(req.user, unitId)) {
            return res.status(403).json({ success: false, message: 'Not authorized for this facility' });
        }

        const existing = await (prisma as any).patient.findFirst({
            where: {
                id: req.params.id,
                tenantId: req.user.tenantId,
                unitId: activeUnitId
            }
        });
        if (!existing) return res.status(404).json({ success: false, message: 'Patient not found' });

        const updatedPatient = await (prisma as any).patient.update({
            where: { id: req.params.id },
            data: {
                name, dob, age: age ? parseInt(age) : null, gender, bloodGroup, primaryContact, emergencyContact, email, phone, address,
                unitId: unitId || activeUnitId
            }
        });

        res.json({ success: true, data: updatedPatient });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// POST /admissions - Admission
router.post('/admissions', auth, enforceTenant, requirePermission('ADMISSION', 'CREATE'), async (req: any, res: any) => {
    try {
        const { enquiryId, patientId, admissionPriority, healthCondition, clinicalStatus, floor, room, bed, unitId, consent } = req.body;
        
        if (unitId && !isUnitAuthorized(req.user, unitId)) {
            return res.status(403).json({ success: false, message: 'Not authorized for this facility' });
        }

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }

        if (consent?.acknowledged && !hasExplicitPermission(req.user, 'PATIENT', 'UPDATE')) {
            return res.status(403).json({ success: false, message: 'PATIENT_UPDATE permission is required to record consent' });
        }

        if (consent?.acknowledged && !String(consent.signedByName || '').trim()) {
            return res.status(400).json({ success: false, message: 'signedByName is required when consent is acknowledged' });
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

        const requestedUnitId = unitId || req.context?.unitId || req.user.unitId;
        const newAdmission = await (prisma as any).$transaction(async (tx: any) => {
            const patient = await getAuthorizedPatient(tx, req, patientId);
            if (patient.unitId !== requestedUnitId) {
                const error: any = new Error('Patient does not belong to the selected facility');
                error.status = 403;
                throw error;
            }

            const admission = await tx.admission.create({
                data: {
                    ...(actualEnquiryId ? { enquiryId: actualEnquiryId } : {}),
                    patientId, admissionPriority, healthCondition, clinicalStatus, floor, room, bed,
                    unitId: patient.unitId,
                    tenantId: req.user.tenantId,
                    status: 'ACTIVE'
                }
            });

            const allocationRef = await generateRefNumber('ALC', req.user.tenantId, admission.unitId, tx);
            await tx.allocation.create({
                data: {
                    refNo: allocationRef,
                    ...(actualEnquiryId ? { enquiryId: actualEnquiryId } : {}),
                    admissionId: admission.id,
                    type: 'CLINICAL',
                    status: 'ALLOCATED',
                    tenantId: req.user.tenantId,
                    unitId: admission.unitId,
                    metadata: { handoffSource: 'ADMISSION_SYSTEM' }
                }
            });

            if (consent?.acknowledged) {
                const consentType = String(consent.consentType || 'ADMISSION');
                const version = String(consent.version || '1.0');
                const existing = await tx.residentConsent.findFirst({
                    where: { patientId, consentType, version },
                    select: { id: true }
                });
                if (existing) {
                    const error: any = new Error('A consent with this version already exists; create a new version instead');
                    error.status = 409;
                    throw error;
                }

                await tx.residentConsent.create({
                    data: {
                        patientId,
                        admissionId: admission.id,
                        consentType,
                        title: String(consent.title || 'Resident Admission Consent'),
                        version,
                        content: consent.content ? String(consent.content) : null,
                        signedByName: String(consent.signedByName).trim(),
                        signerRelation: String(consent.signerRelation || 'SELF'),
                        signatureUrl: consent.signatureUrl ? String(consent.signatureUrl) : null,
                        notes: consent.notes ? String(consent.notes) : null,
                        ipAddress: typeof req.ip === 'string' ? req.ip : null,
                        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
                        tenantId: req.user.tenantId,
                        unitId: patient.unitId,
                        createdById: req.user.id
                    }
                });
            }

            return admission;
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

// GET /admissions - List admissions (defaults to active, supports ?status=DISCHARGED, ?includeDischarged=true, search, pagination)
router.get('/admissions', auth, enforceTenant, requirePermission('ADMISSION', 'READ'), async (req: any, res: any) => {
    try {
        const { status, includeDischarged, search, q, allUnits, page, limit } = req.query;
        const requestedUnitId = (req.headers['x-unit-id'] as string) || req.context?.unitId || req.user.unitId;

        if (requestedUnitId && !isUnitAuthorized(req.user, requestedUnitId)) {
            return res.status(403).json({ success: false, message: 'Not authorized for this facility' });
        }

        const where: any = {
            tenantId: req.user.tenantId
        };

        // Unit scoping: if allUnits is explicitly requested and authorized for all, omit unitId; otherwise scope to target unit
        if (!(allUnits === 'true' && isUnitAuthorized(req.user, '*'))) {
            if (requestedUnitId) {
                where.unitId = requestedUnitId;
            }
        }

        // Status filtering:
        // Default behavior (no param): { not: 'DISCHARGED' } -> Preserves active-inpatient register completely
        const statusUpper = typeof status === 'string' ? status.trim().toUpperCase() : undefined;
        if (statusUpper === 'DISCHARGED') {
            where.status = 'DISCHARGED';
        } else if (statusUpper === 'ALL' || includeDischarged === 'true') {
            // Include all statuses without restriction
        } else if (statusUpper) {
            where.status = statusUpper;
        } else {
            where.status = { not: 'DISCHARGED' };
        }

        // Search filtering (resident name, elder ID, phone, room, bed)
        const searchTerm = String(search || q || '').trim();
        if (searchTerm) {
            where.OR = [
                { patient: { name: { contains: searchTerm, mode: 'insensitive' } } },
                { patient: { elderId: { contains: searchTerm, mode: 'insensitive' } } },
                { patient: { phone: { contains: searchTerm } } },
                { room: { contains: searchTerm, mode: 'insensitive' } },
                { bed: { contains: searchTerm, mode: 'insensitive' } }
            ];
        }

        const orderBy = where.status === 'DISCHARGED'
            ? [{ dischargedAt: 'desc' }, { updatedAt: 'desc' }]
            : [{ admittedAt: 'desc' }];

        const include = {
            patient: {
                select: {
                    id: true,
                    name: true,
                    elderId: true,
                    phone: true,
                    age: true,
                    gender: true,
                    bloodGroup: true,
                    emergencyContact: true
                }
            },
            serviceClosure: {
                select: {
                    id: true,
                    status: true,
                    closingRemarks: true,
                    medicalCleared: true,
                    medicalClearedAt: true,
                    financeCleared: true,
                    financeClearedAt: true,
                    assetCleared: true,
                    assetClearedAt: true,
                    updatedAt: true
                }
            }
        };

        // Optional pagination
        if (page || limit) {
            const pageNum = Math.max(1, parseInt(page, 10) || 1);
            const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
            const skip = (pageNum - 1) * limitNum;

            const [total, admissions] = await Promise.all([
                (prisma as any).admission.count({ where }),
                (prisma as any).admission.findMany({
                    where,
                    include,
                    orderBy,
                    skip,
                    take: limitNum
                })
            ]);

            return res.json({
                success: true,
                data: admissions,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum)
                }
            });
        }

        const admissions = await (prisma as any).admission.findMany({
            where,
            include,
            orderBy
        });

        res.json({ success: true, data: admissions });
    } catch (error: any) {
        console.error("ADMISSIONS FETCH ERROR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /consents - Record/Sign Resident Consent
router.post('/consents', auth, enforceTenant, requirePermission('PATIENT', 'UPDATE', true), async (req: any, res: any) => {
    try {
        const { 
            patientId, 
            admissionId, 
            consentType = 'ADMISSION', 
            title = 'Resident Admission Consent', 
            version = '1.0', 
            content, 
            signedByName, 
            signerRelation = 'SELF' 
        } = req.body;

        if (!patientId || !signedByName) {
            return res.status(400).json({ success: false, message: 'patientId and signedByName are required' });
        }

        const patient = await getAuthorizedPatient(prisma as any, req, patientId);
        if (admissionId) {
            const admission = await getAuthorizedAdmission(prisma as any, req, admissionId);
            if (admission.patientId !== patient.id || admission.unitId !== patient.unitId) {
                return res.status(403).json({ success: false, message: 'Admission does not belong to this patient unit' });
            }
        }

        const existing = await (prisma as any).residentConsent.findFirst({
            where: { patientId, consentType, version },
            select: { id: true }
        });
        if (existing) {
            return res.status(409).json({ success: false, message: 'A consent with this version already exists; create a new version instead' });
        }

        const newConsent = await (prisma as any).residentConsent.create({
            data: {
                patientId,
                admissionId: admissionId || null,
                consentType,
                title,
                version,
                content: content || null,
                signedByName,
                signerRelation,
                signedAt: new Date(),
                signatureUrl: req.body.signatureUrl ? String(req.body.signatureUrl) : null,
                notes: req.body.notes ? String(req.body.notes) : null,
                ipAddress: typeof req.ip === 'string' ? req.ip : null,
                userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
                status: 'SIGNED',
                tenantId: req.user.tenantId,
                unitId: patient.unitId,
                createdById: req.user.id
            }
        });

        res.status(201).json({ success: true, data: newConsent, message: 'Resident consent recorded successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message || 'Failed to record consent' });
    }
});

// GET /consents - List consent records
router.get('/consents', auth, enforceTenant, requirePermission('PATIENT', 'READ', true), async (req: any, res: any) => {
    try {
        const { patientId, admissionId, consentType } = req.query;
        const tenantId = req.user.tenantId;

        if (patientId) await getAuthorizedPatient(prisma as any, req, String(patientId));
        if (admissionId) await getAuthorizedAdmission(prisma as any, req, String(admissionId));

        const where: any = { tenantId, isDeleted: false };
        if (patientId) where.patientId = String(patientId);
        if (admissionId) where.admissionId = String(admissionId);
        if (consentType) where.consentType = String(consentType);

        const consents = await (prisma as any).residentConsent.findMany({
            where,
            include: { patient: { select: { unitId: true } }, admission: { select: { unitId: true } } },
            orderBy: { signedAt: 'desc' }
        });
        const authorizedConsents = consents
            .filter((consent: any) => isUnitAuthorized(req.user, consent.patient?.unitId) && (!consent.admission || isUnitAuthorized(req.user, consent.admission.unitId)))
            .map(({ patient, admission, ...consent }: any) => consent);

        res.json({ success: true, data: authorizedConsents });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /consents/:id - Get specific consent details
router.get('/consents/:id', auth, enforceTenant, requirePermission('PATIENT', 'READ', true), async (req: any, res: any) => {
    try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;

        const consent = await (prisma as any).residentConsent.findFirst({
            where: { id, tenantId, isDeleted: false },
            include: { patient: { select: { unitId: true } }, admission: { select: { patientId: true, unitId: true } } }
        });

        if (!consent) {
            return res.status(404).json({ success: false, message: 'Consent record not found' });
        }

        if (!isUnitAuthorized(req.user, consent.patient.unitId) || (consent.admission && (!isUnitAuthorized(req.user, consent.admission.unitId) || consent.admission.patientId !== consent.patientId))) {
            return res.status(403).json({ success: false, message: 'Not authorized for this consent unit' });
        }

        const { patient, admission, ...data } = consent;
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;



