import { Request, Response } from 'express';
import * as service from './service.js';
import * as validation from './validation.js';

const getScope = (req: any) => ({
    tenantId: req.user.tenantId,
    unitId: req.context?.unitId || req.user.unitId
});

const getUserId = (req: any) => req.user.id || req.user.email || 'System';

const getRouteId = (value: unknown, res: Response): string | null => {
    const result = validation.ambulanceRouteIdSchema.safeParse(value);
    if (!result.success) {
        res.status(400).json({ success: false, message: 'Valid route ID required' });
        return null;
    }
    return result.data;
};

// --- VEHICLE CONTROLLER ---

export const getVehicles = async (req: Request, res: Response) => {
    try {
        const vehicles = await service.getVehicles(getScope(req));
        res.json({ success: true, data: vehicles });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getVehicleById = async (req: Request, res: Response) => {
    try {
        const id = getRouteId(req.params.id, res);
        if (!id) return;
        const vehicle = await service.getVehicleById(getScope(req), id);
        if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
        res.json({ success: true, data: vehicle });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createVehicle = async (req: Request, res: Response) => {
    try {
        const data = validation.createVehicleSchema.parse(req.body);
        const vehicle = await service.createVehicle(getScope(req), data, getUserId(req));
        res.status(201).json({ success: true, data: vehicle, message: 'Vehicle created successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateVehicle = async (req: Request, res: Response) => {
    try {
        const id = getRouteId(req.params.id, res);
        if (!id) return;
        const data = validation.updateVehicleSchema.parse(req.body);
        const vehicle = await service.updateVehicle(getScope(req), id, data, getUserId(req));
        res.json({ success: true, data: vehicle, message: 'Vehicle updated successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateVehicleStatus = async (req: Request, res: Response) => {
    try {
        const id = getRouteId(req.params.id, res);
        if (!id) return;
        const { status } = validation.updateVehicleStatusSchema.parse(req.body);
        const vehicle = await service.updateVehicleStatus(getScope(req), id, status, getUserId(req));
        res.json({ success: true, data: vehicle, message: 'Vehicle status updated successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

// --- TRIP CONTROLLER ---

export const getTrips = async (req: Request, res: Response) => {
    try {
        const trips = await service.getTrips(getScope(req));
        res.json({ success: true, data: trips });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getTripById = async (req: Request, res: Response) => {
    try {
        const id = getRouteId(req.params.id, res);
        if (!id) return;
        const trip = await service.getTripById(getScope(req), id);
        if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
        res.json({ success: true, data: trip });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createTrip = async (req: Request, res: Response) => {
    try {
        const data = validation.createTripSchema.parse(req.body);
        const trip = await service.createTrip(getScope(req), data, getUserId(req));
        res.status(201).json({ success: true, data: trip, message: 'Trip created successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateTrip = async (req: Request, res: Response) => {
    try {
        const id = getRouteId(req.params.id, res);
        if (!id) return;
        const data = validation.updateTripSchema.parse(req.body);
        const trip = await service.updateTrip(getScope(req), id, data, getUserId(req));
        res.json({ success: true, data: trip, message: 'Trip updated successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateTripStatus = async (req: Request, res: Response) => {
    try {
        const id = getRouteId(req.params.id, res);
        if (!id) return;
        const body = req.body;
        let data: any;

        // Based on the status, validate differently
        switch (body.status) {
            case 'DISPATCHED':
                data = validation.dispatchTripSchema.parse(body);
                break;
            case 'EN_ROUTE':
                data = validation.enRouteTripSchema.parse(body);
                break;
            case 'COMPLETED':
                data = validation.completeTripSchema.parse(body);
                break;
            case 'BILLED':
                data = validation.billTripSchema.parse(body);
                break;
            default:
                data = validation.genericStatusUpdateSchema.parse(body);
        }

        const trip = await service.updateTripStatus(getScope(req), id, data, getUserId(req));
        res.json({ success: true, data: trip, message: 'Trip status updated successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: error.errors });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const generateInvoice = async (req: Request, res: Response) => {
    try {
        const id = getRouteId(req.params.id, res);
        if (!id) return;
        const customAmount = req.body?.amount != null ? Number(req.body.amount) : undefined;
        const result = await service.generateAmbulanceInvoice(getScope(req), id, getUserId(req), customAmount);
        res.status(201).json({ success: true, data: result, message: 'Ambulance invoice generated successfully' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

