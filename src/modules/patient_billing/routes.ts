import { recurringBillingService } from './recurringBilling.service.js';
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../../app/prisma.js';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { requireAnyPermission } from '../../shared/middleware/rbac.middleware.js';
import { generateRefNumber as generateRef } from '../../shared/utils/refGenerator.js';
import { canReadFacilityWide } from '../../shared/utils/rbac.js';
import {
    cleanupDuplicateCompletionBillingEntries,
    ensurePatientBillingTables as ensureLedgerPatientBillingTables,
    reconcileAllocationCompletionBilling
} from './ledger.js';
import { postMonthlyPatientInvoiceToLedger } from '../accounts/service.js';
import axios from 'axios';
import { uploadToSupabase } from '../../shared/utils/supabase.js';

const router = Router();

const billingAdminRoles = ['SUPER_ADMIN', 'SUPERADMIN', 'ADMIN', 'UNCF_ADMIN', 'FINANCE_MANAGER'];
const billingViewRoles = ['SUPER_ADMIN', 'SUPERADMIN', 'ADMIN', 'UNCF_ADMIN', 'FINANCE_MANAGER', 'HOME_CARE_MANAGER', 'PATIENT_CARE_MANAGER'];
const billingPermissions = ['Finance', 'Finance Dashboard', 'Invoice', 'Patient Billing', 'Patient Expense Ledger', 'ALL_ACCESS'];
const billingViewPermissions = ['Finance', 'Finance Dashboard', 'Invoice', 'Patient Billing', 'Patient Expense Ledger', 'Home Care', 'Home Care Manager', 'Home Care Dashboard', 'Service Contracts', 'ALL_ACCESS'];

const caregiverRevenueRoles = [
    ...billingAdminRoles,
    'NURSING_MANAGER',
    'MEDICAL_MANAGER',
    'NURSE',
    'NURSING_CARE_STAFF',
    'MEDICAL_DOCTOR',
    'PATIENT_CARE_MANAGER',
    'HOME_CARE_MANAGER'
];
const caregiverRevenuePermissions = [
    ...billingPermissions,
    'Inhouse Care',
    'Nursing',
    'Daily Care Checklist',
    'Medical Operations',
    'In-House Care',
    'Care Management'
];

const require = createRequire(import.meta.url);
const multer: any = require('multer');
const billUploadDir = path.join(process.cwd(), 'public', 'uploads', 'patient-bills');
fs.mkdirSync(billUploadDir, { recursive: true });

const billUpload = multer({
    storage: multer.diskStorage({
        destination: billUploadDir,
        filename: (_req: any, file: any, cb: any) => {
            const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            cb(null, `${Date.now()}-${randomUUID()}-${safeName}`);
        }
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) return cb(new Error('Only PDF, JPG and PNG bills can be uploaded'));
        cb(null, true);
    }
});

const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const costEntrySchema = z.object({
    allocationId: z.string().uuid(),
    costDate: z.string().min(1),
    category: z.string().min(1),
    description: z.string().min(1),
    quantity: z.number().positive(),
    rate: z.number().min(0),
    sourceType: z.string().optional().nullable(),
    sourceId: z.string().optional().nullable()
});

const invoiceSchema = z.object({
    entryIds: z.array(z.string().uuid()).optional(),
    allocationId: z.string().uuid().optional(),
    periodFrom: z.string().optional(),
    periodTo: z.string().optional(),
    upiId: z.string().optional().nullable(),
    qrLabel: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
}).refine((data) => (data.entryIds?.length || (data.allocationId && data.periodFrom && data.periodTo)), {
    message: 'Select ledger entries or provide patient/service with billing period'
});

const paymentSentSchema = z.object({
    invoiceId: z.string().uuid(),
    sentVia: z.string().optional().nullable(),
    familyContact: z.string().optional().nullable()
});

const uploadBillSchema = z.object({
    allocationId: z.string().uuid(),
    costDate: z.string().min(1),
    category: z.string().min(1),
    description: z.string().min(1),
    quantity: z.coerce.number().positive(),
    rate: z.coerce.number().min(0),
    sourceId: z.string().optional().nullable()
});

const caregiverRevenueItemSchema = z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    category: z.string().optional().nullable(),
    unit: z.string().optional().default('Nos'),
    rate: z.number().min(0).default(0),
    days: z.record(z.string(), z.number().min(0)).default({})
});

const caregiverRevenueSheetSchema = z.object({
    allocationId: z.string().uuid().optional().nullable(),
    patientId: z.string().optional().nullable(),
    patientName: z.string().min(1),
    clientName: z.string().optional().nullable(),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
    items: z.array(caregiverRevenueItemSchema).default([]),
    signatures: z.object({
        caregiverDay: z.string().optional().default(''),
        caregiverNight: z.string().optional().default(''),
        nurse: z.string().optional().default(''),
        manager: z.string().optional().default('')
    }).optional().default({ caregiverDay: '', caregiverNight: '', nurse: '', manager: '' }),
    status: z.string().optional().default('DRAFT')
});

let patientBillingReady = false;
let caregiverRevenueSheetReady = false;

const scope = (req: any) => ({
    tenantId: req.user.tenantId,
    unitId: req.user.unitId
});

const canReadAllUnits = (user: any) => {
    return canReadFacilityWide(user);
};

const medicinePattern = /medicine|medical|tablet|syrup|capsule|injection|clinical|pharma|drug|dolo|paracetamol|antibiotic|vitamin/i;

const ensurePatientBillingTables = async () => {
    if (patientBillingReady) return;

    await (prisma as any).$executeRawUnsafe(`
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
    await (prisma as any).$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "PatientDailyCost_costNo_key" ON "PatientDailyCost"("costNo")');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PatientDailyCost_tenant_unit_idx" ON "PatientDailyCost"("tenantId", "unitId")');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PatientDailyCost_allocation_idx" ON "PatientDailyCost"("allocationId")');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PatientDailyCost_status_idx" ON "PatientDailyCost"("status")');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PatientDailyCost_costDate_idx" ON "PatientDailyCost"("costDate")');
    await (prisma as any).$executeRawUnsafe('ALTER TABLE "PatientDailyCost" ADD COLUMN IF NOT EXISTS "metadata" JSONB');

    patientBillingReady = true;
};

const ensureCaregiverRevenueSheetTable = async () => {
    if (caregiverRevenueSheetReady) return;

    await (prisma as any).$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CaregiverRevenueSheet" (
            "id" TEXT NOT NULL,
            "allocationId" TEXT,
            "patientId" TEXT,
            "patientName" TEXT NOT NULL,
            "clientName" TEXT,
            "month" TEXT NOT NULL,
            "items" JSONB NOT NULL DEFAULT '[]'::jsonb,
            "signatures" JSONB NOT NULL DEFAULT '{}'::jsonb,
            "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
            "status" TEXT NOT NULL DEFAULT 'DRAFT',
            "tenantId" TEXT NOT NULL,
            "unitId" TEXT NOT NULL,
            "createdBy" TEXT,
            "isDeleted" BOOLEAN NOT NULL DEFAULT false,
            "deletedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "CaregiverRevenueSheet_pkey" PRIMARY KEY ("id")
        )
    `);
    await (prisma as any).$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "CaregiverRevenueSheet_patient_month_key" ON "CaregiverRevenueSheet"(COALESCE("allocationId", "patientId", "patientName"), "month", "tenantId", "unitId") WHERE "isDeleted" = false');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CaregiverRevenueSheet_tenant_unit_idx" ON "CaregiverRevenueSheet"("tenantId", "unitId")');
    await (prisma as any).$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "CaregiverRevenueSheet_month_idx" ON "CaregiverRevenueSheet"("month")');

    caregiverRevenueSheetReady = true;
};

const caregiverRevenueSourcePrefix = (sheetId: string) => `CAREGIVER_REVENUE_SHEET:${sheetId}:`;

const caregiverLedgerCategory = (item: any) => {
    const category = String(item?.category || '').trim();
    if (category) return category;

    const label = String(item?.label || '').toLowerCase();
    if (/doctor|consult/.test(label)) return 'Doctor Consultation';
    if (/lab|test/.test(label)) return 'Lab';
    if (/medicine|tablet|insulin|injection|dolo|antibiotic|vitamin|bp|diabetes/.test(label)) return 'Medicine';
    if (/caregiver|nursing|physio|service|dressing|hygiene|bath/.test(label)) return 'Care Services';
    if (/ambulance|transport|trip/.test(label)) return 'Transport';
    return 'Medical Consumables';
};

const dateForSheetDay = (month: string, dayValue: string) => {
    const [year, monthNumber] = month.split('-').map((value) => Number(value));
    const day = Number(dayValue);
    if (!year || !monthNumber || !Number.isInteger(day) || day < 1) return null;
    const lastDay = new Date(year, monthNumber, 0).getDate();
    if (day > lastDay) return null;
    return new Date(Date.UTC(year, monthNumber - 1, day));
};

const totalCaregiverRevenueSheet = (items: any[], month: string) => Number(items
    .reduce((sheetTotal, item) => {
        const days = item?.days && typeof item.days === 'object' ? item.days : {};
        const quantity = Object.entries(days).reduce((sum: number, [day, value]: any) => (
            dateForSheetDay(month, day) ? sum + Number(value || 0) : sum
        ), 0);
        return sheetTotal + quantity * Number(item?.rate || 0);
    }, 0)
    .toFixed(2));

const reserveRefNumbers = async (tx: any, prefix: string, tenantId: string, unitId: string, count: number) => {
    if (count <= 0) return [];

    const rows = await tx.$queryRaw`
        INSERT INTO "RefCounter" ("id", "prefix", "tenantId", "unitId", "current")
        VALUES (${randomUUID()}, ${prefix}, ${tenantId}, ${unitId}, ${count})
        ON CONFLICT ("prefix", "tenantId")
        DO UPDATE SET
            "current" = "RefCounter"."current" + ${count},
            "unitId" = ${unitId}
        RETURNING "current"
    `;
    const current = Number(rows?.[0]?.current || 0);
    const first = current - count + 1;

    return Array.from({ length: count }, (_, index) => `${prefix}-${String(first + index).padStart(6, '0')}`);
};

const buildCaregiverLedgerRows = (sheetId: string, validated: any, service: any) => {
    const rows: any[] = [];

    for (const item of validated.items || []) {
        const rate = Number(item?.rate || 0);
        if (rate <= 0) continue;

        const days = item?.days && typeof item.days === 'object' ? item.days : {};
        for (const [day, rawQuantity] of Object.entries(days)) {
            const quantity = Number(rawQuantity || 0);
            if (quantity <= 0) continue;

            const costDate = dateForSheetDay(validated.month, day);
            if (!costDate) continue;

            rows.push({
                allocationId: service.allocationId,
                admissionId: service.admissionId,
                patientId: service.patientId || validated.patientId || null,
                patientName: service.patientName || validated.patientName,
                clientName: service.clientName || validated.clientName || null,
                serviceType: service.serviceType || 'IN_HOUSE',
                costDate,
                category: caregiverLedgerCategory(item),
                description: item.label,
                quantity,
                rate,
                amount: Number((quantity * rate).toFixed(2)),
                sourceType: 'CAREGIVER_REVENUE_SHEET',
                sourceId: `${caregiverRevenueSourcePrefix(sheetId)}${item.key}:${day}`,
                metadata: {
                    source: 'CAREGIVER_REVENUE_SHEET',
                    sheetId,
                    sheetMonth: validated.month,
                    itemKey: item.key,
                    unit: item.unit || 'Nos',
                    day: Number(day)
                }
            });
        }
    }

    return rows;
};

const syncCaregiverRevenueToLedger = async (tx: any, sheetId: string, validated: any, tenantId: string, userId?: string | null) => {
    if (!validated.allocationId) return { skipped: true, reason: 'NO_ALLOCATION', syncedRows: 0 };

    const { service } = await getAllocationForCost(tx, validated.allocationId, tenantId);
    const sourcePrefix = caregiverRevenueSourcePrefix(sheetId);
    const sourcePattern = `${sourcePrefix}%`;
    const lockedRows = await tx.$queryRaw`
        SELECT "id", "invoiceRefNo", "status"
        FROM "PatientDailyCost"
        WHERE "tenantId" = ${tenantId}
          AND "sourceType" = 'CAREGIVER_REVENUE_SHEET'
          AND "sourceId" LIKE ${sourcePattern}
          AND "isDeleted" = false
          AND ("invoiceId" IS NOT NULL OR "status" NOT IN ('DRAFT', 'REVIEWED'))
        LIMIT 1
    `;

    if (lockedRows?.length) {
        const error: any = new Error(`This caregiver revenue sheet is already linked to invoice ${lockedRows[0].invoiceRefNo || lockedRows[0].status}. Create an adjustment entry instead of overwriting it.`);
        error.status = 409;
        throw error;
    }

    await tx.$executeRaw`
        UPDATE "PatientDailyCost"
        SET "isDeleted" = true,
            "deletedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "tenantId" = ${tenantId}
          AND "sourceType" = 'CAREGIVER_REVENUE_SHEET'
          AND "sourceId" LIKE ${sourcePattern}
          AND "isDeleted" = false
          AND "status" IN ('DRAFT', 'REVIEWED')
    `;

    const ledgerRows = buildCaregiverLedgerRows(sheetId, validated, service);
    const costNumbers = await reserveRefNumbers(tx, 'PDC', tenantId, service.unitId, ledgerRows.length);
    for (const [index, row] of ledgerRows.entries()) {
        const costNo = costNumbers[index];
        await tx.$queryRaw`
            INSERT INTO "PatientDailyCost" (
                "id", "costNo", "allocationId", "admissionId", "patientId", "patientName", "clientName",
                "serviceType", "costDate", "category", "description", "quantity", "rate", "amount",
                "sourceType", "sourceId", "status", "metadata", "tenantId", "unitId", "createdBy", "createdAt", "updatedAt"
            )
            VALUES (
                ${randomUUID()}, ${costNo}, ${row.allocationId}, ${row.admissionId}, ${row.patientId},
                ${row.patientName}, ${row.clientName}, ${row.serviceType}, ${row.costDate},
                ${row.category}, ${row.description}, ${row.quantity}, ${row.rate}, ${row.amount},
                ${row.sourceType}, ${row.sourceId}, 'DRAFT', ${JSON.stringify(row.metadata)}::jsonb,
                ${tenantId}, ${service.unitId}, ${userId || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING *
        `;
    }

    return { skipped: false, syncedRows: ledgerRows.length };
};

const toCaregiverRevenueSheet = (row: any) => ({
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
    signatures: row.signatures && typeof row.signatures === 'object' && !Array.isArray(row.signatures) ? row.signatures : {}
});

const allocationInclude = {
    staff: {
        select: { firstName: true, lastName: true }
    },
    enquiry: {
        select: {
            client: {
                select: {
                    name: true,
                    mobile: true,
                    email: true
                }
            },
            service: {
                select: {
                    name: true
                }
            },
            admission: {
                select: {
                    id: true,
                    patient: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            }
        }
    }
};

const serviceLabel = (type: string) => String(type || 'SERVICE').replace(/_/g, ' ');

const chargeGroupForCategory = (category: string) => {
    const value = String(category || '').toLowerCase();
    if (value.includes('room') || value.includes('accommodation')) return 'Accommodation Charges';
    if (value.includes('care') || value.includes('staff') || value.includes('duty') || value.includes('service') || value.includes('extra hours')) return 'Care Service Charges';
    if (value.includes('consumable') || value.includes('diaper') || value.includes('glove') || value.includes('mask') || value.includes('catheter') || value.includes('uro') || value.includes('dressing') || value.includes('underpad') || value.includes('rubber')) return 'Consumable Charges';
    if (value.includes('medicine') || value.includes('injection')) return 'Medicine Charges';
    if (value.includes('doctor') || value.includes('consult')) return 'Doctor Consultation Charges';
    if (value.includes('lab') || value.includes('test')) return 'Lab Charges';
    return 'Other Charges';
};

const buildChargeSummary = (entries: any[]) => {
    const groups = [
        'Accommodation Charges',
        'Care Service Charges',
        'Medicine Charges',
        'Doctor Consultation Charges',
        'Consumable Charges',
        'Lab Charges',
        'Other Charges'
    ];

    return groups.map((name) => ({
        name,
        amount: Number(entries
            .filter((entry: any) => chargeGroupForCategory(entry.category) === name)
            .reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0)
            .toFixed(2))
    }));
};

const toServiceRow = (allocation: any) => {
    const metadata = allocation.metadata && typeof allocation.metadata === 'object' ? allocation.metadata : {};
    const admission = allocation.enquiry?.admission || null;
    const patient = admission?.patient || null;
    const client = allocation.enquiry?.client || null;

    return {
        allocationId: allocation.id,
        allocationRef: allocation.refNo,
        admissionId: admission?.id || null,
        patientId: patient?.id || null,
        patientName: patient?.name || metadata.patientName || client?.name || 'Patient',
        clientName: client?.name || metadata.patientName || 'Client',
        familyContact: client?.mobile || client?.email || '',
        serviceType: allocation.type,
        serviceLabel: serviceLabel(allocation.type),
        serviceName: allocation.enquiry?.service?.name || serviceLabel(allocation.type),
        status: allocation.status,
        startDate: allocation.startDate,
        unitId: allocation.unitId
    };
};

const getAllocationForCost = async (tx: any, allocationId: string, tenantId: string) => {
    const allocation = await tx.allocation.findFirst({
        where: {
            id: allocationId,
            tenantId,
            isDeleted: false
        },
        include: allocationInclude
    });

    if (!allocation) {
        const error: any = new Error('Service allocation not found for daily cost');
        error.status = 404;
        throw error;
    }

    return { allocation, service: toServiceRow(allocation) };
};

router.get('/services', auth, enforceTenant, requireAnyPermission(billingViewPermissions, billingViewRoles), async (req: any, res: any) => {
    try {
        const { tenantId, unitId } = scope(req);
        const includeAllUnits = canReadAllUnits(req.user) && req.query?.scope === 'all';
        const allocations = await (prisma as any).allocation.findMany({
            where: {
                tenantId,
                isDeleted: false,
                ...(includeAllUnits ? {} : { unitId }),
                status: { in: ['PENDING', 'ALLOCATED', 'ON_HOLD', 'COMPLETED'] }
            },
            include: allocationInclude,
            orderBy: { updatedAt: 'desc' },
            take: 500
        });

        res.json({ success: true, data: allocations.map(toServiceRow) });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/entries', auth, enforceTenant, requireAnyPermission(billingViewPermissions, billingViewRoles), async (req: any, res: any) => {
    try {
        await ensurePatientBillingTables();
        await ensureLedgerPatientBillingTables();
        const { tenantId, unitId } = scope(req);
        const includeAllUnits = canReadAllUnits(req.user) && String(req.query?.scope || '').toLowerCase() === 'all';

        const completedAllocationRows = includeAllUnits
            ? await (prisma as any).$queryRaw`
                SELECT a."id" AS "allocationId",
                       COALESCE(a."endDate", a."updatedAt", a."createdAt") AS "completedAt"
                FROM "Allocation" a
                JOIN "Enquiry" e ON e."id" = a."enquiryId"
                WHERE a."tenantId" = ${tenantId}
                  AND a."isDeleted" = false
                  AND a."status" = 'COMPLETED'
                  AND (a."metadata"->>'enquiryCompletionBillingSyncedAt' IS NULL)
                  AND e."isDeleted" = false
                  AND (e."status" = 'CLOSED' OR e."isConverted" = true)
                ORDER BY a."updatedAt" DESC
                LIMIT 50
            `
            : await (prisma as any).$queryRaw`
                SELECT a."id" AS "allocationId",
                       COALESCE(a."endDate", a."updatedAt", a."createdAt") AS "completedAt"
                FROM "Allocation" a
                JOIN "Enquiry" e ON e."id" = a."enquiryId"
                WHERE a."tenantId" = ${tenantId}
                  AND a."unitId" = ${unitId}
                  AND a."isDeleted" = false
                  AND a."status" = 'COMPLETED'
                  AND (a."metadata"->>'enquiryCompletionBillingSyncedAt' IS NULL)
                  AND e."isDeleted" = false
                  AND (e."status" = 'CLOSED' OR e."isConverted" = true)
                ORDER BY a."updatedAt" DESC
                LIMIT 50
            `;

        const existingCompletionRows: any[] = []; // Disable full re-sync on every GET request to prevent timeouts

        const completionByAllocation = new Map<string, any>();
        [...(completedAllocationRows || []), ...(existingCompletionRows || [])].forEach((row: any) => {
            if (!row?.allocationId) return;
            completionByAllocation.set(row.allocationId, row);
        });

        const completionGroups = Array.from(completionByAllocation.values());
        const batchSize = 25;
        for (let i = 0; i < completionGroups.length; i += batchSize) {
            const batch = completionGroups.slice(i, i + batchSize);
            await (prisma as any).$transaction(async (tx: any) => {
                for (const group of batch) {
                    if (!group.allocationId) continue;
                    const syncResult = await reconcileAllocationCompletionBilling(tx, {
                        tenantId,
                        allocationId: group.allocationId,
                        completedAt: group.completedAt || new Date(),
                        createdBy: req.user?.id || null
                    });
                    await cleanupDuplicateCompletionBillingEntries(tx, tenantId, group.allocationId);

                    const latestAllocation = await tx.allocation.findFirst({
                        where: {
                            id: group.allocationId,
                            tenantId,
                            isDeleted: false
                        },
                        select: { id: true, metadata: true }
                    });

                    if (latestAllocation) {
                        const metadata = latestAllocation.metadata && typeof latestAllocation.metadata === 'object'
                            ? latestAllocation.metadata
                            : {};
                        await tx.allocation.update({
                            where: { id: latestAllocation.id },
                            data: {
                                metadata: {
                                    ...metadata,
                                    enquiryCompletionBillingSyncedAt: new Date(),
                                    enquiryCompletionBillingSync: syncResult
                                }
                            }
                        });
                    }
                }
            }, {
                maxWait: 10000,
                timeout: 60000
            });
        }

        const entries = includeAllUnits
            ? await (prisma as any).$queryRaw`
                SELECT *
                FROM "PatientDailyCost"
                WHERE "tenantId" = ${tenantId}
                  AND "isDeleted" = false
                ORDER BY "costDate" DESC, "createdAt" DESC
            `
            : await (prisma as any).$queryRaw`
                SELECT *
                FROM "PatientDailyCost"
                WHERE "tenantId" = ${tenantId}
                  AND "unitId" = ${unitId}
                  AND "isDeleted" = false
                ORDER BY "costDate" DESC, "createdAt" DESC
            `;

        console.log(`[DEBUG GET /entries] tenantId=${tenantId} unitId=${unitId} includeAllUnits=${includeAllUnits}`);
        console.log(`[DEBUG GET /entries] Found ${entries?.length || 0} entries`);
        if (entries?.length > 0) console.log(`[DEBUG GET /entries] First entry:`, entries[0].patientName, entries[0].unitId);

        res.json({ success: true, data: entries || [] });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/caregiver-revenue-sheets', auth, enforceTenant, requireAnyPermission(caregiverRevenuePermissions, caregiverRevenueRoles), async (req: any, res: any) => {
    try {
        await ensureCaregiverRevenueSheetTable();
        const readScope = String(req.query.scope || '').toLowerCase() === 'all' && canReadAllUnits(req.user)
            ? { tenantId: req.user.tenantId, unitId: null }
            : scope(req);
        const month = String(req.query.month || '').trim();

        const rows = await (prisma as any).$queryRaw`
            SELECT *
            FROM "CaregiverRevenueSheet"
            WHERE "tenantId" = ${readScope.tenantId}
              AND (${readScope.unitId || null}::text IS NULL OR "unitId" = ${readScope.unitId || null})
              AND "isDeleted" = false
              AND (${month || null}::text IS NULL OR "month" = ${month || null})
            ORDER BY "month" DESC, "updatedAt" DESC
        `;

        res.json({ success: true, data: rows.map(toCaregiverRevenueSheet) });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/caregiver-revenue-sheets', auth, enforceTenant, requireAnyPermission(caregiverRevenuePermissions, caregiverRevenueRoles), async (req: any, res: any) => {
    try {
        await ensurePatientBillingTables();
        await ensureCaregiverRevenueSheetTable();
        const validated = caregiverRevenueSheetSchema.parse(req.body);
        const activeScope = scope(req);
        const totalAmount = totalCaregiverRevenueSheet(validated.items, validated.month);
        const identity = validated.allocationId || validated.patientId || validated.patientName;

        const result = await (prisma as any).$transaction(async (tx: any) => {
            let targetAllocationId = validated.allocationId || null;
            let targetClientName = validated.clientName || null;

            if (!targetAllocationId && (validated.patientId || validated.patientName)) {
                try {
                    const foundAlloc = await tx.allocation.findFirst({
                        where: {
                            tenantId: activeScope.tenantId,
                            isDeleted: false,
                            OR: [
                                ...(validated.patientId ? [{ enquiry: { admission: { patientId: validated.patientId } } }] : []),
                                { enquiry: { admission: { patient: { name: { equals: validated.patientName, mode: 'insensitive' } } } } }
                            ]
                        },
                        include: allocationInclude,
                        orderBy: { updatedAt: 'desc' }
                    });
                    if (foundAlloc) {
                        targetAllocationId = foundAlloc.id;
                        if (!targetClientName) {
                            targetClientName = toServiceRow(foundAlloc).clientName;
                        }
                    }
                } catch (e) {
                    console.warn('[CaregiverRevenueSheet] Allocation auto-resolve skipped:', e.message);
                }
            }

            const targetUnit = targetAllocationId
                ? await tx.allocation.findFirst({
                    where: {
                        id: targetAllocationId,
                        tenantId: activeScope.tenantId,
                        isDeleted: false
                    },
                    select: { unitId: true }
                })
                : null;
            const sheetUnitId = targetUnit?.unitId || activeScope.unitId;

            const existing = await tx.$queryRaw`
                SELECT "id"
                FROM "CaregiverRevenueSheet"
                WHERE "tenantId" = ${activeScope.tenantId}
                  AND "unitId" = ${sheetUnitId}
                  AND "month" = ${validated.month}
                  AND "isDeleted" = false
                  AND COALESCE("allocationId", "patientId", "patientName") = ${identity}
                LIMIT 1
            `;

            const id = existing?.[0]?.id || randomUUID();
            const rows = existing?.[0]
                ? await tx.$queryRaw`
                    UPDATE "CaregiverRevenueSheet"
                    SET "allocationId" = ${targetAllocationId},
                        "patientId" = ${validated.patientId || null},
                        "patientName" = ${validated.patientName},
                        "clientName" = ${targetClientName},
                        "items" = ${JSON.stringify(validated.items)}::jsonb,
                        "signatures" = ${JSON.stringify(validated.signatures || {})}::jsonb,
                        "totalAmount" = ${totalAmount},
                        "status" = ${validated.status || 'DRAFT'},
                        "updatedAt" = CURRENT_TIMESTAMP
                    WHERE "id" = ${id}
                    RETURNING *
                `
                : await tx.$queryRaw`
                    INSERT INTO "CaregiverRevenueSheet" (
                        "id", "allocationId", "patientId", "patientName", "clientName", "month",
                        "items", "signatures", "totalAmount", "status", "tenantId", "unitId", "createdBy",
                        "createdAt", "updatedAt"
                    )
                    VALUES (
                        ${id}, ${targetAllocationId}, ${validated.patientId || null}, ${validated.patientName},
                        ${targetClientName}, ${validated.month}, ${JSON.stringify(validated.items)}::jsonb,
                        ${JSON.stringify(validated.signatures || {})}::jsonb, ${totalAmount}, ${validated.status || 'DRAFT'},
                        ${activeScope.tenantId}, ${sheetUnitId}, ${req.user.id || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    RETURNING *
                `;

            const payloadForLedger = {
                ...validated,
                allocationId: targetAllocationId,
                clientName: targetClientName
            };
            const ledgerSync = await syncCaregiverRevenueToLedger(tx, id, payloadForLedger, activeScope.tenantId, req.user.id || null);
            return { sheet: rows[0], ledgerSync };
        }, {
            maxWait: 10000,
            timeout: 60000
        });

        res.status(201).json({
            success: true,
            data: {
                ...toCaregiverRevenueSheet(result.sheet),
                ledgerSync: result.ledgerSync
            },
            message: result.ledgerSync?.skipped
                ? 'Caregiver revenue sheet saved'
                : `Caregiver revenue sheet saved and ${result.ledgerSync.syncedRows} billing ledger rows synced`
        });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.get('/medicine-catalog', auth, enforceTenant, requireAnyPermission(billingViewPermissions, billingViewRoles), async (req: any, res: any) => {
    try {
        await ensurePatientBillingTables();
        const { tenantId, unitId } = scope(req);
        const includeAllUnits = canReadAllUnits(req.user) && req.query?.scope === 'all';

        const [products, stockRows, recentRates] = await Promise.all([
            (prisma as any).product.findMany({
                where: {
                    tenantId,
                    ...(includeAllUnits ? {} : { unitId })
                },
                orderBy: { updatedAt: 'desc' },
                take: 500
            }),
            (prisma as any).stock.findMany({
                where: {
                    tenantId,
                    ...(includeAllUnits ? {} : { unitId })
                },
                include: { product: true },
                orderBy: { updatedAt: 'desc' },
                take: 500
            }),
            (prisma as any).$queryRaw`
                SELECT "description", "category", "rate", "sourceId", "createdAt"
                FROM "PatientDailyCost"
                WHERE "tenantId" = ${tenantId}
                  AND "isDeleted" = false
                  AND "rate" > 0
                ORDER BY "createdAt" DESC
                LIMIT 500
            `
        ]);

        const stockByProduct = new Map<string, any>();
        for (const row of stockRows || []) stockByProduct.set(row.productId, row);

        const findRate = (name: string) => {
            const normalizedName = String(name || '').toLowerCase();
            const match = (recentRates || []).find((row: any) => String(row.description || '').toLowerCase().includes(normalizedName));
            return match ? { rate: Number(match.rate || 0), source: 'Last Ledger Rate' } : { rate: 0, source: 'Manual Rate Required' };
        };

        const catalog = (products || [])
            .filter((product: any) => medicinePattern.test(`${product.name} ${product.category}`))
            .map((product: any) => {
                const stock = stockByProduct.get(product.id);
                const rateInfo = findRate(product.name);
                return {
                    id: product.id,
                    productId: product.id,
                    name: product.name,
                    category: product.category,
                    availableQty: Number(stock?.quantity || 0),
                    suggestedRate: rateInfo.rate,
                    rateSource: rateInfo.source,
                    unitId: product.unitId
                };
            });

        const ledgerOnly = new Map<string, any>();
        for (const row of recentRates || []) {
            if (!medicinePattern.test(`${row.description} ${row.category}`)) continue;
            const name = String(row.description || '').split('|')[0].trim();
            const key = name.toLowerCase();
            if (!key || ledgerOnly.has(key)) continue;
            ledgerOnly.set(key, {
                id: `ledger-${key}`,
                productId: null,
                name,
                category: row.category || 'Medicine',
                availableQty: null,
                suggestedRate: Number(row.rate || 0),
                rateSource: 'Previous Ledger Entry',
                unitId
            });
        }

        res.json({ success: true, data: [...catalog, ...Array.from(ledgerOnly.values())] });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/entries', auth, enforceTenant, requireAnyPermission(billingPermissions, billingAdminRoles), async (req: any, res: any) => {
    try {
        await ensurePatientBillingTables();
        const data = costEntrySchema.parse(req.body);
        const { tenantId } = scope(req);
        const amount = Number((data.quantity * data.rate).toFixed(2));

        const created = await (prisma as any).$transaction(async (tx: any) => {
            const { service } = await getAllocationForCost(tx, data.allocationId, tenantId);
            const id = randomUUID();
            const costNo = await generateRef('PDC', tenantId, service.unitId, tx);

            const rows = await tx.$queryRaw`
                INSERT INTO "PatientDailyCost" (
                    "id", "costNo", "allocationId", "admissionId", "patientId", "patientName", "clientName",
                    "serviceType", "costDate", "category", "description", "quantity", "rate", "amount",
                    "sourceType", "sourceId", "status", "tenantId", "unitId", "createdBy", "createdAt", "updatedAt"
                )
                VALUES (
                    ${id}, ${costNo}, ${service.allocationId}, ${service.admissionId}, ${service.patientId},
                    ${service.patientName}, ${service.clientName}, ${service.serviceType}, ${new Date(data.costDate)},
                    ${data.category}, ${data.description}, ${data.quantity}, ${data.rate}, ${amount},
                    ${data.sourceType || 'MANUAL'}, ${data.sourceId || null}, 'DRAFT',
                    ${tenantId}, ${service.unitId}, ${req.user?.id || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                RETURNING *
            `;

            return rows?.[0];
        });

        res.status(201).json({ success: true, data: created, message: 'Patient daily cost added' });
    } catch (error: any) {
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.post('/entries/upload-bill', auth, enforceTenant, requireAnyPermission(billingPermissions, billingAdminRoles), billUpload.single('bill'), async (req: any, res: any) => {
    try {
        await ensurePatientBillingTables();
        if (!req.file) {
            const error: any = new Error('Bill or invoice file is required');
            error.status = 400;
            throw error;
        }

        const data = uploadBillSchema.parse(req.body);
        const { tenantId } = scope(req);
        const amount = Number((data.quantity * data.rate).toFixed(2));
        const fileUrl = `/uploads/patient-bills/${req.file.filename}`;

        const created = await (prisma as any).$transaction(async (tx: any) => {
            const { service } = await getAllocationForCost(tx, data.allocationId, tenantId);
            const id = randomUUID();
            const costNo = await generateRef('PDC', tenantId, service.unitId, tx);
            const metadata = JSON.stringify({
                source: 'EXTERNAL_BILL_UPLOAD',
                uploadedBill: {
                    fileName: req.file.filename,
                    originalName: req.file.originalname,
                    fileUrl,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    uploadedAt: new Date().toISOString()
                }
            });

            const rows = await tx.$queryRaw`
                INSERT INTO "PatientDailyCost" (
                    "id", "costNo", "allocationId", "admissionId", "patientId", "patientName", "clientName",
                    "serviceType", "costDate", "category", "description", "quantity", "rate", "amount",
                    "sourceType", "sourceId", "status", "metadata", "tenantId", "unitId", "createdBy", "createdAt", "updatedAt"
                )
                VALUES (
                    ${id}, ${costNo}, ${service.allocationId}, ${service.admissionId}, ${service.patientId},
                    ${service.patientName}, ${service.clientName}, ${service.serviceType}, ${new Date(data.costDate)},
                    ${data.category}, ${data.description}, ${data.quantity}, ${data.rate}, ${amount},
                    'EXTERNAL_BILL', ${data.sourceId || req.file.originalname}, 'DRAFT', ${metadata}::jsonb,
                    ${tenantId}, ${service.unitId}, ${req.user?.id || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                RETURNING *
            `;

            return rows?.[0];
        });

        res.status(201).json({ success: true, data: created, message: 'Uploaded bill added to patient expense ledger' });
    } catch (error: any) {
        if (req.file?.path) {
            fs.promises.unlink(req.file.path).catch(() => undefined);
        }
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.post('/generate-invoice', auth, enforceTenant, requireAnyPermission(billingPermissions, billingAdminRoles), async (req: any, res: any) => {
    try {
        await ensurePatientBillingTables();
        const data = invoiceSchema.parse(req.body);
        const { tenantId } = scope(req);

        const result = await (prisma as any).$transaction(async (tx: any) => {
            const entries = data.entryIds?.length
                ? await tx.$queryRaw`
                    SELECT *
                    FROM "PatientDailyCost"
                    WHERE "tenantId" = ${tenantId}
                      AND "id" = ANY(${data.entryIds})
                      AND "isDeleted" = false
                      AND "status" IN ('DRAFT', 'REVIEWED')
                    ORDER BY "costDate" ASC
                `
                : await tx.$queryRaw`
                    SELECT *
                    FROM "PatientDailyCost"
                    WHERE "tenantId" = ${tenantId}
                      AND "allocationId" = ${data.allocationId}
                      AND "costDate" >= ${new Date(data.periodFrom as string)}
                      AND "costDate" <= ${new Date(data.periodTo as string)}
                      AND "isDeleted" = false
                      AND "status" IN ('DRAFT', 'REVIEWED')
                    ORDER BY "costDate" ASC
                `;

            if (!entries?.length) {
                const error: any = new Error('No unbilled daily cost entries selected');
                error.status = 400;
                throw error;
            }

            const allocationIds = [...new Set(entries.map((entry: any) => entry.allocationId).filter(Boolean))];
            const allocationId = allocationIds.length === 1 ? allocationIds[0] : null;
            const invoiceUnitId = entries[0].unitId;
            const totalAmount = Number(entries.reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0).toFixed(2));
            const periodFrom = data.periodFrom || entries[0].costDate;
            const periodTo = data.periodTo || entries[entries.length - 1].costDate;
            const chargeSummary = buildChargeSummary(entries);
            if (totalAmount <= 0) {
                const error: any = new Error('Selected daily cost total must be greater than zero');
                error.status = 400;
                throw error;
            }

            const invoice = await postMonthlyPatientInvoiceToLedger(tx, {
                tenantId,
                unitId: invoiceUnitId,
                allocationId,
                totalAmount,
                clientName: entries[0].clientName || entries[0].patientName || 'Patient Family',
                notes: data.notes || `Monthly patient invoice for ${entries[0].patientName}`,
                metadata: {
                    source: 'PATIENT_EXPENSE_LEDGER',
                    invoiceType: 'MONTHLY_PATIENT_INVOICE',
                    invoiceWorkflowStatus: 'GENERATED',
                    ledgerEntryIds: entries.map((entry: any) => entry.id),
                    costNos: entries.map((entry: any) => entry.costNo),
                    allocationRefs: allocationIds,
                    patientName: entries[0].patientName,
                    clientName: entries[0].clientName,
                    serviceType: entries[0].serviceType,
                    billingPeriodFrom: periodFrom,
                    billingPeriodTo: periodTo,
                    chargeSummary,
                    upiId: data.upiId || null,
                    qrLabel: data.qrLabel || 'GPay / UPI'
                }
            });

            await tx.$executeRaw`
                UPDATE "PatientDailyCost"
                SET "status" = 'INVOICED',
                    "invoiceId" = ${invoice.id},
                    "invoiceRefNo" = ${invoice.refNo},
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "tenantId" = ${tenantId}
                  AND "id" = ANY(${entries.map((entry: any) => entry.id)})
            `;

            return { invoice, entries };
        }, {
            maxWait: 10000,
            timeout: 60000
        });

        res.json({ success: true, data: result, message: 'Monthly patient invoice generated from expense ledger' });
    } catch (error: any) {
        console.error('[PatientBilling] generate-invoice failed', {
            message: error?.message,
            code: error?.code || error?.errorCode,
            meta: error?.meta
        });
        res.status(error.status || 400).json({ success: false, message: error.message });
    }
});

router.post('/mark-sent', auth, enforceTenant, requireAnyPermission(billingPermissions, billingAdminRoles), async (req: any, res: any) => {
    try {
        await ensurePatientBillingTables();
        const data = paymentSentSchema.parse(req.body);
        const { tenantId } = scope(req);

        const rows = await (prisma as any).$queryRaw`
            UPDATE "PatientDailyCost"
            SET "sentAt" = CURRENT_TIMESTAMP,
                "sentVia" = ${data.sentVia || 'WhatsApp'},
                "familyContact" = ${data.familyContact || null},
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "tenantId" = ${tenantId}
              AND "invoiceId" = ${data.invoiceId}
              AND "isDeleted" = false
            RETURNING *
        `;

        const sentMetadata = JSON.stringify({
            invoiceWorkflowStatus: 'SENT',
            sentVia: data.sentVia || 'WhatsApp',
            sentAt: new Date().toISOString(),
            familyContact: data.familyContact || null
        });

        await (prisma as any).$executeRaw`
            UPDATE "AccountTransaction"
            SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${sentMetadata}::jsonb,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "tenantId" = ${tenantId}
              AND "id" = ${data.invoiceId}
              AND "isDeleted" = false
        `;

        res.json({ success: true, data: rows || [], message: 'Family receipt marked as sent' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.post('/send-whatsapp-pdf', auth, enforceTenant, requireAnyPermission(billingPermissions, billingAdminRoles), memoryUpload.single('pdf'), async (req: any, res: any) => {
    try {
        if (!req.file) throw new Error('PDF file is required');
        const { targetNumber, messageBody } = req.body;
        if (!targetNumber) throw new Error('Target phone number is required');

        const pdfUrl = await uploadToSupabase('Erp_software', req.file);

        const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
        const token = process.env.WHATSAPP_TOKEN?.trim();
        if (!phoneId || !token) throw new Error('WhatsApp API credentials missing from backend');

        let to = targetNumber.replace(/[^0-9]/g, '');
        if (!to.startsWith('91') && to.length === 10) to = '91' + to;

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'document',
            document: {
                link: pdfUrl,
                caption: messageBody || 'Please find the attached patient service bill.',
                filename: 'Patient_Bill.pdf'
            }
        };

        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${phoneId}/messages`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({ success: true, message: 'PDF sent successfully', data: response.data, pdfUrl });
    } catch (error: any) {
        console.error('WhatsApp sending error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
    }
});

router.get('/patient-lookup', auth, enforceTenant, requireAnyPermission(billingViewPermissions, billingViewRoles), async (req: any, res: any) => {
    try {
        const { query } = req.query;
        if (!query || query.length < 3) {
            return res.json({ success: true, data: [] });
        }
        const { tenantId, unitId } = scope(req);

        // Fetch patient by ID or Name
        const patients = await prisma.patient.findMany({
            where: {
                tenantId,
                unitId,
                OR: [
                    { id: { equals: query } },
                    { name: { contains: query, mode: 'insensitive' } }
                ]
            },
            select: {
                id: true,
                elderId: true,
                name: true,
                age: true,
                gender: true,
                dob: true,
                email: true,
                phone: true,
                address: true,
                bloodGroup: true,
                admissions: {
                    where: { status: { in: ['ADMITTED', 'RESERVED'] } },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { id: true, status: true }
                }
            },
            take: 10
        });

        res.json({ success: true, data: patients });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
});


// Recurring Monthly Billing Engine
router.get('/recurring/preview', auth, enforceTenant, requireAnyPermission(billingViewPermissions, billingViewRoles), async (req: any, res: any) => {
    try {
        const { tenantId, unitId } = scope(req);
        const month = parseInt(String(req.query.month || new Date().getMonth() + 1), 10);
        const year = parseInt(String(req.query.year || new Date().getFullYear()), 10);

        const result = await recurringBillingService.previewCycle(
            { tenantId, unitId: unitId === 'ALL_UNITS' ? null : unitId },
            month,
            year
        );
        res.json({ success: true, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/recurring/run-cycle', auth, enforceTenant, requireAnyPermission(billingPermissions, billingAdminRoles), async (req: any, res: any) => {
    try {
        const { tenantId, unitId } = scope(req);
        const { month, year, selectedAllocationIds } = req.body;
        const curMonth = month ? parseInt(String(month), 10) : new Date().getMonth() + 1;
        const curYear = year ? parseInt(String(year), 10) : new Date().getFullYear();

        const result = await recurringBillingService.executeCycle(
            { tenantId, unitId: unitId || 'default-unit' },
            req.user,
            { month: curMonth, year: curYear, selectedAllocationIds }
        );
        res.json({ success: true, data: result, message: 'Recurring billing cycle completed successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
