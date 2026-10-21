import { randomUUID } from 'crypto';
import { prisma } from '../../app/prisma.js';
import { generateRefNumber as generateRef } from '../../shared/utils/refGenerator.js';
let patientBillingReady = false;
export const ensurePatientBillingTables = async () => {
    if (patientBillingReady)
        return;
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PatientDailyCost" (
            "id" TEXT NOT NULL,
            "costNo" TEXT NOT NULL,
            "allocationId" TEXT NOT NULL,
            "admissionId" TEXT,
            "patientId" TEXT,
            "patientName" TEXT NOT NULL,
            "clientName" TEXT,
            "serviceType" TEXT NOT NULL,
            "costDate" DATE NOT NULL,
            "category" TEXT NOT NULL,
            "description" TEXT NOT NULL,
            "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
            "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
            "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
            "sourceType" TEXT,
            "sourceId" TEXT,
            "status" TEXT NOT NULL DEFAULT 'DRAFT',
            "invoiceId" TEXT,
            "invoiceRefNo" TEXT,
            "sentAt" TIMESTAMP(3),
            "sentVia" TEXT,
            "familyContact" TEXT,
            "tenantId" TEXT NOT NULL,
            "unitId" TEXT NOT NULL,
            "createdBy" TEXT,
            "isDeleted" BOOLEAN NOT NULL DEFAULT false,
            "deletedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "PatientDailyCost_pkey" PRIMARY KEY ("id")
        )
    `);
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "PatientDailyCost_costNo_key" ON "PatientDailyCost"("costNo")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PatientDailyCost_tenant_unit_idx" ON "PatientDailyCost"("tenantId", "unitId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PatientDailyCost_allocation_idx" ON "PatientDailyCost"("allocationId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PatientDailyCost_status_idx" ON "PatientDailyCost"("status")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PatientDailyCost_costDate_idx" ON "PatientDailyCost"("costDate")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PatientDailyCost_source_idx" ON "PatientDailyCost"("sourceType", "sourceId")');
    await prisma.$executeRawUnsafe('ALTER TABLE "PatientDailyCost" ADD COLUMN IF NOT EXISTS "metadata" JSONB');
    await prisma.$executeRawUnsafe('ALTER TABLE IF EXISTS "StockIssueRequest" ADD COLUMN IF NOT EXISTS "allocationId" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE IF EXISTS "StockIssueRequest" ADD COLUMN IF NOT EXISTS "patientId" TEXT');
    await prisma.$executeRawUnsafe('ALTER TABLE IF EXISTS "StockIssueRequest" ADD COLUMN IF NOT EXISTS "rate" DOUBLE PRECISION');
    await prisma.$executeRawUnsafe('ALTER TABLE IF EXISTS "StockIssueRequest" ADD COLUMN IF NOT EXISTS "amount" DOUBLE PRECISION');
    patientBillingReady = true;
};
const readNoteValue = (notes, label) => {
    const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.+)$`, 'im');
    return String(notes || '').match(pattern)?.[1]?.trim() || '';
};
const readNumericNoteValue = (notes, labels) => {
    for (const label of labels) {
        const value = readNoteValue(notes, label);
        const numeric = Number(String(value).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(numeric) && numeric >= 0)
            return numeric;
    }
    return 0;
};
const completionBillGroupId = (allocationId) => `ENQUIRY_COMPLETION:${allocationId}`;
const completionBillMetadata = (allocationId, extra = {}) => ({
    billType: 'ENQUIRY_COMPLETION',
    sourceGroupId: completionBillGroupId(allocationId),
    groupedBillLabel: 'Enquiry Completion Bill',
    ...extra
});
const toServiceRow = (allocation) => {
    const metadata = allocation.metadata && typeof allocation.metadata === 'object' ? allocation.metadata : {};
    const admission = allocation.enquiry?.admission || null;
    const patient = admission?.patient || null;
    const client = allocation.enquiry?.client || null;
    return {
        allocationId: allocation.id,
        admissionId: admission?.id || null,
        patientId: patient?.id || null,
        patientName: patient?.name || metadata.patientName || client?.name || 'Patient',
        clientName: client?.name || metadata.patientName || 'Client',
        serviceType: allocation.type,
        unitId: allocation.unitId
    };
};
const getAllocationForLedger = async (tx, allocationId, tenantId, expectedUnitId) => {
    const allocation = await tx.allocation.findFirst({
        where: {
            id: allocationId,
            tenantId,
            isDeleted: false
        },
        include: {
            enquiry: {
                include: {
                    client: true,
                    service: true,
                    admission: {
                        include: {
                            patient: true
                        }
                    }
                }
            }
        }
    });
    if (!allocation)
        return null;
    if (expectedUnitId && allocation.unitId !== expectedUnitId) {
        throw new Error(`Patient allocation ${allocationId} belongs to unit ${allocation.unitId}, which does not match expected unit ${expectedUnitId}`);
    }
    return toServiceRow(allocation);
};
export const createPatientLedgerEntryForAllocation = async (tx, payload) => {
    const sourceGroupId = payload.metadata?.sourceGroupId ? String(payload.metadata.sourceGroupId) : '';
    const invoiceRefNo = payload.metadata?.invoiceRefNo ? String(payload.metadata.invoiceRefNo) : '';
    const existing = await tx.$queryRaw `
        SELECT *
        FROM "PatientDailyCost"
        WHERE "tenantId" = ${payload.tenantId}
          AND "sourceType" = ${payload.sourceType}
          AND "sourceId" = ${payload.sourceId}
          AND "isDeleted" = false
        LIMIT 1
    `;
    if (existing?.[0])
        return existing[0];
    if (payload.sourceType === 'ACCOUNT_INVOICE' && sourceGroupId && invoiceRefNo) {
        const invoiceDuplicate = await tx.$queryRaw `
            SELECT *
            FROM "PatientDailyCost"
            WHERE "tenantId" = ${payload.tenantId}
              AND "allocationId" = ${payload.allocationId}
              AND "sourceType" = 'ACCOUNT_INVOICE'
              AND "metadata"->>'sourceGroupId' = ${sourceGroupId}
              AND "metadata"->>'invoiceRefNo' = ${invoiceRefNo}
              AND "isDeleted" = false
            ORDER BY "createdAt" ASC
            LIMIT 1
        `;
        if (invoiceDuplicate?.[0])
            return invoiceDuplicate[0];
    }
    const service = await getAllocationForLedger(tx, payload.allocationId, payload.tenantId, payload.expectedUnitId);
    if (!service)
        return null;
    const quantity = Number(payload.quantity || 0);
    const rate = Number(payload.rate || 0);
    const amount = Number((quantity * rate).toFixed(2));
    const id = randomUUID();
    const costNo = await generateRef('PDC', payload.tenantId, service.unitId, tx);
    const rows = await tx.$queryRaw `
        INSERT INTO "PatientDailyCost" (
            "id", "costNo", "allocationId", "admissionId", "patientId", "patientName", "clientName",
            "serviceType", "costDate", "category", "description", "quantity", "rate", "amount",
            "sourceType", "sourceId", "status", "metadata", "tenantId", "unitId", "createdBy", "createdAt", "updatedAt"
        )
        VALUES (
            ${id}, ${costNo}, ${service.allocationId}, ${service.admissionId}, ${service.patientId},
            ${service.patientName}, ${service.clientName}, ${service.serviceType}, ${payload.costDate ? new Date(payload.costDate) : new Date()},
            ${payload.category}, ${payload.description}, ${quantity}, ${rate}, ${amount},
            ${payload.sourceType}, ${payload.sourceId}, 'DRAFT', ${JSON.stringify(payload.metadata || {})}::jsonb,
            ${payload.tenantId}, ${service.unitId}, ${payload.createdBy || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
    `;
    return rows?.[0] || null;
};
export const cleanupDuplicateCompletionBillingEntries = async (tx, tenantId, allocationId) => {
    await tx.$executeRaw `
        WITH ranked AS (
            SELECT
                "id",
                ROW_NUMBER() OVER (
                    PARTITION BY "tenantId", "allocationId", "sourceType", "sourceId"
                    ORDER BY "createdAt" ASC, "id" ASC
                ) AS rn
            FROM "PatientDailyCost"
            WHERE "tenantId" = ${tenantId}
              AND "allocationId" = ${allocationId}
              AND "isDeleted" = false
              AND "sourceType" IS NOT NULL
              AND "sourceId" IS NOT NULL
        )
        UPDATE "PatientDailyCost" pdc
        SET "isDeleted" = true,
            "deletedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
        FROM ranked
        WHERE pdc."id" = ranked."id"
          AND ranked.rn > 1
    `;
    await tx.$executeRaw `
        WITH ranked AS (
            SELECT
                "id",
                ROW_NUMBER() OVER (
                    PARTITION BY "tenantId", "allocationId", "sourceType", "metadata"->>'sourceGroupId', "metadata"->>'invoiceRefNo'
                    ORDER BY "createdAt" ASC, "id" ASC
                ) AS rn
            FROM "PatientDailyCost"
            WHERE "tenantId" = ${tenantId}
              AND "allocationId" = ${allocationId}
              AND "isDeleted" = false
              AND "sourceType" = 'ACCOUNT_INVOICE'
              AND COALESCE("metadata"->>'sourceGroupId', '') <> ''
              AND COALESCE("metadata"->>'invoiceRefNo', '') <> ''
        )
        UPDATE "PatientDailyCost" pdc
        SET "isDeleted" = true,
            "deletedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
        FROM ranked
        WHERE pdc."id" = ranked."id"
          AND ranked.rn > 1
    `;
};
export const postStockIssueToPatientLedger = async (tx, request, userId) => {
    const usageType = String(request?.usageType || '').toUpperCase();
    if (usageType === 'KITCHEN_PREP')
        return null;
    if (!usageType.includes('PATIENT'))
        return null;
    const allocationId = request?.allocationId || readNoteValue(request?.notes, 'Allocation');
    if (!allocationId)
        return null;
    const quantity = Number(request.quantity || 0);
    const explicitRate = Number(request?.rate || 0);
    const amountRate = Number(request?.amount || 0) > 0 && quantity > 0 ? Number(request.amount) / quantity : 0;
    const noteRate = readNumericNoteValue(request?.notes, ['Rate', 'Unit Cost', 'Cost', 'Medicine Rate']);
    const productRate = Number(request?.product?.defaultRevenuePrice || 0);
    const rate = explicitRate || amountRate || noteRate || productRate;
    const needsRateReview = rate <= 0 ? ' | Rate review needed' : '';
    return createPatientLedgerEntryForAllocation(tx, {
        tenantId: request.tenantId,
        allocationId,
        expectedUnitId: request.unitId || null,
        costDate: request.approvedAt || new Date(),
        category: 'Medicine Charges',
        description: `${request.productName || 'Medicine'}${request.issuedTo ? ` for ${request.issuedTo}` : ''}${needsRateReview}`,
        quantity,
        rate,
        sourceType: 'INVENTORY_ISSUE',
        sourceId: request.id,
        createdBy: userId || null,
        metadata: completionBillMetadata(allocationId, {
            inventoryIssueId: request.id,
            productId: request.productId || null,
            usageType: request.usageType || null
        })
    });
};
export const postAccountInvoiceToPatientLedger = async (tx, invoice, userId) => {
    if (!invoice?.allocationId || invoice?.type !== 'INVOICE')
        return null;
    if (String(invoice?.metadata?.source || '') === 'PATIENT_EXPENSE_LEDGER')
        return null;
    const amount = Number(invoice.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0)
        return null;
    return createPatientLedgerEntryForAllocation(tx, {
        tenantId: invoice.tenantId,
        allocationId: invoice.allocationId,
        costDate: invoice.date || invoice.createdAt || new Date(),
        category: 'Care Service Charges',
        description: `Service bill ${invoice.refNo || ''}`.trim(),
        quantity: 1,
        rate: amount,
        sourceType: 'ACCOUNT_INVOICE',
        sourceId: invoice.id,
        createdBy: userId || null,
        metadata: completionBillMetadata(invoice.allocationId, {
            invoiceId: invoice.id,
            invoiceRefNo: invoice.refNo || null,
            invoiceCategory: invoice.category || null
        })
    });
};
export const postStaffChargeToPatientLedger = async (tx, allocation, userId, options = {}) => {
    if (!allocation?.id || !allocation?.tenantId)
        return null;
    const staffName = [allocation.staff?.firstName, allocation.staff?.lastName].filter(Boolean).join(' ').trim();
    const rate = Number(options.rate || 500);
    return createPatientLedgerEntryForAllocation(tx, {
        tenantId: allocation.tenantId,
        allocationId: allocation.id,
        costDate: options.costDate || new Date(),
        category: 'Doctor Consultation Charges',
        description: staffName ? `Doctor/staff check charge - ${staffName}` : 'Doctor/staff check charge',
        quantity: 1,
        rate,
        sourceType: 'STAFF_CHARGE',
        sourceId: allocation.id,
        createdBy: userId || null,
        metadata: completionBillMetadata(allocation.id, {
            staffId: allocation.staffId || null,
            staffName: staffName || null,
            fixedCharge: true
        })
    });
};
export const reconcileAllocationCompletionBilling = async (tx, payload) => {
    const allocation = await tx.allocation.findFirst({
        where: {
            id: payload.allocationId,
            tenantId: payload.tenantId,
            isDeleted: false
        },
        include: {
            staff: {
                select: { id: true, firstName: true, lastName: true }
            },
            enquiry: {
                include: {
                    client: {
                        select: { name: true }
                    },
                    service: {
                        select: { name: true }
                    }
                }
            }
        }
    });
    if (!allocation)
        return { serviceRows: 0, medicineRows: 0, staffRows: 0 };
    const allocationMetadata = allocation.metadata && typeof allocation.metadata === 'object' ? allocation.metadata : {};
    const clientNames = [
        allocation.enquiry?.client?.name,
        allocationMetadata.clientName,
        allocationMetadata.patientName
    ].map((value) => String(value || '').trim()).filter(Boolean);
    const invoices = await tx.accountTransaction.findMany({
        where: {
            tenantId: payload.tenantId,
            type: 'INVOICE',
            isDeleted: false,
            amount: { gt: 0 },
            OR: [
                { allocationId: payload.allocationId },
                { metadata: { path: ['allocationId'], equals: payload.allocationId } },
                { metadata: { path: ['allocationRef'], equals: allocation.refNo } }
            ]
        },
        orderBy: { createdAt: 'asc' }
    });
    let serviceRows = 0;
    for (const invoice of invoices) {
        const row = await postAccountInvoiceToPatientLedger(tx, {
            ...invoice,
            allocationId: invoice.allocationId || payload.allocationId
        }, payload.createdBy || null);
        if (row)
            serviceRows += 1;
    }
    const stockTable = await tx.$queryRaw `SELECT to_regclass('"StockIssueRequest"')::text AS "tableName"`;
    const stockIssues = stockTable?.[0]?.tableName
        ? await tx.$queryRaw `
            SELECT sir.*, p."defaultRevenuePrice"
            FROM "StockIssueRequest" sir
            LEFT JOIN "Product" p ON p."id" = sir."productId"
            WHERE sir."tenantId" = ${payload.tenantId}
              AND sir."status" = 'APPROVED'
              AND sir."isDeleted" = false
              AND (
                sir."allocationId" = ${payload.allocationId}
                OR sir."notes" ILIKE ${`%Allocation: ${payload.allocationId}%`}
                OR sir."notes" ILIKE ${`%Allocation:${payload.allocationId}%`}
              )
        `
        : [];
    let medicineRows = 0;
    for (const issue of stockIssues || []) {
        const row = await postStockIssueToPatientLedger(tx, {
            ...issue,
            allocationId: issue.allocationId || payload.allocationId,
            product: { defaultRevenuePrice: issue.defaultRevenuePrice }
        }, payload.createdBy || null);
        if (row)
            medicineRows += 1;
    }
    const staffRow = await postStaffChargeToPatientLedger(tx, allocation, payload.createdBy || null, {
        costDate: payload.completedAt || new Date()
    });
    await cleanupDuplicateCompletionBillingEntries(tx, payload.tenantId, payload.allocationId);
    return {
        serviceRows,
        medicineRows,
        staffRows: staffRow ? 1 : 0
    };
};
