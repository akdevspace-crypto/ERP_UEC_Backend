import { getAdlRecordsService, createAdlRecordService, updateAdlStatusService, getNutritionPlansService, createNutritionPlanService, getClinicalSummaryService } from './service.js';
import { adlSchema, adlStatusSchema, nutritionSchema } from './validation.js';

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
