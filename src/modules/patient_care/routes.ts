import { Router } from 'express';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { requireRoles } from '../../shared/middleware/rbac.middleware.js';
import {
    getAdlRecords,
    createAdlRecord,
    updateAdlStatus,
    getNutritionPlans,
    createNutritionPlan,
    getClinicalSummary,
    getNutritionRecords,
    createNutritionRecord,
    createNursingRevenue,
    getNursingPatientRevenueToday,
    getNursingManagerRevenue
} from './controller.js';


const router = Router();

router.use(auth);
router.use(enforceTenant);

router.get('/ping', (req, res) => {
    res.json({ message: "Patient Care module is active" });
});

// ADL Records
router.get('/adl-records', getAdlRecords);
router.post('/adl-records', createAdlRecord);
router.patch('/adl-records/:id/status', updateAdlStatus);

// Nutrition
router.get('/nutrition', getNutritionPlans);
router.post('/nutrition', createNutritionPlan);

router.get('/nutrition-records', getNutritionRecords);
router.post('/nutrition-records', createNutritionRecord);

// Incident Reports are currently owned by UEC (/api/v1/uec/incidents). We will leave them there until full ownership transfer is analyzed.

// Shared Clinical Summary
router.get('/residents/:id/clinical-summary', getClinicalSummary);

// Manager Revenue / Usage read facade (NursingApp)
router.get('/manager/revenue', requireRoles(['NURSING_MANAGER', 'SUPER_ADMIN', 'MEDICAL_MANAGER']), getNursingManagerRevenue);

// Manual Revenue Entry & Read (NursingApp)
router.post('/patients/:patientId/revenue', createNursingRevenue);
router.get('/patients/:patientId/revenue/today', getNursingPatientRevenueToday);

export default router;

