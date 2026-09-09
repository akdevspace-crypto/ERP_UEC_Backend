import { Router } from 'express';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { requireRoles } from '../../shared/middleware/rbac.middleware.js';
import {
    getCaregiverVitalCharts,
    saveCaregiverVitalChart,
    getMedicationSchedules,
    createMedicationSchedule,
    administerMedicationDose,
    getVitals,
    saveVital,
    verifyVital,
    getPrescriptions,
    createPrescription,
    getMedicationLogs,
    administerMedicationLog,
    verifyMedicationLog
} from './controller.js';


const router = Router();

// Apply auth middleware for all Nursing Care routes
router.use(auth);

// We won't block roles aggressively here yet until the RBAC matrix is confirmed.
// We apply enforceTenant which ensures data isolation.
router.use(enforceTenant);

router.get('/ping', (req, res) => {
    res.json({ message: "Nursing Care module is active" });
});

// Vitals (Legacy Caregiver Charts)
router.get('/caregiver-vital-charts', requireRoles(['SUPER_ADMIN', 'NURSE', 'NURSING_CARE_STAFF', 'NURSING_MANAGER', 'MEDICAL_MANAGER']), getCaregiverVitalCharts);
router.post('/caregiver-vital-charts', requireRoles(['SUPER_ADMIN', 'NURSING_CARE_STAFF', 'NURSING_MANAGER', 'MEDICAL_MANAGER']), saveCaregiverVitalChart);

// Vitals (New Prisma Flow)
router.get('/vitals', getVitals);
router.post('/vitals', saveVital);
router.patch('/vitals/:id/verify', requireRoles(['SUPER_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER']), verifyVital);

// Medication Schedules (Legacy)
router.get('/medication-schedules', getMedicationSchedules);
router.post('/medication-schedules', createMedicationSchedule);
router.patch('/medication-schedules/:id/administer', administerMedicationDose);

// Prescriptions & Medication Logs (New Prisma Flow)
router.get('/prescriptions', getPrescriptions);
router.post('/prescriptions', requireRoles(['SUPER_ADMIN', 'MEDICAL_DOCTOR', 'MEDICAL_MANAGER']), createPrescription);
router.get('/medication-logs', getMedicationLogs);
router.post('/medication-logs', requireRoles(['SUPER_ADMIN', 'NURSING_CARE_STAFF', 'NURSING_MANAGER']), administerMedicationLog);
router.patch('/medication-logs/:id/verify', requireRoles(['SUPER_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER']), verifyMedicationLog);

export default router;
