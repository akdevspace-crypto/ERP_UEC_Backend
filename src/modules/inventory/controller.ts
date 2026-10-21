import { InventoryService } from './service.js';
import { z } from 'zod';
import { getReadScope, canReadFacilityWide } from '../../shared/utils/rbac.js';
import { filterProductsByScope, normalizeInventoryScope, isCategoryInScope, InventoryScope, getInventoryReportScope } from './inventoryScope.js';

const service = new InventoryService();

export const getInventoryDomain = (req: any): InventoryScope => {
    const raw = req.headers['x-inventory-domain'] || 
                req.query.domain || 
                req.query.inventoryScope || 
                req.query.scope;
    return normalizeInventoryScope(raw as string);
};

const productSchema = z.object({
    name: z.string().min(1),
    code: z.string().trim().min(1).optional().nullable(),
    category: z.string().min(1),
    unit: z.string().optional().default('Nos'),
    minStockLevel: z.coerce.number().min(0).optional().default(0),
    defaultRevenuePrice: z.coerce.number().min(0).optional().default(0),
    chargeableInCareRevenue: z.boolean().optional().default(false),
    status: z.boolean().optional().default(true),
    isBatchTracked: z.boolean().optional()
});

const updateProductSchema = z.object({
    name: z.string().min(1).optional(),
    code: z.string().trim().min(1).optional().nullable(),
    category: z.string().min(1).optional(),
    subCategory: z.string().trim().optional().nullable(),
    unit: z.string().min(1).optional(),
    minStockLevel: z.coerce.number().min(0).optional(),
    defaultRevenuePrice: z.coerce.number().min(0).optional(),
    chargeableInCareRevenue: z.boolean().optional(),
    status: z.boolean().optional()
});

const updateProductStatusSchema = z.object({
    status: z.boolean()
});

const stockUpdateSchema = z.object({
    productId: z.string().min(1),
    quantity: z.number().int().refine(val => val !== 0, {
        message: 'Adjustment quantity must be a non-zero integer'
    }),
    batchId: z.string().optional().nullable(),
    batchNumber: z.string().trim().min(1).optional().nullable(),
    expiryDate: z.string().optional().nullable(),
    usageType: z.string().optional().nullable(),
    referenceNo: z.string().optional().nullable(),
    storageLocation: z.string().optional().nullable(),
    issuedTo: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
});

const purchaseSchema = z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
    vendor: z.string().min(1).optional(),
    vendorId: z.string().optional().nullable(),
    batchNumber: z.string().optional().nullable(),
    expiryDate: z.string().optional().nullable()
}).refine(data => Boolean(data.vendor || data.vendorId), {
    message: 'Either vendor or vendorId must be provided'
});

const stockIssueRequestSchema = z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
    usageType: z.string().min(1),
    allocationId: z.string().optional().nullable(),
    patientId: z.string().optional().nullable(),
    prescriptionId: z.string().optional().nullable(),
    rate: z.coerce.number().min(0).optional().nullable(),
    overrideReason: z.string().optional().nullable(),
    issuedTo: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
});

const kitchenRequisitionSchema = z.object({
    mealPrepId: z.string().min(1),
    items: z.array(z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive()
    })).min(1)
});

const purchaseOrderItemSchema = z.object({
    productId: z.string().min(1),
    orderedQuantity: z.number().int().positive(),
    notes: z.string().trim().optional().nullable()
});

const createPurchaseOrderSchema = z.object({
    vendorId: z.string().uuid(),
    items: z.array(purchaseOrderItemSchema).min(1, 'Purchase order must have at least one line item'),
    orderDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
    expectedDeliveryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
    notes: z.string().trim().optional().nullable()
});

const updatePurchaseOrderSchema = z.object({
    vendorId: z.string().uuid().optional(),
    items: z.array(purchaseOrderItemSchema).min(1, 'Purchase order must have at least one line item').optional(),
    expectedDeliveryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
    notes: z.string().trim().optional().nullable()
});

const cancelPurchaseOrderSchema = z.object({
    reason: z.string().trim().optional().nullable()
});

const goodsReceiptItemSchema = z.object({
    purchaseOrderItemId: z.string().uuid(),
    receivedQuantity: z.number().int().positive(),
    acceptedQuantity: z.number().int().min(0).optional(),
    rejectedQuantity: z.number().int().min(0).optional().default(0),
    batchNumber: z.string().trim().optional().nullable(),
    expiryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
    notes: z.string().trim().optional().nullable()
});

const createGoodsReceiptSchema = z.object({
    vendorId: z.string().uuid().optional(),
    receivedDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
    deliveryChallanNo: z.string().trim().optional().nullable(),
    supplierInvoiceNo: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    idempotencyKey: z.string().trim().optional().nullable(),
    items: z.array(goodsReceiptItemSchema).min(1, 'Goods receipt must contain at least one line item')
});

const getScope = (req: any) => ({
    tenantId: req.user.tenantId,
    unitId: req.context?.unitId || req.user.unitId
});

export const createProduct = async (req: any, res: any) => {
    try {
        const validated = productSchema.parse(req.body);
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const product = await service.createProduct(validated, scope, req.user, domain);
        res.status(201).json({ success: true, data: product, message: 'Product created successfully' });
    } catch (error: any) {
        if (error.message?.includes('already exists for this tenant')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateProduct = async (req: any, res: any) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Product ID is required' });
        const validated = updateProductSchema.parse(req.body);
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const product = await service.updateProduct(id, validated, scope, req.user, domain);
        res.json({ success: true, data: product, message: 'Product updated successfully' });
    } catch (error: any) {
        if (error.message?.includes('already exists for this tenant')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateProductStatus = async (req: any, res: any) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Product ID is required' });
        const validated = updateProductStatusSchema.parse(req.body);
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const product = await service.updateProductStatus(id, validated.status, scope, req.user, domain);
        res.json({
            success: true,
            data: product,
            message: validated.status ? 'Product reactivated successfully' : 'Product deactivated successfully'
        });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getProducts = async (req: any, res: any) => {
    try {
        const domain = getInventoryDomain(req);
        const scope = getReadScope(req);
        const allProducts = await service.getProducts(scope);
        const products = filterProductsByScope(allProducts, domain);
        res.json({ success: true, data: products });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getStock = async (req: any, res: any) => {
    try {
        const domain = getInventoryDomain(req);
        const scope = getReadScope(req);
        const allStock = await service.getStock(scope);
        const stock = domain !== 'all'
            ? allStock.filter((s: any) => isCategoryInScope(s.product?.category, domain))
            : allStock;
        res.json({ success: true, data: stock });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getPurchases = async (req: any, res: any) => {
    try {
        const domain = getInventoryDomain(req);
        const scope = getReadScope(req);
        const allPurchases = await service.getPurchases(scope);
        const purchases = domain !== 'all'
            ? allPurchases.filter((p: any) => isCategoryInScope(p.product?.category, domain))
            : allPurchases;
        res.json({ success: true, data: purchases });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getIssueRequests = async (req: any, res: any) => {
    try {
        const domain = getInventoryDomain(req);
        const scope = getReadScope(req);
        const patientId = req.query.patientId ? String(req.query.patientId).trim() : undefined;
        const allRequests = await service.getIssueRequests(scope, patientId);
        const requests = domain !== 'all'
            ? allRequests.filter((r: any) => isCategoryInScope(r.category || r.product?.category, domain))
            : allRequests;
        res.json({ success: true, data: requests });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getBatches = async (req: any, res: any) => {
    try {
        const domain = getInventoryDomain(req);
        const scope: any = getReadScope(req);
        if (req.query.productId) {
            scope.productId = String(req.query.productId).trim();
        }
        const allBatches = await service.getBatches(scope);
        const batches = domain !== 'all'
            ? allBatches.filter((b: any) => isCategoryInScope(b.product?.category, domain))
            : allBatches;
        res.json({ success: true, data: batches });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getExpiryAlerts = async (req: any, res: any) => {
    try {
        const domain = getInventoryDomain(req);
        const scope: any = getReadScope(req);
        const daysAhead = req.query.daysAhead !== undefined ? Number(req.query.daysAhead) : 30;
        const status = req.query.status ? String(req.query.status).trim() : 'ALL';
        const productId = req.query.productId ? String(req.query.productId).trim() : undefined;

        const result = await service.getExpiryAlerts(scope, { daysAhead, status, productId, domain });
        res.json({
            success: true,
            data: result.alerts,
            summary: result.summary
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createIssueRequest = async (req: any, res: any) => {
    try {
        const validated = stockIssueRequestSchema.parse(req.body);
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const requestedBy = req.user?.name || req.user?.email || 'Inventory requester';
        const request = await service.createIssueRequest(validated, scope, requestedBy, req.user, domain);
        res.status(201).json({ success: true, data: request, message: 'Stock issue request saved' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const approveIssueRequest = async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Request id is required' });

        const canReadAll = canReadFacilityWide(req.user);
        const rateOverride = req.body?.rate !== undefined && req.body?.rate !== null && req.body?.rate !== ''
            ? Number(req.body.rate)
            : undefined;
        const overrideReason = req.body?.overrideReason || req.body?.rateOverrideReason || undefined;
        const result = await service.approveIssueRequest(id, scope, req.user, canReadAll, { rate: rateOverride, overrideReason });
        res.json({
            success: true,
            data: result,
            message: result?.patientLedgerEntry
                ? 'Stock issue approved, stock reduced, and patient ledger updated'
                : 'Stock issue approved and stock reduced'
        });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const rejectIssueRequest = async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Request id is required' });

        const canReadAll = canReadFacilityWide(req.user);
        const request = await service.rejectIssueRequest(id, scope, req.user, canReadAll);
        res.json({ success: true, data: request, message: 'Stock issue request rejected' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const cancelIssueRequest = async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Request id is required' });

        const reason = req.body?.reason ? String(req.body.reason).trim() : undefined;
        const canReadAll = canReadFacilityWide(req.user);
        const request = await service.cancelIssueRequest(id, scope, req.user, reason, canReadAll);
        res.json({ success: true, data: request, message: 'Stock issue request cancelled successfully' });
    } catch (error: any) {
        const statusCode = error.message?.includes('Unauthorized') ? 403 : 400;
        res.status(statusCode).json({ success: false, message: error.message });
    }
};

export const getStockMovements = async (req: any, res: any) => {
    try {
        const domain = getInventoryDomain(req);
        const scope = getReadScope(req);
        const allMovements = await service.getStockMovements(scope);
        const movements = domain !== 'all'
            ? allMovements.filter((m: any) => isCategoryInScope(m.product?.category, domain))
            : allMovements;
        res.json({ success: true, data: movements });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateStock = async (req: any, res: any) => {
    try {
        const validated = stockUpdateSchema.parse(req.body);
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const stock = await service.updateStock(validated, scope, req.user, domain);
        res.json({ success: true, data: stock, message: 'Stock updated successfully' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const createPurchase = async (req: any, res: any) => {
    try {
        const validated = purchaseSchema.parse(req.body);
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const purchase = await service.createPurchase(validated, scope, req.user, domain);
        res.status(201).json({ success: true, data: purchase, message: 'Purchase recorded and stock updated' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const createKitchenRequisition = async (req: any, res: any) => {
    try {
        const validated = kitchenRequisitionSchema.parse(req.body);
        const scope = getScope(req);
        const results = await service.createKitchenRequisition(validated, scope, req.user);
        res.status(201).json({ success: true, data: results, message: 'Kitchen requisition processed and stock updated' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getPurchaseOrders = async (req: any, res: any) => {
    try {
        const scope = getReadScope(req);
        const domain = getInventoryDomain(req);
        const { status, vendorId, search, page, limit } = req.query;
        const result = await service.getPurchaseOrders(scope, { status, vendorId, search, page, limit, domain });
        res.json({
            success: true,
            data: result.purchaseOrders,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getPurchaseOrderById = async (req: any, res: any) => {
    try {
        const scope = getReadScope(req);
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Purchase order ID is required' });
        const po = await service.getPurchaseOrderById(id, scope);
        res.json({ success: true, data: po });
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createPurchaseOrder = async (req: any, res: any) => {
    try {
        const validated = createPurchaseOrderSchema.parse(req.body);
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const po = await service.createPurchaseOrder(validated, scope, req.user, domain);
        res.status(201).json({ success: true, data: po, message: 'Purchase order created successfully' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: error.issues[0]?.message || 'Validation error', errors: error.issues });
        }
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Duplicate')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updatePurchaseOrder = async (req: any, res: any) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Purchase order ID is required' });
        const validated = updatePurchaseOrderSchema.parse(req.body);
        const scope = getScope(req);
        const po = await service.updatePurchaseOrder(id, validated, scope, req.user);
        res.json({ success: true, data: po, message: 'Purchase order updated successfully' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: error.issues[0]?.message || 'Validation error', errors: error.issues });
        }
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Duplicate')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const orderPurchaseOrder = async (req: any, res: any) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Purchase order ID is required' });
        const scope = getScope(req);
        const po = await service.orderPurchaseOrder(id, scope, req.user);
        res.json({ success: true, data: po, message: 'Purchase order submitted and marked as ORDERED' });
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.message?.includes('conflicting')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const cancelPurchaseOrder = async (req: any, res: any) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Purchase order ID is required' });
        const validated = cancelPurchaseOrderSchema.parse(req.body || {});
        const scope = getScope(req);
        const po = await service.cancelPurchaseOrder(id, scope, req.user, validated.reason || undefined);
        res.json({ success: true, data: po, message: 'Purchase order cancelled successfully' });
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.message?.includes('conflicting')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getGoodsReceipts = async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        if (canReadFacilityWide(req.user)) {
            delete scope.unitId;
        }
        const domain = getInventoryDomain(req);
        const result = await service.getGoodsReceipts(scope, { ...req.query, domain });
        res.json({ success: true, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getGoodsReceiptById = async (req: any, res: any) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Goods receipt ID is required' });
        const scope = getScope(req);
        if (canReadFacilityWide(req.user)) {
            delete scope.unitId;
        }
        const grn = await service.getGoodsReceiptById(id, scope);
        res.json({ success: true, data: grn });
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const createGoodsReceipt = async (req: any, res: any) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Purchase order ID is required' });
        const validated = createGoodsReceiptSchema.parse(req.body);
        if (!validated.idempotencyKey && req.headers['x-idempotency-key']) {
            validated.idempotencyKey = String(req.headers['x-idempotency-key']).trim();
        }
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const grn = await service.createGoodsReceipt(id, validated, scope, req.user, domain);
        res.status(201).json({ success: true, data: grn, message: 'Goods receipt posted successfully' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: error.issues[0]?.message || 'Validation error', errors: error.issues });
        }
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.message?.includes('exceeds remaining') ||
            error.message?.includes('Cannot receive goods against') ||
            error.message?.includes('conflicting') ||
            error.message?.includes('Duplicate') ||
            error.message?.includes('already')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

// ==========================================
// 3.2. SUPPLIER RETURNS (D9.1)
// ==========================================

const createSupplierReturnItemSchema = z.object({
    productId: z.string().uuid(),
    batchId: z.string().uuid().optional().nullable(),
    batchNumber: z.string().trim().optional().nullable(),
    returnQuantity: z.number().int().positive('Return quantity must be a positive integer'),
    reason: z.string().trim().optional().nullable(),
    goodsReceiptItemId: z.string().uuid().optional().nullable()
});

const createSupplierReturnSchema = z.object({
    vendorId: z.string().uuid(),
    sourceType: z.enum(['GRN', 'PURCHASE', 'DIRECT']).default('GRN'),
    sourceReferenceId: z.string().trim().optional().nullable(),
    returnDate: z.string().optional().nullable(),
    reason: z.string().trim().min(5, 'Return reason must be at least 5 characters'),
    notes: z.string().trim().optional().nullable(),
    idempotencyKey: z.string().trim().optional().nullable(),
    items: z.array(createSupplierReturnItemSchema).min(1, 'At least one return item is required')
});

export const getSupplierReturns = async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        if (canReadFacilityWide(req.user)) {
            delete scope.unitId;
        }
        const domain = getInventoryDomain(req);
        const result = await service.getSupplierReturns(scope, { ...req.query, domain });
        res.json({ success: true, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getSupplierReturnById = async (req: any, res: any) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ success: false, message: 'Supplier return ID is required' });
        const scope = getScope(req);
        if (canReadFacilityWide(req.user)) {
            delete scope.unitId;
        }
        const returnRecord = await service.getSupplierReturnById(id, scope);
        res.json({ success: true, data: returnRecord });
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const createSupplierReturn = async (req: any, res: any) => {
    try {
        const validated = createSupplierReturnSchema.parse(req.body);
        if (!validated.idempotencyKey && req.headers['x-idempotency-key']) {
            validated.idempotencyKey = String(req.headers['x-idempotency-key']).trim();
        }
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const returnRecord = await service.createSupplierReturn(validated, scope, req.user, domain);
        res.status(201).json({ success: true, data: returnRecord, message: 'Supplier return processed successfully' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: error.issues[0]?.message || 'Validation error', errors: error.issues });
        }
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.message?.includes('exceeds remaining') ||
            error.message?.includes('Insufficient') ||
            error.message?.includes('inactive') ||
            error.message?.includes('mismatch')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

// =========================================================================
// D10 — VALUATION, CONSUMPTION & PHYSICAL AUDIT CONTROLLER
// =========================================================================

export const getStockValuation = async (req: any, res: any) => {
    try {
        const scope = getInventoryReportScope(req);
        const domain = getInventoryDomain(req);
        const report = await service.getStockValuation({ ...req.query, domain }, scope);
        res.json({ success: true, data: report });
    } catch (error: any) {
        if (error.message?.includes('Access denied') || error.message?.includes('context is required') || error.message?.includes('Forbidden')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getConsumptionAnalytics = async (req: any, res: any) => {
    try {
        const scope = getInventoryReportScope(req);
        const domain = getInventoryDomain(req);
        const report = await service.getConsumptionAnalytics({ ...req.query, domain }, scope);
        res.json({ success: true, data: report });
    } catch (error: any) {
        if (error.message?.includes('Access denied') || error.message?.includes('context is required') || error.message?.includes('Forbidden')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

const createPhysicalAuditSchema = z.object({
    productId: z.string().min(1, 'Product ID is required'),
    batchId: z.string().optional().nullable(),
    batchNumber: z.string().optional().nullable(),
    physicalQuantity: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)]).optional().nullable(),
    reason: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
});

const submitPhysicalAuditCountSchema = z.object({
    physicalQuantity: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)]),
    reason: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
});

const reconcilePhysicalAuditSchema = z.object({
    notes: z.string().optional().nullable()
});

export const getPhysicalAudits = async (req: any, res: any) => {
    try {
        const scope = getInventoryReportScope(req);
        const domain = getInventoryDomain(req);
        const result = await service.getPhysicalAudits({ ...req.query, domain }, scope);
        res.json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error: any) {
        if (error.message?.includes('Access denied') || error.message?.includes('context is required') || error.message?.includes('Forbidden')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const getPhysicalAuditById = async (req: any, res: any) => {
    try {
        const scope = getScope(req);
        const audit = await service.getPhysicalAuditById(req.params.id, scope);
        res.json({ success: true, data: audit });
    } catch (error: any) {
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const createPhysicalAudit = async (req: any, res: any) => {
    try {
        const validated = createPhysicalAuditSchema.parse(req.body);
        const scope = getScope(req);
        const domain = getInventoryDomain(req);
        const audit = await service.createPhysicalAudit(validated, scope, req.user, domain);
        res.status(201).json({ success: true, data: audit, message: 'Physical stock count initiated successfully' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: error.issues[0]?.message || 'Validation error', errors: error.issues });
        }
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const submitPhysicalAuditCount = async (req: any, res: any) => {
    try {
        const validated = submitPhysicalAuditCountSchema.parse(req.body);
        const scope = getScope(req);
        const audit = await service.submitPhysicalAuditCount(req.params.id, validated, scope, req.user);
        res.json({ success: true, data: audit, message: 'Physical stock count updated successfully' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: error.issues[0]?.message || 'Validation error', errors: error.issues });
        }
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.message?.includes('already reconciled') || error.message?.includes('cancelled')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

export const reconcilePhysicalAudit = async (req: any, res: any) => {
    try {
        const validated = reconcilePhysicalAuditSchema.parse(req.body || {});
        const scope = getScope(req);
        const result = await service.reconcilePhysicalAudit(req.params.id, validated, scope, req.user);
        res.json({ success: true, data: result, message: 'Physical stock audit reconciled and stock ledger updated' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: error.issues[0]?.message || 'Validation error', errors: error.issues });
        }
        if (error.message?.includes('not found')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message?.includes('Access denied')) {
            return res.status(403).json({ success: false, message: error.message });
        }
        if (error.message?.includes('already been reconciled') || error.message?.includes('negative aggregate stock')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};


