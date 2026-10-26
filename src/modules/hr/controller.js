import {
    createStaff,
    getStaff,
    getRoles,
    getStaffPerformance,
    getAttendanceLogs,
    getPayrollPreview,
    processPayroll,
    getMyAttendanceLogs,
    markMyAttendance,
    recordStaffAttendance,
    updateStaff,
    updateStaffMenuPrivilege,
    deleteStaff,
    getLeaveRequests,
    getMyLeaveRequests,
    createLeaveRequest,
    createMyLeaveRequest,
    updateLeaveRequestStatus,
    createJobApplication,
    updateJobApplication,
    getJobApplications,
    deleteJobApplication,
    getLinkableUsers,
    getStaffSalary,
    updateStaffSalary,
    getCandidates,
    createCandidate,
    updateCandidate,
    placeCandidate,
    getCandidateInterviews,
    createInterview,
    updateInterview,
    deleteInterview,
    convertJobApplication
} from './service.js';
import { z } from 'zod';
import { success } from '../../shared/utils/response.js';
import { staffSchema, jobApplicationSchema, staffMenuPrivilegeSchema, leaveRequestSchema, myLeaveRequestSchema, leaveActionSchema, attendanceActionSchema, processPayrollSchema, staffSalarySchema, candidateSchema, candidateUpdateSchema, interviewSchema, interviewUpdateSchema } from './schema.js';

const normalizeStaffPayload = (body = {}, req = null) => {
    const normalized = { ...body };

    if (typeof normalized.metadata === 'string') {
        try {
            normalized.metadata = JSON.parse(normalized.metadata);
        } catch {
            normalized.metadata = {};
        }
    }

    if (!normalized.unitId) {
        normalized.unitId = req?.headers?.['x-unit-id'] || req?.context?.unitId || req?.user?.unitId || '5c83400d-d805-4f7a-9629-9e370d7f4618';
    }

    return normalized;
};

export const handleCreateStaff = async (req, res, next) => {
    try {
        const data = staffSchema.parse(normalizeStaffPayload(req.body, req));
        console.log('BODY UNIT:', req.body.unitId);
        const tenantId = req.context?.tenantId || req.user.tenantId;
        let staff = await createStaff(tenantId, data, req.files || {});
        return success(res, staff, { message: 'Staff member onboarded successfully' }, 201);
    } catch (error) {
        next(error);
    }
};

export const handleGetStaffSalary = async (req, res, next) => {
    try {
        const tenantId = req.context?.tenantId || req.user.tenantId;
        const unitId = req.context?.unitId || req.user.unitId;
        const salary = await getStaffSalary(tenantId, unitId, req.params.id);
        return success(res, salary);
    } catch (error) {
        next(error);
    }
};

export const handleUpdateStaffSalary = async (req, res, next) => {
    try {
        const data = staffSalarySchema.parse(req.body);
        const tenantId = req.context?.tenantId || req.user.tenantId;
        const unitId = req.context?.unitId || req.user.unitId;
        const salary = await updateStaffSalary(tenantId, unitId, req.params.id, data);
        return success(res, salary, { message: 'Staff salary updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleUpdateStaff = async (req, res, next) => {
    try {
        const data = staffSchema.parse(normalizeStaffPayload(req.body));
        const tenantId = req.context?.tenantId || req.user.tenantId;
        let staff = await updateStaff(tenantId, req.params.id, data, req.files || {});
        return success(res, staff, { message: 'Staff member updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetStaffDocuments = async (req, res, next) => {
    try {
        const { getStaffDocuments } = await import('./service.js');
        const documents = await getStaffDocuments(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            req.params.id,
            req.user
        );
        return success(res, documents);
    } catch (error) {
        next(error);
    }
};

export const handleUploadStaffDocuments = async (req, res, next) => {
    try {
        const { uploadStaffDocumentRelational } = await import('./service.js');
        const tenantId = req.context?.tenantId || req.user.tenantId;
        const documents = await uploadStaffDocumentRelational({
            tenantId,
            unitId: req.context?.unitId || req.user.unitId,
            staffId: req.params.id,
            files: req.files
        });
        return success(res, documents, { message: 'Documents uploaded successfully' }, 201);
    } catch (error) {
        next(error);
    }
};

export const handleGetDocumentTracker = async (req, res, next) => {
    try {
        const { getDocumentTracker } = await import('./service.js');
        const documents = await getDocumentTracker(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            req.user
        );
        return success(res, documents);
    } catch (error) {
        next(error);
    }
};

export const handleVerifyStaffDocument = async (req, res, next) => {
    try {
        const { verifyStaffDocumentRelational } = await import('./service.js');
        const tenantId = req.context?.tenantId || req.user.tenantId;
        const unitId = req.context?.unitId || req.user.unitId;
        
        const document = await verifyStaffDocumentRelational(
            tenantId,
            unitId,
            req.params.id,
            req.params.documentId,
            req.body.status,
            req.user
        );
        return success(res, document, { message: 'Document verified successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetStaff = async (req, res, next) => {
    try {
        const includeFormer = String(req.query.includeFormer || '').toLowerCase() === 'true';
        const requestedAllUnits = String(req.query.scope || '').toLowerCase() === 'all';
        const normalizedRole = String(req.user?.role || '').trim().toLowerCase().replace(/_/g, ' ');
        const canReadAllUnits = [
            'admin',
            'super admin',
            'superadmin',
            'customer relations manager',
            'follow up coordinator',
            'admissions coordinator',
            'care allocation manager',
            'hr manager',
            'security supervisor'
        ].includes(normalizedRole);
        const staff = await getStaff(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            { includeFormer, scope: requestedAllUnits && canReadAllUnits ? 'all' : undefined }
        );
        return success(res, staff);
    } catch (error) {
        next(error);
    }
};

export const handleGetRoles = async (req, res, next) => {
    try {
        const tenantId = req.context?.tenantId || req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ error: 'Tenant ID is required' });
        }
        const roles = await getRoles(tenantId);
        return success(res, roles);
    } catch (error) {
        next(error);
    }
};

export const handleGetStaffPerformance = async (req, res, next) => {
    try {
        const staff = await getStaffPerformance(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId);
        return success(res, staff);
    } catch (error) {
        next(error);
    }
};

export const handleGetAttendanceLogs = async (req, res, next) => {
    try {
        const requestedAllUnits = String(req.query.scope || '').toLowerCase() === 'all';
        const normalizedRole = String(req.user?.role || '').trim().toLowerCase().replace(/_/g, ' ');
        const canReadAllUnits = [
            'admin',
            'super admin',
            'superadmin',
            'uncf admin',
            'hr manager'
        ].includes(normalizedRole);
        const logs = await getAttendanceLogs(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            {
                date: req.query.date,
                scope: requestedAllUnits && canReadAllUnits ? 'all' : undefined
            }
        );
        return success(res, logs);
    } catch (error) {
        next(error);
    }
};

export const handleGetPayrollPreview = async (req, res, next) => {
    try {
        const requestedAllUnits = String(req.query.scope || '').toLowerCase() === 'all';
        const normalizedRole = String(req.user?.role || '').trim().toLowerCase().replace(/_/g, ' ');
        const canReadAllUnits = [
            'admin',
            'super admin',
            'superadmin',
            'uncf admin',
            'hr manager'
        ].includes(normalizedRole);
        const payroll = await getPayrollPreview(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            {
                month: req.query.month,
                scope: requestedAllUnits && canReadAllUnits ? 'all' : undefined
            }
        );
        return success(res, payroll);
    } catch (error) {
        next(error);
    }
};

export const handleProcessPayroll = async (req, res, next) => {
    try {
        const data = processPayrollSchema.parse(req.body);
        const normalizedRole = String(req.user?.role || '').trim().toLowerCase().replace(/_/g, ' ');
        const canProcessAllUnits = [
            'admin',
            'super admin',
            'superadmin',
            'uncf admin',
            'hr manager'
        ].includes(normalizedRole);
        const payroll = await processPayroll(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            data,
            req.user?.id,
            { scope: canProcessAllUnits ? 'all' : undefined }
        );
        return success(res, payroll, { message: 'Payroll processed successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetMyAttendanceLogs = async (req, res, next) => {
    try {
        const logs = await getMyAttendanceLogs(
            req.context?.tenantId || req.user.tenantId,
            req.user.id,
            { date: req.query.date }
        );
        return success(res, logs, { isStaffLinked: Boolean(req.user?.staff?.id) });
    } catch (error) {
        next(error);
    }
};

export const handleMarkMyAttendance = async (req, res, next) => {
    try {
        const data = attendanceActionSchema.parse(req.body);
        const log = await markMyAttendance(
            req.context?.tenantId || req.user.tenantId,
            req.user.id,
            data
        );
        return success(res, log, { message: data.action === 'CHECK_IN' ? 'Checked in successfully' : 'Checked out successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetLeaveRequests = async (req, res, next) => {
    try {
        const requestedAllUnits = String(req.query.scope || '').toLowerCase() === 'all';
        const normalizedRole = String(req.user?.role || '').trim().toLowerCase().replace(/_/g, ' ');
        const canReadAllUnits = [
            'admin',
            'super admin',
            'superadmin',
            'uncf admin',
            'hr manager'
        ].includes(normalizedRole);
        const leaveRequests = await getLeaveRequests(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            { scope: requestedAllUnits && canReadAllUnits ? 'all' : undefined }
        );
        return success(res, leaveRequests);
    } catch (error) {
        next(error);
    }
};

export const handleGetMyLeaveRequests = async (req, res, next) => {
    try {
        const leaveRequests = await getMyLeaveRequests(
            req.context?.tenantId || req.user.tenantId,
            req.user.id
        );
        return success(res, leaveRequests, { isStaffLinked: Boolean(req.user?.staff?.id) });
    } catch (error) {
        next(error);
    }
};

export const handleCreateLeaveRequest = async (req, res, next) => {
    try {
        const data = leaveRequestSchema.parse(req.body);
        const leaveRequest = await createLeaveRequest(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            data,
            req.user?.id
        );
        return success(res, leaveRequest, { message: 'Leave request saved successfully' }, 201);
    } catch (error) {
        next(error);
    }
};

export const handleCreateMyLeaveRequest = async (req, res, next) => {
    try {
        const data = myLeaveRequestSchema.parse(req.body);
        const leaveRequest = await createMyLeaveRequest(
            req.context?.tenantId || req.user.tenantId,
            req.user.id,
            data
        );
        return success(res, leaveRequest, { message: 'Leave request submitted successfully' }, 201);
    } catch (error) {
        next(error);
    }
};

export const handleUpdateLeaveRequestStatus = async (req, res, next) => {
    try {
        const data = leaveActionSchema.parse(req.body);
        const normalizedRole = String(req.user?.role || '').trim().toLowerCase().replace(/_/g, ' ');
        const canUpdateAllUnits = [
            'admin',
            'super admin',
            'superadmin',
            'uncf admin',
            'hr manager'
        ].includes(normalizedRole);
        const leaveRequest = await updateLeaveRequestStatus(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            req.params.id,
            data,
            req.user?.id,
            { scope: canUpdateAllUnits ? 'all' : undefined }
        );
        return success(res, leaveRequest, { message: `Leave request ${data.status.toLowerCase()} successfully` });
    } catch (error) {
        next(error);
    }
};



export const handleUpdateStaffMenuPrivilege = async (req, res, next) => {
    try {
        const data = staffMenuPrivilegeSchema.parse(req.body);
        const normalizedRole = String(req.user?.role || '').trim().toLowerCase().replace(/_/g, ' ');
        const canUpdateAllUnits = [
            'admin',
            'super admin',
            'superadmin',
            'uncf admin',
            'hr manager'
        ].includes(normalizedRole);
        const staff = await updateStaffMenuPrivilege(
            req.context?.tenantId || req.user.tenantId, 
            req.context?.unitId || req.user.unitId, 
            req.params.id, 
            data,
            { scope: canUpdateAllUnits ? 'all' : undefined }
        );
        return success(res, staff, { message: 'Staff menu privilege updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleDeleteStaff = async (req, res, next) => {
    try {
        await deleteStaff(req.user.tenantId, req.params.id);
        return success(res, null, { message: 'Staff member deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// --- Job Applications Controllers ---

export const handleCreateJobApplication = async (req, res, next) => {
    try {
        const data = jobApplicationSchema.parse(req.body);
        const application = await createJobApplication(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, data);
        return success(res, application, { message: 'Job application submitted successfully' }, 201);
    } catch (error) {
        next(error);
    }
};

export const handleUpdateJobApplication = async (req, res, next) => {
    try {
        const data = jobApplicationSchema.partial().parse(req.body);
        const application = await updateJobApplication(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, req.params.id, data);
        return success(res, application, { message: 'Job application updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetJobApplications = async (req, res, next) => {
    try {
        const applications = await getJobApplications(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId);
        return success(res, applications);
    } catch (error) {
        next(error);
    }
};

export const handleDeleteJobApplication = async (req, res, next) => {
    try {
        await deleteJobApplication(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, req.params.id);
        return success(res, null, { message: 'Job application deleted successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetLinkableUsers = async (req, res, next) => {
    try {
        const tenantId = req.context?.tenantId || req.user.tenantId;
        const users = await getLinkableUsers(tenantId);
        return success(res, users);
    } catch (error) {
        next(error);
    }
};

export const handleGetCandidates = async (req, res, next) => {
    try {
        const candidates = await getCandidates(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId);
        return success(res, candidates);
    } catch (error) {
        next(error);
    }
};

export const handleCreateCandidate = async (req, res, next) => {
    try {
        const parsed = candidateSchema.parse(req.body);
        const data = {
            ...parsed,
            mobileNo: parsed.mobileNo || parsed.phone || 'N/A'
        };
        const candidate = await createCandidate(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, data);
        return success(res, candidate, { message: 'Candidate created successfully' }, 201);
    } catch (error) {
        next(error);
    }
};

export const handleUpdateCandidate = async (req, res, next) => {
    try {
        const data = candidateUpdateSchema.parse(req.body);
        const candidate = await updateCandidate(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, req.params.id, data);
        return success(res, candidate, { message: 'Candidate updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const handlePlaceCandidate = async (req, res, next) => {
    try {
        const staff = await placeCandidate(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, req.params.id, req.body);
        return success(res, { staff }, { message: 'Candidate placed successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetCandidateInterviews = async (req, res, next) => {
    try {
        const interviews = await getCandidateInterviews(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, req.params.id);
        return success(res, interviews);
    } catch (error) {
        next(error);
    }
};

export const handleCreateInterview = async (req, res, next) => {
    try {
        const data = interviewSchema.parse({ ...req.body, candidateId: req.params.id });
        const interview = await createInterview(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, req.params.id, data);
        return success(res, interview, { message: 'Interview scheduled successfully' }, 201);
    } catch (error) {
        next(error);
    }
};

export const handleUpdateInterview = async (req, res, next) => {
    try {
        const data = interviewUpdateSchema.parse(req.body);
        const interview = await updateInterview(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, req.params.id, data);
        return success(res, interview, { message: 'Interview updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleDeleteInterview = async (req, res, next) => {
    try {
        await deleteInterview(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, req.params.id);
        return success(res, null, { message: 'Interview deleted successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleConvertJobApplication = async (req, res, next) => {
    try {
        const candidate = await convertJobApplication(req.context?.tenantId || req.user.tenantId, req.context?.unitId || req.user.unitId, req.params.id);
        return success(res, candidate, { message: 'Job application converted to candidate successfully' }, 201);
    } catch (error) {
        next(error);
    }
};

export const handleProvisionStaffAccount = async (req, res, next) => {
    try {
        const { provisionAccountSchema } = await import('./schema.js');
        const data = provisionAccountSchema.parse(req.body);
        const { provisionStaffAccount } = await import('./service.js');
        
        const tenantId = req.context?.tenantId || req.user.tenantId;
        const unitId = req.context?.unitId || req.user.unitId;
        const staffId = req.params.id;
        
        const result = await provisionStaffAccount(tenantId, unitId, staffId, data, req.user);
        
        // success is already available in controller.js
        return res.status(201).json({
            success: true,
            message: 'Staff account provisioning initiated.',
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const handleResetStaffPassword = async (req, res, next) => {
    try {
        const { resetStaffPasswordSchema } = await import('./schema.js');
        const data = resetStaffPasswordSchema.parse(req.body);
        const { resetStaffPassword } = await import('./service.js');
        
        const tenantId = req.context?.tenantId || req.user.tenantId;
        const unitId = req.context?.unitId || req.user.unitId;
        const staffId = req.params.id;
        
        const result = await resetStaffPassword(tenantId, unitId, staffId, data, req.user);
        
        return res.status(200).json({
            success: true,
            message: result.message || 'Staff password reset initiated.',
            method: data.method,
            ...(result.temporaryPassword ? { temporaryPassword: result.temporaryPassword } : {})
        });
    } catch (error) {
        next(error);
    }
};

export const handleRecordStaffAttendance = async (req, res, next) => {
    try {
        const log = await recordStaffAttendance(
            req.context?.tenantId || req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            req.body
        );
        return success(res, log, { message: 'Attendance record saved successfully' });
    } catch (error) {
        next(error);
    }
};
