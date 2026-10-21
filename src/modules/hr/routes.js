import { Router } from 'express';
import {
    handleCreateStaff,
    handleGetStaff,
    handleGetRoles,
    handleGetStaffPerformance,
    handleGetAttendanceLogs,
    handleRecordStaffAttendance,
    handleGetPayrollPreview,
    handleProcessPayroll,
    handleGetMyAttendanceLogs,
    handleMarkMyAttendance,
    handleGetLeaveRequests,
    handleGetMyLeaveRequests,
    handleCreateLeaveRequest,
    handleCreateMyLeaveRequest,
    handleUpdateLeaveRequestStatus,
    handleUpdateStaff,
    handleGetStaffSalary,
    handleUpdateStaffSalary,
    handleUpdateStaffMenuPrivilege,
    handleDeleteStaff,
    handleProvisionStaffAccount,
    handleResetStaffPassword,
    handleCreateJobApplication,
    handleGetJobApplications,
    handleUpdateJobApplication,
    handleDeleteJobApplication,
    handleGetLinkableUsers,
    handleUploadStaffDocuments,
    handleGetStaffDocuments,
    handleGetDocumentTracker,
    handleVerifyStaffDocument,
    handleGetCandidates,
    handleCreateCandidate,
    handleUpdateCandidate,
    handlePlaceCandidate,
    handleGetCandidateInterviews,
    handleCreateInterview,
    handleUpdateInterview,
    handleDeleteInterview,
    handleConvertJobApplication
} from './controller.js';
import { protect } from '../../shared/middleware/auth.middleware.js';
import { enforceTenant } from '../../shared/middleware/tenant.middleware.js';
import { upload } from '../storage/service.js';
import { prisma } from '../../app/prisma.js';
import { success } from '../../shared/utils/response.js';

const router = Router();

router.use(protect);
router.use(enforceTenant);

const staffDocumentUpload = upload.fields([
    { name: 'aadhaarDocument', maxCount: 1 },
    { name: 'resumeDocument', maxCount: 1 }
]);

router.get('/linkable-users', handleGetLinkableUsers);

router.post('/staff', handleCreateStaff);
router.get('/staff', handleGetStaff);
router.get('/roles', handleGetRoles);
router.get('/staff/performance', handleGetStaffPerformance);
router.get('/attendance', handleGetAttendanceLogs);
router.post('/attendance', handleRecordStaffAttendance);
router.get('/payroll', handleGetPayrollPreview);
router.post('/payroll/process', handleProcessPayroll);
router.get('/my-attendance', handleGetMyAttendanceLogs);
router.post('/my-attendance', handleMarkMyAttendance);
router.get('/my-leave-requests', handleGetMyLeaveRequests);
router.post('/my-leave-requests', handleCreateMyLeaveRequest);
router.get('/leave-requests', handleGetLeaveRequests);
router.post('/leave-requests', handleCreateLeaveRequest);
router.patch('/leave-requests/:id', handleUpdateLeaveRequestStatus);

router.post('/staff/:id/documents', staffDocumentUpload, handleUploadStaffDocuments);
router.get('/staff/:id/documents', handleGetStaffDocuments);
router.patch('/staff/:id/documents/:documentId/verify', handleVerifyStaffDocument);
router.get('/documents/tracker', handleGetDocumentTracker);

router.put('/staff/:id', handleUpdateStaff);
router.get('/staff/:id/salary', handleGetStaffSalary);
router.put('/staff/:id/salary', handleUpdateStaffSalary);
router.patch('/staff/:id/menu-privilege', handleUpdateStaffMenuPrivilege);
router.delete('/staff/:id', handleDeleteStaff);
router.post('/staff/:id/provision-account', handleProvisionStaffAccount);
router.post('/staff/:id/reset-password', handleResetStaffPassword);

router.post('/job-applications', handleCreateJobApplication);
router.get('/job-applications', handleGetJobApplications);
router.put('/job-applications/:id', handleUpdateJobApplication);
router.delete('/job-applications/:id', handleDeleteJobApplication);

// --- JOB APPLICATION CONVERSION --- //
router.post('/job-applications/:id/convert', handleConvertJobApplication);

// --- CANDIDATE RECRUITMENT ROUTES --- //

router.get('/candidates', handleGetCandidates);
router.post('/candidates', handleCreateCandidate);
router.patch('/candidates/:id', handleUpdateCandidate);
router.post('/candidates/:id/place', handlePlaceCandidate);

// --- INTERVIEW ROUTES --- //

router.get('/candidates/:id/interviews', handleGetCandidateInterviews);
router.post('/candidates/:id/interviews', handleCreateInterview);
router.patch('/interviews/:id', handleUpdateInterview);
router.delete('/interviews/:id', handleDeleteInterview);

export default router;
