import { prisma } from '../../app/prisma.js';
import { canReadFacilityWide } from '../../shared/utils/rbac.js';
import { success } from '../../shared/utils/response.js';
import {
    createMedicalAssignment,
    deleteMedicalAssignment,
    getMedicalAssignmentById,
    getMedicalAssignments,
    getMedicalDashboard,
    getMedicalStaff,
    updateMedicalAssignment,
    updateMedicalAssignmentStatus,
    getDoctorVisits,
    createDoctorVisit,
    updateDoctorVisit,
    getMyShift
} from './service.js';
import {
    createMedicalAssignmentSchema,
    medicalAssignmentQuerySchema,
    updateMedicalAssignmentSchema,
    updateMedicalAssignmentStatusSchema,
    createDoctorVisitSchema,
    updateDoctorVisitSchema
} from './schema.js';

const getScope = (req, allowFacilityWide = false) => {
    const rawHeader = req.headers['x-unit-id'];
    const headerUnitId = typeof rawHeader === 'string'
        ? rawHeader.trim()
        : Array.isArray(rawHeader)
            ? String(rawHeader[0] || '').trim()
            : '';

    const isFacilityWide = Boolean(
        req.user?.unitAccess?.includes('*') ||
        (req.user && canReadFacilityWide(req.user))
    );

    let unitId = null;
    if (headerUnitId && headerUnitId !== 'ALL' && headerUnitId !== '*') {
        unitId = headerUnitId;
    } else if (allowFacilityWide && isFacilityWide && (!headerUnitId || headerUnitId === 'ALL' || headerUnitId === '*')) {
        unitId = null; // Query organization-wide across all units
    } else {
        unitId = req.context?.unitId || req.user?.unitId;
    }

    return {
        tenantId: req.context?.tenantId || req.user?.tenantId,
        unitId
    };
};

export const handleCreateMedicalAssignment = async (req, res, next) => {
    try {
        const data = createMedicalAssignmentSchema.parse(req.body);
        const { tenantId, unitId } = getScope(req, true);
        const assignment = await createMedicalAssignment(tenantId, unitId, req.user?.id, data);
        return success(res, assignment, { message: 'Medical assignment created successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetMedicalAssignments = async (req, res, next) => {
    try {
        const filters = medicalAssignmentQuerySchema.parse(req.query);
        const { tenantId, unitId } = getScope(req, true);
        const assignments = await getMedicalAssignments(tenantId, unitId, filters);
        return success(res, assignments);
    } catch (error) {
        next(error);
    }
};

export const handleGetMedicalAssignmentById = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getScope(req);
        const assignment = await getMedicalAssignmentById(tenantId, unitId, req.params.id);
        return success(res, assignment);
    } catch (error) {
        next(error);
    }
};

export const handleGetMedicalDashboard = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getScope(req, true);
        const dashboard = await getMedicalDashboard(tenantId, unitId);
        return success(res, dashboard);
    } catch (error) {
        next(error);
    }
};

export const handleGetMedicalStaff = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getScope(req, true);
        const staff = await getMedicalStaff(tenantId, unitId);
        return success(res, staff);
    } catch (error) {
        next(error);
    }
};

export const handleUpdateMedicalAssignment = async (req, res, next) => {
    try {
        // Phase 16: Inhouse Care Staff & Manager RBAC Protection
        const data = updateMedicalAssignmentSchema.parse(req.body);
        const { tenantId, unitId } = getScope(req);

        let rawRole = req.user?.role;
        if (rawRole && typeof rawRole === 'object' && rawRole.name) {
            rawRole = rawRole.name;
        }
        const userRole = String(rawRole || '').trim().toUpperCase().replace(/\s+/g, '_');
        const isManager = ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER'].includes(userRole) || (req.user?.permissions || []).includes('ALL_ACCESS');

        if (!isManager && req.user?.staff?.id) {
            const currentAssignment = await prisma.medicalAssignment.findFirst({
                where: { id: req.params.id, tenantId, isDeleted: false },
                select: { staffId: true }
            });
            if (currentAssignment && currentAssignment.staffId !== req.user.staff.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: You cannot modify assignments belonging to another staff member'
                });
            }
        }

        const assignment = await updateMedicalAssignment(tenantId, unitId, req.params.id, data);
        return success(res, assignment, { message: 'Medical assignment updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleUpdateMedicalAssignmentStatus = async (req, res, next) => {
    try {
        // Phase 16: Inhouse Care Staff & Manager RBAC Protection
        const data = updateMedicalAssignmentStatusSchema.parse(req.body);
        const { tenantId, unitId } = getScope(req);

        let rawRole = req.user?.role;
        if (rawRole && typeof rawRole === 'object' && rawRole.name) {
            rawRole = rawRole.name;
        }
        const userRole = String(rawRole || '').trim().toUpperCase().replace(/\s+/g, '_');
        const isManager = ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER'].includes(userRole) || (req.user?.permissions || []).includes('ALL_ACCESS');

        if (['APPROVED', 'CANCELLED'].includes(data.status) && !isManager) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: Only Nursing Managers or Administrators can approve or cancel assignments'
            });
        }

        if (!isManager && req.user?.staff?.id) {
            const currentAssignment = await prisma.medicalAssignment.findFirst({
                where: { id: req.params.id, tenantId, isDeleted: false },
                select: { staffId: true }
            });
            if (currentAssignment && currentAssignment.staffId !== req.user.staff.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: You cannot modify assignments belonging to another staff member'
                });
            }
        }

        const assignment = await updateMedicalAssignmentStatus(tenantId, unitId, req.params.id, data);
        return success(res, assignment, { message: 'Medical assignment status updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleDeleteMedicalAssignment = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getScope(req);
        const assignment = await deleteMedicalAssignment(tenantId, unitId, req.params.id);
        return success(res, assignment, { message: 'Medical assignment removed successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetDoctorVisits = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getScope(req);
        const { patientId, doctorId } = req.query;
        const visits = await getDoctorVisits(tenantId, unitId, { patientId, doctorId });
        return success(res, visits);
    } catch (error) {
        next(error);
    }
};

export const handleCreateDoctorVisit = async (req, res, next) => {
    try {
        const data = createDoctorVisitSchema.parse(req.body);
        const { tenantId, unitId } = getScope(req);
        const visit = await createDoctorVisit(tenantId, unitId, data);
        return success(res, visit, { message: 'Doctor visit created successfully' }, 201);
    } catch (error) {
        next(error);
    }
};

export const handleUpdateDoctorVisit = async (req, res, next) => {
    try {
        const data = updateDoctorVisitSchema.parse(req.body);
        const { tenantId, unitId } = getScope(req);
        const visit = await updateDoctorVisit(tenantId, unitId, req.params.id, data);
        return success(res, visit, { message: 'Doctor visit updated successfully' });
    } catch (error) {
        next(error);
    }
};

export const handleGetMyShift = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getScope(req);
        const data = await getMyShift(tenantId, unitId, req.user);
        return success(res, data, { message: 'My shift retrieved successfully' });
    } catch (error) {
        next(error);
    }
};
