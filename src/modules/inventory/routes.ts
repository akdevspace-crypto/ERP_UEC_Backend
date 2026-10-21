import { Router } from 'express';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { requireAnyPermission } from '../../shared/middleware/rbac.middleware.js';
import { validateInventoryScope } from './inventoryScope.js';
import * as controller from './controller.js';

const router = Router();

router.use(validateInventoryScope);

// ==========================================
// 1. PRODUCT CATALOG
// ==========================================

// GET /api/v1/product
router.get(
    '/product',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Products', 'Inventory Products', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'Medicine Requests', 'Medicine Issue Log', 'Medication Schedule'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'PATIENT_CARE_MANAGER', 'MEDICAL_DOCTOR', 'NURSE']
    ),
    controller.getProducts
);

// POST /api/v1/product
router.post(
    '/product',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Products', 'Inventory Products'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.createProduct
);

// PUT /api/v1/product/:id
router.put(
    '/product/:id',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Products', 'Inventory Products'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.updateProduct
);

// PATCH /api/v1/product/:id/status
router.patch(
    '/product/:id/status',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Products', 'Inventory Products'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.updateProductStatus
);

// ==========================================
// 2. STOCK BALANCES & BATCHES
// ==========================================

// GET /api/v1/stock
router.get(
    '/stock',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock', 'Inventory Products', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER']
    ),
    controller.getStock
);

// GET /api/v1/stock/batches
router.get(
    '/stock/batches',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock', 'Inventory Products', 'Medical Inventory Dashboard', 'Medication Management', 'Medicine Requests'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER']
    ),
    controller.getBatches
);

// GET /api/v1/stock/expiry-alerts
router.get(
    '/stock/expiry-alerts',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock', 'Inventory Products', 'Medical Inventory Dashboard', 'Medication Management', 'Medicine Requests', 'Elder Inventory Dashboard'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'ELDER_CARE_ADMIN']
    ),
    controller.getExpiryAlerts
);

// POST /api/v1/stock/update (Direct physical stock adjustments)
router.post(
    '/stock/update',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.updateStock
);

// ==========================================
// 3. PURCHASES & INVENTORY RECEIPT
// ==========================================

// GET /api/v1/purchase
router.get(
    '/purchase',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.getPurchases
);

// POST /api/v1/purchase
router.post(
    '/purchase',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN']
    ),
    controller.createPurchase
);

// ==========================================
// 3b. MULTI-ITEM PURCHASE ORDERS (D8.2)
// ==========================================

// GET /api/v1/purchase-orders
router.get(
    '/purchase-orders',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'inventory.purchases.view'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER']
    ),
    controller.getPurchaseOrders
);

// POST /api/v1/purchase-orders
router.post(
    '/purchase-orders',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'inventory.purchases.manage'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.createPurchaseOrder
);

// GET /api/v1/purchase-orders/:id
router.get(
    '/purchase-orders/:id',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'inventory.purchases.view'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER']
    ),
    controller.getPurchaseOrderById
);

// PATCH /api/v1/purchase-orders/:id
router.patch(
    '/purchase-orders/:id',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'inventory.purchases.manage'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.updatePurchaseOrder
);

// POST /api/v1/purchase-orders/:id/order
router.post(
    '/purchase-orders/:id/order',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'inventory.purchases.manage'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.orderPurchaseOrder
);

// POST /api/v1/purchase-orders/:id/cancel
router.post(
    '/purchase-orders/:id/cancel',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'inventory.purchases.manage'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.cancelPurchaseOrder
);

// ==========================================
// 3.1. GOODS RECEIPT NOTES (GRN)
// ==========================================

// GET /api/v1/goods-receipts
router.get(
    '/goods-receipts',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'inventory.purchases.manage'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.getGoodsReceipts
);

// GET /api/v1/goods-receipts/:id
router.get(
    '/goods-receipts/:id',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'inventory.purchases.manage'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.getGoodsReceiptById
);

// POST /api/v1/purchase-orders/:id/grn
router.post(
    '/purchase-orders/:id/grn',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'Stock', 'inventory.purchases.manage'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.createGoodsReceipt
);

// ==========================================
// 3.2. SUPPLIER RETURNS (D9.1)
// ==========================================

// GET /api/v1/stock/supplier-returns
router.get(
    '/stock/supplier-returns',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'inventory.purchases.view', 'inventory.stock.view'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.getSupplierReturns
);

// GET /api/v1/stock/supplier-returns/:id
router.get(
    '/stock/supplier-returns/:id',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'inventory.purchases.view', 'inventory.stock.view'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.getSupplierReturnById
);

// POST /api/v1/stock/supplier-returns
router.post(
    '/stock/supplier-returns',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Purchase Orders', 'Stock', 'inventory.purchases.manage', 'inventory.stock.manage'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'UHC_ADMIN', 'ELDER_CARE_ADMIN']
    ),
    controller.createSupplierReturn
);

// ==========================================
// 4. STOCK ISSUE REQUISITIONS & APPROVALS
// ==========================================

// GET /api/v1/stock/issue-requests
router.get(
    '/stock/issue-requests',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock Issue', 'Stock Issue Request', 'Stock Issue Approval', 'Medicine Requests', 'Medicine Issue Log', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'Stock'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'PATIENT_CARE_MANAGER', 'NURSE', 'NURSING_CARE_STAFF', 'MEDICAL_DOCTOR']
    ),
    controller.getIssueRequests
);

// POST /api/v1/stock/issue-requests
router.post(
    '/stock/issue-requests',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock Issue Request', 'Stock Issue', 'Medicine Requests'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'PATIENT_CARE_MANAGER', 'NURSE', 'NURSING_CARE_STAFF', 'ELDER_CARE_ADMIN', 'UHC_ADMIN', 'MEDICAL_DOCTOR']
    ),
    controller.createIssueRequest
);

// POST /api/v1/stock/issue-requests/:id/approve
router.post(
    '/stock/issue-requests/:id/approve',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock Issue Approval'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER']
    ),
    controller.approveIssueRequest
);

// POST /api/v1/stock/issue-requests/:id/reject
router.post(
    '/stock/issue-requests/:id/reject',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock Issue Approval'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER']
    ),
    controller.rejectIssueRequest
);

// POST /api/v1/stock/issue-requests/:id/cancel
router.post(
    '/stock/issue-requests/:id/cancel',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock Issue Request', 'Stock Issue', 'Medicine Requests', 'Stock Issue Approval'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'NURSING_MANAGER', 'MEDICAL_MANAGER', 'PATIENT_CARE_MANAGER', 'NURSE', 'NURSING_CARE_STAFF', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.cancelIssueRequest
);

// ==========================================
// 5. STOCK MOVEMENT LEDGER
// ==========================================

// GET /api/v1/stock/movements
router.get(
    '/stock/movements',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock Movements', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER']
    ),
    controller.getStockMovements
);

// ==========================================
// 6. CROSS-MODULE WORKFLOWS
// ==========================================

// POST /api/v1/stock/kitchen-requisition
router.post(
    '/stock/kitchen-requisition',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Food Preparation', 'Stock', 'Stock Issue Request', 'Elder Operations Dashboard'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_OPERATIONS_MANAGER', 'ELDER_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'CHEF', 'COOK', 'KITCHEN_STAFF']
    ),
    controller.createKitchenRequisition
);

// ==========================================
// 7. D10 — VALUATION, CONSUMPTION & PHYSICAL AUDIT
// ==========================================

// GET /api/v1/stock/valuation
router.get(
    '/stock/valuation',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock', 'Inventory Products', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'Stock Movements'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.getStockValuation
);

// GET /api/v1/stock/consumption-analytics
router.get(
    '/stock/consumption-analytics',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock Movements', 'Stock', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard', 'Stock Issue'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.getConsumptionAnalytics
);

// GET /api/v1/stock/physical-audits
router.get(
    '/stock/physical-audits',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock', 'Inventory Products', 'Stock Movements', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.getPhysicalAudits
);

// GET /api/v1/stock/physical-audits/:id
router.get(
    '/stock/physical-audits/:id',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock', 'Inventory Products', 'Stock Movements', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.getPhysicalAuditById
);

// POST /api/v1/stock/physical-audits
router.post(
    '/stock/physical-audits',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock', 'Inventory Products', 'Stock Issue Request'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER']
    ),
    controller.createPhysicalAudit
);

// POST /api/v1/stock/physical-audits/:id/submit-count
router.post(
    '/stock/physical-audits/:id/submit-count',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock', 'Inventory Products', 'Stock Issue Request'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN', 'NURSING_MANAGER', 'MEDICAL_MANAGER']
    ),
    controller.submitPhysicalAuditCount
);

// POST /api/v1/stock/physical-audits/:id/reconcile
router.post(
    '/stock/physical-audits/:id/reconcile',
    auth,
    enforceTenant,
    requireAnyPermission(
        ['Stock', 'Inventory Products'],
        ['SUPER_ADMIN', 'ADMIN', 'UNCF_ADMIN', 'INVENTORY_MANAGER', 'ELDER_INVENTORY_MANAGER', 'MEDICAL_INVENTORY_MANAGER', 'ELDER_CARE_ADMIN', 'UHC_ADMIN']
    ),
    controller.reconcilePhysicalAudit
);

export default router;

