-- AlterTable PurchaseOrderItem
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "unitPrice" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "totalAmount" DOUBLE PRECISION DEFAULT 0;

-- AlterTable PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "subtotal" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'INR';

-- AlterTable GoodsReceiptItem
ALTER TABLE "GoodsReceiptItem" ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "GoodsReceiptItem" ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "GoodsReceiptItem" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "GoodsReceiptItem" ADD COLUMN IF NOT EXISTS "totalCost" DOUBLE PRECISION DEFAULT 0;

-- AlterTable GoodsReceiptNote
ALTER TABLE "GoodsReceiptNote" ADD COLUMN IF NOT EXISTS "totalAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "GoodsReceiptNote" ADD COLUMN IF NOT EXISTS "invoiceNo" TEXT;
ALTER TABLE "GoodsReceiptNote" ADD COLUMN IF NOT EXISTS "invoiceDate" TIMESTAMP(3);

-- AlterTable ProductBatch
ALTER TABLE "ProductBatch" ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION DEFAULT 0;

-- AlterTable Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "averageCost" DOUBLE PRECISION DEFAULT 0;

-- AlterTable SupplierReturnItem
ALTER TABLE "SupplierReturnItem" ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "SupplierReturnItem" ADD COLUMN IF NOT EXISTS "totalCost" DOUBLE PRECISION DEFAULT 0;

-- CreateTable VendorBill
CREATE TABLE IF NOT EXISTS "VendorBill" (
    "id" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "goodsReceiptNoteId" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "accountTransactionId" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorBill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VendorBill_billNumber_tenantId_key" ON "VendorBill"("billNumber", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "VendorBill_idempotencyKey_tenantId_key" ON "VendorBill"("idempotencyKey", "tenantId");
CREATE INDEX IF NOT EXISTS "VendorBill_tenantId_idx" ON "VendorBill"("tenantId");
CREATE INDEX IF NOT EXISTS "VendorBill_unitId_idx" ON "VendorBill"("unitId");
CREATE INDEX IF NOT EXISTS "VendorBill_vendorId_idx" ON "VendorBill"("vendorId");
CREATE INDEX IF NOT EXISTS "VendorBill_status_idx" ON "VendorBill"("status");
CREATE INDEX IF NOT EXISTS "VendorBill_goodsReceiptNoteId_idx" ON "VendorBill"("goodsReceiptNoteId");

-- CreateTable VendorBillItem
CREATE TABLE IF NOT EXISTS "VendorBillItem" (
    "id" TEXT NOT NULL,
    "vendorBillId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "goodsReceiptItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorBillItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VendorBillItem_vendorBillId_idx" ON "VendorBillItem"("vendorBillId");
CREATE INDEX IF NOT EXISTS "VendorBillItem_productId_idx" ON "VendorBillItem"("productId");
CREATE INDEX IF NOT EXISTS "VendorBillItem_tenantId_idx" ON "VendorBillItem"("tenantId");
CREATE INDEX IF NOT EXISTS "VendorBillItem_unitId_idx" ON "VendorBillItem"("unitId");

-- CreateTable GLAccount
CREATE TABLE IF NOT EXISTS "GLAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "normalBalance" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GLAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GLAccount_code_tenantId_key" ON "GLAccount"("code", "tenantId");
CREATE INDEX IF NOT EXISTS "GLAccount_tenantId_idx" ON "GLAccount"("tenantId");
CREATE INDEX IF NOT EXISTS "GLAccount_accountType_idx" ON "GLAccount"("accountType");

-- CreateTable JournalEntry
CREATE TABLE IF NOT EXISTS "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceModule" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,
    "idempotencyKey" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_entryNumber_tenantId_key" ON "JournalEntry"("entryNumber", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_idempotencyKey_tenantId_key" ON "JournalEntry"("idempotencyKey", "tenantId");
CREATE INDEX IF NOT EXISTS "JournalEntry_tenantId_idx" ON "JournalEntry"("tenantId");
CREATE INDEX IF NOT EXISTS "JournalEntry_unitId_idx" ON "JournalEntry"("unitId");
CREATE INDEX IF NOT EXISTS "JournalEntry_sourceReference_idx" ON "JournalEntry"("sourceReference");
CREATE INDEX IF NOT EXISTS "JournalEntry_status_idx" ON "JournalEntry"("status");

-- CreateTable JournalLine
CREATE TABLE IF NOT EXISTS "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
CREATE INDEX IF NOT EXISTS "JournalLine_accountId_idx" ON "JournalLine"("accountId");
CREATE INDEX IF NOT EXISTS "JournalLine_tenantId_idx" ON "JournalLine"("tenantId");
CREATE INDEX IF NOT EXISTS "JournalLine_unitId_idx" ON "JournalLine"("unitId");
