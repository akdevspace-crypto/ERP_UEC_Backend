-- Prepared migration SQL (DO NOT APPLY AUTOMATICALLY)
-- D8.3 Goods Receipt Note Idempotency Key & Posting Invariant
-- Mirrors migration directory: prisma/migrations/20261101010000_add_grn_idempotency_key/migration.sql

ALTER TABLE "GoodsReceiptNote" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "GoodsReceiptNote_idempotencyKey_tenantId_key" 
ON "GoodsReceiptNote"("idempotencyKey", "tenantId");

CREATE INDEX IF NOT EXISTS "GoodsReceiptNote_idempotencyKey_idx"
ON "GoodsReceiptNote"("idempotencyKey");
