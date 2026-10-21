import * as service from './outing.service.js';
import { createOutingRequestSchema, processApprovalSchema } from './outing.schema.js';
import { successResponse, errorResponse } from '../../shared/utils/response.js';

export const createOutingRequest = async (req, res) => {
    try {
        const parsed = createOutingRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            return errorResponse(res, parsed.error.issues.map(e => e.message).join(', '), 400);
        }

        const data = parsed.data;
        const tenantId = req.user.tenantId;
        const unitId = req.context?.unitId || req.user.unitId;
        const requestedByUserId = req.user.id;

        const request = await service.createOutingRequest(tenantId, unitId, requestedByUserId, data);
        return successResponse(res, request, 'Resident outing request created successfully', 201);
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

export const listOutingRequests = async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            patientId: req.query.patientId
        };
        const requests = await service.getOutingRequests(
            req.user.tenantId,
            req.context?.unitId || req.user.unitId,
            filters
        );
        return successResponse(res, requests, 'Resident outing requests retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

export const getOutingRequest = async (req, res) => {
    try {
        const request = await service.getOutingRequestById(
            req.user.tenantId,
            req.params.id,
            req.context?.unitId || req.user.unitId
        );
        if (!request) return errorResponse(res, 'Outing request not found', 404);
        return successResponse(res, request, 'Resident outing request retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

export const processOutingApproval = async (req, res) => {
    try {
        const parsed = processApprovalSchema.safeParse(req.body);
        if (!parsed.success) {
            return errorResponse(res, parsed.error.issues.map(e => e.message).join(', '), 400);
        }

        const { action, comments } = parsed.data;
        const tenantId = req.user.tenantId;
        const requestId = req.params.id;
        const approverId = req.user.id;

        const unitId = req.context?.unitId || req.user.unitId;
        const result = await service.processOutingApproval(tenantId, requestId, approverId, action, comments, unitId);
        return successResponse(res, result, `Resident outing request ${action.toLowerCase()} successfully`);
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};
