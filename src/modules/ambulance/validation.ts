import { z } from 'zod';

export const ambulanceRouteIdSchema = z.string().uuid('Valid route ID required');

export const createVehicleSchema = z.object({
    vehicleNo: z.string().min(1, 'Vehicle number is required'),
    type: z.string().min(1, 'Vehicle type is required'),
    status: z.enum(['AVAILABLE', 'ON_TRIP', 'MAINTENANCE']).optional(),
    baseLocation: z.string().optional().nullable()
});

export const updateVehicleSchema = z.object({
    vehicleNo: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    baseLocation: z.string().optional().nullable()
});

export const updateVehicleStatusSchema = z.object({
    status: z.enum(['AVAILABLE', 'ON_TRIP', 'MAINTENANCE'])
});

export const createTripSchema = z.object({
    clientName: z.string().optional().nullable(),
    mobile: z.string().optional().nullable(),
    pickupLocation: z.string().optional().nullable(),
    destination: z.string().optional().nullable(),
    priority: z.string().optional().nullable(),
    tripNotes: z.string().optional().nullable(),
    patientId: z.string().uuid().optional().nullable(),
    status: z.literal('REQUESTED').optional()
});

export const updateTripSchema = z.object({
    clientName: z.string().optional().nullable(),
    mobile: z.string().optional().nullable(),
    pickupLocation: z.string().optional().nullable(),
    destination: z.string().optional().nullable(),
    priority: z.string().optional().nullable(),
    tripNotes: z.string().optional().nullable(),
    patientId: z.string().uuid().optional().nullable()
});

export const dispatchTripSchema = z.object({
    status: z.literal('DISPATCHED'),
    vehicleId: z.string().uuid('Valid vehicle ID required'),
    driverId: z.string().uuid('Valid driver ID required'),
    supportStaffId: z.string().uuid().optional().nullable(),
    dispatchTime: z.string().datetime().optional()
});

export const enRouteTripSchema = z.object({
    status: z.literal('EN_ROUTE'),
    kmStart: z.number().min(0, 'Start kilometers must be non-negative').optional()
});

export const completeTripSchema = z.object({
    status: z.literal('COMPLETED'),
    kmEnd: z.number().min(0, 'End kilometers must be non-negative')
});

export const billTripSchema = z.object({
    status: z.literal('BILLED'),
    totalAmount: z.number().min(0, 'Total amount must be non-negative')
});

export const genericStatusUpdateSchema = z.object({
    status: z.enum([
        'REQUESTED',
        'DISPATCH_READY',
        'DISPATCHED',
        'EN_ROUTE',
        'ARRIVED',
        'COMPLETED',
        'BILLED',
        'CANCELLED'
    ])
});
