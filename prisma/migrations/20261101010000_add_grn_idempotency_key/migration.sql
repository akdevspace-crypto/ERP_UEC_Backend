-- AlterTable: Add idempotencyKey column to GoodsReceiptNote
ALTER TABLE "GoodsReceiptNote" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex: Unique index scoped by (idempotencyKey, tenantId)
CREATE UNIQUE INDEX "GoodsReceiptNote_idempotencyKey_tenantId_key" ON "GoodsReceiptNote"("idempotencyKey", "tenantId");

-- CreateIndex: Index on idempotencyKey for fast lookups
CREATE INDEX "GoodsReceiptNote_idempotencyKey_idx" ON "GoodsReceiptNote"("idempotencyKey");
