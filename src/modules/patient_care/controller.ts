import { getAdlRecordsService, createAdlRecordService, updateAdlStatusService, getNutritionPlansService, createNutritionPlanService, getClinicalSummaryService, getNutritionRecordsService, createNutritionRecordService, createNursingRevenueRecordService, getNursingPatientRevenueTodayService, getNursingManagerRevenueService } from './service.js';
import { adlSchema, adlStatusSchema, nutritionSchema, nutritionRecordSchema, createNursingRevenueSchema } from './validation.js';



const getScope = (req: any) => ({
    tenantId: req.user.tenantId,
    unitId: req.context?.unitId || req.user.unitId
});

export const getAdlRecords = async (req: any, res: any, next: any) => {
    try {
        const patientId = req.query.patientId ? String(req.query.patientId).trim() : undefined;
        const data = await getAdlRecordsService(patientId, getScope(req), req.user);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createAdlRecord = async (req: any, res: any, next: any) => {
    try {
        const validated = adlSchema.parse(req.body);
        const data = await createAdlRecordService(validated, getScope(req), req.user);
        res.status(201).json({ success: true, data, message: 'ADL record saved successfully' });
    } catch (error: any) {
        if (error.message.includes('authorized') || error.message.includes('assignment')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateAdlStatus = async (req: any, res: any, next: any) => {
    try {
        const validated = adlStatusSchema.parse(req.body);
        const data = await updateAdlStatusService(req.params.id, validated.status, getScope(req));
        res.json({ success: true, data, message: 'ADL status updated' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getNutritionPlans = async (req: any, res: any, next: any) => {
    try {
        const patientId = req.query.patientId ? String(req.query.patientId).trim() : undefined;
        const data = await getNutritionPlansService(patientId, getScope(req));
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createNutritionPlan = async (req: any, res: any, next: any) => {
    try {
        const validated = nutritionSchema.parse(req.body);
        const data = await createNutritionPlanService(validated, getScope(req));
        res.status(201).json({ success: true, data, message: 'Nutrition plan added successfully' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getNutritionRecords = async (req: any, res: any, next: any) => {
    try {
        const patientId = req.query.patientId ? String(req.query.patientId).trim() : undefined;
        const careDate = req.query.careDate ? String(req.query.careDate).trim() : undefined;
        const data = await getNutritionRecordsService(patientId, careDate, getScope(req));
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createNutritionRecord = async (req: any, res: any, next: any) => {
    try {
        const validated = nutritionRecordSchema.parse(req.body);
        const data = await createNutritionRecordService(validated, getScope(req), req.user);
        res.status(201).json({ success: true, data, message: 'Nutrition record saved successfully' });
    } catch (error: any) {
        if (error.message.includes('authorized') || error.message.includes('assignment')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getClinicalSummary = async (req: any, res: any, next: any) => {
    try {
        const patientId = String(req.params.id || '').trim();
        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }
        const data = await getClinicalSummaryService(patientId, getScope(req));
        res.json({ success: true, data });
    } catch (error: any) {
        if (error.message === 'Patient not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createNursingRevenue = async (req: any, res: any, next: any) => {
    try {
        const patientId = String(req.params.patientId || '').trim();
        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }
        if (req.body.patientId && req.body.patientId !== patientId) {
            return res.status(400).json({ success: false, message: 'Payload patientId does not match URL parameter' });
        }
        const forbiddenFields = ['allocationId', 'costNo', 'sourceType', 'sourceId', 'patientName'];
        for (const field of forbiddenFields) {
            if (req.body[field] !== undefined) {
                return res.status(400).json({ success: false, message: `Client cannot specify '${field}'` });
            }
        }
        const validated = createNursingRevenueSchema.parse(req.body);

        const data = await createNursingRevenueRecordService(patientId, validated, getScope(req), req.user);
        res.status(201).json({ success: true, data, message: 'Revenue entry recorded successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError' || error.issues) {
            const firstIssue = error.issues?.[0] || error.errors?.[0];
            const issueMsg = firstIssue ? `${firstIssue.path?.join('.') || 'field'}: ${firstIssue.message}` : error.message;
            return res.status(400).json({ success: false, message: issueMsg, details: error.issues || error.errors });
        }
        if (error.status === 403 || error.message?.includes('authorized') || error.message?.includes('assignment')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        const status = error.status || (error.message?.includes('not found') ? 400 : 500);
        res.status(status).json({ success: false, message: error.message });
    }
};

export const getNursingPatientRevenueToday = async (req: any, res: any, next: any) => {
    try {
        const patientId = String(req.params.patientId || '').trim();
        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }
        const assignmentId = String(req.query.assignmentId || '').trim();
        if (!assignmentId) {
            return res.status(400).json({ success: false, message: 'assignmentId query parameter is required for Nursing Staff' });
        }
        const data = await getNursingPatientRevenueTodayService(patientId, assignmentId, getScope(req), req.user);
        res.json({ success: true, data });
    } catch (error: any) {
        if (error.status === 403 || error.message?.includes('authorized') || error.message?.includes('assignment')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        const status = error.status || (error.message?.includes('not found') ? 400 : 500);
        res.status(status).json({ success: false, message: error.message });
    }
};

export const getNursingManagerRevenue = async (req: any, res: any, next: any) => {
    try {
        const month = String(req.query.month || '').trim();
        const patientId = req.query.patientId ? String(req.query.patientId).trim() : undefined;
        const source = req.query.source ? String(req.query.source).trim().toUpperCase() : 'ALL';

        const data = await getNursingManagerRevenueService({ month, patientId, source }, getScope(req), req.user);
        res.json({ success: true, data });
    } catch (error: any) {
        const status = error.status || (error.message?.includes('not found') ? 404 : 500);
        res.status(status).json({ success: false, message: error.message });
    }
};


