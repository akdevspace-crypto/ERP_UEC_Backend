import { prisma } from '../../app/prisma.js';
import { randomUUID } from 'crypto';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';

export type Scope = {
    tenantId: string;
    unitId: string;
};

// --- VEHICLE SERVICE ---

export const getVehicles = async (scope: Scope) => {
    return prisma.ambulanceVehicle.findMany({
        where: { tenantId: scope.tenantId, unitId: scope.unitId },
        orderBy: { createdAt: 'desc' }
    });
};

export const getVehicleById = async (scope: Scope, id: string) => {
    return prisma.ambulanceVehicle.findFirst({
        where: { id, tenantId: scope.tenantId, unitId: scope.unitId }
    });
};

export const createVehicle = async (scope: Scope, data: any, userId: string) => {
    // Check uniqueness
    const existing = await prisma.ambulanceVehicle.findUnique({
        where: {
            vehicleNo_tenantId_unitId: {
                vehicleNo: data.vehicleNo,
                tenantId: scope.tenantId,
                unitId: scope.unitId
            }
        }
    });

    if (existing) {
        throw new Error('Vehicle number must be unique within tenant and unit');
    }

    const vehicle = await prisma.ambulanceVehicle.create({
        data: {
            ...data,
            tenantId: scope.tenantId,
            unitId: scope.unitId
        }
    });

    await logWorkflow(scope, 'AMBULANCE_VEHICLE', vehicle.id, null, 'CREATED', userId, { data });
    return vehicle;
};

export const updateVehicle = async (scope: Scope, id: string, data: any, userId: string) => {
    const existing = await getVehicleById(scope, id);
    if (!existing) throw new Error('Vehicle not found');

    if (data.vehicleNo && data.vehicleNo !== existing.vehicleNo) {
        const dup = await prisma.ambulanceVehicle.findUnique({
            where: {
                vehicleNo_tenantId_unitId: {
                    vehicleNo: data.vehicleNo,
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            }
        });
        if (dup) throw new Error('Vehicle number must be unique within tenant and unit');
    }

    const updated = await prisma.ambulanceVehicle.update({
        where: { id },
        data
    });

    await logWorkflow(scope, 'AMBULANCE_VEHICLE', id, null, 'UPDATED', userId, { data });
    return updated;
};

export const updateVehicleStatus = async (scope: Scope, id: string, status: string, userId: string) => {
    const existing = await getVehicleById(scope, id);
    if (!existing) throw new Error('Vehicle not found');

    const updated = await prisma.ambulanceVehicle.update({
        where: { id },
        data: { status: status as any }
    });

    await logWorkflow(scope, 'AMBULANCE_VEHICLE', id, existing.status, status, userId, {});
    return updated;
};


// --- TRIP SERVICE ---

export const getTrips = async (scope: Scope) => {
    return prisma.ambulanceTrip.findMany({
        where: { tenantId: scope.tenantId, unitId: scope.unitId },
        orderBy: { createdAt: 'desc' },
        include: { vehicle: true, driver: true, supportStaff: true, patient: true }
    });
};

export const getTripById = async (scope: Scope, id: string) => {
    return prisma.ambulanceTrip.findFirst({
        where: { id, tenantId: scope.tenantId, unitId: scope.unitId },
        include: { vehicle: true, driver: true, supportStaff: true, patient: true }
    });
};

const generateRefNo = () => `AMB-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

export const createTrip = async (scope: Scope, data: any, userId: string) => {
    if (data.patientId) {
        const patient = await prisma.patient.findFirst({
            where: { id: data.patientId, tenantId: scope.tenantId, unitId: scope.unitId }
        });
        if (!patient) throw new Error('Patient not found or belongs to different tenant/unit');
    }

    const trip = await prisma.ambulanceTrip.create({
        data: {
            ...data,
            refNo: generateRefNo(),
            tenantId: scope.tenantId,
            unitId: scope.unitId
        }
    });

    await logWorkflow(scope, 'AMBULANCE_TRIP', trip.id, null, 'REQUESTED', userId, { data });
    return trip;
};

export const updateTrip = async (scope: Scope, id: string, data: any, userId: string) => {
    const existing = await getTripById(scope, id);
    if (!existing) throw new Error('Trip not found');

    if (data.patientId) {
        const patient = await prisma.patient.findFirst({
            where: { id: data.patientId, tenantId: scope.tenantId, unitId: scope.unitId }
        });
        if (!patient) throw new Error('Patient not found or belongs to different tenant/unit');
    }

    const updated = await prisma.ambulanceTrip.update({
        where: { id },
        data
    });

    await logWorkflow(scope, 'AMBULANCE_TRIP', id, null, 'UPDATED', userId, { data });
    return updated;
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    'REQUESTED': ['DISPATCH_READY', 'DISPATCHED', 'CANCELLED'],
    'DISPATCH_READY': ['DISPATCHED', 'CANCELLED'],
    'DISPATCHED': ['EN_ROUTE', 'CANCELLED'],
    'EN_ROUTE': ['ARRIVED', 'COMPLETED', 'CANCELLED'],
    'ARRIVED': ['COMPLETED', 'CANCELLED'],
    'COMPLETED': ['BILLED'],
    'BILLED': [],
    'CANCELLED': []
};

export const updateTripStatus = async (scope: Scope, id: string, statusData: any, userId: string) => {
    const existing = await getTripById(scope, id);
    if (!existing) throw new Error('Trip not found');

    const fromStatus = existing.status;
    const toStatus = statusData.status;

    if (!ALLOWED_TRANSITIONS[fromStatus]?.includes(toStatus)) {
        throw new Error(`Invalid transition from ${fromStatus} to ${toStatus}`);
    }

    const updateData: any = { status: toStatus as any };

    // DISPATCHED rules
    if (toStatus === 'DISPATCHED') {
        const { vehicleId, driverId, supportStaffId, dispatchTime } = statusData;
        if (!vehicleId || !driverId) throw new Error('vehicleId and driverId are required for dispatch');

        // Check vehicle
        const vehicle = await getVehicleById(scope, vehicleId);
        if (!vehicle) throw new Error('Vehicle not found in this tenant/unit');
        if (vehicle.status === 'MAINTENANCE') throw new Error('Cannot assign vehicle in maintenance');

        // Check staff
        const driver = await prisma.staff.findFirst({ where: { id: driverId, tenantId: scope.tenantId, unitId: scope.unitId } });
        if (!driver) throw new Error('Driver not found in this tenant/unit');

        if (supportStaffId) {
            const support = await prisma.staff.findFirst({ where: { id: supportStaffId, tenantId: scope.tenantId, unitId: scope.unitId } });
            if (!support) throw new Error('Support staff not found in this tenant/unit');
        }

        updateData.vehicleId = vehicleId;
        updateData.driverId = driverId;
        if (supportStaffId) updateData.supportStaffId = supportStaffId;
        updateData.dispatchTime = dispatchTime ? new Date(dispatchTime) : new Date();

        await prisma.ambulanceVehicle.update({ where: { id: vehicleId }, data: { status: 'ON_TRIP' } });
    }

    // EN_ROUTE rules
    if (toStatus === 'EN_ROUTE') {
        if (statusData.kmStart !== undefined) {
            if (statusData.kmStart < 0) throw new Error('kmStart cannot be negative');
            updateData.kmStart = statusData.kmStart;
        }
    }

    // COMPLETED rules
    if (toStatus === 'COMPLETED') {
        if (statusData.kmEnd === undefined) throw new Error('kmEnd is required to complete trip');
        if (statusData.kmEnd < 0) throw new Error('kmEnd cannot be negative');
        if (existing.kmStart !== null && statusData.kmEnd < existing.kmStart) throw new Error('kmEnd cannot be less than kmStart');
        updateData.kmEnd = statusData.kmEnd;
        
        // Free up vehicle
        if (existing.vehicleId) {
            await prisma.ambulanceVehicle.update({ where: { id: existing.vehicleId }, data: { status: 'AVAILABLE' } });
        }
    }

    // BILLED rules
    if (toStatus === 'BILLED') {
        if (statusData.totalAmount === undefined) throw new Error('totalAmount is required to bill trip');
        if (statusData.totalAmount < 0) throw new Error('totalAmount cannot be negative');
        updateData.totalAmount = statusData.totalAmount;
        // Finance integration deferred to Phase 3B-4
    }

    // Cancelled rules
    if (toStatus === 'CANCELLED') {
        if (existing.vehicleId && (fromStatus === 'DISPATCHED' || fromStatus === 'EN_ROUTE' || fromStatus === 'ARRIVED')) {
            await prisma.ambulanceVehicle.update({ where: { id: existing.vehicleId }, data: { status: 'AVAILABLE' } });
        }
    }

    const updated = await prisma.ambulanceTrip.update({
        where: { id },
        data: updateData
    });

    await logWorkflow(scope, 'AMBULANCE_TRIP', id, fromStatus, toStatus, userId, statusData);
    return updated;
};

// --- WORKFLOW LOG ---
async function logWorkflow(scope: Scope, entityType: string, entityId: string, fromState: string | null, toState: string, actionBy: string, notesObj: any) {
    try {
        await (prisma as any).workflowLog.create({
            data: {
                entityType,
                entityId,
                fromState,
                toState,
                actionBy,
                notes: JSON.stringify(notesObj),
                tenantId: scope.tenantId,
                unitId: scope.unitId
            }
        });
    } catch (e) {
        console.error('Failed to write WorkflowLog', e);
    }
}

// --- FINANCE INTEGRATION (PHASE 3B-4) ---

export const generateAmbulanceInvoice = async (scope: Scope, tripId: string, userId: string, customAmount?: number) => {
    return await prisma.$transaction(async (tx: any) => {
        const trip = await tx.ambulanceTrip.findFirst({
            where: { id: tripId, tenantId: scope.tenantId, unitId: scope.unitId }
        });

        if (!trip) throw new Error('Trip not found');
        if (trip.status !== 'COMPLETED') throw new Error('Trip must be COMPLETED before generating an invoice');
        
        const amount = Number(customAmount != null ? customAmount : trip.totalAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('Valid billing amount greater than ₹0 is required to generate an invoice.');
        }

        if (trip.totalAmount !== amount) {
            await tx.ambulanceTrip.update({
                where: { id: trip.id },
                data: { totalAmount: amount }
            });
        }

        // Idempotency check: Ensure no invoice already exists for this trip
        const existingInvoice = await tx.accountTransaction.findFirst({
            where: {
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                type: 'INVOICE',
                metadata: { path: ['ambulanceTripId'], equals: tripId },
                isDeleted: false
            }
        });

        if (existingInvoice) {
            throw new Error('Invoice already generated for this trip');
        }

        const invoiceRef = await generateRefNumber('INV', scope.tenantId, scope.unitId, tx);

        // 1. Create Invoice
        const invoice = await tx.accountTransaction.create({
            data: {
                refNo: invoiceRef,
                type: 'INVOICE',
                status: 'POSTED',
                amount: amount,
                category: 'Ambulance Services',
                clientName: trip.clientName || 'Unknown Client',
                tenantId: scope.tenantId,
                unitId: scope.unitId,
                date: new Date(),
                metadata: {
                    ambulanceTripId: trip.id,
                    tripRef: trip.refNo
                }
            }
        });

        // 2. Mark Trip as BILLED
        const updatedTrip = await tx.ambulanceTrip.update({
            where: { id: trip.id },
            data: { status: 'BILLED' }
        });

        // Log workflow inside transaction
        await tx.workflowLog.create({
            data: {
                entityType: 'AMBULANCE_TRIP',
                entityId: trip.id,
                fromState: 'COMPLETED',
                toState: 'BILLED',
                actionBy: userId,
                notes: JSON.stringify({ invoiceId: invoice.id, invoiceRef }),
                tenantId: scope.tenantId,
                unitId: scope.unitId
            }
        });

        return { invoice, trip: updatedTrip };
    });
};

