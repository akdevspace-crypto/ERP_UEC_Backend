CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

CREATE TABLE "ServiceContract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "staffRequired" INTEGER,
    "shift" TEXT,
    "frequency" TEXT,
    "careRequirements" JSONB,
    "specialInstructions" TEXT,
    "servicePrice" DOUBLE PRECISION,
    "billingCycle" TEXT,
    "termsSnapshot" JSONB,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsAcceptedById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceContract_contractNumber_key" ON "ServiceContract"("contractNumber");
CREATE UNIQUE INDEX "ServiceContract_admissionId_key" ON "ServiceContract"("admissionId");
CREATE INDEX "ServiceContract_tenantId_idx" ON "ServiceContract"("tenantId");
CREATE INDEX "ServiceContract_unitId_idx" ON "ServiceContract"("unitId");
CREATE INDEX "ServiceContract_status_idx" ON "ServiceContract"("status");

ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_termsAcceptedById_fkey" FOREIGN KEY ("termsAcceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;