-- CreateEnum
CREATE TYPE "AmbulanceVehicleStatus" AS ENUM ('AVAILABLE', 'ON_TRIP', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AmbulanceTripStatus" AS ENUM ('REQUESTED', 'DISPATCH_READY', 'DISPATCHED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'BILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AmbulanceVehicle" (
    "id" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AmbulanceVehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "baseLocation" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbulanceVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbulanceTrip" (
    "id" TEXT NOT NULL,
    "refNo" TEXT NOT NULL,
    "clientName" TEXT,
    "mobile" TEXT,
    "pickupLocation" TEXT,
    "destination" TEXT,
    "priority" TEXT,
    "status" "AmbulanceTripStatus" NOT NULL DEFAULT 'REQUESTED',
    "dispatchTime" TIMESTAMP(3),
    "kmStart" DOUBLE PRECISION,
    "kmEnd" DOUBLE PRECISION,
    "tripNotes" TEXT,
    "totalAmount" DOUBLE PRECISION,
    "vehicleId" TEXT,
    "driverId" TEXT,
    "supportStaffId" TEXT,
    "patientId" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbulanceTrip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmbulanceVehicle_tenantId_idx" ON "AmbulanceVehicle"("tenantId");

-- CreateIndex
CREATE INDEX "AmbulanceVehicle_unitId_idx" ON "AmbulanceVehicle"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "AmbulanceVehicle_vehicleNo_tenantId_unitId_key" ON "AmbulanceVehicle"("vehicleNo", "tenantId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "AmbulanceTrip_refNo_key" ON "AmbulanceTrip"("refNo");

-- CreateIndex
CREATE INDEX "AmbulanceTrip_tenantId_idx" ON "AmbulanceTrip"("tenantId");

-- CreateIndex
CREATE INDEX "AmbulanceTrip_unitId_idx" ON "AmbulanceTrip"("unitId");

-- CreateIndex
CREATE INDEX "AmbulanceTrip_status_idx" ON "AmbulanceTrip"("status");

-- CreateIndex
CREATE INDEX "AmbulanceTrip_vehicleId_idx" ON "AmbulanceTrip"("vehicleId");

-- CreateIndex
CREATE INDEX "AmbulanceTrip_driverId_idx" ON "AmbulanceTrip"("driverId");

-- CreateIndex
CREATE INDEX "AmbulanceTrip_patientId_idx" ON "AmbulanceTrip"("patientId");

-- AddForeignKey
ALTER TABLE "AmbulanceVehicle" ADD CONSTRAINT "AmbulanceVehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceVehicle" ADD CONSTRAINT "AmbulanceVehicle_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceTrip" ADD CONSTRAINT "AmbulanceTrip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceTrip" ADD CONSTRAINT "AmbulanceTrip_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceTrip" ADD CONSTRAINT "AmbulanceTrip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "AmbulanceVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceTrip" ADD CONSTRAINT "AmbulanceTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceTrip" ADD CONSTRAINT "AmbulanceTrip_supportStaffId_fkey" FOREIGN KEY ("supportStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceTrip" ADD CONSTRAINT "AmbulanceTrip_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

