import { successResponse } from '../../../shared/utils/response.js';
import { roomSchema } from './schema.js';
import * as roomService from './service.js';

export const handleCreateRoom = async (req, res, next) => {
    try {
        const data = roomSchema.parse(req.body);
        const record = await roomService.createRoom(data, req.user.unitId, req.user.tenantId);
        return successResponse(res, record, 'Room created successfully', 201);
    } catch (error) {
        next(error);
    }
};

export const handleGetRooms = async (req, res, next) => {
    try {
        const records = await roomService.getRooms(req.user.unitId, req.user.tenantId, req.query.floorId);
        return successResponse(res, records, 'Rooms retrieved successfully');
    } catch (error) {
        next(error);
    }
};

export const handleUpdateRoom = async (req, res, next) => {
    try {
        const data = roomSchema.partial().parse(req.body);
        const record = await roomService.updateRoom(req.params.id, data, req.user.unitId, req.user.tenantId);
        return successResponse(res, record, 'Room updated successfully');
    } catch (error) {
        next(error);
    }
};

export const handleDeleteRoom = async (req, res, next) => {
    try {
        await roomService.deleteRoom(req.params.id, req.user.unitId, req.user.tenantId);
        return successResponse(res, null, 'Room deleted successfully');
    } catch (error) {
        next(error);
    }
};
