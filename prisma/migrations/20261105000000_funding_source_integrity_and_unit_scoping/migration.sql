-- Migration: 20261105000000_funding_source_integrity_and_unit_scoping
-- Description: Non-destructive schema alignment for funding sources, unit scoping, and donation reconciliation.

-- 1. Alter Donation: Add reconciliation status, timestamps, and allocated amount tracking
ALTER TABLE "Donation" 
    ADD COLUMN IF NOT EXISTS "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "reconciledById" TEXT,
    ADD COLUMN IF NOT EXISTS "allocatedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Donation_tenantId_reconciliationStatus_idx" ON "Donation"("tenantId", "reconciliationStatus");
CREATE INDEX IF NOT EXISTS "Donation_unitId_idx" ON "Donation"("unitId");

-- 2. Alter FundingAllocation: Add unit scoping, structured source types, and idempotency
ALTER TABLE "FundingAllocation"
    ADD COLUMN IF NOT EXISTS "unitId" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'DONATION',
    ADD COLUMN IF NOT EXISTS "sourceDonationId" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceAccountId" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceReference" TEXT,
    ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
    ADD COLUMN IF NOT EXISTS "allocatedById" TEXT;

CREATE INDEX IF NOT EXISTS "FundingAllocation_unitId_idx" ON "FundingAllocation"("unitId");
CREATE INDEX IF NOT EXISTS "FundingAllocation_sourceDonationId_idx" ON "FundingAllocation"("sourceDonationId");
CREATE INDEX IF NOT EXISTS "FundingAllocation_tenantId_idempotencyKey_idx" ON "FundingAllocation"("tenantId", "idempotencyKey");

-- 3. Add Foreign Key constraints for FundingAllocation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FundingAllocation_sourceDonationId_fkey'
    ) THEN
        ALTER TABLE "FundingAllocation" ADD CONSTRAINT "FundingAllocation_sourceDonationId_fkey" 
        FOREIGN KEY ("sourceDonationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 4. Alter ProjectExpenditure: Add unit scoping
ALTER TABLE "ProjectExpenditure"
    ADD COLUMN IF NOT EXISTS "unitId" TEXT;

CREATE INDEX IF NOT EXISTS "ProjectExpenditure_unitId_idx" ON "ProjectExpenditure"("unitId");
