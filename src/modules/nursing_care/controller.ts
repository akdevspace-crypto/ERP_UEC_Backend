import { getCaregiverVitalChartsService, saveCaregiverVitalChartService, getMedicationSchedulesService, createMedicationScheduleService, administerMedicationDoseService, getVitalsService, saveVitalService, verifyVitalService, getPrescriptionsService, createPrescriptionService, getMedicationLogsService, administerMedicationLogService, verifyMedicationLogService } from './service.js';
import { caregiverVitalChartSchema, medicationScheduleSchema, administerDoseSchema, vitalSignSchema, prescriptionSchema, medicationLogSchema } from './validation.js';

const getScope = (req: any) => ({
    tenantId: req.user.tenantId,
    unitId: req.context?.unitId || req.user.unitId
});

const getRoleName = (user: any) => String(typeof user?.role === 'object' ? user.role?.name : user?.role || '').trim().toUpperCase();
const historicalVitalAccessRoles = ['NURSING_MANAGER', 'NURSING_SUPER_HEAD', 'SUPER_ADMIN', 'MEDICAL_MANAGER'];

export const getCaregiverVitalCharts = async (req: any, res: any, next: any) => {
    try {
        const scope = getScope(req);
        const month = String(req.query.month || '').trim();
        const patientId = String(req.query.patientId || '').trim();

        // Today-Only Enforcement
        if (month && !historicalVitalAccessRoles.includes(getRoleName(req.user))) {
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            if (month !== currentMonth) {
                return res.status(403).json({ success: false, message: 'Not authorized to view past month records' });
            }
        }

        const data = await getCaregiverVitalChartsService(month, patientId, scope, req.user);
        res.json({ success: true, data });
    } catch (error: any) {
        if (error.message.includes('authorized') || error.message.includes('assignment')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

export const saveCaregiverVitalChart = async (req: any, res: any, next: any) => {
    try {
        const validated = caregiverVitalChartSchema.parse(req.body);
        const scope = getScope(req);
        
        // Today-Only Enforcement
        if (validated.month && req.user?.role?.name !== 'Nursing Manager' && req.user?.role?.name !== 'Nursing Super Head' && req.user?.role?.name !== 'Super Admin' && req.user?.role?.name !== 'Medical Manager') {
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            if (validated.month !== currentMonth) {
                return res.status(403).json({ success: false, message: 'Not authorized to modify past month records' });
            }
            
            // Further enforcement inside service to only allow today's day insertions
        }

        const data = await saveCaregiverVitalChartService(validated, scope, req.user);
        res.status(201).json({ success: true, data, message: 'Caregiver vital chart saved' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getMedicationSchedules = async (req: any, res: any, next: any) => {
    try {
        const patientId = req.query.patientId ? String(req.query.patientId).trim() : undefined;
        // The service takes the scope from getScope instead of just unitId if we are doing tenant isolation
        const data = await getMedicationSchedulesService(patientId, getScope(req));
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createMedicationSchedule = async (req: any, res: any, next: any) => {
    try {
        const validated = medicationScheduleSchema.parse(req.body);
        const scope = getScope(req);
        const userId = req.user.id;
        const data = await createMedicationScheduleService(validated, scope, userId);
        res.status(201).json({ success: true, data, message: 'Medication schedule saved successfully' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const administerMedicationDose = async (req: any, res: any, next: any) => {
    try {
        const validated = administerDoseSchema.parse(req.body);
        const scope = getScope(req);
        const data = await administerMedicationDoseService(req.params.id, validated, req.user, scope);
        res.json({ success: true, data, message: 'Medication dose marked as administered' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getVitals = async (req: any, res: any, next: any) => {
    try {
        const scope = getScope(req);
        const patientId = String(req.query.patientId || '').trim();
        if (!patientId) throw new Error('patientId is required');
        const data = await getVitalsService(patientId, scope);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const saveVital = async (req: any, res: any, next: any) => {
    try {
        const scope = getScope(req);
        const validated = vitalSignSchema.parse(req.body);
        const data = await saveVitalService(validated, scope, req.user);
        res.status(201).json({ success: true, data, message: 'Vital sign saved successfully' });
    } catch (error: any) {
        if (error.message.includes('authorized') || error.message.includes('assignment')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const verifyVital = async (req: any, res: any, next: any) => {
    try {
        const scope = getScope(req);
        const { notes } = req.body;
        const data = await verifyVitalService(req.params.id, notes, scope, req.user.id);
        res.json({ success: true, data, message: 'Vital sign verified successfully' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getPrescriptions = async (req: any, res: any, next: any) => {
    try {
        const scope = getScope(req);
        const patientId = req.query.patientId || null;
        const data = await getPrescriptionsService(patientId, scope);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createPrescription = async (req: any, res: any, next: any) => {
    try {
        const scope = getScope(req);
        const validated = prescriptionSchema.parse(req.body);
        const data = await createPrescriptionService(validated, scope, req.user.id);
        res.status(201).json({ success: true, data, message: 'Prescription created successfully' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getMedicationLogs = async (req: any, res: any, next: any) => {
    try {
        const scope = getScope(req);
        const patientId = req.query.patientId || null;
        const data = await getMedicationLogsService(patientId, scope);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const administerMedicationLog = async (req: any, res: any, next: any) => {
    try {
        const scope = getScope(req);
        const validated = medicationLogSchema.parse(req.body);
        const data = await administerMedicationLogService(validated, scope, req.user);
        res.status(201).json({ success: true, data, message: 'Medication administered successfully' });
    } catch (error: any) {
        if (error.message.includes('authorized') || error.message.includes('assignment')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const verifyMedicationLog = async (req: any, res: any, next: any) => {
    try {
        const scope = getScope(req);
        const { notes } = req.body;
        const data = await verifyMedicationLogService(req.params.id, notes, scope, req.user.id);
        res.json({ success: true, data, message: 'Medication log verified successfully' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};
