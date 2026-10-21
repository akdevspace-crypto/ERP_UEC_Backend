/**
 * InventoryApp D10 — Valuation, Consumption Analytics & Physical Audit Verification Suite
 * Run with: npx tsx src/tests/runInventoryValuationAndAuditTest.ts
 */

import { InventoryService } from '../modules/inventory/service.js';

interface MockStore {
    products: any[];
    stocks: any[];
    batches: any[];
    movements: any[];
    supplierReturnItems: any[];
    physicalCounts: any[];
    auditLogs: any[];
    refCounters: any[];
}

function createMockPrisma(store: MockStore, options: { failStock?: boolean; failAuditLog?: boolean } = {}) {
    const client: any = {
        product: {
            findMany: async ({ where }: any) => {
                return store.products.filter(p => {
                    if (where.tenantId && p.tenantId !== where.tenantId) return false;
                    if (where.status !== undefined && p.status !== where.status) return false;
                    if (where.category && p.category !== where.category) return false;
                    if (where.id?.in && !where.id.in.includes(p.id)) return false;
                    return true;
                });
            },
            findFirst: async ({ where }: any) => {
                return store.products.find(p => {
                    if (where.id && p.id !== where.id) return false;
                    if (where.tenantId && p.tenantId !== where.tenantId) return false;
                    return true;
                }) || null;
            }
        },
        stock: {
            findMany: async ({ where }: any) => {
                return store.stocks.filter(s => {
                    if (where.tenantId && s.tenantId !== where.tenantId) return false;
                    if (where.unitId && s.unitId !== where.unitId) return false;
                    return true;
                });
            },
            findFirst: async ({ where }: any) => {
                return store.stocks.find(s => {
                    if (where.productId && s.productId !== where.productId) return false;
                    if (where.tenantId && s.tenantId !== where.tenantId) return false;
                    if (where.unitId && s.unitId !== where.unitId) return false;
                    return true;
                }) || null;
            },
            updateMany: async ({ where, data }: any) => {
                if (options.failStock) throw new Error("Stock update simulated fault");
                const item = store.stocks.find(s => s.id === where.id);
                if (!item) return { count: 0 };
                if (data.quantity !== undefined) {
                    item.quantity = data.quantity;
                }
                return { count: 1 };
            }
        },
        productBatch: {
            findMany: async ({ where }: any) => {
                return store.batches.filter(b => {
                    if (where.tenantId && b.tenantId !== where.tenantId) return false;
                    if (where.unitId && b.unitId !== where.unitId) return false;
                    return true;
                });
            },
            findFirst: async ({ where }: any) => {
                return store.batches.find(b => {
                    if (where.id && b.id !== where.id) return false;
                    if (where.productId && b.productId !== where.productId) return false;
                    if (where.batchNumber && b.batchNumber !== where.batchNumber) return false;
                    if (where.tenantId && b.tenantId !== where.tenantId) return false;
                    return true;
                }) || null;
            },
            updateMany: async ({ where, data }: any) => {
                const item = store.batches.find(b => b.id === where.id);
                if (!item) return { count: 0 };
                if (data.quantity !== undefined) {
                    item.quantity = data.quantity;
                }
                return { count: 1 };
            }
        },
        stockMovement: {
            findMany: async ({ where }: any) => {
                return store.movements.filter(m => {
                    if (where.tenantId && m.tenantId !== where.tenantId) return false;
                    if (where.unitId && m.unitId !== where.unitId) return false;
                    if (where.productId && m.productId !== where.productId) return false;
                    if (where.isDeleted !== undefined && m.isDeleted !== where.isDeleted) return false;
                    if (where.createdAt?.gte && new Date(m.createdAt) < new Date(where.createdAt.gte)) return false;
                    if (where.createdAt?.lte && new Date(m.createdAt) > new Date(where.createdAt.lte)) return false;
                    return true;
                });
            },
            create: async ({ data }: any) => {
                const item = {
                    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    ...data,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    isDeleted: false
                };
                store.movements.push(item);
                return item;
            }
        },
        supplierReturnItem: {
            findMany: async ({ where }: any) => {
                return store.supplierReturnItems.filter(i => {
                    if (where.tenantId && i.tenantId !== where.tenantId) return false;
                    if (where.unitCost?.gt !== undefined && !(i.unitCost > where.unitCost.gt)) return false;
                    return true;
                });
            }
        },
        physicalCount: {
            findMany: async ({ where, skip = 0, take = 20 }: any) => {
                const list = store.physicalCounts.filter(c => {
                    if (where.tenantId && c.tenantId !== where.tenantId) return false;
                    if (where.unitId && c.unitId !== where.unitId) return false;
                    if (where.status && c.status !== where.status) return false;
                    if (where.productId && c.productId !== where.productId) return false;
                    if (where.isDeleted !== undefined && c.isDeleted !== where.isDeleted) return false;
                    return true;
                });
                return list.slice(skip, skip + take).map(c => ({
                    ...c,
                    product: store.products.find(p => p.id === c.productId) || null,
                    batch: store.batches.find(b => b.id === c.batchId) || null
                }));
            },
            count: async ({ where }: any) => {
                return store.physicalCounts.filter(c => {
                    if (where.tenantId && c.tenantId !== where.tenantId) return false;
                    if (where.unitId && c.unitId !== where.unitId) return false;
                    if (where.status && c.status !== where.status) return false;
                    if (where.productId && c.productId !== where.productId) return false;
                    if (where.isDeleted !== undefined && c.isDeleted !== where.isDeleted) return false;
                    return true;
                }).length;
            },
            findFirst: async ({ where }: any) => {
                const c = store.physicalCounts.find(item => {
                    if (where.id && item.id !== where.id) return false;
                    if (where.tenantId && item.tenantId !== where.tenantId) return false;
                    if (where.isDeleted !== undefined && item.isDeleted !== where.isDeleted) return false;
                    return true;
                });
                if (!c) return null;
                return {
                    ...c,
                    product: store.products.find(p => p.id === c.productId) || null,
                    batch: store.batches.find(b => b.id === c.batchId) || null
                };
            },
            create: async ({ data }: any) => {
                const item = {
                    ...data,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    isDeleted: false
                };
                store.physicalCounts.push(item);
                return {
                    ...item,
                    product: store.products.find(p => p.id === item.productId) || null,
                    batch: store.batches.find(b => b.id === item.batchId) || null
                };
            },
            update: async ({ where, data }: any) => {
                const item = store.physicalCounts.find(c => c.id === where.id);
                if (!item) throw new Error("Physical count record not found");
                Object.assign(item, data);
                item.updatedAt = new Date();
                return {
                    ...item,
                    product: store.products.find(p => p.id === item.productId) || null,
                    batch: store.batches.find(b => b.id === item.batchId) || null
                };
            }
        },
        auditLog: {
            create: async ({ data }: any) => {
                if (options.failAuditLog) throw new Error("AuditLog failure injected");
                const item = { id: `audit-${Date.now()}`, ...data, createdAt: new Date() };
                store.auditLogs.push(item);
                return item;
            }
        },
        refCounter: {
            upsert: async ({ where }: any) => {
                const prefix = where.prefix_tenantId?.prefix || 'AUD';
                const tenantId = where.prefix_tenantId?.tenantId || 'tenant-1';
                let c = store.refCounters.find(rc => rc.prefix === prefix && rc.tenantId === tenantId);
                if (c) {
                    c.current += 1;
                } else {
                    c = { prefix, tenantId, current: 1 };
                    store.refCounters.push(c);
                }
                return c;
            }
        },
        $queryRaw: async (strings: any, ...values: any[]) => {
            const rawSql = Array.isArray(strings) ? strings.join('?') : String(strings || '');
            if (rawSql.includes('"Product"') || rawSql.includes('Product')) {
                const prodId = values[0];
                const prod = store.products.find(p => p.id === prodId);
                return prod ? [prod] : [];
            }
            return [];
        },
        $transaction: async (cb: any) => {
            const snapshot = JSON.stringify(store);
            try {
                return await cb(client);
            } catch (err) {
                const restored = JSON.parse(snapshot);
                Object.keys(store).forEach(k => {
                    (store as any)[k] = restored[k];
                });
                throw err;
            }
        }
    };

    return client;
}

async function runTests() {
    let passed = 0;
    let failed = 0;

    function assert(cond: boolean, msg: string) {
        if (cond) {
            console.log(`  ✓ PASS: ${msg}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${msg}`);
            failed++;
        }
    }

    console.log("===============================================================================");
    console.log("📊 InventoryApp D10 — Valuation, Consumption & Physical Audit Test Suite");
    console.log("===============================================================================\n");

    const scope = { tenantId: 'tenant-1', unitId: 'unit-1' };

    // -------------------------------------------------------------------------
    // SUITE 1: Valuation Arithmetic & Missing-Cost Exclusion
    // -------------------------------------------------------------------------
    console.log("--- 1. Stock Valuation Arithmetic & Missing-Cost Handling ---");
    {
        const store: MockStore = {
            products: [
                { id: 'p-1', code: 'MED-01', name: 'Paracetamol 500mg', category: 'Medical', unit: 'Strips', isBatchTracked: true, status: true, tenantId: 'tenant-1' },
                { id: 'p-2', code: 'MED-02', name: 'Amoxicillin 250mg', category: 'Medical', unit: 'Capsules', isBatchTracked: true, status: true, tenantId: 'tenant-1' },
                { id: 'p-3', code: 'GEN-01', name: 'Adult Diapers XL', category: 'Elder Care', unit: 'Packs', isBatchTracked: false, status: true, tenantId: 'tenant-1' }
            ],
            stocks: [
                { id: 's-1', productId: 'p-1', quantity: 100, tenantId: 'tenant-1', unitId: 'unit-1' },
                { id: 's-2', productId: 'p-2', quantity: 50, tenantId: 'tenant-1', unitId: 'unit-1' },
                { id: 's-3', productId: 'p-3', quantity: 20, tenantId: 'tenant-1', unitId: 'unit-1' }
            ],
            batches: [
                { id: 'b-1', productId: 'p-1', batchNumber: 'B101', quantity: 100, expiryDate: new Date('2027-01-01'), tenantId: 'tenant-1', unitId: 'unit-1' },
                { id: 'b-2', productId: 'p-2', batchNumber: 'B202', quantity: 50, expiryDate: new Date('2027-06-01'), tenantId: 'tenant-1', unitId: 'unit-1' }
            ],
            movements: [],
            supplierReturnItems: [
                // Only p-1 and p-3 have verified acquisition cost records
                { id: 'sri-1', productId: 'p-1', unitCost: 15.50, tenantId: 'tenant-1' },
                { id: 'sri-2', productId: 'p-3', unitCost: 450.00, tenantId: 'tenant-1' }
            ],
            physicalCounts: [],
            auditLogs: [],
            refCounters: []
        };

        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const report = await service.getStockValuation({}, scope);

        // Verification:
        // p-1: 100 * 15.50 = 1550.00
        // p-2: 50 * null = null (EXCLUDED from valuation sum)
        // p-3: 20 * 450.00 = 9000.00
        // Total expected valuation: 1550.00 + 9000.00 = 10550.00
        assert(report.summary.totalValuationAmount === 10550.00, `Total valuation is 10550.00 (got ${report.summary.totalValuationAmount})`);
        assert(report.summary.totalUnitsInStock === 170, `Total units in stock is 170 (got ${report.summary.totalUnitsInStock})`);
        assert(report.summary.totalItemsValued === 2, `Total items valued is 2`);
        assert(report.summary.totalItemsExcluded === 1, `Total items excluded due to missing cost is 1`);
        assert(report.summary.isFinancialStatement === false, `Flagged as operational valuation, not financial accounting statement`);
        assert(report.excludedProducts.length === 1 && report.excludedProducts[0].productId === 'p-2', `Excluded products explicitly identifies p-2 Amoxicillin`);
    }

    // -------------------------------------------------------------------------
    // SUITE 2: Batch vs. Aggregate Valuation (Zero Double-Counting)
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Batch vs. Aggregate Valuation Without Double-Counting ---");
    {
        const store: MockStore = {
            products: [
                { id: 'p-1', code: 'MED-01', name: 'Paracetamol', category: 'Medical', unit: 'Strips', isBatchTracked: true, status: true, tenantId: 'tenant-1' }
            ],
            stocks: [
                { id: 's-1', productId: 'p-1', quantity: 150, tenantId: 'tenant-1', unitId: 'unit-1' }
            ],
            batches: [
                { id: 'b-1', productId: 'p-1', batchNumber: 'B1', quantity: 100, expiryDate: new Date('2027-01-01'), tenantId: 'tenant-1', unitId: 'unit-1' },
                { id: 'b-2', productId: 'p-1', batchNumber: 'B2', quantity: 50, expiryDate: new Date('2027-06-01'), tenantId: 'tenant-1', unitId: 'unit-1' }
            ],
            movements: [],
            supplierReturnItems: [
                { id: 'sri-1', productId: 'p-1', unitCost: 10.00, tenantId: 'tenant-1' }
            ],
            physicalCounts: [],
            auditLogs: [],
            refCounters: []
        };

        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        // Aggregate view
        const aggReport = await service.getStockValuation({ view: 'aggregate' }, scope);
        assert(aggReport.items.length === 1, `Aggregate view returns exactly 1 row for product`);
        assert(aggReport.summary.totalValuationAmount === 1500.00, `Aggregate valuation is 150 * 10 = 1500.00`);

        // Batch view
        const batchReport = await service.getStockValuation({ view: 'batch' }, scope);
        assert(batchReport.items.length === 2, `Batch view breaks down into 2 batch rows`);
        assert(batchReport.summary.totalUnitsInStock === 150, `Batch view total stock remains 150 (not doubled to 300)`);
        assert(batchReport.summary.totalValuationAmount === 1500.00, `Batch valuation matches aggregate total 1500.00 exactly`);
    }

    // -------------------------------------------------------------------------
    // SUITE 3: Consumption Analytics & Movement Separation
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Consumption Analytics & Movement Type Separation ---");
    {
        const now = new Date();
        const store: MockStore = {
            products: [
                { id: 'p-1', code: 'MED-01', name: 'Insulin 100IU', category: 'Medical', unit: 'Vials', tenantId: 'tenant-1' },
                { id: 'p-2', code: 'KIT-01', name: 'Cooking Oil 5L', category: 'Kitchen', unit: 'Cans', tenantId: 'tenant-1' }
            ],
            stocks: [],
            batches: [],
            movements: [
                // True consumption 1: clinical issue
                { id: 'm-1', productId: 'p-1', movementType: 'ISSUE', quantity: -10, createdAt: now, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false },
                // True consumption 2: kitchen requisition
                { id: 'm-2', productId: 'p-2', movementType: 'KITCHEN_REQUISITION', quantity: -4, createdAt: now, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false },
                // Excluded 1: Supplier return (vendor return, NOT consumption)
                { id: 'm-3', productId: 'p-1', movementType: 'SUPPLIER_RETURN', quantity: -5, createdAt: now, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false },
                // Excluded 2: Audit adjustment
                { id: 'm-4', productId: 'p-1', movementType: 'ADJUSTMENT', quantity: -2, createdAt: now, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false },
                // Excluded 3: Wastage write-off
                { id: 'm-5', productId: 'p-1', movementType: 'DISCARD', quantity: -1, createdAt: now, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false },
                // Inbound receipt
                { id: 'm-6', productId: 'p-1', movementType: 'GRN', quantity: 50, createdAt: now, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }
            ],
            supplierReturnItems: [],
            physicalCounts: [],
            auditLogs: [],
            refCounters: []
        };

        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const analytics = await service.getConsumptionAnalytics({}, scope);

        // Expected consumption:
        // ISSUE (-10) + KITCHEN_REQUISITION (-4) = 14 total consumed
        assert(analytics.summary.totalConsumedQuantity === 14, `Total consumption is 14 (got ${analytics.summary.totalConsumedQuantity})`);
        assert(analytics.summary.totalIssueMovements === 2, `Total issue transactions is 2`);
        assert(analytics.summary.distinctProductsConsumed === 2, `Distinct products consumed is 2`);

        // Verify exclusions are tracked accurately
        assert(analytics.excludedBreakdown.supplierReturnsQty === 5, `Supplier returns excluded: 5 units`);
        assert(analytics.excludedBreakdown.adjustmentNetQty === -2, `Adjustments excluded: -2 units`);
        assert(analytics.excludedBreakdown.wasteDiscardQty === 1, `Waste discard excluded: 1 unit`);
        assert(analytics.excludedBreakdown.receiptInflowQty === 50, `Receipt inflow tracked: 50 units`);

        // Verify top products
        assert(analytics.topConsumedProducts.length === 2, `Top consumed products has 2 items`);
        assert(analytics.topConsumedProducts[0].productId === 'p-1' && analytics.topConsumedProducts[0].consumedQuantity === 10, `Top product is Insulin with 10 units`);
        assert(analytics.topConsumedProducts[1].productId === 'p-2' && analytics.topConsumedProducts[1].consumedQuantity === 4, `Second product is Cooking Oil with 4 units`);
    }

    // -------------------------------------------------------------------------
    // SUITE 4: Physical Stock Audit Workflow & Variance Calculation
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Physical Stock Audit Workflow & Variance Calculation ---");
    {
        const store: MockStore = {
            products: [
                { id: 'p-1', code: 'ELD-01', name: 'Bandages 10cm', category: 'Elder Care', unit: 'Rolls', isBatchTracked: false, tenantId: 'tenant-1' }
            ],
            stocks: [
                { id: 's-1', productId: 'p-1', quantity: 100, tenantId: 'tenant-1', unitId: 'unit-1' }
            ],
            batches: [],
            movements: [],
            supplierReturnItems: [],
            physicalCounts: [],
            auditLogs: [],
            refCounters: [{ id: 'rc-1', prefix: 'AUD', tenantId: 'tenant-1', current: 0 }]
        };

        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        // 1. Create audit count
        const audit = await service.createPhysicalAudit({
            productId: 'p-1',
            notes: 'Q4 Annual Stocktake'
        }, scope, { id: 'u-1', name: 'Nurse Joy' });

        assert(Boolean(audit.id), `Audit initiated with ID ${audit.id}`);
        assert(audit.auditNumber === 'AUD-000001', `Generated sequence AUD-000001`);
        assert(audit.systemQuantityAtCount === 100, `Snapshot system quantity captured as 100`);
        assert(audit.status === 'DRAFT', `Initial audit status is DRAFT`);

        // 2. Submit physical count with variance
        // Physical count is 95 -> Variance: 95 - 100 = -5 (5 missing)
        const updated = await service.submitPhysicalAuditCount(audit.id, {
            physicalQuantity: 95,
            reason: 'Found 5 water damaged rolls discarded without log'
        }, scope, { id: 'u-1', name: 'Nurse Joy' });

        assert(updated.status === 'COUNTED', `Status updated to COUNTED`);
        assert(updated.physicalQuantity === 95, `Physical count recorded as 95`);
        assert(updated.variance === -5, `Variance calculated as -5`);
        assert(updated.reason?.includes('water damaged'), `Reason recorded`);

        // 3. Reconcile audit and post variance
        const reconciled = await service.reconcilePhysicalAudit(audit.id, {
            notes: 'Approved write-off of water damaged bandages'
        }, scope, { id: 'u-admin', name: 'Inventory Manager' });

        assert(reconciled.audit.status === 'RECONCILED', `Audit status transitioned to RECONCILED`);
        assert(reconciled.liveAdjustment === -5, `Live adjustment delta is -5`);
        assert(reconciled.newBalance === 95, `New balance is 95`);

        // Check live stock was updated
        const stockAfter = store.stocks.find(s => s.id === 's-1');
        assert(stockAfter.quantity === 95, `Live stock updated from 100 to 95`);

        // Check StockMovement created
        assert(store.movements.length === 1, `Exactly 1 StockMovement created`);
        assert(store.movements[0].movementType === 'ADJUSTMENT', `Movement type is ADJUSTMENT`);
        assert(store.movements[0].quantity === -5, `Movement quantity is -5`);
        assert(store.movements[0].balanceAfter === 95, `Movement balanceAfter is 95`);
        assert(store.movements[0].referenceType === 'PHYSICAL_AUDIT', `Reference type is PHYSICAL_AUDIT`);
        assert(store.movements[0].referenceId === audit.id, `Reference ID points to audit`);
    }

    // -------------------------------------------------------------------------
    // SUITE 5: Reconciliation Concurrency & Stale-Count Handling
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Reconciliation Concurrency & Stale-Count Handling ---");
    {
        const store: MockStore = {
            products: [
                { id: 'p-1', code: 'ELD-01', name: 'Bath Towels', category: 'Elder Care', unit: 'Pcs', isBatchTracked: false, tenantId: 'tenant-1' }
            ],
            stocks: [
                { id: 's-1', productId: 'p-1', quantity: 100, tenantId: 'tenant-1', unitId: 'unit-1' }
            ],
            batches: [],
            movements: [],
            supplierReturnItems: [],
            physicalCounts: [],
            auditLogs: [],
            refCounters: [{ id: 'rc-1', prefix: 'AUD', tenantId: 'tenant-1', current: 0 }]
        };

        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        // 1. Audit created when stock is 100
        const audit = await service.createPhysicalAudit({
            productId: 'p-1',
            physicalQuantity: 90, // counted 90
            reason: 'Counted 90 on shelf'
        }, scope, { id: 'u-1', name: 'Auditor' });

        // 2. CONCURRENT MOVEMENT occurs before reconciliation!
        // Suppose another staff issued 8 units in between, so live stock is now 92:
        store.stocks[0].quantity = 92;

        // 3. Reconcile is triggered now
        // Physical count is 90. Current live stock is 92.
        // The delta needed to align with physical reality is: 90 - 92 = -2 (NOT -10!)
        const reconciled = await service.reconcilePhysicalAudit(audit.id, {}, scope, { id: 'u-admin', name: 'Manager' });

        assert(reconciled.liveAdjustment === -2, `Live adjustment dynamically adjusted for concurrent drift (-2, not stale -10)`);
        assert(store.stocks[0].quantity === 90, `Stock balance is aligned with physical count (90)`);

        // 4. Duplicate reconciliation attempt must throw error
        let dupBlocked = false;
        try {
            await service.reconcilePhysicalAudit(audit.id, {}, scope, { id: 'u-admin', name: 'Manager' });
        } catch (err: any) {
            dupBlocked = true;
            assert(err.message.includes('already been reconciled'), `Duplicate reconciliation blocked with clear error: "${err.message}"`);
        }
        assert(dupBlocked, `Second reconciliation threw exception`);
    }

    // -------------------------------------------------------------------------
    // SUITE 6: Transaction Rollback on Reconciliation Failure
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Transaction Rollback on Reconciliation Failure ---");
    {
        const store: MockStore = {
            products: [
                { id: 'p-1', code: 'ELD-01', name: 'Bath Towels', category: 'Elder Care', unit: 'Pcs', isBatchTracked: false, tenantId: 'tenant-1' }
            ],
            stocks: [
                { id: 's-1', productId: 'p-1', quantity: 50, tenantId: 'tenant-1', unitId: 'unit-1' }
            ],
            batches: [],
            movements: [],
            supplierReturnItems: [],
            physicalCounts: [],
            auditLogs: [],
            refCounters: [{ id: 'rc-1', prefix: 'AUD', tenantId: 'tenant-1', current: 0 }]
        };

        // Create audit first
        const normalService = new InventoryService();
        (normalService as any).db = createMockPrisma(store);
        const audit = await normalService.createPhysicalAudit({
            productId: 'p-1',
            physicalQuantity: 40,
            reason: 'Damaged bottles'
        }, scope, { id: 'u-1', name: 'Auditor' });

        // Now inject fault during reconciliation auditLog
        const faultPrisma = createMockPrisma(store, { failAuditLog: true });
        const faultService = new InventoryService();
        (faultService as any).db = faultPrisma;

        let rollbackSucceeded = false;
        try {
            await faultService.reconcilePhysicalAudit(audit.id, {}, scope, { id: 'u-1', name: 'Auditor' });
        } catch (err: any) {
            rollbackSucceeded = true;
            assert(err.message.includes('AuditLog failure injected'), `Caught injected fault during reconciliation: "${err.message}"`);
        }
        assert(rollbackSucceeded, `Transaction threw error on failure`);

        // Verify stock was restored to 50
        assert(store.stocks[0].quantity === 50, `Live stock rolled back to 50`);
        assert(store.movements.length === 0, `Zero orphaned stock movements left after rollback`);
        assert(store.physicalCounts[0].status === 'COUNTED', `Audit status rolled back to COUNTED (not RECONCILED)`);
    }

    console.log("\n===============================================================================");
    console.log(` Summary: ${passed} passed, ${failed} failed across 6 test suites.`);
    console.log("===============================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Fatal test runner error:", err);
    process.exit(1);
});
