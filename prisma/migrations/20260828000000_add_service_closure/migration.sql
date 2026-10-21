-- CreateEnum
CREATE TYPE "ClosureStatus" AS ENUM ('IN_PROGRESS', 'READY', 'EXECUTED');

-- AlterEnum
ALTER TYPE "ContractStatus" ADD VALUE 'COMPLETED';

-- CreateTable
CREATE TABLE "ServiceClosure" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "medicalCleared" BOOLEAN NOT NULL DEFAULT false,
    "medicalClearedById" TEXT,
    "medicalClearedAt" TIMESTAMP(3),
    "financeCleared" BOOLEAN NOT NULL DEFAULT false,
    "financeClearedById" TEXT,
    "financeClearedAt" TIMESTAMP(3),
    "assetCleared" BOOLEAN NOT NULL DEFAULT false,
    "assetClearedById" TEXT,
    "assetClearedAt" TIMESTAMP(3),
    "status" "ClosureStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "closingRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceClosure_admissionId_key" ON "ServiceClosure"("admissionId");

-- CreateIndex
CREATE INDEX "ServiceClosure_tenantId_idx" ON "ServiceClosure"("tenantId");

-- CreateIndex
CREATE INDEX "ServiceClosure_unitId_idx" ON "ServiceClosure"("unitId");

-- CreateIndex
CREATE INDEX "ServiceClosure_status_idx" ON "ServiceClosure"("status");

-- AddForeignKey
ALTER TABLE "ServiceClosure" ADD CONSTRAINT "ServiceClosure_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceClosure" ADD CONSTRAINT "ServiceClosure_medicalClearedById_fkey" FOREIGN KEY ("medicalClearedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceClosure" ADD CONSTRAINT "ServiceClosure_financeClearedById_fkey" FOREIGN KEY ("financeClearedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceClosure" ADD CONSTRAINT "ServiceClosure_assetClearedById_fkey" FOREIGN KEY ("assetClearedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

