import { InventoryService } from '../modules/inventory/service.js';

interface MockStore {
    products: any[];
    stocks: any[];
    batches: any[];
    movements: any[];
    auditLogs: any[];
    issueRequests: any[];
    purchases: any[];
}

function createMockPrisma(store: MockStore) {
    return {
        productBatch: {
            findMany: async ({ where, include, orderBy }: any) => {
                let results = store.batches.filter((b) => {
                    // Tenant filter
                    if (where.tenantId && b.tenantId !== where.tenantId) return false;
                    // Unit filter
                    if (where.unitId && b.unitId !== where.unitId) return false;
                    // Product filter
                    if (where.productId && b.productId !== where.productId) return false;
                    // Quantity filter
                    if (where.quantity?.gt !== undefined && !(b.quantity > where.quantity.gt)) {
                        return false;
                    }
                    // Expiry date filters
                    if (where.expiryDate) {
                        const bExp = b.expiryDate ? new Date(b.expiryDate).getTime() : null;
                        if (bExp === null || isNaN(bExp)) return false;

                        if (where.expiryDate.lt !== undefined) {
                            const target = new Date(where.expiryDate.lt).getTime();
                            if (!(bExp < target)) return false;
                        }
                        if (where.expiryDate.lte !== undefined) {
                            const target = new Date(where.expiryDate.lte).getTime();
                            if (!(bExp <= target)) return false;
                        }
                        if (where.expiryDate.gte !== undefined) {
                            const target = new Date(where.expiryDate.gte).getTime();
                            if (!(bExp >= target)) return false;
                        }
                    }
                    return true;
                });

                // Include relation
                if (include?.product) {
                    results = results.map((b) => {
                        const prod = store.products.find((p) => p.id === b.productId);
                        return {
                            ...b,
                            product: prod || null
                        };
                    });
                }

                // Order by
                if (orderBy?.expiryDate === 'asc') {
                    results.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
                }

                return results;
            }
        }
    };
}

async function runTests() {
    console.log('========================================================================');
    console.log('🚀 InventoryApp D7.4 — Near-Expiry Batch Alerts Test Suite');
    console.log('========================================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, name: string) {
        if (condition) {
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } else {
            console.error(`  ❌ [FAIL] ${name}`);
            failed++;
        }
    }

    const tenantA = 'tenant-d7-4-test';
    const unit1 = 'unit-1';
    const unit2 = 'unit-2';

    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;

    // Helper dates
    const expiredPastDate = new Date(now.getTime() - 10 * msInDay); // 10 days ago
    const expiringTodayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0); // Today noon
    const expiringIn10DaysDate = new Date(now.getTime() + 10 * msInDay); // 10 days ahead
    const expiringIn25DaysDate = new Date(now.getTime() + 25 * msInDay); // 25 days ahead
    const healthyFarFutureDate = new Date(now.getTime() + 90 * msInDay); // 90 days ahead

    // -------------------------------------------------------------------------
    // TEST 1: Expired batch with positive stock identified as EXPIRED
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Expired batch with positive stock ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-1', name: 'Amoxicillin 250mg', code: 'AMX-250', category: 'Antibiotic' }],
            stocks: [{ productId: 'prod-1', quantity: 20, tenantId: tenantA, unitId: unit1 }],
            batches: [
                {
                    id: 'b-expired',
                    productId: 'prod-1',
                    batchNumber: 'EXP-001',
                    expiryDate: expiredPastDate.toISOString(),
                    quantity: 20,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        const res = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL' });

        assert(res.alerts.length === 1, 'Returns expired batch in alerts list');
        assert(res.alerts[0].status === 'EXPIRED', 'Status classified as EXPIRED');
        assert(res.alerts[0].daysRemaining < 0, 'Days remaining is negative for past expiry');
        assert(res.alerts[0].isExpiringToday === false, 'isExpiringToday is false for past expiry');
        assert(res.summary.expiredCount === 1, 'Summary telemetry records 1 expired batch');
        assert(res.summary.totalQuantityAtRisk === 20, 'Summary records 20 units at risk');
    }

    // -------------------------------------------------------------------------
    // TEST 2: Batch expiring today boundary behavior
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Batch expiring today boundary evaluation ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-today', name: 'Insulin Glargine', code: 'INS-01', category: 'Diabetes' }],
            stocks: [{ productId: 'prod-today', quantity: 8, tenantId: tenantA, unitId: unit1 }],
            batches: [
                {
                    id: 'b-today',
                    productId: 'prod-today',
                    batchNumber: 'TODAY-01',
                    expiryDate: expiringTodayDate.toISOString(),
                    quantity: 8,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        const res = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL' });

        assert(res.alerts.length === 1, 'Returns batch expiring today');
        assert(res.alerts[0].isExpiringToday === true, 'Boundary rule sets isExpiringToday to true');
        assert(res.summary.expiringTodayCount === 1, 'Summary telemetry captures expiringTodayCount = 1');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Batch within alert window identified as EXPIRING_SOON
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Batch within alert window ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-near', name: 'Cough Syrup', code: 'CS-100', category: 'Respiratory' }],
            stocks: [{ productId: 'prod-near', quantity: 15, tenantId: tenantA, unitId: unit1 }],
            batches: [
                {
                    id: 'b-near',
                    productId: 'prod-near',
                    batchNumber: 'NEAR-01',
                    expiryDate: expiringIn10DaysDate.toISOString(),
                    quantity: 15,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        const res = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL' });

        assert(res.alerts.length === 1, 'Batch expiring in 10 days included');
        assert(res.alerts[0].status === 'EXPIRING_SOON', 'Status is EXPIRING_SOON');
        assert(res.alerts[0].daysRemaining >= 9 && res.alerts[0].daysRemaining <= 11, 'Days remaining calculated accurately');
        assert(res.summary.expiringSoonCount === 1, 'Summary expiringSoonCount = 1');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Batch outside alert window excluded
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Batch outside alert window excluded ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-far', name: 'Vitamin D3', code: 'VIT-D', category: 'Supplements' }],
            stocks: [{ productId: 'prod-far', quantity: 50, tenantId: tenantA, unitId: unit1 }],
            batches: [
                {
                    id: 'b-far',
                    productId: 'prod-far',
                    batchNumber: 'FAR-01',
                    expiryDate: healthyFarFutureDate.toISOString(), // 90 days out
                    quantity: 50,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        // 30 days ahead window
        const res = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL' });

        assert(res.alerts.length === 0, 'Batch expiring in 90 days excluded from 30-day alert window');
        assert(res.summary.totalAlerts === 0, 'Total alerts is 0');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Depleted batch with zero quantity strictly excluded
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Depleted batches excluded ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-depleted', name: 'Saline 500ml', code: 'SAL-500', category: 'Fluids' }],
            stocks: [{ productId: 'prod-depleted', quantity: 0, tenantId: tenantA, unitId: unit1 }],
            batches: [
                {
                    id: 'b-depleted',
                    productId: 'prod-depleted',
                    batchNumber: 'DEP-01',
                    expiryDate: expiredPastDate.toISOString(), // Expired, but 0 stock!
                    quantity: 0,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        const res = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL' });

        assert(res.alerts.length === 0, 'Depleted batch with quantity 0 excluded from actionable alerts');
        assert(res.summary.totalQuantityAtRisk === 0, 'Zero units reported at risk');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Null / invalid expiry date handled safely
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Null / invalid expiry date resilience ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-null', name: 'Cotton Gauze', code: 'COT-01', category: 'Consumables' }],
            stocks: [{ productId: 'prod-null', quantity: 10, tenantId: tenantA, unitId: unit1 }],
            batches: [
                {
                    id: 'b-null',
                    productId: 'prod-null',
                    batchNumber: 'NULL-01',
                    expiryDate: null,
                    quantity: 10,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        let threw = false;
        let res: any = null;
        try {
            res = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL' });
        } catch {
            threw = true;
        }

        assert(!threw, 'Did not throw on null expiryDate');
        assert(res.alerts.length === 0, 'Null expiry batch filtered out gracefully without crash');
    }

    // -------------------------------------------------------------------------
    // TEST 7: Tenant and Unit isolation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Tenant and Unit isolation ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-iso', name: 'Item Isolated', code: 'ISO-01', category: 'General' }],
            stocks: [],
            batches: [
                {
                    id: 'b-tenant-other',
                    productId: 'prod-iso',
                    batchNumber: 'OTHER-TENANT',
                    expiryDate: expiredPastDate.toISOString(),
                    quantity: 10,
                    tenantId: 'other-tenant',
                    unitId: unit1
                },
                {
                    id: 'b-unit-other',
                    productId: 'prod-iso',
                    batchNumber: 'OTHER-UNIT',
                    expiryDate: expiredPastDate.toISOString(),
                    quantity: 10,
                    tenantId: tenantA,
                    unitId: unit2 // Unit 2
                },
                {
                    id: 'b-unit-matching',
                    productId: 'prod-iso',
                    batchNumber: 'MATCHING-UNIT',
                    expiryDate: expiredPastDate.toISOString(),
                    quantity: 10,
                    tenantId: tenantA,
                    unitId: unit1 // Unit 1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        const res = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL' });

        assert(res.alerts.length === 1, 'Only exactly matching tenant and unit returned');
        assert(res.alerts[0].batchNumber === 'MATCHING-UNIT', 'Cross-tenant and cross-unit batches excluded');
    }

    // -------------------------------------------------------------------------
    // TEST 8: Custom daysAhead window
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Custom daysAhead alert window ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-window', name: 'Test Window', code: 'TW-01', category: 'General' }],
            stocks: [],
            batches: [
                {
                    id: 'b-10',
                    productId: 'prod-window',
                    batchNumber: 'BATCH-10D',
                    expiryDate: expiringIn10DaysDate.toISOString(),
                    quantity: 5,
                    tenantId: tenantA,
                    unitId: unit1
                },
                {
                    id: 'b-25',
                    productId: 'prod-window',
                    batchNumber: 'BATCH-25D',
                    expiryDate: expiringIn25DaysDate.toISOString(),
                    quantity: 5,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        // 15 days window -> only BATCH-10D should match
        const res15 = await service.getExpiryAlerts(scope, { daysAhead: 15, status: 'ALL' });
        assert(res15.alerts.length === 1 && res15.alerts[0].batchNumber === 'BATCH-10D', '15-day window includes only batch within 15 days');

        // 30 days window -> both batches should match
        const res30 = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL' });
        assert(res30.alerts.length === 2, '30-day window includes both batches');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Status filtering (EXPIRED only vs EXPIRING_SOON only)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Status filtering ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-mix', name: 'Mixed Item', code: 'MIX-01', category: 'General' }],
            stocks: [],
            batches: [
                {
                    id: 'b-exp',
                    productId: 'prod-mix',
                    batchNumber: 'B-EXP',
                    expiryDate: expiredPastDate.toISOString(),
                    quantity: 12,
                    tenantId: tenantA,
                    unitId: unit1
                },
                {
                    id: 'b-soon',
                    productId: 'prod-mix',
                    batchNumber: 'B-SOON',
                    expiryDate: expiringIn10DaysDate.toISOString(),
                    quantity: 18,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        const expiredOnly = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'EXPIRED' });
        assert(expiredOnly.alerts.length === 1 && expiredOnly.alerts[0].status === 'EXPIRED', 'EXPIRED filter returns only expired batches');

        const soonOnly = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'EXPIRING_SOON' });
        assert(soonOnly.alerts.length === 1 && soonOnly.alerts[0].status === 'EXPIRING_SOON', 'EXPIRING_SOON filter returns only near-expiry batches');
    }

    // -------------------------------------------------------------------------
    // TEST 10: Product filtering by productId
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Product filtering ---');
    {
        const store: MockStore = {
            products: [
                { id: 'prod-A', name: 'Product A', code: 'PA-01', category: 'General' },
                { id: 'prod-B', name: 'Product B', code: 'PB-01', category: 'General' }
            ],
            stocks: [],
            batches: [
                {
                    id: 'b-A',
                    productId: 'prod-A',
                    batchNumber: 'BATCH-A',
                    expiryDate: expiredPastDate.toISOString(),
                    quantity: 10,
                    tenantId: tenantA,
                    unitId: unit1
                },
                {
                    id: 'b-B',
                    productId: 'prod-B',
                    batchNumber: 'BATCH-B',
                    expiryDate: expiredPastDate.toISOString(),
                    quantity: 10,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        const resProdA = await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL', productId: 'prod-A' });
        assert(resProdA.alerts.length === 1 && resProdA.alerts[0].productId === 'prod-A', 'productId filter isolates specific product');
    }

    // -------------------------------------------------------------------------
    // TEST 11: Zero mutation guarantee
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: Zero mutation guarantee ---');
    {
        const initialBatchQty = 33;
        const store: MockStore = {
            products: [{ id: 'prod-nomut', name: 'Untouched Product', code: 'UP-01', category: 'General' }],
            stocks: [{ productId: 'prod-nomut', quantity: initialBatchQty, tenantId: tenantA, unitId: unit1 }],
            batches: [
                {
                    id: 'b-nomut',
                    productId: 'prod-nomut',
                    batchNumber: 'NOMUT-01',
                    expiryDate: expiredPastDate.toISOString(),
                    quantity: initialBatchQty,
                    tenantId: tenantA,
                    unitId: unit1
                }
            ],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };

        const service = new InventoryService(createMockPrisma(store) as any);
        const scope = { tenantId: tenantA, unitId: unit1 };

        await service.getExpiryAlerts(scope, { daysAhead: 30, status: 'ALL' });

        assert(store.batches[0].quantity === initialBatchQty, 'Batch quantity remains completely unmodified');
        assert(store.stocks[0].quantity === initialBatchQty, 'Aggregate stock quantity remains completely unmodified');
        assert(store.movements.length === 0, 'Zero stock movements created during alert calculation');
        assert(store.auditLogs.length === 0, 'Zero audit logs created during read-only operation');
    }

    console.log('\n========================================================================');
    console.log(`🏁 Verification Results: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
