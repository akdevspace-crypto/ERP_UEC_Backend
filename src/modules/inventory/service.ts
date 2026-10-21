import { prisma } from '../../app/prisma.js';
import { randomUUID } from 'crypto';
import { generateRefNumber } from '../../shared/utils/refGenerator.js';
import { ensurePatientBillingTables, postStockIssueToPatientLedger } from '../patient_billing/ledger.js';
import { isAdminRole } from '../auth/access.js';
import { isCategoryInScope, normalizeInventoryScope, resolveInventoryReportUnitId } from './inventoryScope.js';

// =========================================================================
// SCHEMA-SAFE PHYSICAL PROJECTIONS (Operational DB Compatibility)
// These explicit projections strictly match verified physical table columns,
// protecting queries against unmigrated P2P financial schema additions.
// =========================================================================

export const PRODUCT_BASE_SELECT = {
    id: true,
    code: true,
    name: true,
    category: true,
    subCategory: true,
    unit: true,
    minStockLevel: true,
    defaultRevenuePrice: true,
    chargeableInCareRevenue: true,
    status: true,
    isBatchTracked: true,
    unitId: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true
};

export const PRODUCT_BATCH_BASE_SELECT = {
    id: true,
    productId: true,
    batchNumber: true,
    expiryDate: true,
    quantity: true,
    tenantId: true,
    unitId: true,
    createdAt: true,
    updatedAt: true
};

export const PURCHASE_ORDER_BASE_SELECT = {
    id: true,
    orderNumber: true,
    vendorId: true,
    status: true,
    orderDate: true,
    expectedDeliveryDate: true,
    notes: true,
    tenantId: true,
    unitId: true,
    createdById: true,
    createdByName: true,
    approvedById: true,
    approvedByName: true,
    approvedAt: true,
    isDeleted: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true
};

export const PURCHASE_ORDER_ITEM_BASE_SELECT = {
    id: true,
    purchaseOrderId: true,
    productId: true,
    orderedQuantity: true,
    receivedQuantity: true,
    status: true,
    notes: true,
    tenantId: true,
    unitId: true,
    isDeleted: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true
};

export const GOODS_RECEIPT_NOTE_BASE_SELECT = {
    id: true,
    grnNumber: true,
    purchaseOrderId: true,
    vendorId: true,
    receivedDate: true,
    deliveryChallanNo: true,
    supplierInvoiceNo: true,
    notes: true,
    receivedById: true,
    receivedByName: true,
    tenantId: true,
    unitId: true,
    isDeleted: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    idempotencyKey: true
};

export const GOODS_RECEIPT_ITEM_BASE_SELECT = {
    id: true,
    goodsReceiptNoteId: true,
    purchaseOrderItemId: true,
    productId: true,
    receivedQuantity: true,
    rejectedQuantity: true,
    batchNumber: true,
    expiryDate: true,
    batchId: true,
    stockMovementId: true,
    notes: true,
    tenantId: true,
    unitId: true,
    isDeleted: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true
};

export const SUPPLIER_RETURN_BASE_SELECT = {
    id: true,
    returnNumber: true,
    vendorId: true,
    sourceType: true,
    sourceReference: true,
    grnId: true,
    purchaseId: true,
    idempotencyKey: true,
    returnDate: true,
    reason: true,
    status: true,
    totalQuantity: true,
    notes: true,
    returnedById: true,
    returnedByName: true,
    tenantId: true,
    unitId: true,
    isDeleted: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true
};

export const SUPPLIER_RETURN_ITEM_BASE_SELECT = {
    id: true,
    supplierReturnId: true,
    productId: true,
    batchId: true,
    batchNumber: true,
    expiryDate: true,
    returnQuantity: true,
    reason: true,
    stockMovementId: true,
    tenantId: true,
    unitId: true,
    isDeleted: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true
};


// Backward-compatibility no-op stubs (runtime DDL removed in favor of Prisma migrations)
export const ensureProductRevenueColumns = async () => {};
export const ensureInventoryRegisterTables = async () => {};

export const INVENTORY_RATE_OVERRIDE_PERMISSIONS = [
    'Inventory Rate Override',
    'INVENTORY_RATE_OVERRIDE',
    'Billing Rate Override',
    'BILLING_RATE_OVERRIDE'
];

export const isMeaningfulReason = (reason: unknown): boolean => {
    if (!reason || typeof reason !== 'string') return false;
    const trimmed = reason.trim();
    if (trimmed.length < 5) return false;
    const invalidPlaceholders = ['none', 'n/a', 'na', 'test', 'null', 'undefined', 'nil', 'no reason', 'asdf', 'blank'];
    if (invalidPlaceholders.includes(trimmed.toLowerCase())) return false;
    return true;
};

export const canOverrideBillingRate = (user: any): boolean => {
    if (!user) return false;

    // 1. System / Tenant Administrators
    if (isAdminRole(user.role)) return true;

    // 2. Explicitly approved financial and administrative roles
    let rawRole = user?.role;
    if (rawRole && typeof rawRole === 'object' && rawRole.name) {
        rawRole = rawRole.name;
    }
    const normalizedRole = String(rawRole || user?.roleName || '').trim().toLowerCase().replace(/_/g, ' ');
    const approvedRoles = ['admin', 'super admin', 'superadmin', 'uncf admin', 'finance manager', 'elder finance manager'];
    if (approvedRoles.includes(normalizedRole)) {
        return true;
    }

    // 3. Explicit dedicated permission check
    const permissions: string[] = Array.isArray(user.permissions) ? user.permissions : [];
    const normalizedPerms = permissions.map((p: string) => String(p).trim().toUpperCase());

    return INVENTORY_RATE_OVERRIDE_PERMISSIONS.some(
        (target) => normalizedPerms.includes(target.toUpperCase())
    );
};

export const readNoteValue = (notes: unknown, label: string) => {
    const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escapedLabel}\\s*:\\s*([0-9a-fA-F-]{36})`, 'im');
    return String(notes || '').match(pattern)?.[1] || null;
};

export class InventoryService {
    private db: any;

    constructor(dbClient?: any) {
        this.db = dbClient || prisma;
    }

    /**
     * Concurrency-safe helper to lock a Product row using PostgreSQL SELECT ... FOR UPDATE.
     * Enforces tenant and optional unit isolation within the current transaction client.
     */
    async lockProductRow(tx: any, productId: string, scope: { tenantId: string; unitId?: string }) {
        let rows: any[];
        if (scope.unitId) {
            rows = await tx.$queryRaw`
                SELECT *
                FROM "Product"
                WHERE id = ${productId}
                  AND "tenantId" = ${scope.tenantId}
                  AND "unitId" = ${scope.unitId}
                LIMIT 1
                FOR UPDATE
            `;
        } else {
            rows = await tx.$queryRaw`
                SELECT *
                FROM "Product"
                WHERE id = ${productId}
                  AND "tenantId" = ${scope.tenantId}
                LIMIT 1
                FOR UPDATE
            `;
        }

        const product = rows?.[0];
        if (!product) {
            throw new Error('Product not found or not accessible within this tenant/unit scope');
        }
        return product;
    }

    async createProduct(validated: any, scope: any, user?: any, domain?: string) {
        if (domain && domain !== 'all' && !isCategoryInScope(validated.category, domain)) {
            throw new Error(`Product category '${validated.category}' does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
        }
        const isMedical = String(validated.category).toLowerCase() === 'medical';
        const isBatchTracked = validated.isBatchTracked !== undefined ? Boolean(validated.isBatchTracked) : isMedical;

        let code = validated.code ? String(validated.code).trim().toUpperCase() : null;
        if (code) {
            const existingWithCode = await (prisma as any).product.findFirst({
                where: {
                    tenantId: scope.tenantId,
                    code
                },
                select: { id: true, code: true }
            });
            if (existingWithCode) {
                throw new Error(`Product code '${code}' already exists for this tenant`);
            }
        }

        const minStockLevel = validated.minStockLevel !== undefined ? Number(validated.minStockLevel) : 0;

        let product;
        try {
            product = await (prisma as any).product.create({
                data: {
                    id: randomUUID(),
                    code,
                    name: validated.name,
                    category: validated.category,
                    unit: validated.unit || 'Nos',
                    minStockLevel,
                    defaultRevenuePrice: Number(validated.defaultRevenuePrice || 0),
                    chargeableInCareRevenue: Boolean(validated.chargeableInCareRevenue),
                    status: validated.status !== false,
                    isBatchTracked,
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });
        } catch (err: any) {
            if (err?.code === 'P2002' || err?.message?.includes('Unique constraint') || err?.message?.includes('Product_tenantId_code_key')) {
                throw new Error(`Product code '${code}' already exists for this tenant`);
            }
            throw err;
        }

        await (prisma as any).auditLog.create({
            data: {
                userId: user?.id || null,
                module: 'inventory',
                action: 'CREATE_PRODUCT',
                payload: {
                    productId: product.id,
                    code: product.code,
                    name: product.name,
                    category: product.category,
                    unit: product.unit,
                    minStockLevel: product.minStockLevel,
                    defaultRevenuePrice: product.defaultRevenuePrice,
                    isBatchTracked: product.isBatchTracked
                },
                tenantId: scope.tenantId,
                unitId: scope.unitId
            }
        });

        return product;
    }

    async updateProduct(id: string, validated: any, scope: any, user?: any, domain?: string) {
        const db = (this as any).db || prisma;
        return await db.$transaction(async (tx: any) => {
            // 1. Concurrency-safe lock on the Product row (SELECT ... FOR UPDATE)
            const existing = await this.lockProductRow(tx, id, {
                tenantId: scope.tenantId,
                unitId: scope.unitId
            });

            if (domain && domain !== 'all' && !isCategoryInScope(existing.category, domain)) {
                throw new Error(`Product '${existing.name}' does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
            }

            if (validated.category && domain && domain !== 'all' && !isCategoryInScope(validated.category, domain)) {
                throw new Error(`Product category '${validated.category}' does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
            }

            let code = existing.code;
            if (validated.code !== undefined) {
                code = validated.code ? String(validated.code).trim().toUpperCase() : null;
            }

            if (code && code !== existing.code) {
                const duplicate = await tx.product.findFirst({
                    where: {
                        tenantId: scope.tenantId,
                        code,
                        NOT: { id }
                    },
                    select: { id: true, code: true }
                });
                if (duplicate) {
                    throw new Error(`Product code '${code}' already exists for this tenant`);
                }
            }

            if (validated.status === false && existing.status !== false) {
                const pendingRequests = await tx.stockIssueRequest.findFirst({
                    where: {
                        productId: id,
                        tenantId: scope.tenantId,
                        status: 'PENDING',
                        isDeleted: false
                    }
                });
                if (pendingRequests) {
                    throw new Error(`Cannot deactivate product '${existing.name}'. There are active pending stock issue requests that must be approved or rejected first.`);
                }
            }

            const oldValues = {
                name: existing.name,
                code: existing.code,
                category: existing.category,
                subCategory: existing.subCategory,
                unit: existing.unit,
                minStockLevel: existing.minStockLevel,
                defaultRevenuePrice: existing.defaultRevenuePrice,
                chargeableInCareRevenue: existing.chargeableInCareRevenue,
                status: existing.status
            };

            const dataToUpdate: any = {};
            if (validated.name !== undefined) dataToUpdate.name = validated.name;
            if (validated.code !== undefined) dataToUpdate.code = code;
            if (validated.category !== undefined) dataToUpdate.category = validated.category;
            if (validated.subCategory !== undefined) dataToUpdate.subCategory = validated.subCategory;
            if (validated.unit !== undefined) dataToUpdate.unit = validated.unit || 'Nos';
            if (validated.minStockLevel !== undefined) dataToUpdate.minStockLevel = Number(validated.minStockLevel);
            if (validated.defaultRevenuePrice !== undefined) dataToUpdate.defaultRevenuePrice = Number(validated.defaultRevenuePrice);
            if (validated.chargeableInCareRevenue !== undefined) dataToUpdate.chargeableInCareRevenue = Boolean(validated.chargeableInCareRevenue);
            if (validated.status !== undefined) dataToUpdate.status = Boolean(validated.status);

            let updated;
            try {
                updated = await tx.product.update({
                    where: { id },
                    data: dataToUpdate
                });
            } catch (err: any) {
                if (err?.code === 'P2002' || err?.message?.includes('Unique constraint') || err?.message?.includes('Product_tenantId_code_key')) {
                    throw new Error(`Product code '${code}' already exists for this tenant`);
                }
                throw err;
            }

            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'UPDATE_PRODUCT',
                    payload: {
                        productId: updated.id,
                        oldValues,
                        newValues: {
                            name: updated.name,
                            code: updated.code,
                            category: updated.category,
                            subCategory: updated.subCategory,
                            unit: updated.unit,
                            minStockLevel: updated.minStockLevel,
                            defaultRevenuePrice: updated.defaultRevenuePrice,
                            chargeableInCareRevenue: updated.chargeableInCareRevenue,
                            status: updated.status
                        }
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId || existing.unitId
                }
            });

            return updated;
        });
    }

    async updateProductStatus(id: string, status: boolean, scope: any, user?: any, domain?: string) {
        const db = (this as any).db || prisma;
        return await db.$transaction(async (tx: any) => {
            // 1. Concurrency-safe lock on the Product row (SELECT ... FOR UPDATE)
            const existing = await this.lockProductRow(tx, id, {
                tenantId: scope.tenantId,
                unitId: scope.unitId
            });

            if (domain && domain !== 'all' && !isCategoryInScope(existing.category, domain)) {
                throw new Error(`Product '${existing.name}' does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
            }

            const previousStatus = existing.status;
            const targetStatus = Boolean(status);
            if (!targetStatus) {
                const pendingRequests = await tx.stockIssueRequest.findFirst({
                    where: {
                        productId: id,
                        tenantId: scope.tenantId,
                        status: 'PENDING',
                        isDeleted: false
                    }
                });
                if (pendingRequests) {
                    throw new Error(`Cannot deactivate product '${existing.name}'. There are active pending stock issue requests that must be approved or rejected first.`);
                }
            }

            const updated = await tx.product.update({
                where: { id },
                data: { status: targetStatus }
            });

            const action = targetStatus ? 'REACTIVATE_PRODUCT' : 'DEACTIVATE_PRODUCT';

            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action,
                    payload: {
                        productId: updated.id,
                        name: updated.name,
                        code: updated.code,
                        previousStatus,
                        newStatus: targetStatus
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId || existing.unitId
                }
            });

            return updated;
        });
    }

    async getProducts(scope: any) {
        const db = (this as any).db || prisma;
        return await db.product.findMany({
            where: {
                tenantId: scope.tenantId,
                ...(scope.unitId ? { unitId: scope.unitId } : {})
            },
            select: PRODUCT_BASE_SELECT,
            orderBy: { createdAt: 'desc' }
        });
    }

    async getStock(scope: any) {
        return await (prisma as any).stock.findMany({
            where: scope,
            include: { product: { select: PRODUCT_BASE_SELECT } },
            orderBy: { updatedAt: 'desc' }
        });
    }

    async getPurchases(scope: any) {
        const purchases: any[] = await (prisma as any).$queryRaw`
            SELECT p.*,
                   v.name AS "vendorName",
                   v.code AS "vendorCode",
                   v.category AS "vendorCategory",
                   v.contact AS "vendorContact",
                   json_build_object(
                       'id', prod.id,
                       'code', prod.code,
                       'name', prod.name,
                       'category', prod.category,
                       'unit', prod.unit,
                       'minStockLevel', prod."minStockLevel"
                   ) AS "product"
            FROM "Purchase" p
            LEFT JOIN "Vendor" v ON v.id = p."vendorId"
            LEFT JOIN "Product" prod ON prod.id = p."productId"
            WHERE p."tenantId" = ${scope.tenantId}
              AND (${scope.unitId || null}::text IS NULL OR p."unitId" = ${scope.unitId || null})
            ORDER BY p."createdAt" DESC
        `;

        return purchases.map((p: any) => ({
            id: p.id,
            productId: p.productId,
            quantity: p.quantity,
            vendor: p.vendor,
            vendorId: p.vendorId,
            batchId: p.batchId,
            tenantId: p.tenantId,
            unitId: p.unitId,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            product: p.product,
            Vendor: p.vendorId ? {
                id: p.vendorId,
                name: p.vendorName,
                code: p.vendorCode,
                category: p.vendorCategory,
                contact: p.vendorContact
            } : null
        }));
    }

    async getIssueRequests(scope: any, patientId?: string) {
        const whereClause: any = {
            tenantId: scope.tenantId,
            isDeleted: false
        };
        if (scope.unitId) {
            whereClause.unitId = scope.unitId;
        }
        if (patientId) {
            whereClause.patientId = patientId;
        }

        return await (prisma as any).stockIssueRequest.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });
    }

    async createIssueRequest(validated: any, scope: any, requestedBy: string, user?: any, domain?: string) {
        const db = (this as any).db || prisma;
        return await db.$transaction(async (tx: any) => {
            const fallbackAllocationId = readNoteValue(validated.notes, 'Allocation');
            const allocationId = validated.allocationId || fallbackAllocationId;

            if (allocationId) {
                const allocation = await tx.allocation.findFirst({
                    where: {
                        id: allocationId,
                        tenantId: scope.tenantId,
                        isDeleted: false
                    },
                    select: { id: true, unitId: true }
                });
                if (!allocation) {
                    throw new Error('Provided patient allocation does not exist or has been deleted.');
                }
                if (allocation.unitId !== scope.unitId) {
                    throw new Error(`Patient allocation unit (${allocation.unitId}) does not match stock issue unit (${scope.unitId}). Cross-unit allocations are not permitted.`);
                }
            }

            if (validated.prescriptionId) {
                const prescription = await tx.prescription.findFirst({
                    where: {
                        id: validated.prescriptionId,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    },
                    select: { id: true }
                });
                if (!prescription) {
                    throw new Error('Provided prescription does not exist or does not belong to the current unit.');
                }
            }

            // 1. Concurrency-safe lock on the Product row (SELECT ... FOR UPDATE)
            const product = await this.lockProductRow(tx, validated.productId, {
                tenantId: scope.tenantId,
                unitId: scope.unitId
            });

            if (domain && domain !== 'all' && !isCategoryInScope(product.category, domain)) {
                throw new Error(`Product '${product.name}' does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
            }

            // Workflow integrity enforcement
            const usageUpper = String(validated.usageType || '').toUpperCase();
            if ((usageUpper.includes('KITCHEN') || usageUpper.includes('MEAL')) && !isCategoryInScope(product.category, 'food')) {
                throw new Error(`Product '${product.name}' (${product.category}) is not a Food/Ration item and cannot be issued for kitchen use.`);
            }
            if ((validated.patientId || validated.prescriptionId) && !isCategoryInScope(product.category, 'medical')) {
                throw new Error(`Product '${product.name}' (${product.category}) is not a Medical item and cannot be issued for clinical patient care.`);
            }

            if (product.status === false) {
                throw new Error(`Cannot request stock issue for deactivated product '${product.name}'`);
            }

            const stock = await tx.stock.findFirst({
                where: {
                    productId: validated.productId,
                    ...scope
                }
            });

            const currentQuantity = Number(stock?.quantity || 0);
            if (currentQuantity <= 0) {
                throw new Error('Selected product has no available stock');
            }

            if (validated.quantity > currentQuantity) {
                throw new Error('Requested quantity is greater than available stock');
            }

            const defaultRevenuePrice = Number(product.defaultRevenuePrice || 0);
            const requestedRate = (validated.rate !== undefined && validated.rate !== null && validated.rate !== '')
                ? Number(validated.rate)
                : null;

            let finalRate = defaultRevenuePrice;
            let isRateOverridden = false;
            const rawOverrideReason = validated.overrideReason
                || validated.notes?.match(/(?:Reason|Override Reason)\s*:\s*([^;\n]+)/i)?.[1]?.trim()
                || null;

            if (requestedRate !== null && Number.isFinite(requestedRate) && requestedRate !== defaultRevenuePrice) {
                if (canOverrideBillingRate(user)) {
                    if (!isMeaningfulReason(rawOverrideReason)) {
                        throw new Error('A meaningful override reason (minimum 5 characters) is required when modifying the default product billing rate.');
                    }
                    finalRate = Math.max(0, Number(requestedRate.toFixed(2)));
                    isRateOverridden = true;
                } else {
                    // Unauthorized override attempt: safely fall back to configured default revenue price
                    finalRate = defaultRevenuePrice;
                }
            } else {
                finalRate = defaultRevenuePrice;
            }

            if (String(validated.usageType || '').toUpperCase().includes('PATIENT') && finalRate <= 0) {
                throw new Error('Patient care medicine requires a unit billing rate. Set Product Default Revenue Price or enter Patient Billing Rate.');
            }
            const amount = Number((validated.quantity * finalRate).toFixed(2));

            const request = await tx.stockIssueRequest.create({
                data: {
                    id: randomUUID(),
                    productId: validated.productId,
                    productName: product.name || 'Unknown Product',
                    category: product.category || '-',
                    quantity: validated.quantity,
                    usageType: validated.usageType,
                    allocationId: allocationId || null,
                    patientId: validated.patientId || null,
                    prescriptionId: validated.prescriptionId || null,
                    rate: finalRate,
                    amount,
                    issuedTo: validated.issuedTo || null,
                    notes: validated.notes || null,
                    status: 'PENDING',
                    requestedBy,
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'CREATE_STOCK_ISSUE_REQUEST',
                    payload: {
                        requestId: request.id,
                        productId: request.productId,
                        quantity: request.quantity,
                        usageType: request.usageType,
                        patientId: request.patientId,
                        allocationId: request.allocationId,
                        defaultRevenuePrice,
                        rate: finalRate,
                        amount,
                        rateOverridden: isRateOverridden,
                        ...(isRateOverridden ? {
                            originalRate: defaultRevenuePrice,
                            overrideRate: finalRate,
                            overrideReason: String(rawOverrideReason).trim(),
                            overriddenBy: user?.name || user?.email || user?.id || requestedBy,
                            overriddenAt: new Date().toISOString()
                        } : {})
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return request;
        });
    }

    async createStockIssueRequest(validated: any, scope: any, requestedBy: string, user?: any) {
        return await this.createIssueRequest(validated, scope, requestedBy, user);
    }

    async approveIssueRequest(
        id: string,
        scope: any,
        user: any,
        canReadAll: boolean,
        overrideOptions?: { rate?: number; overrideReason?: string }
    ) {
        await ensurePatientBillingTables();
        
        return await (prisma as any).$transaction(async (tx: any) => {
            // 1. Concurrency-safe lock on the StockIssueRequest row
            const requestRows = canReadAll
                ? await tx.$queryRaw`
                    SELECT *
                    FROM "StockIssueRequest"
                    WHERE id = ${id}
                      AND "tenantId" = ${scope.tenantId}
                      AND "isDeleted" = false
                    LIMIT 1
                    FOR UPDATE
                `
                : await tx.$queryRaw`
                    SELECT *
                    FROM "StockIssueRequest"
                    WHERE id = ${id}
                      AND "tenantId" = ${scope.tenantId}
                      AND "unitId" = ${scope.unitId}
                      AND "isDeleted" = false
                    LIMIT 1
                    FOR UPDATE
                `;

            const request = requestRows?.[0];
            if (!request) throw new Error('Stock issue request not found');
            if (request.status !== 'PENDING') throw new Error('Only pending requests can be approved');
            const operationScope = { tenantId: scope.tenantId, unitId: request.unitId };

            // 2. Patient allocation same-unit invariant enforcement (Rule A)
            const targetAllocationId = request.allocationId || readNoteValue(request.notes, 'Allocation');
            if (targetAllocationId) {
                const allocation = await tx.allocation.findFirst({
                    where: {
                        id: targetAllocationId,
                        tenantId: operationScope.tenantId,
                        isDeleted: false
                    },
                    select: { id: true, unitId: true }
                });
                if (!allocation) {
                    throw new Error('Associated patient allocation does not exist or has been deleted');
                }
                if (allocation.unitId !== operationScope.unitId) {
                    throw new Error(`Patient allocation unit (${allocation.unitId}) does not match stock issue unit (${operationScope.unitId}). Cross-unit stock issue approval is prohibited.`);
                }
            }

            // 3. Concurrency-safe lock on the Stock balance row
            const stockRows = await tx.$queryRaw`
                SELECT id, quantity
                FROM "Stock"
                WHERE "productId" = ${request.productId}
                  AND "tenantId" = ${operationScope.tenantId}
                  AND "unitId" = ${operationScope.unitId}
                LIMIT 1
                FOR UPDATE
            `;
            const liveStock = stockRows?.[0];
            const currentQuantity = Number(liveStock?.quantity || 0);
            if (!liveStock || currentQuantity < request.quantity) {
                throw new Error('Available stock is lower than requested quantity');
            }

            const product = await tx.product.findFirst({
                where: { id: request.productId },
                select: { id: true, name: true, category: true, defaultRevenuePrice: true, isBatchTracked: true }
            });

            const newBalance = currentQuantity - request.quantity;

            if (product?.isBatchTracked) {
                const now = new Date();
                // 4. Lock batches in deterministic order (expiryDate ASC, id ASC) to prevent deadlocks
                const batchRows = await tx.$queryRaw`
                    SELECT id, quantity, "batchNumber", "expiryDate"
                    FROM "ProductBatch"
                    WHERE "productId" = ${request.productId}
                        AND "tenantId" = ${operationScope.tenantId}
                        AND "unitId" = ${operationScope.unitId}
                        AND quantity > 0
                        AND "expiryDate" > ${now}
                    ORDER BY "expiryDate" ASC, id ASC
                    FOR UPDATE
                `;

                let remainingQuantity = request.quantity;
                let totalAvailableValid = 0;
                for (const b of batchRows) totalAvailableValid += Number(b.quantity || 0);

                const unbatchedLegacyStock = Math.max(0, currentQuantity - totalAvailableValid);

                if (totalAvailableValid + unbatchedLegacyStock < request.quantity) {
                    throw new Error('Insufficient valid, non-expired batch stock to fulfill the request');
                }

                for (const batch of batchRows) {
                    if (remainingQuantity <= 0) break;
                    const batchQty = Number(batch.quantity || 0);
                    const deduct = Math.min(remainingQuantity, batchQty);
                    
                    const batchUpdate = await tx.productBatch.updateMany({
                        where: {
                            id: batch.id,
                            quantity: { gte: deduct }
                        },
                        data: {
                            quantity: { decrement: deduct }
                        }
                    });
                    if (batchUpdate.count === 0) {
                        throw new Error(`Concurrent modification detected for batch ${batch.batchNumber || batch.id}`);
                    }

                    await tx.stockMovement.create({
                        data: {
                            productId: request.productId,
                            movementType: 'ISSUE',
                            quantity: 0 - deduct,
                            balanceAfter: newBalance,
                            batchId: batch.id,
                            referenceType: 'StockIssueRequest',
                            referenceId: request.id,
                            notes: request.notes,
                            performedBy: user?.name || user?.email || 'System',
                            ...operationScope
                        }
                    });

                    remainingQuantity -= deduct;
                }

                if (remainingQuantity > 0) {
                    await tx.stockMovement.create({
                        data: {
                            productId: request.productId,
                            movementType: 'ISSUE',
                            quantity: 0 - remainingQuantity,
                            balanceAfter: newBalance,
                            batchId: null,
                            referenceType: 'StockIssueRequest',
                            referenceId: request.id,
                            notes: (request.notes ? request.notes + ' ' : '') + '(Legacy unbatched stock)',
                            performedBy: user?.name || user?.email || 'System',
                            ...operationScope
                        }
                    });
                    remainingQuantity = 0;
                }
            } else {
                await tx.stockMovement.create({
                    data: {
                        productId: request.productId,
                        movementType: 'ISSUE',
                        quantity: 0 - request.quantity,
                        balanceAfter: newBalance,
                        referenceType: 'StockIssueRequest',
                        referenceId: request.id,
                        notes: request.notes,
                        performedBy: user?.name || user?.email || 'System',
                        ...operationScope
                    }
                });
            }

            // 5. Decrement main stock with atomic condition ensuring balance cannot become negative
            const stockUpdate = await tx.stock.updateMany({
                where: {
                    id: liveStock.id,
                    quantity: { gte: request.quantity }
                },
                data: {
                    quantity: { decrement: request.quantity }
                }
            });
            if (stockUpdate.count === 0) {
                throw new Error('Concurrent stock modification detected: balance would become negative');
            }

            // 6. Billing rate resolution and authorized override (Rule B)
            const defaultRevenuePrice = Number(product?.defaultRevenuePrice || 0);
            const noteRateMatch = String(request.notes || '').match(/(?:Rate|Unit Cost|Cost|Medicine Rate)\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
            const noteRate = noteRateMatch ? Number(noteRateMatch[1]) : 0;
            const amountRate = Number(request.amount || 0) > 0 && Number(request.quantity || 0) > 0
                ? Number(request.amount) / Number(request.quantity)
                : 0;

            let approvedRate = Number(request.rate || amountRate || noteRate || defaultRevenuePrice || 0);
            let overrideAtApproval = false;
            let effectiveOverrideReason: string | null = null;

            if (overrideOptions?.rate !== undefined && overrideOptions.rate !== null && Number.isFinite(overrideOptions.rate)) {
                const requestedApprovalRate = Math.max(0, Number(Number(overrideOptions.rate).toFixed(2)));
                if (requestedApprovalRate !== approvedRate) {
                    if (!canOverrideBillingRate(user)) {
                        throw new Error('Unauthorized: Dedicated billing rate override permission required to modify patient billing rate.');
                    }
                    if (!isMeaningfulReason(overrideOptions.overrideReason)) {
                        throw new Error('A meaningful override reason (minimum 5 characters) is required when modifying the billing rate during approval.');
                    }
                    approvedRate = requestedApprovalRate;
                    overrideAtApproval = true;
                    effectiveOverrideReason = String(overrideOptions.overrideReason).trim();
                }
            }

            const savedRate = Number(approvedRate || 0);
            const savedAmount = Number((Number(request.quantity || 0) * savedRate).toFixed(2));
            const isRateOverridden = overrideAtApproval || (savedRate !== defaultRevenuePrice);

            if (!effectiveOverrideReason && isRateOverridden) {
                effectiveOverrideReason = String(request.notes || '').match(/(?:Reason|Override Reason)\s*:\s*([^;\n]+)/i)?.[1]?.trim() || 'Authorized override preserved at approval';
            }

            // 7. Atomic status transition verifying status is still PENDING
            const statusUpdate = await tx.stockIssueRequest.updateMany({
                where: {
                    id,
                    status: 'PENDING'
                },
                data: {
                    status: 'APPROVED',
                    approvedBy: user?.name || user?.email || 'Inventory approver',
                    approvedAt: new Date(),
                    rate: savedRate,
                    amount: savedAmount
                }
            });
            if (statusUpdate.count === 0) {
                throw new Error('Stock issue request is no longer pending');
            }

            const approvedRequest = await tx.stockIssueRequest.findUnique({
                where: { id }
            });

            // 8. Audit log creation
            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'APPROVE_STOCK_ISSUE_REQUEST',
                    payload: {
                        stockIssueRequestId: request.id,
                        productId: request.productId,
                        quantity: request.quantity,
                        balanceAfter: newBalance,
                        patientId: request.patientId || null,
                        rate: savedRate,
                        amount: savedAmount,
                        defaultRevenuePrice,
                        rateOverridden: isRateOverridden,
                        ...(isRateOverridden ? {
                            originalRate: defaultRevenuePrice,
                            approvedRate: savedRate,
                            overrideReason: effectiveOverrideReason,
                            overriddenBy: user?.name || user?.email || user?.id || 'Inventory approver',
                            overriddenAt: new Date().toISOString()
                        } : {})
                    },
                    ...operationScope
                }
            });

            // 9. Post to patient ledger (strictly passes request.unitId as expectedUnitId)
            const ledgerEntry = await postStockIssueToPatientLedger(tx, {
                ...approvedRequest,
                product
            }, user?.id || null);

            return {
                ...approvedRequest,
                patientLedgerEntry: ledgerEntry || null
            };
        }, { maxWait: 15000, timeout: 30000 });
    }

    async rejectIssueRequest(id: string, scope: any, user: any, canReadAll: boolean) {
        return await (prisma as any).$transaction(async (tx: any) => {
            const requestRows = canReadAll
                ? await tx.$queryRaw`
                    SELECT id, status, "unitId", "tenantId", "productId", quantity
                    FROM "StockIssueRequest"
                    WHERE id = ${id}
                      AND "tenantId" = ${scope.tenantId}
                      AND "isDeleted" = false
                    LIMIT 1
                    FOR UPDATE
                `
                : await tx.$queryRaw`
                    SELECT id, status, "unitId", "tenantId", "productId", quantity
                    FROM "StockIssueRequest"
                    WHERE id = ${id}
                      AND "tenantId" = ${scope.tenantId}
                      AND "unitId" = ${scope.unitId}
                      AND "isDeleted" = false
                    LIMIT 1
                    FOR UPDATE
                `;

            const request = requestRows?.[0];
            if (!request) throw new Error('Pending stock issue request not found');
            if (request.status !== 'PENDING') throw new Error('Only pending requests can be rejected');

            const updateResult = await tx.stockIssueRequest.updateMany({
                where: { id, status: 'PENDING' },
                data: {
                    status: 'REJECTED',
                    rejectedBy: user?.name || user?.email || 'Inventory approver',
                    rejectedAt: new Date()
                }
            });
            if (updateResult.count === 0) {
                throw new Error('Stock issue request is no longer pending');
            }

            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'REJECT_STOCK_ISSUE_REQUEST',
                    payload: {
                        stockIssueRequestId: id,
                        productId: request.productId,
                        quantity: request.quantity
                    },
                    tenantId: scope.tenantId,
                    unitId: request.unitId
                }
            });

            return await tx.stockIssueRequest.findUnique({ where: { id } });
        });
    }

    async cancelIssueRequest(id: string, scope: any, user: any, reason?: string, canReadAll: boolean = false) {
        const db = (this as any).db || prisma;
        return await db.$transaction(async (tx: any) => {
            // 1. Concurrency-safe lock on the StockIssueRequest row
            const requestRows = canReadAll || !scope.unitId
                ? await tx.$queryRaw`
                    SELECT id, status, "unitId", "tenantId", "productId", "productName", quantity, "requestedBy", notes
                    FROM "StockIssueRequest"
                    WHERE id = ${id}
                      AND "tenantId" = ${scope.tenantId}
                      AND "isDeleted" = false
                    LIMIT 1
                    FOR UPDATE
                `
                : await tx.$queryRaw`
                    SELECT id, status, "unitId", "tenantId", "productId", "productName", quantity, "requestedBy", notes
                    FROM "StockIssueRequest"
                    WHERE id = ${id}
                      AND "tenantId" = ${scope.tenantId}
                      AND "unitId" = ${scope.unitId}
                      AND "isDeleted" = false
                    LIMIT 1
                    FOR UPDATE
                `;

            const request = requestRows?.[0];
            if (!request) {
                throw new Error('Stock issue request not found or not accessible within this tenant/unit scope');
            }

            // 2. Requester ownership check
            const requesterIdentifiers = [
                user?.id,
                user?.name,
                user?.email,
                user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : null
            ].filter(Boolean).map(s => String(s).toLowerCase().trim());

            const storedRequester = String(request.requestedBy || '').toLowerCase().trim();
            const isOwner = requesterIdentifiers.includes(storedRequester);
            const userRole = String(user?.role?.name || user?.role || '').toUpperCase();
            const isPrivilegedAdmin = ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN'].includes(userRole);

            if (!isOwner && !isPrivilegedAdmin) {
                throw new Error('Unauthorized: You can only cancel your own stock issue requests');
            }

            // 3. Status eligibility check
            if (request.status === 'CANCELLED') {
                throw new Error('Stock issue request is already cancelled');
            }
            if (request.status !== 'PENDING') {
                throw new Error(`Cannot cancel stock issue request with status '${request.status}'. Only pending requests can be cancelled.`);
            }

            // 4. Atomic status transition to CANCELLED
            const previousStatus = request.status;
            const cancelNote = reason ? String(reason).trim() : '';
            const updatedNotes = cancelNote
                ? (request.notes ? `${request.notes}\n[Cancelled]: ${cancelNote}` : `[Cancelled]: ${cancelNote}`)
                : request.notes;

            const updateResult = await tx.stockIssueRequest.updateMany({
                where: { id, status: 'PENDING' },
                data: {
                    status: 'CANCELLED',
                    notes: updatedNotes,
                    updatedAt: new Date()
                }
            });

            if (updateResult.count === 0) {
                throw new Error('Stock issue request is no longer pending and cannot be cancelled');
            }

            // 5. Audit log creation inside the transaction client
            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'CANCEL_STOCK_ISSUE_REQUEST',
                    payload: {
                        stockIssueRequestId: id,
                        productId: request.productId,
                        productName: request.productName,
                        quantity: request.quantity,
                        previousStatus,
                        newStatus: 'CANCELLED',
                        reason: cancelNote || null,
                        cancelledBy: user?.name || user?.email || user?.id || 'Requester'
                    },
                    tenantId: scope.tenantId,
                    unitId: request.unitId
                }
            });

            return await tx.stockIssueRequest.findUnique({ where: { id } });
        });
    }

    async getStockMovements(scope: any) {
        const movements = await (prisma as any).stockMovement.findMany({
            where: scope,
            include: { product: { select: PRODUCT_BASE_SELECT } },
            orderBy: { createdAt: 'desc' },
            take: 300
        });
        
        return movements.map((movement: any) => ({
            id: movement.id,
            productId: movement.productId,
            product: movement.product,
            movementType: movement.movementType,
            quantity: Math.abs(movement.quantity),
            signedQuantity: movement.quantity,
            balanceAfter: movement.balanceAfter,
            vendor: movement.referenceType === 'Purchase' ? movement.notes : null,
            usageType: null,
            notes: movement.notes,
            issuedTo: null,
            updatedBy: movement.performedBy || 'System',
            createdAt: movement.createdAt
        }));
    }

    async updateStock(
        inputOrProductId: any,
        quantityOrScope?: any,
        scopeOrUser?: any,
        userOrUndefined?: any,
        domain?: string
    ) {
        let payload: {
            productId: string;
            quantity: number;
            batchId?: string | null;
            batchNumber?: string | null;
            expiryDate?: string | null;
            usageType?: string | null;
            referenceNo?: string | null;
            storageLocation?: string | null;
            issuedTo?: string | null;
            notes?: string | null;
        };
        let scope: any;
        let user: any;

        if (typeof inputOrProductId === 'string') {
            payload = {
                productId: inputOrProductId,
                quantity: Number(quantityOrScope)
            };
            scope = scopeOrUser;
            user = userOrUndefined;
        } else {
            payload = inputOrProductId;
            scope = quantityOrScope;
            user = scopeOrUser;
        }

        const quantityChange = Number(payload.quantity);
        if (!Number.isInteger(quantityChange) || quantityChange === 0) {
            throw new Error('Adjustment quantity must be a non-zero integer');
        }

        if (!scope?.tenantId || !scope?.unitId) {
            throw new Error('Tenant context and unit context are required for stock adjustments');
        }

        return await ((this as any).db || prisma).$transaction(async (tx: any) => {
            // 1. Verify Product exists and belongs to the authenticated tenant
            const product = await tx.product.findFirst({
                where: {
                    id: payload.productId,
                    tenantId: scope.tenantId
                },
                select: PRODUCT_BASE_SELECT
            });
            if (!product) {
                throw new Error('Product not found or not accessible within this tenant');
            }

            if (domain && domain !== 'all' && !isCategoryInScope(product.category, domain)) {
                throw new Error(`Product '${product.name}' does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
            }

            const isBatchTracked = Boolean(
                product.isBatchTracked ||
                (product.category && String(product.category).toLowerCase() === 'medical')
            );

            // 2. Lock or query current Stock balance row for this product and unit
            let liveStock: any = null;
            try {
                const stockRows: any[] = await tx.$queryRaw`
                    SELECT id, quantity
                    FROM "Stock"
                    WHERE "productId" = ${product.id}
                      AND "tenantId" = ${scope.tenantId}
                      AND "unitId" = ${scope.unitId}
                    LIMIT 1
                    FOR UPDATE
                `;
                liveStock = stockRows?.[0] || null;
            } catch {
                liveStock = await tx.stock.findFirst({
                    where: {
                        productId: product.id,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    }
                });
            }

            const currentStockQuantity = Number(liveStock?.quantity || 0);
            const deductAmount = Math.abs(quantityChange);
            let resolvedBatchId: string | null = null;

            // 3. Batch Synchronization Logic
            if (isBatchTracked) {
                if (quantityChange > 0) {
                    if (payload.batchId) {
                        const existingBatch = await tx.productBatch.findFirst({
                            where: {
                                id: payload.batchId,
                                productId: product.id,
                                tenantId: scope.tenantId,
                                unitId: scope.unitId
                            }
                        });
                        if (!existingBatch) {
                            throw new Error('Selected batch not found or does not belong to this product and unit');
                        }
                        await tx.productBatch.update({
                            where: { id: existingBatch.id },
                            data: { quantity: { increment: quantityChange } }
                        });
                        resolvedBatchId = existingBatch.id;
                    } else if (payload.batchNumber && payload.expiryDate) {
                        const trimmedBatchNumber = String(payload.batchNumber).trim();
                        if (!trimmedBatchNumber) {
                            throw new Error('Batch number cannot be empty');
                        }
                        const expiryDate = new Date(payload.expiryDate);
                        if (isNaN(expiryDate.getTime())) {
                            throw new Error('Invalid expiry date provided for batch');
                        }

                        const batch = await tx.productBatch.upsert({
                            where: {
                                productId_batchNumber_tenantId_unitId: {
                                    productId: product.id,
                                    batchNumber: trimmedBatchNumber,
                                    tenantId: scope.tenantId,
                                    unitId: scope.unitId
                                }
                            },
                            update: {
                                quantity: { increment: quantityChange },
                                expiryDate
                            },
                            create: {
                                productId: product.id,
                                batchNumber: trimmedBatchNumber,
                                expiryDate,
                                quantity: quantityChange,
                                tenantId: scope.tenantId,
                                unitId: scope.unitId
                            }
                        });
                        resolvedBatchId = batch.id;
                    } else if (payload.usageType === 'Initial Opening Stock') {
                        // Resilient opening stock initialization: generate default opening batch
                        const defaultBatchNum = 'OPENING-STOCK';
                        const defaultExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
                        const batch = await tx.productBatch.upsert({
                            where: {
                                productId_batchNumber_tenantId_unitId: {
                                    productId: product.id,
                                    batchNumber: defaultBatchNum,
                                    tenantId: scope.tenantId,
                                    unitId: scope.unitId
                                }
                            },
                            update: { quantity: { increment: quantityChange } },
                            create: {
                                productId: product.id,
                                batchNumber: defaultBatchNum,
                                expiryDate: defaultExpiry,
                                quantity: quantityChange,
                                tenantId: scope.tenantId,
                                unitId: scope.unitId
                            }
                        });
                        resolvedBatchId = batch.id;
                    } else {
                        throw new Error('Batch number and expiry date are required for batch-tracked product restock');
                    }
                } else {
                    // Negative adjustment for batch-tracked product
                    let targetBatch = null;
                    if (payload.batchId) {
                        targetBatch = await tx.productBatch.findFirst({
                            where: {
                                id: payload.batchId,
                                productId: product.id,
                                tenantId: scope.tenantId,
                                unitId: scope.unitId
                            }
                        });
                    } else if (payload.batchNumber) {
                        targetBatch = await tx.productBatch.findFirst({
                            where: {
                                productId: product.id,
                                batchNumber: String(payload.batchNumber).trim(),
                                tenantId: scope.tenantId,
                                unitId: scope.unitId
                            }
                        });
                    }

                    if (!targetBatch) {
                        throw new Error('A valid existing batch in the current unit is required for batch-tracked product deduction');
                    }

                    if (Number(targetBatch.quantity || 0) < deductAmount) {
                        throw new Error(`Selected batch ${targetBatch.batchNumber} has insufficient quantity (${targetBatch.quantity} available, ${deductAmount} requested)`);
                    }

                    const batchUpdate = await tx.productBatch.updateMany({
                        where: {
                            id: targetBatch.id,
                            quantity: { gte: deductAmount }
                        },
                        data: {
                            quantity: { decrement: deductAmount }
                        }
                    });
                    if (batchUpdate.count === 0) {
                        throw new Error(`Concurrent modification detected for batch ${targetBatch.batchNumber}: insufficient stock`);
                    }
                    resolvedBatchId = targetBatch.id;
                }
            } else {
                if (payload.batchId || payload.batchNumber) {
                    throw new Error('Product is not batch-tracked; batch fields must not be provided');
                }
            }

            // 4. Update Aggregate Stock with Non-Negative Invariant
            let finalStockBalance = 0;

            if (quantityChange < 0) {
                if (!liveStock || currentStockQuantity < deductAmount) {
                    throw new Error(`Insufficient stock balance. Available: ${currentStockQuantity}, requested deduction: ${deductAmount}`);
                }

                const stockUpdate = await tx.stock.updateMany({
                    where: {
                        id: liveStock.id,
                        quantity: { gte: deductAmount }
                    },
                    data: {
                        quantity: { decrement: deductAmount }
                    }
                });

                if (stockUpdate.count === 0) {
                    throw new Error('Concurrent stock modification detected: balance would become negative');
                }

                finalStockBalance = currentStockQuantity - deductAmount;
            } else {
                const stock = await tx.stock.upsert({
                    where: {
                        productId_tenantId_unitId: {
                            productId: product.id,
                            tenantId: scope.tenantId,
                            unitId: scope.unitId
                        }
                    },
                    update: { quantity: { increment: quantityChange } },
                    create: {
                        productId: product.id,
                        quantity: quantityChange,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    }
                });
                finalStockBalance = stock.quantity;
            }

            // 5. Format structured notes and trace metadata
            const noteSegments = [
                payload.notes ? String(payload.notes).trim() : '',
                payload.referenceNo ? `Ref: ${String(payload.referenceNo).trim()}` : '',
                payload.storageLocation ? `Location: ${String(payload.storageLocation).trim()}` : '',
                payload.issuedTo ? `${quantityChange < 0 ? 'Issued To' : 'Received From'}: ${String(payload.issuedTo).trim()}` : '',
                payload.usageType ? `Purpose: ${String(payload.usageType).trim()}` : ''
            ].filter(Boolean);

            const finalNotes = noteSegments.length > 0 ? noteSegments.join(' | ') : 'Manual Stock Update';
            const movementRefType = payload.usageType
                ? String(payload.usageType).trim()
                : (quantityChange > 0 ? 'Stock Receipt' : 'Manual Adjustment');

            // 6. Record StockMovement
            await tx.stockMovement.create({
                data: {
                    productId: product.id,
                    movementType: 'ADJUSTMENT',
                    quantity: quantityChange,
                    balanceAfter: finalStockBalance,
                    batchId: resolvedBatchId,
                    referenceType: movementRefType,
                    referenceId: payload.referenceNo ? String(payload.referenceNo).trim() : null,
                    notes: finalNotes,
                    performedBy: user?.name || user?.email || 'System',
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            // 7. Record AuditLog
            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'UPDATE_STOCK',
                    payload: {
                        productId: product.id,
                        productName: product.name,
                        quantityChange,
                        balanceAfter: finalStockBalance,
                        batchId: resolvedBatchId,
                        usageType: payload.usageType || null,
                        referenceNo: payload.referenceNo || null,
                        storageLocation: payload.storageLocation || null,
                        issuedTo: payload.issuedTo || null,
                        notes: finalNotes
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            // 8. Return updated stock record
            const resultStock = await tx.stock.findUnique({
                where: {
                    productId_tenantId_unitId: {
                        productId: product.id,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    }
                }
            });

            return resultStock;
        }, { maxWait: 15000, timeout: 30000 });
    }

    async getBatches(scope: any) {
        const batches = await (prisma as any).productBatch.findMany({
            where: {
                ...scope,
                quantity: { gt: 0 }
            },
            select: {
                ...PRODUCT_BATCH_BASE_SELECT,
                product: { select: PRODUCT_BASE_SELECT }
            },
            orderBy: { expiryDate: 'asc' }
        });
        
        const now = new Date();
        const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        return batches.map((batch: any) => {
            const exp = new Date(batch.expiryDate);
            let status = 'Healthy';
            if (exp < now) status = 'Expired';
            else if (exp <= thirtyDays) status = 'Expiring Soon';

            return {
                ...batch,
                status
            };
        });
    }

    async getExpiryAlerts(scope: any, options: { daysAhead?: number; status?: string; productId?: string; domain?: string } = {}) {
        const db = (this as any).db || prisma;
        const daysAhead = options.daysAhead !== undefined && !isNaN(Number(options.daysAhead)) && Number(options.daysAhead) >= 0
            ? Math.floor(Number(options.daysAhead))
            : 30;

        const now = new Date();
        const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        const filterStatus = String(options.status || 'ALL').toUpperCase();

        const whereClause: any = {
            quantity: { gt: 0 }
        };

        if (scope.tenantId) {
            whereClause.tenantId = scope.tenantId;
        }
        if (scope.unitId) {
            whereClause.unitId = scope.unitId;
        }
        if (options.productId) {
            whereClause.productId = String(options.productId).trim();
        }

        // Push date filtering down to query level to prevent full-table scan
        if (filterStatus === 'EXPIRED') {
            whereClause.expiryDate = { lt: now };
        } else if (filterStatus === 'EXPIRING_SOON') {
            whereClause.expiryDate = { gte: now, lte: windowEnd };
        } else {
            whereClause.expiryDate = { lte: windowEnd };
        }

        const batches = await (db as any).productBatch.findMany({
            where: whereClause,
            select: {
                ...PRODUCT_BATCH_BASE_SELECT,
                product: {
                    select: PRODUCT_BASE_SELECT
                }
            },
            orderBy: { expiryDate: 'asc' }
        });

        const domain = options.domain ? normalizeInventoryScope(options.domain) : 'all';
        const targetBatches = domain !== 'all'
            ? (batches || []).filter((b: any) => isCategoryInScope(b.product?.category, domain))
            : (batches || []);

        let expiredCount = 0;
        let expiringSoonCount = 0;
        let expiringTodayCount = 0;
        let totalQuantityAtRisk = 0;

        const alerts = targetBatches.map((batch: any) => {
            const hasValidDate = batch.expiryDate && !isNaN(new Date(batch.expiryDate).getTime());
            const exp = hasValidDate ? new Date(batch.expiryDate) : null;

            let alertStatus = 'EXPIRED';
            let isExpiringToday = false;
            let daysRemaining = 0;

            if (exp) {
                const diffMs = exp.getTime() - now.getTime();
                daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                const isSameCalendarDay = exp.toDateString() === now.toDateString();

                if (exp < now) {
                    alertStatus = 'EXPIRED';
                    isExpiringToday = isSameCalendarDay;
                } else {
                    alertStatus = 'EXPIRING_SOON';
                    isExpiringToday = isSameCalendarDay;
                }
            } else {
                alertStatus = 'UNKNOWN';
                daysRemaining = 0;
            }

            if (alertStatus === 'EXPIRED') expiredCount++;
            if (alertStatus === 'EXPIRING_SOON') expiringSoonCount++;
            if (isExpiringToday) expiringTodayCount++;
            totalQuantityAtRisk += Number(batch.quantity || 0);

            return {
                id: batch.id,
                productId: batch.productId,
                batchNumber: batch.batchNumber,
                expiryDate: batch.expiryDate,
                quantity: batch.quantity,
                tenantId: batch.tenantId,
                unitId: batch.unitId,
                status: alertStatus,
                daysRemaining,
                isExpiringToday,
                product: batch.product || null,
                createdAt: batch.createdAt,
                updatedAt: batch.updatedAt
            };
        });

        return {
            alerts,
            summary: {
                totalAlerts: alerts.length,
                expiredCount,
                expiringSoonCount,
                expiringTodayCount,
                totalQuantityAtRisk,
                windowDays: daysAhead,
                evaluatedAt: now.toISOString()
            }
        };
    }

    async createPurchase(validated: any, scope: any, user: any, domain?: string) {
        const db = (this as any).db || prisma;
        return await db.$transaction(async (tx: any) => {
            // 1. Concurrency-safe lock on the Product row (SELECT ... FOR UPDATE)
            const product = await this.lockProductRow(tx, validated.productId, {
                tenantId: scope.tenantId
            });
            if (domain && domain !== 'all' && !isCategoryInScope(product.category, domain)) {
                throw new Error(`Product '${product.name}' does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
            }
            if (product.status === false) {
                throw new Error(`Cannot record purchase for deactivated product '${product.name}'`);
            }

            // Vendor Master Integration:
            // 1. If vendorId provided, verify it exists and is valid for this tenant
            let resolvedVendorId: string | null = validated.vendorId || null;
            let resolvedVendorName: string = validated.vendor || '';

            if (resolvedVendorId) {
                const vendorRecord = await tx.vendor.findFirst({
                    where: {
                        id: resolvedVendorId,
                        tenantId: scope.tenantId
                    }
                });
                if (!vendorRecord) {
                    throw new Error(`Vendor with ID '${resolvedVendorId}' not found for this tenant`);
                }
                if (!resolvedVendorName) {
                    resolvedVendorName = vendorRecord.name;
                }
            } else if (resolvedVendorName) {
                // Backward-compatible auto-link if vendor name matches Vendor master
                const existingVendor = await tx.vendor.findFirst({
                    where: {
                        name: { equals: resolvedVendorName, mode: 'insensitive' },
                        tenantId: scope.tenantId,
                        isDeleted: false
                    }
                });
                if (existingVendor) {
                    resolvedVendorId = existingVendor.id;
                }
            }

            let batchId = null;
            if (product.isBatchTracked) {
                if (!validated.batchNumber || !validated.expiryDate) {
                    throw new Error('Batch number and expiry date are required for batch-tracked products');
                }
                const expiryDate = new Date(validated.expiryDate);
                if (isNaN(expiryDate.getTime())) throw new Error('Invalid expiry date');

                const batch = await tx.productBatch.upsert({
                    where: {
                        productId_batchNumber_tenantId_unitId: {
                            productId: validated.productId,
                            batchNumber: validated.batchNumber,
                            tenantId: scope.tenantId,
                            unitId: scope.unitId
                        }
                    },
                    update: { quantity: { increment: validated.quantity } },
                    create: {
                        productId: validated.productId,
                        batchNumber: validated.batchNumber,
                        expiryDate,
                        quantity: validated.quantity,
                        ...scope
                    }
                });
                batchId = batch.id;
            }

            const purchaseId = randomUUID();
            const purchaseRows: any[] = await tx.$queryRaw`
                INSERT INTO "Purchase" (
                    "id", "productId", "quantity", "vendor", "vendorId", "batchId",
                    "tenantId", "unitId", "createdAt", "updatedAt"
                )
                VALUES (
                    ${purchaseId}, ${validated.productId}, ${validated.quantity},
                    ${resolvedVendorName || 'Unknown Vendor'}, ${resolvedVendorId}, ${batchId},
                    ${scope.tenantId}, ${scope.unitId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                RETURNING *
            `;
            const purchase = purchaseRows?.[0];

            const stock = await tx.stock.upsert({
                where: {
                    productId_tenantId_unitId: {
                        productId: validated.productId,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    }
                },
                update: { quantity: { increment: validated.quantity } },
                create: {
                    productId: validated.productId,
                    quantity: validated.quantity,
                    ...scope
                }
            });

            await tx.stockMovement.create({
                data: {
                    productId: validated.productId,
                    movementType: 'PURCHASE',
                    quantity: validated.quantity,
                    balanceAfter: stock.quantity,
                    batchId,
                    referenceType: 'Purchase',
                    referenceId: purchase.id,
                    notes: resolvedVendorName,
                    performedBy: user?.name || user?.email || 'System',
                    ...scope
                }
            });

            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'PURCHASE',
                    payload: {
                        purchaseId: purchase.id,
                        productId: validated.productId,
                        quantity: validated.quantity,
                        vendor: resolvedVendorName,
                        vendorId: resolvedVendorId,
                        batchId,
                        balanceAfter: stock.quantity
                    },
                    ...scope
                }
            });

            return purchase;
        }, { maxWait: 15000, timeout: 30000 });
    }

    async createKitchenRequisition(validated: { mealPrepId: string, items: { productId: string, quantity: number }[] }, scope: any, user: any) {
        return await (prisma as any).$transaction(async (tx: any) => {
            const results = [];
            for (const item of validated.items) {
                const product = await tx.product.findFirst({
                    where: {
                        id: item.productId,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    },
                    select: PRODUCT_BASE_SELECT
                });
                if (!product) throw new Error(`Product not found: ${item.productId}`);

                if (!isCategoryInScope(product.category, 'food')) {
                    throw new Error(`Product '${product.name}' (${product.category}) is not a verified Food & Ration product and cannot be used in a kitchen requisition.`);
                }

                const liveStock = await tx.stock.findFirst({
                    where: { productId: item.productId, ...scope }
                });
                const currentQuantity = Number(liveStock?.quantity || 0);
                if (item.quantity > currentQuantity) {
                    throw new Error(`Insufficient stock for product: ${product.name}`);
                }

                const notes = `MealPrep: ${validated.mealPrepId}`;

                const request = await tx.stockIssueRequest.create({
                    data: {
                        id: randomUUID(),
                        productId: item.productId,
                        productName: product.name,
                        category: product.category || '-',
                        quantity: item.quantity,
                        usageType: 'KITCHEN_PREP',
                        patientId: null,
                        rate: 0,
                        amount: 0,
                        issuedTo: 'Kitchen',
                        notes,
                        status: 'APPROVED',
                        requestedBy: user?.name || user?.email || 'System',
                        approvedBy: user?.name || user?.email || 'System',
                        approvedAt: new Date(),
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    }
                });

                const updatedStock = await tx.stock.update({
                    where: {
                        productId_tenantId_unitId: {
                            productId: item.productId,
                            tenantId: scope.tenantId,
                            unitId: scope.unitId
                        }
                    },
                    data: { quantity: { decrement: item.quantity } }
                });

                await tx.stockMovement.create({
                    data: {
                        productId: item.productId,
                        movementType: 'ISSUE',
                        quantity: 0 - item.quantity,
                        balanceAfter: updatedStock.quantity,
                        referenceType: 'StockIssueRequest',
                        referenceId: request.id,
                        notes,
                        performedBy: user?.name || user?.email || 'System',
                        ...scope
                    }
                });

                await tx.auditLog.create({
                    data: {
                        userId: user?.id || null,
                        module: 'inventory',
                        action: 'KITCHEN_REQUISITION',
                        payload: {
                            stockIssueRequestId: request.id,
                            mealPrepId: validated.mealPrepId,
                            productId: item.productId,
                            quantity: item.quantity,
                            balanceAfter: updatedStock.quantity
                        },
                        ...scope
                    }
                });

                results.push(request);
            }
            return results;
        }, { maxWait: 15000, timeout: 30000 });
    }

    // ==========================================
    // MULTI-ITEM PURCHASE ORDERS (D8.2)
    // ==========================================

    async getPurchaseOrders(scope: any, filters: any = {}) {
        const db = (this as any).db || prisma;
        const page = Math.max(1, Number(filters.page || 1));
        const limit = Math.min(100, Math.max(1, Number(filters.limit || 20)));
        const skip = (page - 1) * limit;

        const whereClause: any = {
            tenantId: scope.tenantId,
            isDeleted: false
        };

        if (scope.unitId) {
            whereClause.unitId = scope.unitId;
        }

        if (filters.status) {
            whereClause.status = String(filters.status).trim().toUpperCase();
        }

        if (filters.vendorId) {
            whereClause.vendorId = String(filters.vendorId).trim();
        }

        if (filters.search) {
            const query = String(filters.search).trim();
            whereClause.OR = [
                { orderNumber: { contains: query, mode: 'insensitive' } },
                { notes: { contains: query, mode: 'insensitive' } },
                { vendor: { name: { contains: query, mode: 'insensitive' } } }
            ];
        }

        const [total, purchaseOrders] = await Promise.all([
            (db as any).purchaseOrder.count({ where: whereClause }),
            (db as any).purchaseOrder.findMany({
                where: whereClause,
                select: {
                    ...PURCHASE_ORDER_BASE_SELECT,
                    vendor: {
                        select: { id: true, name: true, code: true, category: true, contact: true }
                    },
                    items: {
                        where: { isDeleted: false },
                        select: {
                            ...PURCHASE_ORDER_ITEM_BASE_SELECT,
                            product: {
                                select: PRODUCT_BASE_SELECT
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            })
        ]);

        const ordersWithSummary = (purchaseOrders || []).map((po: any) => {
            const items = po.items || [];
            const totalOrderedQuantity = items.reduce((sum: number, it: any) => sum + Number(it.orderedQuantity || 0), 0);
            const totalReceivedQuantity = items.reduce((sum: number, it: any) => sum + Number(it.receivedQuantity || 0), 0);
            return {
                ...po,
                itemCount: items.length,
                totalOrderedQuantity,
                totalReceivedQuantity,
                isFullyReceived: totalOrderedQuantity > 0 && totalReceivedQuantity >= totalOrderedQuantity
            };
        });

        let finalOrders = ordersWithSummary;
        let finalTotal = total;
        if (filters.domain && filters.domain !== 'all') {
            const normDomain = normalizeInventoryScope(filters.domain);
            finalOrders = ordersWithSummary.filter((po: any) =>
                (po.items || []).some((it: any) => isCategoryInScope(it.product?.category, normDomain))
            );
            finalTotal = finalOrders.length;
        }

        return {
            purchaseOrders: finalOrders,
            total: finalTotal,
            page,
            limit,
            totalPages: Math.ceil(finalTotal / limit) || 1
        };
    }

    async getPurchaseOrderById(id: string, scope: any) {
        const db = (this as any).db || prisma;
        const po = await (db as any).purchaseOrder.findFirst({
            where: {
                id,
                tenantId: scope.tenantId,
                isDeleted: false
            },
            select: {
                ...PURCHASE_ORDER_BASE_SELECT,
                vendor: true,
                items: {
                    where: { isDeleted: false },
                    select: {
                        ...PURCHASE_ORDER_ITEM_BASE_SELECT,
                        product: {
                            select: PRODUCT_BASE_SELECT
                        },
                        receiptItems: {
                            where: { isDeleted: false },
                            select: GOODS_RECEIPT_ITEM_BASE_SELECT
                        }
                    }
                },
                goodsReceipts: {
                    where: { isDeleted: false },
                    select: {
                        ...GOODS_RECEIPT_NOTE_BASE_SELECT,
                        items: {
                            where: { isDeleted: false },
                            select: GOODS_RECEIPT_ITEM_BASE_SELECT
                        }
                    },
                    orderBy: { receivedDate: 'desc' }
                }
            }
        });

        if (!po) {
            throw new Error(`Purchase order '${id}' not found or not accessible`);
        }

        if (scope.unitId && po.unitId !== scope.unitId) {
            throw new Error(`Access denied: Purchase order belongs to another unit`);
        }

        const items = po.items || [];
        const totalOrderedQuantity = items.reduce((sum: number, it: any) => sum + Number(it.orderedQuantity || 0), 0);
        const totalReceivedQuantity = items.reduce((sum: number, it: any) => sum + Number(it.receivedQuantity || 0), 0);

        return {
            ...po,
            itemCount: items.length,
            totalOrderedQuantity,
            totalReceivedQuantity,
            remainingQuantity: Math.max(0, totalOrderedQuantity - totalReceivedQuantity),
            isFullyReceived: totalOrderedQuantity > 0 && totalReceivedQuantity >= totalOrderedQuantity
        };
    }

    async createPurchaseOrder(validated: any, scope: any, user: any, domain?: string) {
        const db = (this as any).db || prisma;
        if (!scope.tenantId) {
            throw new Error("Tenant ID is required for purchase order creation");
        }
        if (!scope.unitId) {
            throw new Error("Unit ID is required for purchase order creation");
        }

        return await db.$transaction(async (tx: any) => {
            // 1. Verify vendor
            if (!validated.vendorId || !String(validated.vendorId).trim()) {
                throw new Error("Vendor ID is required for purchase order creation");
            }

            const vendor = await tx.vendor.findFirst({
                where: {
                    id: String(validated.vendorId).trim(),
                    tenantId: scope.tenantId,
                    isDeleted: false
                }
            });
            if (!vendor) {
                throw new Error(`Vendor with ID '${validated.vendorId}' not found or is inactive for this tenant`);
            }

            // 2. Validate items
            if (!Array.isArray(validated.items) || validated.items.length === 0) {
                throw new Error("Purchase order must have at least one line item");
            }

            // 3. Reject duplicate product lines
            const productIds = validated.items.map((it: any) => String(it.productId).trim());
            const uniqueProductIds = new Set(productIds);
            if (uniqueProductIds.size !== productIds.length) {
                throw new Error("Duplicate product lines in purchase order are not allowed");
            }

            // 4. Validate and lock each product
            for (const item of validated.items) {
                const qty = Number(item.orderedQuantity);
                if (!Number.isInteger(qty) || qty <= 0) {
                    throw new Error(`Ordered quantity must be a positive integer greater than zero. Received: ${item.orderedQuantity}`);
                }

                const product = await this.lockProductRow(tx, item.productId, { tenantId: scope.tenantId });
                if (!product) {
                    throw new Error(`Product with ID '${item.productId}' not found in this tenant`);
                }
                if (product.status === false) {
                    throw new Error(`Cannot order deactivated product '${product.name}'`);
                }
                if (domain && domain !== 'all' && !isCategoryInScope(product.category, domain)) {
                    throw new Error(`Product '${product.name}' (category: '${product.category}') does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
                }
            }

            // 5. Generate reference number via atomic refGenerator
            const orderNumber = await generateRefNumber('PO', scope.tenantId, scope.unitId, tx);

            // 6. Create PurchaseOrder and child PurchaseOrderItems
            const po = await tx.purchaseOrder.create({
                data: {
                    orderNumber,
                    vendorId: validated.vendorId,
                    status: 'DRAFT',
                    orderDate: validated.orderDate ? new Date(validated.orderDate) : new Date(),
                    expectedDeliveryDate: validated.expectedDeliveryDate ? new Date(validated.expectedDeliveryDate) : null,
                    notes: validated.notes ? String(validated.notes).trim() : null,
                    tenantId: scope.tenantId,
                    unitId: scope.unitId,
                    createdById: user?.id || null,
                    createdByName: user?.name || user?.email || 'Authorized User',
                    items: {
                        create: validated.items.map((item: any) => ({
                            productId: item.productId,
                            orderedQuantity: Math.trunc(Number(item.orderedQuantity)),
                            receivedQuantity: 0,
                            status: 'PENDING',
                            notes: item.notes ? String(item.notes).trim() : null,
                            tenantId: scope.tenantId,
                            unitId: scope.unitId
                        }))
                    }
                },
                include: {
                    vendor: true,
                    items: {
                        include: {
                            product: {
                                select: { id: true, name: true, code: true, category: true, unit: true, status: true }
                            }
                        }
                    }
                }
            });

            // 7. Audit Logging
            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'CREATE_PURCHASE_ORDER',
                    payload: {
                        purchaseOrderId: po.id,
                        orderNumber: po.orderNumber,
                        vendorId: po.vendorId,
                        itemCount: po.items.length
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return po;
        });
    }

    async updatePurchaseOrder(id: string, validated: any, scope: any, user: any) {
        const db = (this as any).db || prisma;
        return await db.$transaction(async (tx: any) => {
            const po = await tx.purchaseOrder.findFirst({
                where: { id, tenantId: scope.tenantId, isDeleted: false },
                select: {
                    ...PURCHASE_ORDER_BASE_SELECT,
                    items: {
                        where: { isDeleted: false },
                        select: PURCHASE_ORDER_ITEM_BASE_SELECT
                    }
                }
            });

            if (!po) {
                throw new Error(`Purchase order '${id}' not found`);
            }
            if (scope.unitId && po.unitId !== scope.unitId) {
                throw new Error("Access denied: Purchase order belongs to another unit");
            }
            if (po.status !== 'DRAFT') {
                throw new Error(`Only DRAFT purchase orders can be updated. Current status: ${po.status}`);
            }

            // If updating vendor
            if (validated.vendorId) {
                const vendor = await tx.vendor.findFirst({
                    where: { id: validated.vendorId, tenantId: scope.tenantId, isDeleted: false }
                });
                if (!vendor) {
                    throw new Error(`Vendor with ID '${validated.vendorId}' not found or is inactive`);
                }
            }

            // If updating items
            if (validated.items) {
                if (!Array.isArray(validated.items) || validated.items.length === 0) {
                    throw new Error("Purchase order must have at least one line item");
                }

                const productIds = validated.items.map((it: any) => String(it.productId).trim());
                const uniqueProductIds = new Set(productIds);
                if (uniqueProductIds.size !== productIds.length) {
                    throw new Error("Duplicate product lines in purchase order are not allowed");
                }

                for (const item of validated.items) {
                    const qty = Number(item.orderedQuantity);
                    if (!Number.isInteger(qty) || qty <= 0) {
                        throw new Error(`Ordered quantity must be a positive integer greater than zero. Received: ${item.orderedQuantity}`);
                    }
                    const product = await this.lockProductRow(tx, item.productId, { tenantId: scope.tenantId });
                    if (!product) {
                        throw new Error(`Product with ID '${item.productId}' not found`);
                    }
                    if (product.status === false) {
                        throw new Error(`Cannot order deactivated product '${product.name}'`);
                    }
                }

                // Delete old items and create new ones
                await tx.purchaseOrderItem.deleteMany({
                    where: { purchaseOrderId: id }
                });
            }

            const updateData: any = {};
            if (validated.vendorId) updateData.vendorId = validated.vendorId;
            if (validated.notes !== undefined) updateData.notes = validated.notes ? String(validated.notes).trim() : null;
            if (validated.expectedDeliveryDate !== undefined) {
                updateData.expectedDeliveryDate = validated.expectedDeliveryDate ? new Date(validated.expectedDeliveryDate) : null;
            }
            if (validated.items) {
                updateData.items = {
                    create: validated.items.map((item: any) => ({
                        productId: item.productId,
                        orderedQuantity: Math.trunc(Number(item.orderedQuantity)),
                        receivedQuantity: 0,
                        status: 'PENDING',
                        notes: item.notes ? String(item.notes).trim() : null,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    }))
                };
            }

            const updatedPo = await tx.purchaseOrder.update({
                where: { id },
                data: updateData,
                include: {
                    vendor: true,
                    items: {
                        include: {
                            product: {
                                select: { id: true, name: true, code: true, category: true, unit: true, status: true }
                            }
                        }
                    }
                }
            });

            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'UPDATE_PURCHASE_ORDER',
                    payload: {
                        purchaseOrderId: id,
                        orderNumber: po.orderNumber,
                        updatedFields: Object.keys(validated)
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return updatedPo;
        });
    }

    async orderPurchaseOrder(id: string, scope: any, user: any) {
        const db = (this as any).db || prisma;
        return await db.$transaction(async (tx: any) => {
            const po = await tx.purchaseOrder.findFirst({
                where: { id, tenantId: scope.tenantId, isDeleted: false },
                include: { items: true }
            });

            if (!po) {
                throw new Error(`Purchase order '${id}' not found`);
            }
            if (scope.unitId && po.unitId !== scope.unitId) {
                throw new Error("Access denied: Purchase order belongs to another unit");
            }
            if (po.status !== 'DRAFT') {
                throw new Error(`Cannot transition purchase order to ORDERED from status '${po.status}'. Only DRAFT orders can be ordered.`);
            }
            if (!po.items || po.items.length === 0) {
                throw new Error("Cannot order an empty purchase order");
            }

            // Verify all items are active before ordering
            for (const item of po.items) {
                const product = await this.lockProductRow(tx, item.productId, { tenantId: scope.tenantId });
                if (product.status === false) {
                    throw new Error(`Cannot order: Product '${product.name}' is deactivated`);
                }
            }

            // Concurrency-safe atomic conditional transition
            const updateResult = await tx.purchaseOrder.updateMany({
                where: {
                    id,
                    tenantId: scope.tenantId,
                    status: 'DRAFT',
                    isDeleted: false
                },
                data: {
                    status: 'ORDERED',
                    approvedById: user?.id || null,
                    approvedByName: user?.name || user?.email || 'Authorized User',
                    approvedAt: new Date()
                }
            });

            if (updateResult.count === 0) {
                throw new Error("Failed to order purchase order: conflicting concurrent update or status changed");
            }

            await tx.purchaseOrderItem.updateMany({
                where: { purchaseOrderId: id, tenantId: scope.tenantId },
                data: { status: 'ORDERED' }
            });

            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'ORDER_PURCHASE_ORDER',
                    payload: {
                        purchaseOrderId: id,
                        orderNumber: po.orderNumber,
                        previousStatus: 'DRAFT',
                        newStatus: 'ORDERED'
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return await tx.purchaseOrder.findUnique({
                where: { id },
                include: {
                    vendor: true,
                    items: {
                        include: {
                            product: {
                                select: { id: true, name: true, code: true, category: true, unit: true, status: true }
                            }
                        }
                    }
                }
            });
        });
    }

    async cancelPurchaseOrder(id: string, scope: any, user: any, reason?: string) {
        const db = (this as any).db || prisma;
        return await db.$transaction(async (tx: any) => {
            const po = await tx.purchaseOrder.findFirst({
                where: { id, tenantId: scope.tenantId, isDeleted: false },
                include: { items: true }
            });

            if (!po) {
                throw new Error(`Purchase order '${id}' not found`);
            }
            if (scope.unitId && po.unitId !== scope.unitId) {
                throw new Error("Access denied: Purchase order belongs to another unit");
            }
            if (po.status === 'COMPLETED') {
                throw new Error("Cannot cancel a completed purchase order");
            }
            if (po.status === 'CANCELLED') {
                throw new Error("Purchase order is already cancelled");
            }

            const reasonText = reason ? String(reason).trim() : '';
            const updatedNotes = reasonText
                ? `${po.notes ? po.notes + ' | ' : ''}Cancelled: ${reasonText}`
                : po.notes;

            // Concurrency-safe atomic conditional update
            const updateResult = await tx.purchaseOrder.updateMany({
                where: {
                    id,
                    tenantId: scope.tenantId,
                    status: { notIn: ['COMPLETED', 'CANCELLED'] },
                    isDeleted: false
                },
                data: {
                    status: 'CANCELLED',
                    notes: updatedNotes
                }
            });

            if (updateResult.count === 0) {
                throw new Error("Failed to cancel purchase order: conflicting update or order already completed/cancelled");
            }

            // Cancel any pending line items with receivedQuantity === 0
            await tx.purchaseOrderItem.updateMany({
                where: {
                    purchaseOrderId: id,
                    tenantId: scope.tenantId,
                    receivedQuantity: 0
                },
                data: { status: 'CANCELLED' }
            });

            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'CANCEL_PURCHASE_ORDER',
                    payload: {
                        purchaseOrderId: id,
                        orderNumber: po.orderNumber,
                        previousStatus: po.status,
                        newStatus: 'CANCELLED',
                        reason: reasonText || null
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return await tx.purchaseOrder.findUnique({
                where: { id },
                include: {
                    vendor: true,
                    items: {
                        include: {
                            product: {
                                select: { id: true, name: true, code: true, category: true, unit: true, status: true }
                            }
                        }
                    }
                }
            });
        });
    }

    async getGoodsReceipts(scope: any, filters: any = {}) {
        const db = (this as any).db || prisma;
        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
        const skip = (page - 1) * limit;

        const whereClause: any = {
            tenantId: scope.tenantId,
            isDeleted: false
        };

        if (scope.unitId) {
            whereClause.unitId = scope.unitId;
        }

        if (filters.purchaseOrderId) {
            whereClause.purchaseOrderId = String(filters.purchaseOrderId).trim();
        }

        if (filters.vendorId) {
            whereClause.vendorId = String(filters.vendorId).trim();
        }

        if (filters.startDate || filters.endDate) {
            whereClause.receivedDate = {};
            if (filters.startDate) {
                whereClause.receivedDate.gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                whereClause.receivedDate.lte = new Date(filters.endDate);
            }
        }

        if (filters.idempotencyKey) {
            whereClause.idempotencyKey = String(filters.idempotencyKey).trim();
        }

        if (filters.search) {
            const query = String(filters.search).trim();
            whereClause.OR = [
                { grnNumber: { contains: query, mode: 'insensitive' } },
                { deliveryChallanNo: { contains: query, mode: 'insensitive' } },
                { supplierInvoiceNo: { contains: query, mode: 'insensitive' } },
                { idempotencyKey: { contains: query, mode: 'insensitive' } },
                { notes: { contains: query, mode: 'insensitive' } },
                { vendor: { name: { contains: query, mode: 'insensitive' } } },
                { purchaseOrder: { orderNumber: { contains: query, mode: 'insensitive' } } }
            ];
        }

        const [total, goodsReceipts] = await Promise.all([
            (db as any).goodsReceiptNote.count({ where: whereClause }),
            (db as any).goodsReceiptNote.findMany({
                where: whereClause,
                select: {
                    ...GOODS_RECEIPT_NOTE_BASE_SELECT,
                    vendor: {
                        select: { id: true, name: true, code: true, category: true, contact: true }
                    },
                    purchaseOrder: {
                        select: { id: true, orderNumber: true, status: true, orderDate: true }
                    },
                    items: {
                        where: { isDeleted: false },
                        select: {
                            ...GOODS_RECEIPT_ITEM_BASE_SELECT,
                            product: {
                                select: PRODUCT_BASE_SELECT
                            },
                            batch: {
                                select: PRODUCT_BATCH_BASE_SELECT
                            }
                        }
                    }
                },
                orderBy: { receivedDate: 'desc' },
                skip,
                take: limit
            })
        ]);

        const grnWithSummary = (goodsReceipts || []).map((grn: any) => {
            const items = grn.items || [];
            const totalReceived = items.reduce((s: number, i: any) => s + (Number(i.receivedQuantity) || 0), 0);
            const totalRejected = items.reduce((s: number, i: any) => s + (Number(i.rejectedQuantity) || 0), 0);
            const totalAccepted = totalReceived - totalRejected;
            return {
                ...grn,
                itemCount: items.length,
                totalReceivedQuantity: totalReceived,
                totalAcceptedQuantity: totalAccepted,
                totalRejectedQuantity: totalRejected
            };
        });

        let finalGrn = grnWithSummary;
        let finalTotal = total;
        if (filters.domain && filters.domain !== 'all') {
            const normDomain = normalizeInventoryScope(filters.domain);
            finalGrn = grnWithSummary.filter((grn: any) =>
                (grn.items || []).some((it: any) => isCategoryInScope(it.product?.category, normDomain))
            );
            finalTotal = finalGrn.length;
        }

        return {
            goodsReceipts: finalGrn,
            total: finalTotal,
            page,
            limit,
            totalPages: Math.ceil(finalTotal / limit) || 1
        };
    }

    async getGoodsReceiptById(id: string, scope: any) {
        const db = (this as any).db || prisma;
        const grn = await (db as any).goodsReceiptNote.findFirst({
            where: {
                id,
                tenantId: scope.tenantId,
                isDeleted: false
            },
            select: {
                ...GOODS_RECEIPT_NOTE_BASE_SELECT,
                vendor: true,
                purchaseOrder: {
                    select: {
                        ...PURCHASE_ORDER_BASE_SELECT,
                        items: {
                            where: { isDeleted: false },
                            select: {
                                ...PURCHASE_ORDER_ITEM_BASE_SELECT,
                                product: {
                                    select: PRODUCT_BASE_SELECT
                                }
                            }
                        }
                    }
                },
                items: {
                    where: { isDeleted: false },
                    select: {
                        ...GOODS_RECEIPT_ITEM_BASE_SELECT,
                        product: {
                            select: PRODUCT_BASE_SELECT
                        },
                        purchaseOrderItem: {
                            select: PURCHASE_ORDER_ITEM_BASE_SELECT
                        },
                        batch: {
                            select: PRODUCT_BATCH_BASE_SELECT
                        }
                    }
                }
            }
        });

        if (!grn) {
            throw new Error(`Goods receipt note '${id}' not found or not accessible`);
        }

        if (scope.unitId && grn.unitId !== scope.unitId) {
            throw new Error(`Access denied: Goods receipt note belongs to another unit`);
        }

        const items = grn.items || [];
        const totalReceived = items.reduce((s: number, i: any) => s + (Number(i.receivedQuantity) || 0), 0);
        const totalRejected = items.reduce((s: number, i: any) => s + (Number(i.rejectedQuantity) || 0), 0);
        const totalAccepted = totalReceived - totalRejected;

        return {
            ...grn,
            itemCount: items.length,
            totalReceivedQuantity: totalReceived,
            totalAcceptedQuantity: totalAccepted,
            totalRejectedQuantity: totalRejected
        };
    }

    async createGoodsReceipt(purchaseOrderId: string, validated: any, scope: any, user: any, domain?: string) {
        const db = (this as any).db || prisma;
        if (!scope.tenantId) {
            throw new Error("Tenant ID is required for goods receipt creation");
        }
        if (!scope.unitId) {
            throw new Error("Unit ID is required for goods receipt creation");
        }

        const cleanPoId = String(purchaseOrderId || '').trim();
        if (!cleanPoId) {
            throw new Error("Purchase order ID is required");
        }

        const idempotencyKey = validated.idempotencyKey ? String(validated.idempotencyKey).trim() : null;

        return await db.$transaction(async (tx: any) => {
            // 1. Idempotency replay check
            if (idempotencyKey) {
                const existingGrn = await tx.goodsReceiptNote.findFirst({
                    where: {
                        tenantId: scope.tenantId,
                        OR: [
                            { idempotencyKey },
                            { notes: { contains: `[IDEMPOTENCY_KEY:${idempotencyKey}]` } }
                        ],
                        isDeleted: false
                    },
                    include: {
                        vendor: true,
                        purchaseOrder: true,
                        items: {
                            where: { isDeleted: false },
                            include: {
                                product: { select: { id: true, name: true, code: true, category: true, unit: true, isBatchTracked: true } },
                                batch: true
                            }
                        }
                    }
                });
                if (existingGrn) {
                    return existingGrn;
                }
            }

            // 2. Validate items array
            if (!Array.isArray(validated.items) || validated.items.length === 0) {
                throw new Error("Goods receipt must contain at least one receipt line item");
            }

            // 3. Reject duplicate PO-item lines
            const poItemIds = validated.items.map((it: any) => String(it.purchaseOrderItemId).trim());
            const uniquePoItemIds = new Set(poItemIds);
            if (uniquePoItemIds.size !== poItemIds.length) {
                throw new Error("Duplicate purchase order item lines in goods receipt are not allowed");
            }

            // 4. Lock PO row with SELECT ... FOR UPDATE
            let poRows: any[];
            try {
                poRows = await tx.$queryRaw`
                    SELECT *
                    FROM "PurchaseOrder"
                    WHERE id = ${cleanPoId}
                      AND "tenantId" = ${scope.tenantId}
                    LIMIT 1
                    FOR UPDATE
                `;
            } catch (err: any) {
                poRows = [await tx.purchaseOrder.findFirst({
                    where: { id: cleanPoId, tenantId: scope.tenantId, isDeleted: false }
                })].filter(Boolean);
            }

            const po = poRows?.[0];
            if (!po || po.isDeleted) {
                throw new Error(`Purchase order '${cleanPoId}' not found or not accessible`);
            }

            if (scope.unitId && po.unitId !== scope.unitId) {
                throw new Error(`Access denied: Purchase order belongs to another unit`);
            }

            // 5. Verify PO status eligibility
            if (po.status === 'CANCELLED') {
                throw new Error(`Cannot receive goods against CANCELLED purchase order '${po.orderNumber}'`);
            }
            if (po.status === 'COMPLETED') {
                throw new Error(`Cannot receive goods against COMPLETED purchase order '${po.orderNumber}'`);
            }
            if (po.status !== 'ORDERED' && po.status !== 'PARTIALLY_RECEIVED') {
                throw new Error(`Cannot receive goods against purchase order with status '${po.status}'. Receipt requires ORDERED or PARTIALLY_RECEIVED status.`);
            }

            // 6. Vendor validation
            const vendor = await tx.vendor.findFirst({
                where: {
                    id: po.vendorId,
                    tenantId: scope.tenantId,
                    isDeleted: false
                }
            });
            if (!vendor) {
                throw new Error(`Vendor '${po.vendorId}' not found or inactive for this tenant`);
            }

            // If caller supplied vendorId, ensure it matches PO vendor
            if (validated.vendorId && validated.vendorId !== po.vendorId) {
                throw new Error(`Vendor '${validated.vendorId}' does not match purchase order vendor '${po.vendorId}'`);
            }

            // 7. Fetch all PO items belonging to this PO
            const existingPoItems = await tx.purchaseOrderItem.findMany({
                where: {
                    purchaseOrderId: po.id,
                    tenantId: scope.tenantId,
                    isDeleted: false
                }
            });
            const poItemMap = new Map<string, any>(existingPoItems.map((item: any) => [item.id, item]));

            // Sort receipt lines by purchaseOrderItemId to ensure deterministic processing
            const sortedItems = [...validated.items].sort((a: any, b: any) => 
                String(a.purchaseOrderItemId).localeCompare(String(b.purchaseOrderItemId))
            );

            // Pre-validate quantities, physical invariant, and over-receipt
            for (const item of sortedItems) {
                const poItemId = String(item.purchaseOrderItemId).trim();
                const poItem = poItemMap.get(poItemId);
                if (!poItem) {
                    throw new Error(`Purchase order item '${poItemId}' does not belong to purchase order '${po.orderNumber}'`);
                }

                const receivedQty = Number(item.receivedQuantity);
                const acceptedQty = Number(item.acceptedQuantity ?? receivedQty);
                const rejectedQty = Number(item.rejectedQuantity ?? 0);

                if (!Number.isInteger(receivedQty) || receivedQty <= 0) {
                    throw new Error(`Physical received quantity must be a positive integer greater than zero. Received: ${item.receivedQuantity}`);
                }
                if (!Number.isInteger(acceptedQty) || acceptedQty < 0) {
                    throw new Error(`Accepted quantity must be a non-negative integer. Received: ${item.acceptedQuantity}`);
                }
                if (!Number.isInteger(rejectedQty) || rejectedQty < 0) {
                    throw new Error(`Rejected quantity must be a non-negative integer. Received: ${item.rejectedQuantity}`);
                }
                if (acceptedQty + rejectedQty !== receivedQty) {
                    throw new Error(`Physical quantity mismatch: accepted (${acceptedQty}) + rejected (${rejectedQty}) must equal received quantity (${receivedQty})`);
                }

                const remainingQty = poItem.orderedQuantity - poItem.receivedQuantity;
                if (acceptedQty > remainingQty) {
                    throw new Error(`Accepted quantity (${acceptedQty}) exceeds remaining ordered quantity (${remainingQty}) for PO item '${poItemId}'`);
                }
            }

            // 8. Generate GRN reference number
            const grnNumber = await generateRefNumber('GRN', scope.tenantId, scope.unitId, tx);
            const grnId = randomUUID();

            let finalNotes = validated.notes ? String(validated.notes).trim() : '';
            if (idempotencyKey) {
                finalNotes = finalNotes ? `${finalNotes} [IDEMPOTENCY_KEY:${idempotencyKey}]` : `[IDEMPOTENCY_KEY:${idempotencyKey}]`;
            }

            // 9. Process each receipt line: Product lock, batch tracking, stock increment, stock movement
            const createdItemsData: any[] = [];
            let totalAcceptedAll = 0;
            let totalRejectedAll = 0;

            for (const item of sortedItems) {
                const poItemId = String(item.purchaseOrderItemId).trim();
                const poItem = poItemMap.get(poItemId)!;
                const acceptedQty = Math.trunc(Number(item.acceptedQuantity ?? item.receivedQuantity));
                const rejectedQty = Math.trunc(Number(item.rejectedQuantity ?? 0));
                const receivedQty = Math.trunc(Number(item.receivedQuantity));

                totalAcceptedAll += acceptedQty;
                totalRejectedAll += rejectedQty;

                // Lock product row
                const product = await this.lockProductRow(tx, poItem.productId, { tenantId: scope.tenantId });
                if (!product || product.isDeleted) {
                    throw new Error(`Product '${poItem.productId}' not found or inactive`);
                }
                if (domain && domain !== 'all' && !isCategoryInScope(product.category, domain)) {
                    throw new Error(`Product '${product.name}' (category: '${product.category}') does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
                }

                let batchId: string | null = null;
                let stockMovementId: string | null = null;

                if (acceptedQty > 0) {
                    // Batch tracking check
                    if (product.isBatchTracked) {
                        const batchNum = item.batchNumber ? String(item.batchNumber).trim() : '';
                        if (!batchNum) {
                            throw new Error(`Batch number is required for batch-tracked product '${product.name}'`);
                        }
                        if (!item.expiryDate) {
                            throw new Error(`Expiry date is required for batch-tracked product '${product.name}'`);
                        }
                        const expiry = new Date(item.expiryDate);
                        if (isNaN(expiry.getTime())) {
                            throw new Error(`Invalid expiry date '${item.expiryDate}' for batch-tracked product '${product.name}'`);
                        }

                        const batch = await tx.productBatch.upsert({
                            where: {
                                productId_batchNumber_tenantId_unitId: {
                                    productId: product.id,
                                    batchNumber: batchNum,
                                    tenantId: scope.tenantId,
                                    unitId: scope.unitId
                                }
                            },
                            update: {
                                quantity: { increment: acceptedQty }
                            },
                            create: {
                                productId: product.id,
                                batchNumber: batchNum,
                                expiryDate: expiry,
                                quantity: acceptedQty,
                                tenantId: scope.tenantId,
                                unitId: scope.unitId
                            }
                        });
                        batchId = batch.id;
                    } else if (item.batchNumber) {
                        const batchNum = String(item.batchNumber).trim();
                        const expiry = item.expiryDate ? new Date(item.expiryDate) : null;
                        const batch = await tx.productBatch.upsert({
                            where: {
                                productId_batchNumber_tenantId_unitId: {
                                    productId: product.id,
                                    batchNumber: batchNum,
                                    tenantId: scope.tenantId,
                                    unitId: scope.unitId
                                }
                            },
                            update: {
                                quantity: { increment: acceptedQty }
                            },
                            create: {
                                productId: product.id,
                                batchNumber: batchNum,
                                expiryDate: expiry || new Date(Date.now() + 365 * 24 * 3600 * 1000),
                                quantity: acceptedQty,
                                tenantId: scope.tenantId,
                                unitId: scope.unitId
                            }
                        });
                        batchId = batch.id;
                    }

                    // Stock upsert (increment accepted quantity ONLY)
                    const stock = await tx.stock.upsert({
                        where: {
                            productId_tenantId_unitId: {
                                productId: product.id,
                                tenantId: scope.tenantId,
                                unitId: scope.unitId
                            }
                        },
                        update: {
                            quantity: { increment: acceptedQty }
                        },
                        create: {
                            productId: product.id,
                            quantity: acceptedQty,
                            tenantId: scope.tenantId,
                            unitId: scope.unitId
                        }
                    });

                    // StockMovement creation (movementType 'GRN')
                    const stockMovement = await tx.stockMovement.create({
                        data: {
                            productId: product.id,
                            movementType: 'GRN',
                            quantity: acceptedQty,
                            balanceAfter: stock.quantity,
                            batchId: batchId || null,
                            referenceType: 'GoodsReceiptNote',
                            referenceId: grnId,
                            notes: `GRN ${grnNumber} for PO ${po.orderNumber} (Vendor: ${vendor.name})`,
                            performedBy: user?.name || user?.email || 'Authorized Receiver',
                            tenantId: scope.tenantId,
                            unitId: scope.unitId
                        }
                    });
                    stockMovementId = stockMovement.id;

                    // Update PO line item cumulative receivedQuantity and line status
                    const newReceivedQty = poItem.receivedQuantity + acceptedQty;
                    const lineStatus = newReceivedQty >= poItem.orderedQuantity ? 'COMPLETED' : 'PARTIALLY_RECEIVED';
                    await tx.purchaseOrderItem.update({
                        where: { id: poItem.id },
                        data: {
                            receivedQuantity: newReceivedQty,
                            status: lineStatus
                        }
                    });
                    poItem.receivedQuantity = newReceivedQty;
                    poItem.status = lineStatus;
                }

                createdItemsData.push({
                    purchaseOrderItemId: poItem.id,
                    productId: product.id,
                    receivedQuantity: receivedQty,
                    rejectedQuantity: rejectedQty,
                    batchNumber: item.batchNumber ? String(item.batchNumber).trim() : null,
                    expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
                    batchId: batchId || null,
                    stockMovementId: stockMovementId || null,
                    notes: item.notes ? String(item.notes).trim() : null,
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                });
            }

            // 10. Update PO status
            const allPoItems = await tx.purchaseOrderItem.findMany({
                where: {
                    purchaseOrderId: po.id,
                    tenantId: scope.tenantId,
                    isDeleted: false
                }
            });
            const allLinesCompleted = allPoItems.length > 0 && allPoItems.every((it: any) => it.status === 'COMPLETED');
            const anyLineAccepted = allPoItems.some((it: any) => it.receivedQuantity > 0);

            let newPoStatus = po.status;
            if (allLinesCompleted) {
                newPoStatus = 'COMPLETED';
            } else if (anyLineAccepted) {
                newPoStatus = 'PARTIALLY_RECEIVED';
            }

            if (newPoStatus !== po.status) {
                await tx.purchaseOrder.update({
                    where: { id: po.id },
                    data: { status: newPoStatus }
                });
            }

            // 11. Create GoodsReceiptNote
            let grn;
            try {
                grn = await tx.goodsReceiptNote.create({
                    data: {
                        id: grnId,
                        grnNumber,
                        purchaseOrderId: po.id,
                        vendorId: po.vendorId,
                        idempotencyKey: idempotencyKey || null,
                        receivedDate: validated.receivedDate ? new Date(validated.receivedDate) : new Date(),
                        deliveryChallanNo: validated.deliveryChallanNo ? String(validated.deliveryChallanNo).trim() : null,
                        supplierInvoiceNo: validated.supplierInvoiceNo ? String(validated.supplierInvoiceNo).trim() : null,
                        notes: finalNotes || null,
                        receivedById: user?.id || null,
                        receivedByName: user?.name || user?.email || 'Authorized Receiver',
                        tenantId: scope.tenantId,
                        unitId: scope.unitId,
                        items: {
                            create: createdItemsData
                        }
                    },
                    include: {
                        vendor: true,
                        purchaseOrder: true,
                        items: {
                            include: {
                                product: {
                                    select: { id: true, name: true, code: true, category: true, unit: true, isBatchTracked: true }
                                },
                                batch: true
                            }
                        }
                    }
                });
            } catch (createErr: any) {
                // If concurrent attempt raced and hit the unique constraint on (idempotencyKey, tenantId)
                if (idempotencyKey && (createErr.code === 'P2002' || createErr.message?.includes('Unique constraint') || createErr.message?.includes('idempotencyKey'))) {
                    const raceWinnerGrn = await tx.goodsReceiptNote.findFirst({
                        where: {
                            tenantId: scope.tenantId,
                            OR: [
                                { idempotencyKey },
                                { notes: { contains: `[IDEMPOTENCY_KEY:${idempotencyKey}]` } }
                            ],
                            isDeleted: false
                        },
                        include: {
                            vendor: true,
                            purchaseOrder: true,
                            items: {
                                where: { isDeleted: false },
                                include: {
                                    product: { select: { id: true, name: true, code: true, category: true, unit: true, isBatchTracked: true } },
                                    batch: true
                                }
                            }
                        }
                    });
                    if (raceWinnerGrn) {
                        return raceWinnerGrn;
                    }
                }
                throw createErr;
            }

            // 12. Create AuditLog
            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'CREATE_GOODS_RECEIPT',
                    payload: {
                        goodsReceiptNoteId: grn.id,
                        grnNumber,
                        purchaseOrderId: po.id,
                        orderNumber: po.orderNumber,
                        vendorId: po.vendorId,
                        vendorName: vendor.name,
                        totalItems: createdItemsData.length,
                        totalAcceptedQuantity: totalAcceptedAll,
                        totalRejectedQuantity: totalRejectedAll,
                        poStatusBefore: po.status,
                        poStatusAfter: newPoStatus,
                        idempotencyKey: idempotencyKey || null
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return grn;
        }, { maxWait: 15000, timeout: 30000 });
    }

    // ==========================================
    // 3.2. SUPPLIER RETURNS (D9.1)
    // ==========================================

    async getSupplierReturns(scope: any, filters: any = {}) {
        const db = (this as any).db || prisma;
        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
        const skip = (page - 1) * limit;

        const whereClause: any = {
            tenantId: scope.tenantId,
            isDeleted: false
        };

        if (scope.unitId) {
            whereClause.unitId = scope.unitId;
        }

        if (filters.vendorId && String(filters.vendorId).trim()) {
            whereClause.vendorId = String(filters.vendorId).trim();
        }

        if (filters.query && String(filters.query).trim()) {
            const q = String(filters.query).trim();
            whereClause.OR = [
                { returnNumber: { contains: q, mode: 'insensitive' } },
                { reason: { contains: q, mode: 'insensitive' } },
                { sourceReference: { contains: q, mode: 'insensitive' } },
                { notes: { contains: q, mode: 'insensitive' } }
            ];
        }

        try {
            const [returns, total] = await Promise.all([
                (db as any).supplierReturn.findMany({
                    where: whereClause,
                    select: {
                        ...SUPPLIER_RETURN_BASE_SELECT,
                        vendor: true,
                        items: {
                            where: { isDeleted: false },
                            select: {
                                ...SUPPLIER_RETURN_ITEM_BASE_SELECT,
                                product: {
                                    select: PRODUCT_BASE_SELECT
                                },
                                batch: {
                                    select: PRODUCT_BATCH_BASE_SELECT
                                }
                            }
                        }
                    },
                    orderBy: { returnDate: 'desc' },
                    skip,
                    take: limit
                }),
                (db as any).supplierReturn.count({ where: whereClause })
            ]);

            let finalReturns = returns;
            let finalTotal = total;
            if (filters.domain && filters.domain !== 'all') {
                const normDomain = normalizeInventoryScope(filters.domain);
                finalReturns = returns.filter((ret: any) =>
                    (ret.items || []).some((it: any) => isCategoryInScope(it.product?.category, normDomain))
                );
                finalTotal = finalReturns.length;
            }

            return {
                data: finalReturns,
                pagination: {
                    total: finalTotal,
                    page,
                    limit,
                    totalPages: Math.ceil(finalTotal / limit) || 1
                }
            };
        } catch (tableErr: any) {
            // Fallback for unmigrated environments: query StockMovement with movementType = 'SUPPLIER_RETURN'
            const movementWhere: any = {
                tenantId: scope.tenantId,
                movementType: 'SUPPLIER_RETURN',
                isDeleted: false
            };
            if (scope.unitId) movementWhere.unitId = scope.unitId;

            const movements = await (db as any).stockMovement.findMany({
                where: movementWhere,
                include: {
                    product: true,
                    batch: true
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            });
            const total = await (db as any).stockMovement.count({ where: movementWhere });

            const formattedReturns = movements.map((m: any) => ({
                id: m.id,
                returnNumber: m.notes?.match(/Return (RET-\d+)/)?.[1] || `RET-${m.id.slice(0, 6)}`,
                vendorId: null,
                vendor: { name: m.notes?.match(/Vendor: ([^|]+)/)?.[1]?.trim() || 'Supplier' },
                sourceType: m.referenceType === 'GoodsReceiptNote' ? 'GRN' : 'PURCHASE',
                sourceReference: m.referenceId,
                returnDate: m.createdAt,
                reason: m.notes?.match(/Reason: ([^|]+)/)?.[1]?.trim() || m.notes || 'Supplier Return',
                status: 'COMPLETED',
                totalQuantity: Math.abs(m.quantity),
                returnedByName: m.performedBy || 'Staff',
                items: [
                    {
                        id: m.id,
                        productId: m.productId,
                        product: m.product,
                        batchId: m.batchId,
                        batch: m.batch,
                        batchNumber: m.batch?.batchNumber || null,
                        expiryDate: m.batch?.expiryDate || null,
                        returnQuantity: Math.abs(m.quantity),
                        reason: null
                    }
                ]
            }));

            return {
                data: formattedReturns,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            };
        }
    }

    async getSupplierReturnById(id: string, scope: any) {
        const db = (this as any).db || prisma;
        const cleanId = String(id || '').trim();

        try {
            const ret = await (db as any).supplierReturn.findFirst({
                where: {
                    id: cleanId,
                    tenantId: scope.tenantId,
                    isDeleted: false
                },
                select: {
                    ...SUPPLIER_RETURN_BASE_SELECT,
                    vendor: true,
                    items: {
                        where: { isDeleted: false },
                        select: {
                            ...SUPPLIER_RETURN_ITEM_BASE_SELECT,
                            product: {
                                select: PRODUCT_BASE_SELECT
                            },
                            batch: {
                                select: PRODUCT_BATCH_BASE_SELECT
                            }
                        }
                    }
                }
            });

            if (!ret) {
                throw new Error(`Supplier return '${cleanId}' not found or not accessible`);
            }

            if (scope.unitId && ret.unitId !== scope.unitId) {
                throw new Error('Access denied: Supplier return belongs to another unit');
            }

            return ret;
        } catch (tableErr: any) {
            if (tableErr.message?.includes('not found') || tableErr.message?.includes('Access denied')) {
                throw tableErr;
            }

            // Fallback: check StockMovement
            const m = await (db as any).stockMovement.findFirst({
                where: {
                    id: cleanId,
                    tenantId: scope.tenantId,
                    movementType: 'SUPPLIER_RETURN',
                    isDeleted: false
                },
                include: {
                    product: true,
                    batch: true
                }
            });

            if (!m) {
                throw new Error(`Supplier return '${cleanId}' not found or not accessible`);
            }

            return {
                id: m.id,
                returnNumber: m.notes?.match(/Return (RET-\d+)/)?.[1] || `RET-${m.id.slice(0, 6)}`,
                vendorId: null,
                vendor: { name: m.notes?.match(/Vendor: ([^|]+)/)?.[1]?.trim() || 'Supplier' },
                sourceType: m.referenceType === 'GoodsReceiptNote' ? 'GRN' : 'PURCHASE',
                sourceReference: m.referenceId,
                returnDate: m.createdAt,
                reason: m.notes?.match(/Reason: ([^|]+)/)?.[1]?.trim() || m.notes || 'Supplier Return',
                status: 'COMPLETED',
                totalQuantity: Math.abs(m.quantity),
                returnedByName: m.performedBy || 'Staff',
                items: [
                    {
                        id: m.id,
                        productId: m.productId,
                        product: m.product,
                        batchId: m.batchId,
                        batch: m.batch,
                        batchNumber: m.batch?.batchNumber || null,
                        expiryDate: m.batch?.expiryDate || null,
                        returnQuantity: Math.abs(m.quantity),
                        reason: null
                    }
                ]
            };
        }
    }

    async createSupplierReturn(validated: any, scope: any, user?: any, domain?: string) {
        const db = (this as any).db || prisma;

        // Reason validation
        if (!isMeaningfulReason(validated.reason)) {
            throw new Error('A meaningful return reason of at least 5 characters is required');
        }

        // Validate items presence
        if (!Array.isArray(validated.items) || validated.items.length === 0) {
            throw new Error('Supplier return must contain at least one line item');
        }

        const idempotencyKey = validated.idempotencyKey ? String(validated.idempotencyKey).trim() : null;

        // Pre-transaction Idempotency Check
        if (idempotencyKey) {
            try {
                const existing = await (db as any).supplierReturn.findFirst({
                    where: {
                        idempotencyKey,
                        tenantId: scope.tenantId,
                        isDeleted: false
                    },
                    include: {
                        vendor: true,
                        items: {
                            where: { isDeleted: false },
                            include: {
                                product: { select: { id: true, name: true, code: true, category: true, unit: true, isBatchTracked: true } },
                                batch: true
                            }
                        }
                    }
                });
                if (existing) {
                    return existing;
                }
            } catch (ignore: any) {
                // Table might not exist yet; check audit log / stock movement
                const existingLog = await (db as any).auditLog?.findFirst?.({
                    where: {
                        tenantId: scope.tenantId,
                        action: 'CREATE_SUPPLIER_RETURN',
                        payload: { path: ['idempotencyKey'], equals: idempotencyKey }
                    }
                });
                if (existingLog) {
                    const retId = existingLog.payload?.supplierReturnId;
                    if (retId) {
                        return await this.getSupplierReturnById(retId, scope);
                    }
                }
            }
        }

        return await db.$transaction(async (tx: any) => {
            // 1. Verify Vendor
            const vendor = await tx.vendor.findFirst({
                where: {
                    id: validated.vendorId,
                    tenantId: scope.tenantId,
                    isDeleted: false
                }
            });
            if (!vendor) {
                throw new Error(`Vendor '${validated.vendorId}' not found or not accessible`);
            }
            if (vendor.status === false) {
                throw new Error(`Vendor '${vendor.name}' is inactive and cannot accept returns`);
            }

            // 2. If source is GRN, verify GRN and returnable eligibility
            let grn: any = null;
            if (validated.sourceType === 'GRN' && validated.sourceReferenceId) {
                grn = await tx.goodsReceiptNote.findFirst({
                    where: {
                        id: validated.sourceReferenceId,
                        tenantId: scope.tenantId,
                        isDeleted: false
                    },
                    include: {
                        items: {
                            where: { isDeleted: false }
                        }
                    }
                });
                if (!grn) {
                    throw new Error(`Goods Receipt Note '${validated.sourceReferenceId}' not found`);
                }
                if (grn.vendorId !== vendor.id) {
                    throw new Error(`GRN vendor mismatch: GRN belongs to another vendor`);
                }
            }

            // 3. If source is PURCHASE, verify Purchase
            let purchase: any = null;
            if (validated.sourceType === 'PURCHASE' && validated.sourceReferenceId) {
                purchase = await tx.purchase.findFirst({
                    where: {
                        id: validated.sourceReferenceId,
                        tenantId: scope.tenantId
                    }
                });
                if (!purchase) {
                    throw new Error(`Purchase record '${validated.sourceReferenceId}' not found`);
                }
                if (purchase.vendorId && purchase.vendorId !== vendor.id) {
                    throw new Error(`Purchase vendor mismatch: Purchase belongs to another vendor`);
                }
            }

            // Generate sequence number
            const returnNumber = await generateRefNumber('RET', scope.tenantId, scope.unitId, tx);
            const returnId = randomUUID();
            let totalReturnQuantity = 0;
            const returnItemsData: any[] = [];

            // 4. Validate each line item & calculate cumulative returns
            for (const item of validated.items) {
                const returnQty = Number(item.returnQuantity);
                if (!Number.isInteger(returnQty) || returnQty <= 0) {
                    throw new Error('Return quantity must be a positive integer');
                }

                // Concurrency-safe lock on Product
                const product = await this.lockProductRow(tx, item.productId, scope);
                if (domain && domain !== 'all' && !isCategoryInScope(product.category, domain)) {
                    throw new Error(`Product '${product.name}' (category: '${product.category}') does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
                }

                // Eligibility check against GRN source
                if (grn) {
                    const grnItem = grn.items.find((gi: any) =>
                        gi.id === item.goodsReceiptItemId ||
                        (gi.productId === item.productId && (!item.batchId || gi.batchId === item.batchId))
                    );
                    if (!grnItem) {
                        throw new Error(`Product '${product.name}' was not part of GRN '${grn.grnNumber}'`);
                    }

                    const originalAccepted = grnItem.receivedQuantity - (grnItem.rejectedQuantity || 0);

                    // Find previous returns against this GRN and product
                    const pastReturnMovements = await tx.stockMovement.findMany({
                        where: {
                            tenantId: scope.tenantId,
                            movementType: 'SUPPLIER_RETURN',
                            referenceType: 'GoodsReceiptNote',
                            referenceId: grn.id,
                            productId: product.id,
                            isDeleted: false
                        }
                    });
                    const pastReturnedQty = pastReturnMovements.reduce(
                        (sum: number, m: any) => sum + Math.abs(Number(m.quantity || 0)),
                        0
                    );

                    const remainingReturnable = originalAccepted - pastReturnedQty;
                    if (returnQty > remainingReturnable) {
                        throw new Error(
                            `Return quantity (${returnQty}) exceeds remaining eligible returnable balance (${remainingReturnable}) for product '${product.name}'`
                        );
                    }
                }

                // Eligibility check against Direct Purchase source
                if (purchase && purchase.productId === product.id) {
                    const pastReturnMovements = await tx.stockMovement.findMany({
                        where: {
                            tenantId: scope.tenantId,
                            movementType: 'SUPPLIER_RETURN',
                            referenceType: 'Purchase',
                            referenceId: purchase.id,
                            productId: product.id,
                            isDeleted: false
                        }
                    });
                    const pastReturnedQty = pastReturnMovements.reduce(
                        (sum: number, m: any) => sum + Math.abs(Number(m.quantity || 0)),
                        0
                    );
                    const remainingReturnable = purchase.quantity - pastReturnedQty;
                    if (returnQty > remainingReturnable) {
                        throw new Error(
                            `Return quantity (${returnQty}) exceeds remaining eligible returnable balance (${remainingReturnable}) for purchase`
                        );
                    }
                }

                // Check live stock balance
                const liveStock = await tx.stock.findUnique({
                    where: {
                        productId_tenantId_unitId: {
                            productId: product.id,
                            tenantId: scope.tenantId,
                            unitId: scope.unitId
                        }
                    }
                });
                const availableStock = Number(liveStock?.quantity || 0);
                if (availableStock < returnQty) {
                    throw new Error(
                        `Insufficient available stock for '${product.name}'. Available: ${availableStock}, requested return: ${returnQty}`
                    );
                }

                // Batch verification & deduction
                let resolvedBatchId: string | null = null;
                let resolvedBatchNumber: string | null = null;
                let resolvedExpiryDate: Date | null = null;

                if (product.isBatchTracked) {
                    if (!item.batchId && !item.batchNumber) {
                        throw new Error(`Batch details are required for batch-tracked product '${product.name}'`);
                    }

                    const batchWhere: any = {
                        productId: product.id,
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    };
                    if (item.batchId) batchWhere.id = item.batchId;
                    if (item.batchNumber) batchWhere.batchNumber = item.batchNumber;

                    const batch = await tx.productBatch.findFirst({ where: batchWhere, select: PRODUCT_BATCH_BASE_SELECT });
                    if (!batch) {
                        throw new Error(`Batch not found for product '${product.name}' in this unit`);
                    }
                    if (batch.quantity < returnQty) {
                        throw new Error(
                            `Insufficient batch stock for '${product.name}' (Batch ${batch.batchNumber}). Available: ${batch.quantity}, requested return: ${returnQty}`
                        );
                    }

                    // Atomic batch deduction
                    const batchUpdate = await tx.productBatch.updateMany({
                        where: {
                            id: batch.id,
                            quantity: { gte: returnQty }
                        },
                        data: {
                            quantity: { decrement: returnQty }
                        }
                    });
                    if (batchUpdate.count === 0) {
                        throw new Error('Concurrent batch modification detected: balance would become negative');
                    }

                    resolvedBatchId = batch.id;
                    resolvedBatchNumber = batch.batchNumber;
                    resolvedExpiryDate = batch.expiryDate;
                }

                // Atomic stock deduction
                const stockUpdate = await tx.stock.updateMany({
                    where: {
                        id: liveStock.id,
                        quantity: { gte: returnQty }
                    },
                    data: {
                        quantity: { decrement: returnQty }
                    }
                });
                if (stockUpdate.count === 0) {
                    throw new Error('Concurrent stock modification detected: balance would become negative');
                }

                const newBalance = availableStock - returnQty;

                // Record StockMovement (movementType: 'SUPPLIER_RETURN', negative quantity)
                const movement = await tx.stockMovement.create({
                    data: {
                        productId: product.id,
                        movementType: 'SUPPLIER_RETURN',
                        quantity: 0 - returnQty,
                        balanceAfter: newBalance,
                        batchId: resolvedBatchId,
                        referenceType: grn ? 'GoodsReceiptNote' : (purchase ? 'Purchase' : 'SupplierReturn'),
                        referenceId: grn?.id || purchase?.id || returnId,
                        notes: `Return ${returnNumber} to ${vendor.name} | Reason: ${validated.reason}${item.reason ? ' (' + item.reason + ')' : ''}`,
                        performedBy: user?.name || user?.email || 'Authorized Staff',
                        tenantId: scope.tenantId,
                        unitId: scope.unitId
                    }
                });

                totalReturnQuantity += returnQty;

                returnItemsData.push({
                    id: randomUUID(),
                    productId: product.id,
                    batchId: resolvedBatchId,
                    batchNumber: resolvedBatchNumber,
                    expiryDate: resolvedExpiryDate,
                    returnQuantity: returnQty,
                    reason: item.reason ? String(item.reason).trim() : null,
                    stockMovementId: movement.id,
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                });
            }

            // 5. Create SupplierReturn record (with fallback)
            let returnRecord: any;
            try {
                returnRecord = await tx.supplierReturn.create({
                    data: {
                        id: returnId,
                        returnNumber,
                        vendorId: vendor.id,
                        sourceType: validated.sourceType || 'GRN',
                        sourceReference: grn?.grnNumber || purchase?.id || null,
                        grnId: grn?.id || null,
                        purchaseId: purchase?.id || null,
                        idempotencyKey,
                        returnDate: validated.returnDate ? new Date(validated.returnDate) : new Date(),
                        reason: String(validated.reason).trim(),
                        status: 'COMPLETED',
                        totalQuantity: totalReturnQuantity,
                        notes: validated.notes ? String(validated.notes).trim() : null,
                        returnedById: user?.id || null,
                        returnedByName: user?.name || user?.email || 'Authorized Staff',
                        tenantId: scope.tenantId,
                        unitId: scope.unitId,
                        items: {
                            create: returnItemsData
                        }
                    },
                    include: {
                        vendor: true,
                        items: {
                            include: {
                                product: { select: { id: true, name: true, code: true, category: true, unit: true, isBatchTracked: true } },
                                batch: true
                            }
                        }
                    }
                });
            } catch (createErr: any) {
                // Return synthetic record if table does not exist
                returnRecord = {
                    id: returnId,
                    returnNumber,
                    vendorId: vendor.id,
                    vendor,
                    sourceType: validated.sourceType || 'GRN',
                    sourceReference: grn?.grnNumber || purchase?.id || null,
                    grnId: grn?.id || null,
                    purchaseId: purchase?.id || null,
                    idempotencyKey,
                    returnDate: validated.returnDate ? new Date(validated.returnDate) : new Date(),
                    reason: String(validated.reason).trim(),
                    status: 'COMPLETED',
                    totalQuantity: totalReturnQuantity,
                    notes: validated.notes ? String(validated.notes).trim() : null,
                    returnedById: user?.id || null,
                    returnedByName: user?.name || user?.email || 'Authorized Staff',
                    tenantId: scope.tenantId,
                    unitId: scope.unitId,
                    items: returnItemsData.map(ri => ({
                        ...ri,
                        product: { id: ri.productId, name: 'Product' }
                    }))
                };
            }

            // 6. Record AuditLog
            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'CREATE_SUPPLIER_RETURN',
                    payload: {
                        supplierReturnId: returnRecord.id,
                        returnNumber,
                        vendorId: vendor.id,
                        vendorName: vendor.name,
                        sourceType: validated.sourceType,
                        sourceReference: returnRecord.sourceReference,
                        totalQuantity: totalReturnQuantity,
                        itemCount: returnItemsData.length,
                        reason: validated.reason,
                        idempotencyKey
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return returnRecord;
        }, { maxWait: 15000, timeout: 30000 });
    }

    // =========================================================================
    // D10 — STOCK VALUATION, CONSUMPTION ANALYTICS & PHYSICAL STOCK AUDIT
    // =========================================================================

    async getStockValuation(query: any = {}, scope: any) {
        if (!scope?.tenantId) {
            throw new Error('Tenant context is required');
        }

        const client = (this as any).db || prisma;
        const targetUnitId = resolveInventoryReportUnitId(query.unitId, scope);
        const viewMode = String(query.view || 'aggregate').toLowerCase();
        const categoryFilter = query.category ? String(query.category).trim() : null;
        const search = query.search ? String(query.search).trim().toLowerCase() : null;

        // 1. Fetch active products within tenant
        const productWhere: any = {
            tenantId: scope.tenantId,
            status: true
        };
        if (targetUnitId) {
            productWhere.unitId = targetUnitId;
        }
        if (categoryFilter && categoryFilter !== 'ALL') {
            productWhere.category = categoryFilter;
        }

        const products = await client.product.findMany({
            where: productWhere,
            select: {
                id: true,
                code: true,
                name: true,
                category: true,
                unit: true,
                isBatchTracked: true,
                minStockLevel: true,
                defaultRevenuePrice: true
            }
        });

        const domain = query.domain || query.inventoryScope || scope.inventoryScope;
        const normDomain = domain ? normalizeInventoryScope(domain) : 'all';
        const activeProducts = normDomain !== 'all'
            ? products.filter((p: any) => isCategoryInScope(p.category, normDomain))
            : products;

        // 2. Fetch stock balances
        const stockWhere: any = {
            tenantId: scope.tenantId
        };
        if (targetUnitId) {
            stockWhere.unitId = targetUnitId;
        }
        const stocks = await client.stock.findMany({
            where: stockWhere
        });
        const stockMap = new Map<string, number>();
        stocks.forEach((s: any) => {
            const current = stockMap.get(s.productId) || 0;
            stockMap.set(s.productId, current + s.quantity);
        });

        // 3. Fetch batches if batch view requested
        let batches: any[] = [];
        if (viewMode === 'batch') {
            const batchWhere: any = {
                tenantId: scope.tenantId
            };
            if (targetUnitId) {
                batchWhere.unitId = targetUnitId;
            }
            batches = await client.productBatch.findMany({
                where: batchWhere,
                select: PRODUCT_BATCH_BASE_SELECT,
                orderBy: { expiryDate: 'asc' }
            });
        }

        // 4. Fetch verified unit costs (e.g. from SupplierReturnItem or recent verified sources)
        const verifiedCostMap = new Map<string, { unitCost: number; source: string }>();
        try {
            if (client.supplierReturnItem?.findMany) {
                const returnItemsWithCost = await client.supplierReturnItem.findMany({
                    where: {
                        tenantId: scope.tenantId,
                        ...(targetUnitId ? { unitId: targetUnitId } : {}),
                        unitCost: { gt: 0 }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 200
                });
                returnItemsWithCost.forEach((item: any) => {
                    if (!verifiedCostMap.has(item.productId) && item.unitCost) {
                        verifiedCostMap.set(item.productId, { unitCost: Number(item.unitCost), source: 'SUPPLIER_RETURN' });
                    }
                });
            }
        } catch {
            // SupplierReturnItem table may not exist yet or mock without it
        }

        // 5. Construct valuation items
        const valuationItems: any[] = [];
        let totalValuationAmount = 0;
        let totalUnitsInStock = 0;
        let totalItemsValued = 0;
        let totalItemsExcluded = 0;
        const excludedProducts: any[] = [];

        if (viewMode === 'batch') {
            const batchesByProduct = new Map<string, any[]>();
            batches.forEach((b: any) => {
                const list = batchesByProduct.get(b.productId) || [];
                list.push(b);
                batchesByProduct.set(b.productId, list);
            });

            for (const prod of activeProducts) {
                if (search && !prod.name.toLowerCase().includes(search) && !(prod.code || '').toLowerCase().includes(search)) {
                    continue;
                }
                const prodBatches = batchesByProduct.get(prod.id) || [];
                const costInfo = verifiedCostMap.get(prod.id) || null;
                const unitCost = costInfo ? costInfo.unitCost : null;

                if (prod.isBatchTracked && prodBatches.length > 0) {
                    for (const b of prodBatches) {
                        const batchQty = Number(b.quantity || 0);
                        totalUnitsInStock += batchQty;
                        let itemValuation: number | null = null;
                        if (unitCost !== null && !isNaN(unitCost)) {
                            itemValuation = Math.round(batchQty * unitCost * 100) / 100;
                            totalValuationAmount += itemValuation;
                            totalItemsValued++;
                        } else {
                            totalItemsExcluded++;
                        }

                        valuationItems.push({
                            productId: prod.id,
                            productCode: prod.code,
                            productName: prod.name,
                            category: prod.category,
                            unit: prod.unit,
                            isBatchTracked: true,
                            batchId: b.id,
                            batchNumber: b.batchNumber,
                            expiryDate: b.expiryDate,
                            quantity: batchQty,
                            applicableUnitCost: unitCost,
                            valuationAmount: itemValuation,
                            costSource: costInfo ? costInfo.source : 'UNVERIFIED',
                            costStatus: unitCost !== null ? 'VERIFIED' : 'MISSING_COST'
                        });
                    }
                } else {
                    const stockQty = stockMap.get(prod.id) || 0;
                    totalUnitsInStock += stockQty;
                    let itemValuation: number | null = null;
                    if (unitCost !== null && !isNaN(unitCost)) {
                        itemValuation = Math.round(stockQty * unitCost * 100) / 100;
                        totalValuationAmount += itemValuation;
                        totalItemsValued++;
                    } else {
                        totalItemsExcluded++;
                        excludedProducts.push({
                            productId: prod.id,
                            productCode: prod.code,
                            productName: prod.name,
                            category: prod.category,
                            quantity: stockQty,
                            reason: 'No verified acquisition cost available'
                        });
                    }

                    valuationItems.push({
                        productId: prod.id,
                        productCode: prod.code,
                        productName: prod.name,
                        category: prod.category,
                        unit: prod.unit,
                        isBatchTracked: Boolean(prod.isBatchTracked),
                        batchId: null,
                        batchNumber: null,
                        expiryDate: null,
                        quantity: stockQty,
                        applicableUnitCost: unitCost,
                        valuationAmount: itemValuation,
                        costSource: costInfo ? costInfo.source : 'UNVERIFIED',
                        costStatus: unitCost !== null ? 'VERIFIED' : 'MISSING_COST'
                    });
                }
            }
        } else {
            // Aggregate view: strictly 1 row per product
            for (const prod of activeProducts) {
                if (search && !prod.name.toLowerCase().includes(search) && !(prod.code || '').toLowerCase().includes(search)) {
                    continue;
                }
                const stockQty = stockMap.get(prod.id) || 0;
                totalUnitsInStock += stockQty;
                const costInfo = verifiedCostMap.get(prod.id) || null;
                const unitCost = costInfo ? costInfo.unitCost : null;
                let itemValuation: number | null = null;

                if (unitCost !== null && !isNaN(unitCost)) {
                    itemValuation = Math.round(stockQty * unitCost * 100) / 100;
                    totalValuationAmount += itemValuation;
                    totalItemsValued++;
                } else {
                    totalItemsExcluded++;
                    excludedProducts.push({
                        productId: prod.id,
                        productCode: prod.code,
                        productName: prod.name,
                        category: prod.category,
                        quantity: stockQty,
                        reason: 'No verified acquisition cost available'
                    });
                }

                valuationItems.push({
                    productId: prod.id,
                    productCode: prod.code,
                    productName: prod.name,
                    category: prod.category,
                    unit: prod.unit,
                    isBatchTracked: Boolean(prod.isBatchTracked),
                    quantity: stockQty,
                    applicableUnitCost: unitCost,
                    valuationAmount: itemValuation,
                    costSource: costInfo ? costInfo.source : 'UNVERIFIED',
                    costStatus: unitCost !== null ? 'VERIFIED' : 'MISSING_COST'
                });
            }
        }

        totalValuationAmount = Math.round(totalValuationAmount * 100) / 100;

        return {
            summary: {
                totalValuationAmount,
                totalUnitsInStock,
                totalProductsCount: products.length,
                totalItemsValued,
                totalItemsExcluded,
                viewMode,
                unitId: targetUnitId || null,
                tenantId: scope.tenantId,
                valuationMethod: 'VERIFIED_ACQUISITION_COST',
                isFinancialStatement: false,
                disclaimer: 'Operational inventory valuation based on verified acquisition unit costs. Excludes items without verified cost records. Not an audited accounting statement.'
            },
            items: valuationItems,
            excludedProducts
        };
    }

    async getConsumptionAnalytics(query: any = {}, scope: any) {
        if (!scope?.tenantId) {
            throw new Error('Tenant context is required');
        }

        const client = (this as any).db || prisma;
        const targetUnitId = resolveInventoryReportUnitId(query.unitId, scope);
        const categoryFilter = query.category ? String(query.category).trim() : null;
        const productFilter = query.productId ? String(query.productId).trim() : null;

        const now = new Date();
        const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const startDate = query.startDate ? new Date(query.startDate) : defaultStart;
        const endDate = query.endDate ? new Date(query.endDate) : now;

        const movementWhere: any = {
            tenantId: scope.tenantId,
            createdAt: {
                gte: startDate,
                lte: endDate
            },
            isDeleted: false
        };
        if (targetUnitId) {
            movementWhere.unitId = targetUnitId;
        }
        if (productFilter) {
            movementWhere.productId = productFilter;
        }

        const movements = await client.stockMovement.findMany({
            where: movementWhere,
            orderBy: { createdAt: 'desc' }
        });

        const productIds = Array.from(new Set(movements.map((m: any) => m.productId)));
        const products = await client.product.findMany({
            where: {
                id: { in: productIds },
                tenantId: scope.tenantId,
                ...(targetUnitId ? { unitId: targetUnitId } : {})
            },
            select: {
                id: true,
                code: true,
                name: true,
                category: true,
                unit: true
            }
        });
        const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));

        let totalConsumedQuantity = 0;
        let totalIssueMovements = 0;
        let supplierReturnsQty = 0;
        let adjustmentNetQty = 0;
        let wasteDiscardQty = 0;
        let receiptInflowQty = 0;

        const consumedByProductMap = new Map<string, { quantity: number; count: number }>();
        const consumedByCategoryMap = new Map<string, number>();
        const dailyTrendsMap = new Map<string, { quantity: number; count: number }>();

        const domain = query.domain || query.inventoryScope || scope.inventoryScope;
        const normDomain = domain ? normalizeInventoryScope(domain) : 'all';

        for (const mov of movements) {
            const prod = productMap.get(mov.productId);
            if (normDomain !== 'all' && (!prod || !isCategoryInScope(prod?.category, normDomain))) {
                continue;
            }
            if (categoryFilter && categoryFilter !== 'ALL' && prod?.category !== categoryFilter) {
                continue;
            }

            const mType = String(mov.movementType).toUpperCase();
            const rawQty = Number(mov.quantity || 0);

            if (mType === 'ISSUE' || mType === 'KITCHEN_REQUISITION') {
                const consumedQty = Math.abs(rawQty);
                totalConsumedQuantity += consumedQty;
                totalIssueMovements++;

                const existingProd = consumedByProductMap.get(mov.productId) || { quantity: 0, count: 0 };
                existingProd.quantity += consumedQty;
                existingProd.count += 1;
                consumedByProductMap.set(mov.productId, existingProd);

                const cat = prod?.category || 'General';
                const existingCatQty = consumedByCategoryMap.get(cat) || 0;
                consumedByCategoryMap.set(cat, existingCatQty + consumedQty);

                const dateKey = mov.createdAt ? new Date(mov.createdAt).toISOString().split('T')[0] : 'Unknown';
                const existingDay = dailyTrendsMap.get(dateKey) || { quantity: 0, count: 0 };
                existingDay.quantity += consumedQty;
                existingDay.count += 1;
                dailyTrendsMap.set(dateKey, existingDay);
            } else if (mType === 'SUPPLIER_RETURN') {
                supplierReturnsQty += Math.abs(rawQty);
            } else if (mType === 'ADJUSTMENT') {
                adjustmentNetQty += rawQty;
            } else if (mType === 'DISCARD' || mType === 'WASTE') {
                wasteDiscardQty += Math.abs(rawQty);
            } else if (mType === 'PURCHASE' || mType === 'GRN') {
                receiptInflowQty += rawQty;
            }
        }

        const topConsumedProducts = Array.from(consumedByProductMap.entries())
            .map(([productId, data]) => {
                const prod = productMap.get(productId);
                return {
                    productId,
                    productCode: prod?.code || null,
                    productName: prod?.name || 'Unknown Product',
                    category: prod?.category || 'General',
                    unit: prod?.unit || 'Nos',
                    consumedQuantity: data.quantity,
                    movementCount: data.count
                };
            })
            .sort((a, b) => b.consumedQuantity - a.consumedQuantity)
            .slice(0, 10);

        const dailyTrends = Array.from(dailyTrendsMap.entries())
            .map(([date, data]) => ({
                date,
                consumedQuantity: data.quantity,
                movementCount: data.count
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const consumptionByCategory = Array.from(consumedByCategoryMap.entries())
            .map(([category, quantity]) => ({
                category,
                quantity,
                percentage: totalConsumedQuantity > 0 ? Math.round((quantity / totalConsumedQuantity) * 1000) / 10 : 0
            }))
            .sort((a, b) => b.quantity - a.quantity);

        return {
            period: {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            },
            summary: {
                totalConsumedQuantity,
                totalIssueMovements,
                distinctProductsConsumed: consumedByProductMap.size,
                unitId: targetUnitId || null,
                tenantId: scope.tenantId
            },
            topConsumedProducts,
            consumptionByCategory,
            dailyTrends,
            excludedBreakdown: {
                supplierReturnsQty,
                adjustmentNetQty,
                wasteDiscardQty,
                receiptInflowQty
            },
            coverageNotice: 'Operational consumption strictly includes clinical medication dispensing, ward stock issues, and kitchen food preparation requisitions. Outbound supplier returns, physical adjustments, and discarded waste are excluded from consumption totals.'
        };
    }

    async getPhysicalAudits(query: any = {}, scope: any) {
        if (!scope?.tenantId) {
            throw new Error('Tenant context is required');
        }

        const client = (this as any).db || prisma;
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
        const skip = (page - 1) * limit;

        const where: any = {
            tenantId: scope.tenantId,
            isDeleted: false
        };
        const targetUnitId = resolveInventoryReportUnitId(query.unitId, scope);
        if (targetUnitId) where.unitId = targetUnitId;
        if (query.status) where.status = query.status;
        if (query.productId) where.productId = query.productId;

        try {
            if (client.physicalCount?.findMany) {
                const [total, audits] = await Promise.all([
                    client.physicalCount.count({ where }),
                    client.physicalCount.findMany({
                        where,
                        skip,
                        take: limit,
                        orderBy: { createdAt: 'desc' },
                        include: {
                            product: {
                                select: { id: true, name: true, code: true, category: true, unit: true, isBatchTracked: true }
                            },
                            batch: true
                        }
                    })
                ]);
                const domain = query.domain || query.inventoryScope || scope.inventoryScope;
                const normDomain = domain ? normalizeInventoryScope(domain) : 'all';
                let finalAudits = audits;
                let finalTotal = total;
                if (normDomain !== 'all') {
                    finalAudits = audits.filter((a: any) => isCategoryInScope(a.product?.category, normDomain));
                    finalTotal = finalAudits.length;
                }
                return {
                    data: finalAudits,
                    pagination: {
                        page,
                        limit,
                        total: finalTotal,
                        totalPages: Math.ceil(finalTotal / limit) || 1
                    }
                };
            }
        } catch {
            // Table not yet migrated
        }

        return {
            data: [],
            pagination: { page, limit, total: 0, totalPages: 0 }
        };
    }

    async getPhysicalAuditById(id: string, scope: any) {
        if (!scope?.tenantId) {
            throw new Error('Tenant context is required');
        }

        const client = (this as any).db || prisma;
        let audit: any = null;

        try {
            if (client.physicalCount?.findFirst) {
                audit = await client.physicalCount.findFirst({
                    where: {
                        id,
                        tenantId: scope.tenantId,
                        isDeleted: false
                    },
                    include: {
                        product: { select: PRODUCT_BASE_SELECT },
                        batch: { select: PRODUCT_BATCH_BASE_SELECT }
                    }
                });
            }
        } catch {
            // Fallback
        }

        if (!audit) {
            throw new Error('Physical stock audit not found or not accessible');
        }
        return audit;
    }

    async createPhysicalAudit(payload: any, scope: any, user: any, domain?: string) {
        if (!scope?.tenantId) {
            throw new Error('Tenant context is required');
        }

        const client = (this as any).db || prisma;

        return await client.$transaction(async (tx: any) => {
            // 1. Verify Product
            const product = await tx.product.findFirst({
                where: {
                    id: payload.productId,
                    tenantId: scope.tenantId
                },
                select: PRODUCT_BASE_SELECT
            });
            if (!product) {
                throw new Error('Product not found or not accessible within this tenant');
            }
            if (domain && domain !== 'all' && !isCategoryInScope(product.category, domain)) {
                throw new Error(`Product '${product.name}' (category: '${product.category}') does not belong to the active '${domain === 'medical' ? 'Medical' : 'Food & Ration'}' inventory domain.`);
            }

            const isBatchTracked = Boolean(
                product.isBatchTracked ||
                (product.category && String(product.category).toLowerCase() === 'medical')
            );

            // 2. Resolve batch if batch-tracked
            let batch: any = null;
            if (isBatchTracked) {
                if (payload.batchId) {
                    batch = await tx.productBatch.findFirst({
                        where: {
                            id: payload.batchId,
                            productId: product.id,
                            tenantId: scope.tenantId
                        }
                    });
                } else if (payload.batchNumber) {
                    batch = await tx.productBatch.findFirst({
                        where: {
                            batchNumber: payload.batchNumber,
                            productId: product.id,
                            tenantId: scope.tenantId
                        }
                    });
                }
                if (!batch && isBatchTracked) {
                    throw new Error('Batch selection is required for batch-tracked product physical count');
                }
            }

            // 3. Snapshot live system quantity at initiation
            let systemQty = 0;
            if (isBatchTracked && batch) {
                systemQty = Number(batch.quantity || 0);
            } else {
                const liveStock = await tx.stock.findFirst({
                    where: {
                        productId: product.id,
                        tenantId: scope.tenantId,
                        ...(scope.unitId ? { unitId: scope.unitId } : {})
                    }
                });
                systemQty = Number(liveStock?.quantity || 0);
            }

            // 4. Generate Audit Reference
            const auditNumber = await generateRefNumber('AUD', scope.tenantId, scope.unitId, tx);
            const auditId = randomUUID();

            let physicalQty: number | null = null;
            let variance: number | null = null;
            let status = 'DRAFT';

            if (payload.physicalQuantity !== undefined && payload.physicalQuantity !== null && payload.physicalQuantity !== '') {
                physicalQty = Number(payload.physicalQuantity);
                if (!Number.isInteger(physicalQty) || physicalQty < 0) {
                    throw new Error('Physical counted quantity must be a non-negative integer');
                }
                variance = physicalQty - systemQty;
                status = 'COUNTED';
            }

            const auditRecordData = {
                id: auditId,
                auditNumber,
                productId: product.id,
                batchId: batch?.id || null,
                batchNumber: batch?.batchNumber || null,
                systemQuantityAtCount: systemQty,
                physicalQuantity: physicalQty,
                variance,
                status,
                reason: payload.reason ? String(payload.reason).trim() : null,
                notes: payload.notes ? String(payload.notes).trim() : null,
                countedById: user?.id || null,
                countedByName: user?.name || user?.email || 'Authorized Auditor',
                countedAt: physicalQty !== null ? new Date() : null,
                tenantId: scope.tenantId,
                unitId: scope.unitId || null
            };

            let createdAudit: any = null;
            try {
                if (tx.physicalCount?.create) {
                    createdAudit = await tx.physicalCount.create({
                        data: auditRecordData,
                        include: {
                            product: true,
                            batch: true
                        }
                    });
                } else {
                    createdAudit = { ...auditRecordData, product, batch };
                }
            } catch {
                createdAudit = { ...auditRecordData, product, batch };
            }

            // Audit log
            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'CREATE_PHYSICAL_AUDIT',
                    payload: {
                        auditId,
                        auditNumber,
                        productId: product.id,
                        productName: product.name,
                        systemQuantityAtCount: systemQty,
                        physicalQuantity: physicalQty,
                        variance,
                        status
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return createdAudit;
        });
    }

    async submitPhysicalAuditCount(id: string, payload: any, scope: any, user: any) {
        if (!scope?.tenantId) {
            throw new Error('Tenant context is required');
        }

        const client = (this as any).db || prisma;
        const physicalQty = Number(payload.physicalQuantity);
        if (!Number.isInteger(physicalQty) || physicalQty < 0) {
            throw new Error('Physical counted quantity must be a non-negative integer');
        }

        return await client.$transaction(async (tx: any) => {
            let audit: any = null;
            if (tx.physicalCount?.findFirst) {
                audit = await tx.physicalCount.findFirst({
                    where: {
                        id,
                        tenantId: scope.tenantId,
                        isDeleted: false
                    }
                });
            }
            if (!audit) {
                throw new Error('Physical stock audit not found');
            }

            if (audit.status === 'RECONCILED') {
                throw new Error('Cannot update count on an already reconciled audit');
            }
            if (audit.status === 'CANCELLED') {
                throw new Error('Cannot update count on a cancelled audit');
            }

            const variance = physicalQty - audit.systemQuantityAtCount;
            if (variance !== 0 && (!payload.reason || String(payload.reason).trim().length < 3)) {
                throw new Error('A reason (minimum 3 characters) is required when there is a variance between system and physical count');
            }

            const updateData = {
                physicalQuantity: physicalQty,
                variance,
                status: 'COUNTED',
                reason: payload.reason ? String(payload.reason).trim() : audit.reason,
                notes: payload.notes ? String(payload.notes).trim() : audit.notes,
                countedById: user?.id || null,
                countedByName: user?.name || user?.email || 'Authorized Auditor',
                countedAt: new Date()
            };

            let updated: any = null;
            if (tx.physicalCount?.update) {
                updated = await tx.physicalCount.update({
                    where: { id: audit.id },
                    data: updateData,
                    include: { product: true, batch: true }
                });
            } else {
                updated = { ...audit, ...updateData };
            }

            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'SUBMIT_PHYSICAL_COUNT',
                    payload: {
                        auditId: audit.id,
                        auditNumber: audit.auditNumber,
                        systemQuantityAtCount: audit.systemQuantityAtCount,
                        physicalQuantity: physicalQty,
                        variance,
                        reason: updateData.reason
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return updated;
        });
    }

    async reconcilePhysicalAudit(id: string, payload: any = {}, scope: any, user: any) {
        if (!scope?.tenantId) {
            throw new Error('Tenant context is required');
        }

        const client = (this as any).db || prisma;

        return await client.$transaction(async (tx: any) => {
            // 1. Fetch and validate audit
            let audit: any = null;
            if (tx.physicalCount?.findFirst) {
                audit = await tx.physicalCount.findFirst({
                    where: {
                        id,
                        tenantId: scope.tenantId,
                        isDeleted: false
                    }
                });
            }
            if (!audit) {
                throw new Error('Physical stock audit not found');
            }

            if (audit.status === 'RECONCILED') {
                throw new Error('Physical stock audit has already been reconciled; duplicate reconciliation blocked');
            }
            if (audit.status === 'CANCELLED') {
                throw new Error('Cannot reconcile a cancelled physical stock audit');
            }
            if (audit.physicalQuantity === null || audit.physicalQuantity === undefined) {
                throw new Error('Physical count has not yet been recorded for this audit');
            }

            const targetPhysicalQty = Number(audit.physicalQuantity);

            // 2. Lock product row to prevent concurrent mutations
            await this.lockProductRow(tx, audit.productId, scope);

            // 3. Fetch live stock and batch balances
            const liveStock = await tx.stock.findFirst({
                where: {
                    productId: audit.productId,
                    tenantId: scope.tenantId,
                    ...(scope.unitId ? { unitId: scope.unitId } : {})
                }
            });
            if (!liveStock) {
                throw new Error('Stock balance record not found for product');
            }

            let liveBatch: any = null;
            if (audit.batchId) {
                liveBatch = await tx.productBatch.findFirst({
                    where: {
                        id: audit.batchId,
                        tenantId: scope.tenantId
                    }
                });
                if (!liveBatch) {
                    throw new Error('Batch record not found for physical audit reconciliation');
                }
            }

            // 4. Calculate live delta needed to reconcile with verified physical count
            const currentLiveStockQty = liveBatch ? Number(liveBatch.quantity || 0) : Number(liveStock.quantity || 0);
            const liveAdjustment = targetPhysicalQty - currentLiveStockQty;

            // 5. Apply live adjustment to stock and batch if non-zero
            if (liveAdjustment !== 0) {
                if (liveBatch) {
                    // Update batch quantity to exact target physical quantity
                    await tx.productBatch.updateMany({
                        where: { id: liveBatch.id },
                        data: {
                            quantity: targetPhysicalQty
                        }
                    });
                    // Also adjust aggregate facility stock by the exact live delta
                    const newAggStock = liveStock.quantity + liveAdjustment;
                    if (newAggStock < 0) {
                        throw new Error('Reconciliation adjustment would result in negative aggregate stock');
                    }
                    await tx.stock.updateMany({
                        where: { id: liveStock.id },
                        data: {
                            quantity: newAggStock
                        }
                    });
                } else {
                    // Non-batch product: adjust aggregate stock directly to physical count
                    await tx.stock.updateMany({
                        where: { id: liveStock.id },
                        data: {
                            quantity: targetPhysicalQty
                        }
                    });
                }
            }

            // 6. Record StockMovement
            const movementNotes = payload.notes ||
                `Physical Audit Reconciliation: ${audit.auditNumber} (Snapshot: ${audit.systemQuantityAtCount}, Physical Count: ${targetPhysicalQty}, Adjustment: ${liveAdjustment >= 0 ? '+' : ''}${liveAdjustment}${audit.reason ? ` - ${audit.reason}` : ''})`;

            const movement = await tx.stockMovement.create({
                data: {
                    productId: audit.productId,
                    movementType: 'ADJUSTMENT',
                    quantity: liveAdjustment,
                    balanceAfter: targetPhysicalQty,
                    batchId: audit.batchId || null,
                    referenceType: 'PHYSICAL_AUDIT',
                    referenceId: audit.id,
                    notes: movementNotes,
                    performedBy: user?.name || user?.email || 'Authorized Auditor',
                    tenantId: scope.tenantId,
                    unitId: scope.unitId || liveStock.unitId
                }
            });

            // 7. Update audit status to RECONCILED
            const reconcileUpdate = {
                status: 'RECONCILED',
                reconciledById: user?.id || null,
                reconciledByName: user?.name || user?.email || 'Authorized Auditor',
                reconciledAt: new Date(),
                reconciliationMovementId: movement.id
            };

            let reconciledRecord: any = null;
            if (tx.physicalCount?.update) {
                reconciledRecord = await tx.physicalCount.update({
                    where: { id: audit.id },
                    data: reconcileUpdate,
                    include: { product: true, batch: true }
                });
            } else {
                reconciledRecord = { ...audit, ...reconcileUpdate };
            }

            // 8. Record AuditLog
            await tx.auditLog.create({
                data: {
                    userId: user?.id || null,
                    module: 'inventory',
                    action: 'RECONCILE_PHYSICAL_COUNT',
                    payload: {
                        auditId: audit.id,
                        auditNumber: audit.auditNumber,
                        productId: audit.productId,
                        systemQuantityAtCount: audit.systemQuantityAtCount,
                        liveStockBeforeReconciliation: currentLiveStockQty,
                        physicalQuantity: targetPhysicalQty,
                        adjustmentQuantity: liveAdjustment,
                        stockMovementId: movement.id
                    },
                    tenantId: scope.tenantId,
                    unitId: scope.unitId
                }
            });

            return {
                audit: reconciledRecord,
                movement,
                liveAdjustment,
                previousBalance: currentLiveStockQty,
                newBalance: targetPhysicalQty
            };
        }, { maxWait: 15000, timeout: 30000 });
    }
}



