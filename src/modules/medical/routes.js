import { Router } from 'express';
import { protect } from '../../shared/middleware/auth.middleware.js';
import { enforceTenant } from '../../shared/middleware/tenant.middleware.js';
import { requireRoles } from '../../shared/middleware/rbac.middleware.js';
import {
    handleCreateMedicalAssignment,
    handleDeleteMedicalAssignment,
    handleGetMedicalAssignmentById,
    handleGetMedicalAssignments,
    handleGetMedicalDashboard,
    handleGetMedicalStaff,
    handleUpdateMedicalAssignment,
    handleUpdateMedicalAssignmentStatus,
    handleGetDoctorVisits,
    handleCreateDoctorVisit,
    handleUpdateDoctorVisit,
    handleGetMyShift
} from './controller.js';

const router = Router();

router.use(protect);
router.use(enforceTenant);

const managerRoles = ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER'];

router.get('/dashboard', handleGetMedicalDashboard);
router.get('/my-shift', handleGetMyShift);
router.get('/staff', handleGetMedicalStaff);
router.get('/assignments', handleGetMedicalAssignments);
router.post('/assignments', requireRoles(managerRoles), handleCreateMedicalAssignment);
router.get('/assignments/:id', handleGetMedicalAssignmentById);
router.patch('/assignments/:id', handleUpdateMedicalAssignment);
router.patch('/assignments/:id/status', handleUpdateMedicalAssignmentStatus);
router.delete('/assignments/:id', requireRoles(managerRoles), handleDeleteMedicalAssignment);

router.get('/visits', handleGetDoctorVisits);
router.post('/visits', handleCreateDoctorVisit);
router.patch('/visits/:id', handleUpdateDoctorVisit);

export default router;
