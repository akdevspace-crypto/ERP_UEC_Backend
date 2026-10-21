-- CreateTable: PhysicalCount
CREATE TABLE IF NOT EXISTS "PhysicalCount" (
    "id" TEXT NOT NULL,
    "auditNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "batchNumber" TEXT,
    "systemQuantityAtCount" INTEGER NOT NULL,
    "physicalQuantity" INTEGER,
    "variance" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "notes" TEXT,
    "countedById" TEXT,
    "countedByName" TEXT,
    "countedAt" TIMESTAMP(3),
    "reconciledById" TEXT,
    "reconciledByName" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciliationMovementId" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "PhysicalCount_tenantId_idx" ON "PhysicalCount"("tenantId");
CREATE INDEX IF NOT EXISTS "PhysicalCount_unitId_idx" ON "PhysicalCount"("unitId");
CREATE INDEX IF NOT EXISTS "PhysicalCount_productId_idx" ON "PhysicalCount"("productId");
CREATE INDEX IF NOT EXISTS "PhysicalCount_batchId_idx" ON "PhysicalCount"("batchId");
CREATE INDEX IF NOT EXISTS "PhysicalCount_status_idx" ON "PhysicalCount"("status");
CREATE INDEX IF NOT EXISTS "PhysicalCount_createdAt_idx" ON "PhysicalCount"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PhysicalCount_productId_fkey'
    ) THEN
        ALTER TABLE "PhysicalCount" ADD CONSTRAINT "PhysicalCount_productId_fkey" 
        FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PhysicalCount_batchId_fkey'
    ) THEN
        ALTER TABLE "PhysicalCount" ADD CONSTRAINT "PhysicalCount_batchId_fkey" 
        FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
