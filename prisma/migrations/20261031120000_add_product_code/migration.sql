-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_code_key" ON "Product"("tenantId", "code");
