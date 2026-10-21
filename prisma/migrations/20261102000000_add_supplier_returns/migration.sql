-- CreateTable
CREATE TABLE "SupplierReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'GRN',
    "sourceReference" TEXT,
    "grnId" TEXT,
    "purchaseId" TEXT,
    "idempotencyKey" TEXT,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "totalQuantity" INTEGER NOT NULL,
    "notes" TEXT,
    "returnedById" TEXT,
    "returnedByName" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnItem" (
    "id" TEXT NOT NULL,
    "supplierReturnId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "returnQuantity" INTEGER NOT NULL,
    "reason" TEXT,
    "stockMovementId" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturn_returnNumber_tenantId_key" ON "SupplierReturn"("returnNumber", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturn_idempotencyKey_tenantId_key" ON "SupplierReturn"("idempotencyKey", "tenantId");

-- CreateIndex
CREATE INDEX "SupplierReturn_tenantId_idx" ON "SupplierReturn"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierReturn_unitId_idx" ON "SupplierReturn"("unitId");

-- CreateIndex
CREATE INDEX "SupplierReturn_vendorId_idx" ON "SupplierReturn"("vendorId");

-- CreateIndex
CREATE INDEX "SupplierReturn_returnDate_idx" ON "SupplierReturn"("returnDate");

-- CreateIndex
CREATE INDEX "SupplierReturn_grnId_idx" ON "SupplierReturn"("grnId");

-- CreateIndex
CREATE INDEX "SupplierReturn_purchaseId_idx" ON "SupplierReturn"("purchaseId");

-- CreateIndex
CREATE INDEX "SupplierReturn_idempotencyKey_idx" ON "SupplierReturn"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_supplierReturnId_idx" ON "SupplierReturnItem"("supplierReturnId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_productId_idx" ON "SupplierReturnItem"("productId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_batchId_idx" ON "SupplierReturnItem"("batchId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_tenantId_idx" ON "SupplierReturnItem"("tenantId");

-- CreateIndex
CREATE INDEX "SupplierReturnItem_unitId_idx" ON "SupplierReturnItem"("unitId");

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
