-- Migration: 20261106000000_project_expenditure_payment_lifecycle
-- Description: Non-destructive addition of payment status, payment voucher tracking, rejection reasons, and audit fields to ProjectExpenditure.

ALTER TABLE "ProjectExpenditure"
    ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
    ADD COLUMN IF NOT EXISTS "submittedById" TEXT,
    ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    ADD COLUMN IF NOT EXISTS "paymentVoucherRef" TEXT,
    ADD COLUMN IF NOT EXISTS "paymentMode" TEXT,
    ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "paidById" TEXT,
    ADD COLUMN IF NOT EXISTS "justification" TEXT,
    ADD COLUMN IF NOT EXISTS "receiptRef" TEXT,
    ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE INDEX IF NOT EXISTS "ProjectExpenditure_approvalStatus_idx" ON "ProjectExpenditure"("approvalStatus");
CREATE INDEX IF NOT EXISTS "ProjectExpenditure_paymentStatus_idx" ON "ProjectExpenditure"("paymentStatus");
CREATE INDEX IF NOT EXISTS "ProjectExpenditure_paymentVoucherRef_idx" ON "ProjectExpenditure"("paymentVoucherRef");
CREATE INDEX IF NOT EXISTS "ProjectExpenditure_tenantId_idempotencyKey_idx" ON "ProjectExpenditure"("tenantId", "idempotencyKey");
