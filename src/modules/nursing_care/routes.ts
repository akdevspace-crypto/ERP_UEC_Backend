import { Router } from 'express';
// @ts-ignore
import multer from 'multer';
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
    uploadVitalPhoto,
    getPatientMonitoringStatus,
    upsertVitalMonitoringRequirement,
    getVitalMonitoringRequirement,
    recordPatientAttention,
    resolvePatientAttention,
    getAttentionLogs,
    getAllPatientsMonitoringStatus,
    getPrescriptions,
    createPrescription,
    getMedicationLogs,
    administerMedicationLog,
    verifyMedicationLog
} from './controller.js';

const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

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

// Vitals & Monitoring (New Prisma Flow)
router.get('/vitals', getVitals);
router.post('/vitals', saveVital);
router.post('/vitals/upload-photo', photoUpload.single('photo'), uploadVitalPhoto);
router.patch('/vitals/:id/verify', requireRoles(['SUPER_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER']), verifyVital);

// Phase 2 Care-Plan Monitoring & Attention Routes
router.get('/patients/:patientId/monitoring-status', getPatientMonitoringStatus);
router.get('/patients/:patientId/monitoring-requirements', getVitalMonitoringRequirement);
router.post('/patients/:patientId/monitoring-requirements', requireRoles(['SUPER_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'MEDICAL_DOCTOR']), upsertVitalMonitoringRequirement);
router.get('/manager/monitoring', requireRoles(['SUPER_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'NURSING_SUPER_HEAD']), getAllPatientsMonitoringStatus);

router.post('/patients/:patientId/attention', recordPatientAttention);
router.patch('/attention/:id/resolve', resolvePatientAttention);
router.get('/attention-logs', getAttentionLogs);


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
