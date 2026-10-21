import { createAllocation, getAllocationsByType, updateAllocation } from './service.js';
import { success } from '../../shared/utils/response.js';
import { allocationSchema } from './schema.js';

const canReadAllUnits = (user) => {
    const normalizedRole = String(user?.role || '').trim().toLowerCase();
    return ['admin', 'super admin', 'superadmin', 'care allocation manager', 'customer relations manager'].includes(normalizedRole);
};

const getRequestScope = (req) => ({
    tenantId: req.context?.tenantId || req.user.tenantId,
    unitId: String(req.query?.scope || '').trim().toLowerCase() === 'all' && canReadAllUnits(req.user)
        ? 'ALL'
        : (req.context?.unitId || req.user.unitId)
});

export const handleCreateAllocation = async (req, res, next) => {
    try {
        const data = allocationSchema.parse(req.body);
        const { tenantId, unitId } = getRequestScope(req);
        const allocation = await createAllocation(tenantId, unitId, data);
        return success(res, allocation, { message: 'Allocation successfully assigned' });
    } catch (error) {
        next(error);
    }
};

export const handleGetHomeCareAllocations = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getRequestScope(req);
        const allocations = await getAllocationsByType(tenantId, unitId, 'HOME_CARE', req.user);
        return success(res, allocations);
    } catch (error) {
        next(error);
    }
};

export const handleGetClinicalCareAllocations = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getRequestScope(req);
        const allocations = await getAllocationsByType(tenantId, unitId, 'CLINICAL');
        return success(res, allocations);
    } catch (error) {
        next(error);
    }
};

export const handleGetInHouseCareAllocations = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getRequestScope(req);
        const allocations = await getAllocationsByType(tenantId, unitId, 'IN_HOUSE');
        return success(res, allocations);
    } catch (error) {
        next(error);
    }
};

export const handleGetOthersCareAllocations = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getRequestScope(req);
        const allocations = await getAllocationsByType(tenantId, unitId, 'OTHERS');
        return success(res, allocations);
    } catch (error) {
        next(error);
    }
};

export const handleUpdateAllocation = async (req, res, next) => {
    try {
        const { tenantId, unitId } = getRequestScope(req);
        const updated = await updateAllocation(tenantId, unitId, req.params.id, req.body);
        return success(res, updated, { message: 'Allocation updated successfully' });
    } catch (error) {
        next(error);
    }
};
