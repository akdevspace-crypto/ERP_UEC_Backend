import { Router } from 'express';
import { protect } from '../../shared/middleware/auth.middleware.js';
import { enforceTenant } from '../../shared/middleware/tenant.middleware.js';
import { requirePermission } from '../../shared/middleware/rbac.middleware.js';
import { canReadFacilityWide } from '../../shared/utils/rbac.js';
import { upload, saveFileMetadata } from '../storage/service.js';
import { uploadToSupabase } from '../../shared/utils/supabase.js';
import { prisma } from '../../app/prisma.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const router = Router();

router.use(protect);
router.use(enforceTenant);

const residentEntityTypes = new Set(['PATIENT', 'ADMISSION']);

const isResidentEntityType = (entityType) => residentEntityTypes.has(String(entityType || '').trim().toUpperCase());

const hasUnitAccess = (user, unitId) => {
    const unitAccess = user?.unitAccess || [];
    return unitAccess.includes('*') || unitAccess.includes(unitId) || canReadFacilityWide(user);
};

const requireResidentFilePermission = (action) => (req, res, next) => {
    const entityType = String(req.body?.entityType || req.query?.entityType || 'ADMIN_FILE').trim().toUpperCase();
    if (!isResidentEntityType(entityType)) return next();
    return requirePermission('PATIENT', action, true)(req, res, next);
};

const resolveResidentDocumentEntity = async (req, entityType, entityId) => {
    const normalizedType = String(entityType || '').trim().toUpperCase();
    if (!isResidentEntityType(normalizedType)) return null;
    if (!entityId) {
        const error = new Error('Resident document entityId is required');
        error.status = 400;
        throw error;
    }

    if (normalizedType === 'PATIENT') {
        const patient = await prisma.patient.findFirst({
            where: { id: entityId, tenantId: req.user.tenantId },
            select: { id: true, unitId: true }
        });
        if (!patient) {
            const error = new Error('Patient not found');
            error.status = 404;
            throw error;
        }
        if (!hasUnitAccess(req.user, patient.unitId)) {
            const error = new Error('Not authorized for this patient unit');
            error.status = 403;
            throw error;
        }
        return { unitId: patient.unitId };
    }

    const admission = await prisma.admission.findFirst({
        where: { id: entityId, tenantId: req.user.tenantId },
        select: { id: true, unitId: true, patient: { select: { unitId: true, tenantId: true } } }
    });
    if (!admission || admission.patient?.tenantId !== req.user.tenantId) {
        const error = new Error('Admission not found');
        error.status = 404;
        throw error;
    }
    if (admission.patient.unitId !== admission.unitId || !hasUnitAccess(req.user, admission.unitId)) {
        const error = new Error('Not authorized for this admission unit');
        error.status = 403;
        throw error;
    }
    return { unitId: admission.unitId };
};

const registerSchema = z.object({
    group: z.string().min(1),
    fileType: z.string().min(1),
    relatedName: z.string().optional().nullable(),
    fileNo: z.string().optional().nullable(),
    fileName: z.string().optional().nullable(),
    maintainedBy: z.string().optional().nullable(),
    date: z.string().optional().nullable(),
    issueDate: z.string().optional().nullable(),
    expiryDate: z.string().optional().nullable(),
    renewalReminderDate: z.string().optional().nullable(),
    status: z.string().min(1),
    remarks: z.string().optional().nullable(),
    uploadedFileId: z.string().optional().nullable(),
    uploadedFileName: z.string().optional().nullable(),
    uploadedFileUrl: z.string().optional().nullable(),
    uploadedAt: z.string().optional().nullable()
});

let adminFileRegisterReady = false;

const ensureAdminFileRegisterTable = async () => {
    if (adminFileRegisterReady) return;

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AdminFileRegister" (
            "id" TEXT NOT NULL,
            "group" TEXT NOT NULL,
            "fileType" TEXT NOT NULL,
            "relatedName" TEXT NOT NULL DEFAULT '-',
            "fileNo" TEXT NOT NULL DEFAULT '-',
            "fileName" TEXT NOT NULL DEFAULT '-',
            "maintainedBy" TEXT NOT NULL DEFAULT 'Admin',
            "date" TIMESTAMP(3),
            "issueDate" TIMESTAMP(3),
            "expiryDate" TIMESTAMP(3),
            "renewalReminderDate" TIMESTAMP(3),
            "status" TEXT NOT NULL DEFAULT 'Not Uploaded',
            "remarks" TEXT,
            "uploadedFileId" TEXT,
            "uploadedFileName" TEXT,
            "uploadedFileUrl" TEXT,
            "uploadedAt" TIMESTAMP(3),
            "tenantId" TEXT NOT NULL,
            "unitId" TEXT NOT NULL,
            "isDeleted" BOOLEAN NOT NULL DEFAULT false,
            "deletedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "AdminFileRegister_pkey" PRIMARY KEY ("id")
        )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AdminFileRegister_tenantId_idx" ON "AdminFileRegister"("tenantId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AdminFileRegister_unitId_idx" ON "AdminFileRegister"("unitId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AdminFileRegister_group_idx" ON "AdminFileRegister"("group")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AdminFileRegister_status_idx" ON "AdminFileRegister"("status")');

    adminFileRegisterReady = true;
};

const ensureAutoAdminFileSourceTables = async () => {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CaregiverVitalChart" (
            "id" TEXT NOT NULL,
            "patientId" TEXT NOT NULL,
            "patientName" TEXT NOT NULL,
            "age" TEXT,
            "sex" TEXT,
            "month" TEXT NOT NULL,
            "entries" JSONB NOT NULL DEFAULT '[]'::jsonb,
            "signatures" JSONB NOT NULL DEFAULT '{}'::jsonb,
            "status" TEXT NOT NULL DEFAULT 'DRAFT',
            "tenantId" TEXT NOT NULL,
            "unitId" TEXT NOT NULL,
            "createdBy" TEXT,
            "isDeleted" BOOLEAN NOT NULL DEFAULT false,
            "deletedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "CaregiverVitalChart_pkey" PRIMARY KEY ("id")
        )
    `);
    await prisma.$executeRawUnsafe(`
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
};

const nullableDate = (value) => {
    const text = String(value || '').trim();
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const securityModuleName = 'SECURITY_GATE';

const readObjectPayload = (value) =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};

const normalizeSecurityEntryType = (payload) => {
    if (payload.entryType === 'VEHICLE') return 'VEHICLE';
    if (payload.entryType === 'STAFF') return 'STAFF';
    return 'VISITOR';
};

const securityFileTypeForPayload = (payload) => {
    const entryType = normalizeSecurityEntryType(payload);
    if (entryType === 'VEHICLE') return 'Vehicle In and Out Record';
    if (entryType === 'STAFF') return 'Staff Movement Register Record';
    return 'Visitors Record';
};

const securityRelatedName = (payload) => {
    const entryType = normalizeSecurityEntryType(payload);
    if (entryType === 'VEHICLE') return payload.vehicleNo || payload.driverName || '-';
    if (entryType === 'STAFF') return payload.staffName || payload.empId || '-';
    return payload.visitorName || '-';
};

const formatDateForFileName = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN');
};

const normalizeSecurityGateRecord = (row) => {
    const payload = readObjectPayload(row.payload);
    const entryType = normalizeSecurityEntryType(payload);
    const label = entryType === 'VEHICLE' ? 'Vehicle movement' : entryType === 'STAFF' ? 'Staff movement' : 'Visitor movement';

    return {
        id: `AUTO-SECURITY-${row.id}`,
        group: 'Watchman Files',
        fileType: securityFileTypeForPayload(payload),
        relatedName: securityRelatedName(payload),
        fileNo: `GATE-${String(row.id).slice(0, 8).toUpperCase()}`,
        fileName: `${label} - ${securityRelatedName(payload)} - ${formatDateForFileName(row.createdAt)}`,
        maintainedBy: 'Auto: Security',
        date: row.updatedAt,
        issueDate: row.createdAt,
        expiryDate: null,
        renewalReminderDate: null,
        status: payload.status === 'Checked Out' ? 'Verified' : 'Received',
        remarks: [
            payload.purpose ? `Purpose: ${payload.purpose}` : '',
            payload.checkInAt ? `Check-in: ${payload.checkInAt}` : '',
            payload.checkOutAt ? `Checkout: ${payload.checkOutAt}` : '',
            payload.materialDetails ? `Material: ${payload.materialDetails}` : '',
            payload.checkoutRemarks || payload.remarks || ''
        ].filter(Boolean).join(' | '),
        uploadedFileId: null,
        uploadedFileName: null,
        uploadedFileUrl: null,
        uploadedAt: null,
        tenantId: row.tenantId,
        unitId: row.unitId,
        isDeleted: false,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sourceType: 'SECURITY_GATE_ENTRY',
        sourceId: row.id,
        isAutoFetched: true
    };
};

const getAdminFilesUnitId = async (req) => {
    const uncfUnit = await prisma.unit.findFirst({
        where: {
            tenantId: req.user.tenantId,
            isDeleted: false,
            OR: [
                { unitId: { equals: 'UNCF', mode: 'insensitive' } },
                { shortName: { equals: 'UNCF', mode: 'insensitive' } },
                { name: { contains: 'UNCF', mode: 'insensitive' } }
            ]
        },
        select: { id: true }
    });

    return uncfUnit?.id || req.user.unitId;
};

const normalizeRegisterPayload = (body) => {
    const validated = registerSchema.parse(body);
    return {
        ...validated,
        relatedName: String(validated.relatedName || '-').trim() || '-',
        fileNo: String(validated.fileNo || '-').trim() || '-',
        fileName: String(validated.fileName || '-').trim() || '-',
        maintainedBy: String(validated.maintainedBy || 'Admin').trim() || 'Admin',
        remarks: String(validated.remarks || '').trim(),
        date: nullableDate(validated.date),
        issueDate: nullableDate(validated.issueDate),
        expiryDate: nullableDate(validated.expiryDate),
        renewalReminderDate: nullableDate(validated.renewalReminderDate),
        uploadedAt: nullableDate(validated.uploadedAt)
    };
};

router.get('/register', async (req, res, next) => {
    try {
        await ensureAdminFileRegisterTable();
        await ensureAutoAdminFileSourceTables();
        const records = await prisma.$queryRaw`
            SELECT *
            FROM "AdminFileRegister"
            WHERE "tenantId" = ${req.user.tenantId}
              AND "isDeleted" = false
            ORDER BY "createdAt" DESC
        `;
        const vitalCharts = await prisma.$queryRaw`
            SELECT *
            FROM "CaregiverVitalChart"
            WHERE "tenantId" = ${req.user.tenantId}
              AND "isDeleted" = false
            ORDER BY "updatedAt" DESC
        `;
        const revenueSheets = await prisma.$queryRaw`
            SELECT *
            FROM "CaregiverRevenueSheet"
            WHERE "tenantId" = ${req.user.tenantId}
              AND "isDeleted" = false
            ORDER BY "updatedAt" DESC
        `;
        const securityGateEntries = await prisma.auditLog.findMany({
            where: {
                tenantId: req.user.tenantId,
                module: securityModuleName,
                isDeleted: false
            },
            orderBy: { updatedAt: 'desc' },
            take: 500
        });

        const autoRecords = [
            ...vitalCharts.map((row) => ({
                id: `AUTO-VITAL-${row.id}`,
                group: 'Nursing Files',
                fileType: 'Inmates Vitals Record',
                relatedName: row.patientName || '-',
                fileNo: row.month || '-',
                fileName: `Caregiver vital chart - ${row.month}`,
                maintainedBy: 'Auto: Vitals',
                date: row.updatedAt,
                issueDate: row.createdAt,
                expiryDate: null,
                renewalReminderDate: null,
                status: row.status === 'APPROVED' ? 'Verified' : 'Received',
                remarks: 'Auto-fetched from UEC caregiver vital chart',
                uploadedFileId: null,
                uploadedFileName: null,
                uploadedFileUrl: null,
                uploadedAt: null,
                tenantId: row.tenantId,
                unitId: row.unitId,
                isDeleted: false,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                sourceType: 'CAREGIVER_VITAL_CHART',
                sourceId: row.id,
                isAutoFetched: true
            })),
            ...revenueSheets.map((row) => ({
                id: `AUTO-REVENUE-${row.id}`,
                group: 'Nursing Files',
                fileType: 'Inmates Revenue',
                relatedName: row.patientName || row.clientName || '-',
                fileNo: row.month || '-',
                fileName: `Caregiver used-items revenue sheet - ${row.month}`,
                maintainedBy: 'Auto: Patient Billing',
                date: row.updatedAt,
                issueDate: row.createdAt,
                expiryDate: null,
                renewalReminderDate: null,
                status: row.status === 'APPROVED' ? 'Verified' : 'Received',
                remarks: `Auto-fetched from UEC caregiver revenue sheet. Total Rs ${Number(row.totalAmount || 0).toFixed(2)}`,
                uploadedFileId: null,
                uploadedFileName: null,
                uploadedFileUrl: null,
                uploadedAt: null,
                tenantId: row.tenantId,
                unitId: row.unitId,
                isDeleted: false,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                sourceType: 'CAREGIVER_REVENUE_SHEET',
                sourceId: row.id,
                isAutoFetched: true
            })),
            ...securityGateEntries.map(normalizeSecurityGateRecord)
        ];

        res.json({ success: true, data: [...autoRecords, ...records] });
    } catch (error) {
        next(error);
    }
});

router.get('/operational-records/:sourceType/:sourceId', async (req, res, next) => {
    try {
        await ensureAutoAdminFileSourceTables();

        const sourceType = String(req.params.sourceType || '').trim();
        const sourceId = String(req.params.sourceId || '').trim();
        if (!sourceType || !sourceId) {
            return res.status(400).json({ success: false, message: 'Source record is required' });
        }

        if (sourceType === 'CAREGIVER_VITAL_CHART') {
            const rows = await prisma.$queryRaw`
                SELECT *
                FROM "CaregiverVitalChart"
                WHERE "id" = ${sourceId}
                  AND "tenantId" = ${req.user.tenantId}
                  AND "isDeleted" = false
                LIMIT 1
            `;

            if (!rows[0]) {
                return res.status(404).json({ success: false, message: 'Operational record not found' });
            }

            return res.json({ success: true, data: { sourceType, record: rows[0] } });
        }

        if (sourceType === 'CAREGIVER_REVENUE_SHEET') {
            const rows = await prisma.$queryRaw`
                SELECT *
                FROM "CaregiverRevenueSheet"
                WHERE "id" = ${sourceId}
                  AND "tenantId" = ${req.user.tenantId}
                  AND "isDeleted" = false
                LIMIT 1
            `;

            if (!rows[0]) {
                return res.status(404).json({ success: false, message: 'Operational record not found' });
            }

            return res.json({ success: true, data: { sourceType, record: rows[0] } });
        }

        if (sourceType === 'SECURITY_GATE_ENTRY') {
            const row = await prisma.auditLog.findFirst({
                where: {
                    id: sourceId,
                    tenantId: req.user.tenantId,
                    module: securityModuleName,
                    isDeleted: false
                },
                include: {
                    user: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    }
                }
            });

            if (!row) {
                return res.status(404).json({ success: false, message: 'Security gate record not found' });
            }

            return res.json({
                success: true,
                data: {
                    sourceType,
                    record: {
                        id: row.id,
                        action: row.action,
                        createdAt: row.createdAt,
                        updatedAt: row.updatedAt,
                        tenantId: row.tenantId,
                        unitId: row.unitId,
                        payload: readObjectPayload(row.payload),
                        recordedBy: [row.user?.firstName, row.user?.lastName].filter(Boolean).join(' ').trim() || row.user?.email || '-'
                    }
                }
            });
        }

        return res.status(400).json({ success: false, message: 'Unsupported operational record type' });
    } catch (error) {
        next(error);
    }
});

router.post('/register', async (req, res, next) => {
    try {
        await ensureAdminFileRegisterTable();
        const payload = normalizeRegisterPayload(req.body);
        const id = randomUUID();
        const adminFilesUnitId = await getAdminFilesUnitId(req);
        const rows = await prisma.$queryRaw`
            INSERT INTO "AdminFileRegister" (
                "id", "group", "fileType", "relatedName", "fileNo", "fileName", "maintainedBy",
                "date", "issueDate", "expiryDate", "renewalReminderDate", "status", "remarks",
                "uploadedFileId", "uploadedFileName", "uploadedFileUrl", "uploadedAt",
                "tenantId", "unitId", "createdAt", "updatedAt"
            )
            VALUES (
                ${id}, ${payload.group}, ${payload.fileType}, ${payload.relatedName}, ${payload.fileNo},
                ${payload.fileName}, ${payload.maintainedBy}, ${payload.date}, ${payload.issueDate},
                ${payload.expiryDate}, ${payload.renewalReminderDate}, ${payload.status}, ${payload.remarks},
                ${payload.uploadedFileId || null}, ${payload.uploadedFileName || null}, ${payload.uploadedFileUrl || null},
                ${payload.uploadedAt}, ${req.user.tenantId}, ${adminFilesUnitId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING *
        `;

        res.status(201).json({ success: true, data: rows[0], message: 'Admin file entry saved' });
    } catch (error) {
        next(error);
    }
});

router.put('/register/:id', async (req, res, next) => {
    try {
        await ensureAdminFileRegisterTable();
        const payload = normalizeRegisterPayload(req.body);
        const id = String(req.params.id || '').trim();
        const rows = await prisma.$queryRaw`
            UPDATE "AdminFileRegister"
            SET "group" = ${payload.group},
                "fileType" = ${payload.fileType},
                "relatedName" = ${payload.relatedName},
                "fileNo" = ${payload.fileNo},
                "fileName" = ${payload.fileName},
                "maintainedBy" = ${payload.maintainedBy},
                "date" = ${payload.date},
                "issueDate" = ${payload.issueDate},
                "expiryDate" = ${payload.expiryDate},
                "renewalReminderDate" = ${payload.renewalReminderDate},
                "status" = ${payload.status},
                "remarks" = ${payload.remarks},
                "uploadedFileId" = COALESCE(${payload.uploadedFileId || null}, "uploadedFileId"),
                "uploadedFileName" = COALESCE(${payload.uploadedFileName || null}, "uploadedFileName"),
                "uploadedFileUrl" = COALESCE(${payload.uploadedFileUrl || null}, "uploadedFileUrl"),
                "uploadedAt" = COALESCE(${payload.uploadedAt}, "uploadedAt"),
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${id}
              AND "tenantId" = ${req.user.tenantId}
              AND "isDeleted" = false
            RETURNING *
        `;

        if (!rows[0]) {
            return res.status(404).json({ success: false, message: 'Admin file entry not found' });
        }

        res.json({ success: true, data: rows[0], message: 'Admin file entry updated' });
    } catch (error) {
        next(error);
    }
});

router.delete('/register/:id', async (req, res, next) => {
    try {
        await ensureAdminFileRegisterTable();
        const id = String(req.params.id || '').trim();
        const rows = await prisma.$queryRaw`
            UPDATE "AdminFileRegister"
            SET "isDeleted" = true,
                "deletedAt" = CURRENT_TIMESTAMP,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${id}
              AND "tenantId" = ${req.user.tenantId}
              AND "isDeleted" = false
            RETURNING "id"
        `;

        if (!rows[0]) {
            return res.status(404).json({ success: false, message: 'Admin file entry not found' });
        }

        res.json({ success: true, data: rows[0], message: 'Admin file entry deleted' });
    } catch (error) {
        next(error);
    }
});

router.get('/files', requireResidentFilePermission('READ'), async (req, res, next) => {
    try {
        const entityId = String(req.query.entityId || '').trim();
        const entityType = String(req.query.entityType || 'ADMIN_FILE').trim().toUpperCase();
        const residentEntity = await resolveResidentDocumentEntity(req, entityType, entityId);
        const where = {
            tenantId: req.user.tenantId,
            entityType,
            isDeleted: false
        };

        if (entityId) {
            where.entityId = entityId;
        }

        const files = await prisma.fileStorage.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        const authorizedFiles = residentEntity
            ? files.filter((file) => file.unitId === residentEntity.unitId)
            : files;

        res.json({ success: true, data: authorizedFiles });
    } catch (error) {
        next(error);
    }
});

router.post('/upload', upload.single('file'), requireResidentFilePermission('UPDATE'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File is required' });
        }

        const entityId = String(req.body.entityId || '').trim();
        if (!entityId) {
            return res.status(400).json({ success: false, message: 'Admin file entry is required' });
        }

        const entityType = String(req.body.entityType || 'ADMIN_FILE').trim().toUpperCase();
        const residentEntity = await resolveResidentDocumentEntity(req, entityType, entityId);

        const fileUrl = await uploadToSupabase('Erp_software', req.file);
        const adminFilesUnitId = await getAdminFilesUnitId(req);
        const metadata = await saveFileMetadata({
            fileName: req.file.originalname,
            fileUrl,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            entityType,
            entityId,
            category: req.body.category ? String(req.body.category) : null,
            tenantId: req.user.tenantId,
            unitId: residentEntity?.unitId || adminFilesUnitId
        });

        res.status(201).json({
            success: true,
            data: metadata,
            message: 'Admin file uploaded successfully'
        });
    } catch (error) {
        next(error);
    }
});

export default router;
