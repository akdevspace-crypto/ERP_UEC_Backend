import { Router } from 'express';
import { prisma } from '../../app/prisma.js';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { requirePermission } from '../../shared/middleware/rbac.middleware.js';
import { hasVerifiedOtpForReference, otpPurposes } from './otp.service.js';
import * as outingController from './outing.controller.js';
import * as staffController from './staff.controller.js';
import * as vehicleController from './vehicle.controller.js';
import * as entryLogsController from './entry-logs.controller.js';
import * as dashboardController from './dashboard.controller.js';
import * as gateQueueController from './gate-queue.controller.js';
import * as reportsController from './reports.controller.js';
import { checkoutVisitorPass } from '../visitor/visitor.service.js';

const router = Router();

const moduleName = 'SECURITY_GATE';
const canReadSecurity = requirePermission('SECURITY', 'READ');
const canCreateSecurity = requirePermission('SECURITY', 'CREATE');
const canUpdateSecurity = requirePermission('SECURITY', 'UPDATE');

const buildHttpError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    error.statusCode = status;
    return error;
};

const getScope = (req) => ({
    tenantId: req.context?.tenantId || req.user.tenantId,
    unitId: req.context?.unitId || req.user.unitId,
    userId: req.context?.userId || req.user.id
});

const canAccessTenantSecurityLogs = (req) => {
    const roleName = String(req.user?.role || '').trim().toLowerCase();
    return roleName === 'security supervisor' || roleName === 'security manager';
};

const buildSecurityWhere = (req, scope, extra = {}) => ({
    tenantId: scope.tenantId,
    ...(canAccessTenantSecurityLogs(req) ? {} : { unitId: scope.unitId }),
    module: moduleName,
    isDeleted: false,
    ...extra
});

const normalizeString = (value) => String(value || '').trim();

const readVisitorPayload = (body) => ({
    visitorName: normalizeString(body.visitorName),
    mobile: normalizeString(body.mobile),
    purpose: normalizeString(body.purpose),
    visitingPerson: normalizeString(body.visitingPerson),
    department: normalizeString(body.department),
    vehicleNo: normalizeString(body.vehicleNo),
    remarks: normalizeString(body.remarks),
    expectedAt: normalizeString(body.expectedAt)
});

const readVehiclePayload = (body) => ({
    vehicleNo: normalizeString(body.vehicleNo).toUpperCase(),
    vehicleType: normalizeString(body.vehicleType),
    driverName: normalizeString(body.driverName),
    driverMobile: normalizeString(body.driverMobile),
    purpose: normalizeString(body.purpose),
    companyName: normalizeString(body.companyName),
    materialDetails: normalizeString(body.materialDetails),
    remarks: normalizeString(body.remarks)
});

const readStaffPayload = (body) => ({
    staffName: normalizeString(body.staffName),
    empId: normalizeString(body.empId),
    department: normalizeString(body.department),
    designation: normalizeString(body.designation),
    mobile: normalizeString(body.mobile),
    purpose: normalizeString(body.purpose),
    remarks: normalizeString(body.remarks)
});

const normalizeEntry = (entry) => {
    if (entry.entryType === 'VISITOR_PASS' || entry.entryType === 'RESIDENT') return entry;
    return {
        id: entry.id,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        tenantId: entry.tenantId,
        unitId: entry.unitId,
        recordedBy: entry.user?.firstName || entry.user?.email || entry.payload?.recordedBy || '-',
        ...(entry.payload || {})
    };
};

router.get('/dashboard-summary', auth, enforceTenant, canReadSecurity, dashboardController.getDashboardSummary);

router.get('/dashboard/action-queue', auth, enforceTenant, canReadSecurity, dashboardController.getActionQueueController);

router.get('/movement-timeline', auth, enforceTenant, canReadSecurity, entryLogsController.getMovementTimelineController);

router.get('/gate-queue', auth, enforceTenant, canReadSecurity, gateQueueController.getGateQueueController);

router.get('/reports/daily-movement', auth, enforceTenant, canReadSecurity, reportsController.getDailyMovementReportController);

router.post('/vehicle-entries', auth, enforceTenant, canCreateSecurity, vehicleController.createVehicleMovement);

router.post('/staff-entries', auth, enforceTenant, canCreateSecurity, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const { staffName, empId, department, designation, mobile, purpose, remarks } = readStaffPayload(req.body);

        if (!staffName) throw buildHttpError('Staff name is required');
        if (!empId) throw buildHttpError('Employee ID is required');
        if (!purpose) throw buildHttpError('Movement purpose is required');

        const now = new Date().toISOString();
        const created = await prisma.auditLog.create({
            data: {
                userId: scope.userId,
                module: moduleName,
                action: 'STAFF_CHECK_IN',
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                payload: {
                    entryType: 'STAFF',
                    staffName,
                    empId,
                    department,
                    designation,
                    mobile,
                    purpose,
                    remarks,
                    status: 'Checked In',
                    checkInAt: now,
                    checkOutAt: null,
                    recordedBy: req.user?.name || req.user?.email || 'Security'
                }
            },
            include: {
                user: {
                    select: {
                        firstName: true,
                        email: true
                    }
                }
            }
        });

        // Sync with HR AttendanceLog
        try {
            const staff = await prisma.staff.findFirst({
                where: { tenantId: scope.tenantId, empId, isDeleted: false }
            });
            if (staff) {
                const today = new Date().toISOString().split('T')[0];
                const existingLog = await prisma.attendanceLog.findFirst({
                    where: { staffId: staff.id, date: new Date(today) }
                });
                if (!existingLog) {
                    await prisma.attendanceLog.create({
                        data: {
                            staffId: staff.id,
                            date: new Date(today),
                            checkIn: new Date(now),
                            method: 'SECURITY_GATE',
                            metadata: { status: 'Present' },
                            tenantId: scope.tenantId,
                            unitId: staff.unitId || scope.unitId
                        }
                    });
                } else if (!existingLog.checkIn) {
                    await prisma.attendanceLog.update({
                        where: { id: existingLog.id },
                        data: { checkIn: new Date(now) }
                    });
                }
            }
        } catch (err) {
            console.error('Error syncing Security Check-In to AttendanceLog:', err);
        }

        res.status(201).json({ success: true, data: normalizeEntry(created), message: 'Staff checked in successfully' });
    } catch (error) {
        next(error);
    }
});

router.post('/expected-visitors', auth, enforceTenant, canCreateSecurity, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const { visitorName, mobile, purpose, visitingPerson, department, vehicleNo, remarks, expectedAt } = readVisitorPayload(req.body);

        if (!visitorName) throw buildHttpError('Visitor name is required');
        if (!mobile) throw buildHttpError('Visitor mobile is required');
        if (!purpose) throw buildHttpError('Visit purpose is required');

        const created = await prisma.auditLog.create({
            data: {
                userId: scope.userId,
                module: moduleName,
                action: 'VISITOR_EXPECTED',
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                payload: {
                    entryType: 'VISITOR',
                    visitorName,
                    mobile,
                    purpose,
                    visitingPerson,
                    department,
                    vehicleNo,
                    remarks,
                    expectedAt: expectedAt || null,
                    status: 'Expected',
                    checkInAt: null,
                    checkOutAt: null,
                    recordedBy: req.user?.name || req.user?.email || 'Security'
                }
            },
            include: {
                user: {
                    select: {
                        firstName: true,
                        email: true
                    }
                }
            }
        });

        res.status(201).json({ success: true, data: normalizeEntry(created), message: 'Expected visitor saved successfully' });
    } catch (error) {
        next(error);
    }
});

router.patch('/expected-visitors/:id/check-in', auth, enforceTenant, canUpdateSecurity, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const id = normalizeString(req.params.id);
        if (!id) throw buildHttpError('Expected visitor id is required');

        // 1. Check if this is an expected VisitorPass
        const visitorPass = await prisma.visitorPass.findFirst({
            where: {
                id,
                tenantId: scope.tenantId,
                ...(canAccessTenantSecurityLogs(req) ? {} : { unitId: scope.unitId })
            },
            include: { visitor: true }
        });

        if (visitorPass) {
            const updatedPass = await prisma.visitorPass.update({
                where: { id: visitorPass.id },
                data: {
                    status: 'APPROVED',
                    checkInAt: new Date(),
                    materialDetails: req.body.remarks
                        ? [visitorPass.materialDetails, req.body.remarks].filter(Boolean).join(' | ')
                        : visitorPass.materialDetails
                },
                include: { visitor: true }
            });
            return res.json({
                success: true,
                data: {
                    id: updatedPass.id,
                    entryType: 'VISITOR_PASS',
                    status: 'Checked In',
                    checkInAt: updatedPass.checkInAt,
                    visitorName: updatedPass.visitor?.name,
                    mobile: updatedPass.visitor?.mobile
                },
                message: 'Expected visitor checked in successfully'
            });
        }

        // 2. Fallback to legacy AuditLog
        const existing = await prisma.auditLog.findFirst({
            where: buildSecurityWhere(req, scope, { id })
        });

        if (!existing) throw buildHttpError('Expected visitor not found', 404);

        const payload = existing.payload && typeof existing.payload === 'object' ? existing.payload : {};
        if (payload.status !== 'Expected') {
            throw buildHttpError('Only expected visitors can be checked in from this queue');
        }

        const updated = await prisma.auditLog.update({
            where: { id: existing.id },
            data: {
                action: 'VISITOR_CHECK_IN',
                payload: {
                    ...payload,
                    status: 'Checked In',
                    checkInAt: new Date().toISOString(),
                    checkOutAt: null,
                    arrivalRemarks: normalizeString(req.body.remarks)
                }
            },
            include: {
                user: {
                    select: {
                        firstName: true,
                        email: true
                    }
                }
            }
        });

        res.json({ success: true, data: normalizeEntry(updated), message: 'Expected visitor checked in successfully' });
    } catch (error) {
        next(error);
    }
});

router.patch('/gate-entries/:id/checkout', auth, enforceTenant, canUpdateSecurity, async (req, res, next) => {
    try {
        const scope = getScope(req);
        const id = normalizeString(req.params.id);
        if (!id) throw buildHttpError('Gate entry id is required');

        const visitorPass = await checkoutVisitorPass({
            id,
            tenantId: scope.tenantId,
            unitId: canAccessTenantSecurityLogs(req) ? undefined : scope.unitId
        });

        if (visitorPass) {
            return res.json({
                success: true,
                data: {
                    id: visitorPass.id,
                    entryType: 'VISITOR_PASS',
                    status: 'Checked Out',
                    checkOutAt: visitorPass.checkOutAt
                },
                message: 'Visitor checked out successfully'
            });
        }

        // Check if this is a resident outing movement or request
        const residentMovement = await prisma.residentGateMovement.findFirst({
            where: {
                OR: [{ id }, { outingRequestId: id }],
                tenantId: scope.tenantId,
                ...(canAccessTenantSecurityLogs(req) ? {} : { unitId: scope.unitId }),
                isDeleted: false
            }
        });

        if (residentMovement) {
            return await outingController.recordPhysicalReturn(req, res);
        }

        // Check if this is an active vehicle movement
        const activeVehicle = await prisma.vehicleMovement.findFirst({
            where: {
                id,
                tenantId: scope.tenantId,
                ...(canAccessTenantSecurityLogs(req) ? {} : { unitId: scope.unitId }),
                status: 'INSIDE'
            }
        });

        if (activeVehicle) {
            return await vehicleController.exitVehicleMovement(req, res, next);
        }

        const existing = await prisma.auditLog.findFirst({
            where: buildSecurityWhere(req, scope, { id })
        });

        if (!existing) throw buildHttpError('Gate entry not found', 404);

        const payload = existing.payload && typeof existing.payload === 'object' ? existing.payload : {};
        if (payload.status === 'Checked Out') {
            throw buildHttpError('Gate entry is already checked out');
        }

        const entryType = payload.entryType === 'VEHICLE' ? 'VEHICLE' : payload.entryType === 'STAFF' ? 'STAFF' : 'VISITOR';
        if (entryType === 'VISITOR') {
            /*
            const hasCheckoutOtp = await hasVerifiedOtpForReference({
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                referenceId: existing.id,
                purpose: otpPurposes.visitorCheckout,
                includeTenant: canAccessTenantSecurityLogs(req)
            });

            if (!hasCheckoutOtp) {
                throw buildHttpError('Visitor checkout requires verified checkout OTP');
            }
            */
        }

        const updated = await prisma.auditLog.update({
            where: { id: existing.id },
            data: {
                action: entryType === 'VEHICLE' ? 'VEHICLE_CHECK_OUT' : entryType === 'STAFF' ? 'STAFF_CHECK_OUT' : 'VISITOR_CHECK_OUT',
                payload: {
                    ...payload,
                    status: 'Checked Out',
                    checkOutAt: new Date().toISOString(),
                    checkoutRemarks: normalizeString(req.body.remarks)
                }
            },
            include: {
                user: {
                    select: {
                        firstName: true,
                        email: true
                    }
                }
            }
        });

        // Sync with HR AttendanceLog
        if (entryType === 'STAFF' && payload.empId) {
            try {
                const staff = await prisma.staff.findFirst({
                    where: { tenantId: scope.tenantId, empId: payload.empId, isDeleted: false }
                });
                if (staff) {
                    const checkOutTime = updated.payload.checkOutAt;
                    const checkInDate = updated.payload.checkInAt ? new Date(updated.payload.checkInAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                    const existingLog = await prisma.attendanceLog.findFirst({
                        where: { staffId: staff.id, date: new Date(checkInDate) }
                    });
                    if (existingLog && !existingLog.checkOut) {
                        await prisma.attendanceLog.update({
                            where: { id: existingLog.id },
                            data: { checkOut: new Date(checkOutTime) }
                        });
                    }
                }
            } catch (err) {
                console.error('Error syncing Security Check-Out to AttendanceLog:', err);
            }
        }

        res.json({
            success: true,
            data: normalizeEntry(updated),
            message: entryType === 'VEHICLE' ? 'Vehicle checked out successfully' : entryType === 'STAFF' ? 'Staff checked out successfully' : 'Visitor checked out successfully'
        });
    } catch (error) {
        next(error);
    }
});




// Resident Outings Security API
router.get('/resident-outings', auth, enforceTenant, canReadSecurity, outingController.getSecurityOutings);
router.post('/resident-outings', auth, enforceTenant, canCreateSecurity, outingController.createSecurityOuting);
router.post('/resident-outings/:id/exit', auth, enforceTenant, canCreateSecurity, outingController.recordPhysicalExit);
router.post('/resident-outings/:id/return', auth, enforceTenant, canUpdateSecurity, outingController.recordPhysicalReturn);
// Staff Movements
router.get('/staff-movements', auth, enforceTenant, canReadSecurity, staffController.getStaffMovements);
router.get('/staff-movements/:id', auth, enforceTenant, canReadSecurity, staffController.getStaffMovementById);
router.post('/staff-movements/entry', auth, enforceTenant, canCreateSecurity, staffController.recordStaffEntry);
router.post('/staff-movements/:id/temp-exit', auth, enforceTenant, canUpdateSecurity, staffController.recordTempExit);
router.post('/staff-movements/:id/return', auth, enforceTenant, canUpdateSecurity, staffController.recordTempReturn);
router.post('/staff-movements/:id/final-exit', auth, enforceTenant, canUpdateSecurity, staffController.recordFinalExit);

// Vehicle Movements
router.get('/vehicle-movements', auth, enforceTenant, canReadSecurity, vehicleController.getVehicleMovements);
router.get('/vehicle-movements/:id', auth, enforceTenant, canReadSecurity, vehicleController.getVehicleMovementById);
router.post('/vehicle-movements/entry', auth, enforceTenant, canCreateSecurity, vehicleController.createVehicleMovement);
router.post('/vehicle-movements/:id/exit', auth, enforceTenant, canUpdateSecurity, vehicleController.exitVehicleMovement);

export default router;

