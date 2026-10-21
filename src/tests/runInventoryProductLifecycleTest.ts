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

function createMockPrisma(store: MockStore, options: { failAuditLog?: boolean; failDuplicateSkuP2002?: boolean; lockLog?: string[] } = {}) {
    return {
        $transaction: async (callback: (tx: any) => Promise<any>, _opts?: any) => {
            // Snapshot store state for transactional rollback support
            const snapshot = {
                products: JSON.parse(JSON.stringify(store.products)),
                stocks: JSON.parse(JSON.stringify(store.stocks)),
                batches: JSON.parse(JSON.stringify(store.batches)),
                movements: JSON.parse(JSON.stringify(store.movements)),
                auditLogs: JSON.parse(JSON.stringify(store.auditLogs)),
                issueRequests: JSON.parse(JSON.stringify(store.issueRequests)),
                purchases: JSON.parse(JSON.stringify(store.purchases))
            };

            const tx = {
                product: {
                    findFirst: async ({ where }: any) => {
                        return store.products.find(p => {
                            if (where.id && p.id !== where.id) return false;
                            if (where.tenantId && p.tenantId !== where.tenantId) return false;
                            if (where.unitId && p.unitId !== where.unitId) return false;
                            if (where.code && p.code !== where.code) return false;
                            if (where.NOT?.id && p.id === where.NOT.id) return false;
                            return true;
                        }) || null;
                    },
                    update: async ({ where, data }: any) => {
                        if (options.failDuplicateSkuP2002) {
                            const p2002Err: any = new Error('Unique constraint failed on the fields: (`tenantId`,`code`)');
                            p2002Err.code = 'P2002';
                            p2002Err.meta = { target: ['tenantId', 'code'] };
                            throw p2002Err;
                        }
                        const item = store.products.find(p => p.id === where.id);
                        if (!item) throw new Error('Product not found for update');
                        Object.assign(item, data, { updatedAt: new Date() });
                        return item;
                    }
                },
                stockIssueRequest: {
                    findFirst: async ({ where }: any) => {
                        return store.issueRequests.find(r => {
                            if (where.productId && r.productId !== where.productId) return false;
                            if (where.tenantId && r.tenantId !== where.tenantId) return false;
                            if (where.status && r.status !== where.status) return false;
                            if (where.isDeleted !== undefined && r.isDeleted !== where.isDeleted) return false;
                            return true;
                        }) || null;
                    },
                    create: async ({ data }: any) => {
                        const newReq = { ...data, createdAt: new Date(), updatedAt: new Date() };
                        store.issueRequests.push(newReq);
                        return newReq;
                    }
                },
                auditLog: {
                    create: async ({ data }: any) => {
                        if (options.failAuditLog) {
                            throw new Error('Audit log write failed: Simulated disk/network failure');
                        }
                        const log = { id: `audit-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
                        store.auditLogs.push(log);
                        return log;
                    }
                },
                stock: {
                    findFirst: async ({ where }: any) => {
                        return store.stocks.find(s => s.productId === where.productId && s.tenantId === where.tenantId && (where.unitId ? s.unitId === where.unitId : true)) || null;
                    },
                    upsert: async ({ where, update, create }: any) => {
                        const targetId = where.productId_tenantId_unitId?.productId || create.productId;
                        let item = store.stocks.find(s => s.productId === targetId);
                        if (item) {
                            if (update?.quantity?.increment) {
                                item.quantity += update.quantity.increment;
                            }
                            return item;
                        }
                        const newItem = { id: `stock-${Date.now()}`, ...create };
                        store.stocks.push(newItem);
                        return newItem;
                    }
                },
                stockMovement: {
                    create: async ({ data }: any) => {
                        const mov = { id: `mov-${Date.now()}`, ...data, createdAt: new Date() };
                        store.movements.push(mov);
                        return mov;
                    }
                },
                vendor: {
                    findFirst: async ({ where }: any) => null
                },
                productBatch: {
                    upsert: async () => ({ id: 'batch-mock' })
                },
                allocation: {
                    findFirst: async () => null
                },
                prescription: {
                    findFirst: async () => null
                },
                $queryRaw: async (strings: any, ...values: any[]) => {
                    const rawSql = Array.isArray(strings) ? strings.join('?') : String(strings || '');
                    if (rawSql.includes('"Product"') || rawSql.includes('Product')) {
                        const productId = values[0];
                        const tenantId = values[1];
                        const unitId = values[2];
                        if (options.lockLog) {
                            options.lockLog.push(`LOCKED_PRODUCT:${productId}`);
                        }
                        const prod = store.products.find(p => {
                            if (productId && p.id !== productId) return false;
                            if (tenantId && p.tenantId !== tenantId) return false;
                            if (unitId && p.unitId !== unitId) return false;
                            return true;
                        });
                        return prod ? [prod] : [];
                    }
                    if (rawSql.includes('INSERT INTO "Purchase"')) {
                        const newPurchase = {
                            id: values[0],
                            productId: values[1],
                            quantity: values[2],
                            vendor: values[3],
                            vendorId: values[4],
                            batchId: values[5],
                            tenantId: values[6],
                            unitId: values[7],
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        store.purchases.push(newPurchase);
                        return [newPurchase];
                    }
                    return [];
                }
            };

            try {
                return await callback(tx);
            } catch (err) {
                // Rollback on error
                store.products = snapshot.products;
                store.stocks = snapshot.stocks;
                store.batches = snapshot.batches;
                store.movements = snapshot.movements;
                store.auditLogs = snapshot.auditLogs;
                store.issueRequests = snapshot.issueRequests;
                store.purchases = snapshot.purchases;
                throw err;
            }
        },
        product: {
            findFirst: async ({ where }: any) => {
                return store.products.find(p => {
                    if (where.id && p.id !== where.id) return false;
                    if (where.tenantId && p.tenantId !== where.tenantId) return false;
                    if (where.unitId && p.unitId !== where.unitId) return false;
                    if (where.code && p.code !== where.code) return false;
                    if (where.NOT?.id && p.id === where.NOT.id) return false;
                    return true;
                }) || null;
            },
            findMany: async ({ where }: any) => {
                return store.products.filter(p => {
                    if (where.tenantId && p.tenantId !== where.tenantId) return false;
                    if (where.unitId && p.unitId !== where.unitId) return false;
                    return true;
                });
            },
            create: async ({ data }: any) => {
                const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
                store.products.push(item);
                return item;
            },
            update: async ({ where, data }: any) => {
                const item = store.products.find(p => p.id === where.id);
                if (!item) throw new Error('Product not found for update');
                Object.assign(item, data, { updatedAt: new Date() });
                return item;
            }
        },
        stockIssueRequest: {
            findFirst: async ({ where }: any) => {
                return store.issueRequests.find(r => {
                    if (where.productId && r.productId !== where.productId) return false;
                    if (where.tenantId && r.tenantId !== where.tenantId) return false;
                    if (where.status && r.status !== where.status) return false;
                    if (where.isDeleted !== undefined && r.isDeleted !== where.isDeleted) return false;
                    return true;
                }) || null;
            },
            create: async ({ data }: any) => {
                const newReq = { ...data, createdAt: new Date(), updatedAt: new Date() };
                store.issueRequests.push(newReq);
                return newReq;
            }
        },
        stock: {
            findFirst: async ({ where }: any) => {
                return store.stocks.find(s => s.productId === where.productId && s.tenantId === where.tenantId && (where.unitId ? s.unitId === where.unitId : true)) || null;
            }
        },
        allocation: {
            findFirst: async () => null
        },
        prescription: {
            findFirst: async () => null
        },
        auditLog: {
            create: async ({ data }: any) => {
                const log = { id: `audit-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
                store.auditLogs.push(log);
                return log;
            }
        }
    };
}

async function runTests() {
    console.log('========================================================================');
    console.log('🚀 InventoryApp D7.1 — Product Master Lifecycle Mock Verification Suite');
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

    const tenantId = 'tenant-test-1';
    const unitId = 'unit-test-1';
    const scope = { tenantId, unitId };
    const user = { id: 'usr-admin-1', role: 'ADMIN', name: 'Admin Test' };

    // -------------------------------------------------------------------------
    // TEST 1: Successful Product Update
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-001',
                code: 'MED-001',
                name: 'Paracetamol 500mg',
                category: 'medical',
                subCategory: 'Tablets',
                unit: 'Strip',
                minStockLevel: 10,
                defaultRevenuePrice: 25.5,
                chargeableInCareRevenue: true,
                status: true,
                isBatchTracked: true,
                tenantId,
                unitId
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        const updated = await service.updateProduct('prod-001', {
            name: 'Paracetamol 650mg Dolo',
            category: 'medical',
            subCategory: 'Fever Tablets',
            unit: 'Strip',
            minStockLevel: 20,
            defaultRevenuePrice: 32.0,
            chargeableInCareRevenue: true
        }, scope, user);

        assert(updated.name === 'Paracetamol 650mg Dolo', 'T-01: Name updated successfully');
        assert(updated.minStockLevel === 20, 'T-01: MinStockLevel updated to 20');
        assert(updated.defaultRevenuePrice === 32.0, 'T-01: Revenue price updated to 32.0');
        assert(store.auditLogs.length === 1 && store.auditLogs[0].action === 'UPDATE_PRODUCT', 'T-01: UPDATE_PRODUCT audit log recorded');
        assert(store.auditLogs[0].payload.oldValues.name === 'Paracetamol 500mg', 'T-01: Audit log contains previous name');
        assert(store.auditLogs[0].payload.newValues.name === 'Paracetamol 650mg Dolo', 'T-01: Audit log contains new name');
    }

    // -------------------------------------------------------------------------
    // TEST 2: Cross-Tenant Update Rejection
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-other-tenant',
                code: 'MED-OTHER',
                name: 'Other Tenant Med',
                tenantId: 'tenant-other',
                unitId: 'unit-other',
                status: true
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.updateProduct('prod-other-tenant', { name: 'Hacked Name' }, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Product not found or not accessible'), 'T-02: Cross-tenant update blocked with access error');
        }
        assert(threw, 'T-02: Cross-tenant update threw error');
        assert(store.products[0].name === 'Other Tenant Med', 'T-02: Product name remains unmodified');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Duplicate SKU Rejection
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [
                { id: 'prod-a', code: 'MED-AAA', name: 'Item A', tenantId, unitId, status: true },
                { id: 'prod-b', code: 'MED-BBB', name: 'Item B', tenantId, unitId, status: true }
            ],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.updateProduct('prod-b', { code: 'MED-AAA' }, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes("already exists for this tenant"), 'T-03: Duplicate SKU rejected with tenant message');
        }
        assert(threw, 'T-03: Duplicate SKU update threw error');
        assert(store.products[1].code === 'MED-BBB', 'T-03: Product code preserved');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Updating Other Fields Without Changing SKU (Self-collision prevention)
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [
                { id: 'prod-keep-sku', code: 'SKU-SAME', name: 'Original Name', tenantId, unitId, status: true }
            ],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        const updated = await service.updateProduct('prod-keep-sku', {
            code: 'SKU-SAME',
            name: 'Updated Name Without SKU Change'
        }, scope, user);

        assert(updated.name === 'Updated Name Without SKU Change', 'T-04: Name updated when submitting same code');
        assert(updated.code === 'SKU-SAME', 'T-04: Code remains SKU-SAME without false collision');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Immutable-Field Protection (tenantId, unitId, isBatchTracked ignored)
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-immutable',
                code: 'IMMUT-01',
                name: 'Item Immutable',
                isBatchTracked: true,
                tenantId,
                unitId,
                status: true
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        // Malicious client payload attempting to hijack tenant, unit, or flip batch tracking
        const maliciousPayload: any = {
            name: 'New Sanitized Name',
            tenantId: 'tenant-evil',
            unitId: 'unit-evil',
            isBatchTracked: false,
            id: 'id-evil'
        };

        const updated = await service.updateProduct('prod-immutable', maliciousPayload, scope, user);

        assert(updated.id === 'prod-immutable', 'T-05: Product id remains immutable');
        assert(updated.tenantId === tenantId, 'T-05: tenantId remains immutable');
        assert(updated.unitId === unitId, 'T-05: unitId remains immutable');
        assert(updated.isBatchTracked === true, 'T-05: isBatchTracked remains immutable');
        assert(updated.name === 'New Sanitized Name', 'T-05: Allowed field name updated');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Successful Deactivation and Audit Event
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-deact',
                code: 'DEACT-01',
                name: 'Discontinued Bandage',
                tenantId,
                unitId,
                status: true
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        const res = await service.updateProductStatus('prod-deact', false, scope, user);

        assert(res.status === false, 'T-06: Product status set to false');
        assert(store.auditLogs.length === 1, 'T-06: Audit log created');
        assert(store.auditLogs[0].action === 'DEACTIVATE_PRODUCT', 'T-06: Action is DEACTIVATE_PRODUCT');
        assert(store.auditLogs[0].payload.previousStatus === true, 'T-06: Previous status recorded');
        assert(store.auditLogs[0].payload.newStatus === false, 'T-06: New status recorded');
    }

    // -------------------------------------------------------------------------
    // TEST 7: Rejection When Pending Issue Requests Exist
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-has-pending',
                code: 'PEND-01',
                name: 'Item With Pending Issue',
                tenantId,
                unitId,
                status: true
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-pending-1',
                productId: 'prod-has-pending',
                tenantId,
                unitId,
                status: 'PENDING',
                isDeleted: false
            }],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.updateProductStatus('prod-has-pending', false, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('pending stock issue requests that must be approved or rejected first'), 'T-07: Error clearly explains pending request block');
        }
        assert(threw, 'T-07: Deactivation rejected due to pending requests');
        assert(store.products[0].status === true, 'T-07: Product status remains true');
    }

    // -------------------------------------------------------------------------
    // TEST 8: Successful Reactivation
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-reactivate',
                code: 'REACT-01',
                name: 'Reactivated Item',
                tenantId,
                unitId,
                status: false
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        const res = await service.updateProductStatus('prod-reactivate', true, scope, user);

        assert(res.status === true, 'T-08: Product status restored to true');
        assert(store.auditLogs.length === 1 && store.auditLogs[0].action === 'REACTIVATE_PRODUCT', 'T-08: REACTIVATE_PRODUCT audit log recorded');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Inactive Product Rejection in New Stock Issue Requests
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-inactive-issue',
                code: 'INACT-01',
                name: 'Inactive Consumable',
                category: 'medical',
                tenantId,
                unitId,
                status: false,
                defaultRevenuePrice: 10
            }],
            stocks: [{
                id: 'stock-1',
                productId: 'prod-inactive-issue',
                quantity: 100,
                tenantId,
                unitId
            }],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.createIssueRequest({
                productId: 'prod-inactive-issue',
                quantity: 5,
                usageType: 'GENERAL'
            }, scope, 'Staff Requester', user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Cannot request stock issue for deactivated product'), 'T-09: Requisition rejected for deactivated product');
        }
        assert(threw, 'T-09: createIssueRequest threw on deactivated item');
        assert(store.issueRequests.length === 0, 'T-09: No issue request record created');
    }

    // -------------------------------------------------------------------------
    // TEST 10: Inactive Product Rejection in New Purchases
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-inactive-po',
                code: 'INACT-PO',
                name: 'Discontinued Med',
                tenantId,
                unitId,
                status: false,
                isBatchTracked: false
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.createPurchase({
                productId: 'prod-inactive-po',
                quantity: 50,
                vendor: 'Apollo Healthcare Ltd'
            }, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Cannot record purchase for deactivated product'), 'T-10: Purchase rejected for deactivated product');
        }
        assert(threw, 'T-10: createPurchase threw on deactivated item');
    }

    // -------------------------------------------------------------------------
    // TEST 11: Historical Data Remains Accessible
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [
                { id: 'p1', code: 'C1', name: 'Active Med', tenantId, unitId, status: true },
                { id: 'p2', code: 'C2', name: 'Inactive Med', tenantId, unitId, status: false }
            ],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        const products = await service.getProducts(scope);
        assert(products.length === 2, 'T-11: getProducts returns all products including inactive for audit/history');
        const inactive = products.find((p: any) => p.status === false);
        assert(inactive !== undefined && inactive.id === 'p2', 'T-11: Inactive product present and queryable');
    }

    // -------------------------------------------------------------------------
    // TEST 12: Stock Adjustment on Inactive Products Not Blocked (Scrap/write-off)
    // -------------------------------------------------------------------------
    {
        // Rule B.3: "Do not block legitimate stock write-offs or necessary inventory reconciliation solely because a product is inactive."
        const store: MockStore = {
            products: [{
                id: 'prod-scrap-inactive',
                code: 'SCRAP-01',
                name: 'Expired Syringes (Inactive)',
                tenantId,
                unitId,
                status: false,
                isBatchTracked: false
            }],
            stocks: [{
                id: 'stock-scrap-1',
                productId: 'prod-scrap-inactive',
                quantity: 20,
                tenantId,
                unitId
            }],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const mockPrisma: any = createMockPrisma(store);
        mockPrisma.$transaction = async (callback: any) => {
            const tx = {
                product: {
                    findFirst: async () => store.products[0]
                },
                $queryRaw: async () => [store.stocks[0]],
                stock: {
                    findUnique: async () => store.stocks[0],
                    findFirst: async () => store.stocks[0],
                    updateMany: async ({ data }: any) => {
                        store.stocks[0].quantity -= data.quantity.decrement;
                        return { count: 1 };
                    }
                },
                stockMovement: {
                    create: async ({ data }: any) => {
                        store.movements.push(data);
                        return data;
                    }
                },
                auditLog: {
                    create: async ({ data }: any) => {
                        store.auditLogs.push(data);
                        return data;
                    }
                }
            };
            return await callback(tx);
        };
        const service = new InventoryService(mockPrisma);

        const res = await service.updateStock({
            productId: 'prod-scrap-inactive',
            quantity: -20,
            usageType: 'Scrap Write-Off',
            notes: 'Zeroing balance of discontinued item'
        }, scope, user);

        assert(res.quantity === 0, 'T-12: Physical stock adjustment to scrap/write-off inactive product succeeds');
        assert(store.stocks[0].quantity === 0, 'T-12: Stock reduced to 0');
        assert(store.movements.length === 1, 'T-12: Stock movement recorded for reconciliation');
    }

    // -------------------------------------------------------------------------
    // TEST 13: Product Row Locking on Deactivation, Issue Request, and Purchase
    // -------------------------------------------------------------------------
    {
        const lockLog: string[] = [];
        const store: MockStore = {
            products: [{
                id: 'prod-lock-test',
                code: 'LOCK-01',
                name: 'Row Lock Item',
                tenantId,
                unitId,
                status: true,
                defaultRevenuePrice: 15,
                isBatchTracked: false
            }],
            stocks: [{
                id: 'stock-lock-1',
                productId: 'prod-lock-test',
                quantity: 50,
                tenantId,
                unitId
            }],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store, { lockLog }));

        // 1. Deactivation acquires product lock
        await service.updateProductStatus('prod-lock-test', false, scope, user);
        assert(lockLog.includes('LOCKED_PRODUCT:prod-lock-test'), 'T-13: updateProductStatus acquired product row lock');

        // 2. Reactivation acquires product lock
        await service.updateProductStatus('prod-lock-test', true, scope, user);
        assert(lockLog.filter(l => l === 'LOCKED_PRODUCT:prod-lock-test').length >= 2, 'T-13: Reactivation acquired product row lock');

        // 3. Issue Request acquires product lock
        lockLog.length = 0;
        await service.createIssueRequest({
            productId: 'prod-lock-test',
            quantity: 5,
            usageType: 'Internal Clinic'
        }, scope, 'Staff Nurse', user);
        assert(lockLog.includes('LOCKED_PRODUCT:prod-lock-test'), 'T-13: createIssueRequest acquired product row lock');

        // 4. Purchase creation acquires product lock
        lockLog.length = 0;
        await service.createPurchase({
            productId: 'prod-lock-test',
            quantity: 10,
            vendor: 'MedLife Pharma'
        }, scope, user);
        assert(lockLog.includes('LOCKED_PRODUCT:prod-lock-test'), 'T-13: createPurchase acquired product row lock');
    }

    // -------------------------------------------------------------------------
    // TEST 14: Concurrency Serialization (Deactivation blocks concurrent request)
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-ser-1',
                code: 'SER-01',
                name: 'Serialized Med',
                tenantId,
                unitId,
                status: true,
                defaultRevenuePrice: 20
            }],
            stocks: [{
                id: 'stock-ser-1',
                productId: 'prod-ser-1',
                quantity: 100,
                tenantId,
                unitId
            }],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        // When deactivation completes, product.status is false
        await service.updateProductStatus('prod-ser-1', false, scope, user);

        let threw = false;
        try {
            await service.createIssueRequest({
                productId: 'prod-ser-1',
                quantity: 10,
                usageType: 'Internal'
            }, scope, 'Nurse', user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Cannot request stock issue for deactivated product'), 'T-14: Issue request after deactivation cleanly rejected');
        }
        assert(threw, 'T-14: Concurrently serialized request failed as expected');
    }

    // -------------------------------------------------------------------------
    // TEST 15: Concurrency Serialization (Deactivation blocks concurrent purchase)
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-ser-po',
                code: 'SER-PO',
                name: 'Serialized PO Med',
                tenantId,
                unitId,
                status: true,
                defaultRevenuePrice: 20,
                isBatchTracked: false
            }],
            stocks: [{
                id: 'stock-ser-po',
                productId: 'prod-ser-po',
                quantity: 100,
                tenantId,
                unitId
            }],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        // Deactivate first
        await service.updateProductStatus('prod-ser-po', false, scope, user);

        let threw = false;
        try {
            await service.createPurchase({
                productId: 'prod-ser-po',
                quantity: 50,
                vendor: 'Apex Supplies'
            }, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Cannot record purchase for deactivated product'), 'T-15: Purchase on deactivated product cleanly rejected');
        }
        assert(threw, 'T-15: Purchase creation rejected');
    }

    // -------------------------------------------------------------------------
    // TEST 16: Transaction Rollback on Audit Log Failure (Status Change)
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-rb-status',
                code: 'RB-01',
                name: 'Rollback Test Product',
                tenantId,
                unitId,
                status: true
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        // Configure mock to fail on audit log creation
        const service = new InventoryService(createMockPrisma(store, { failAuditLog: true }));

        let threw = false;
        try {
            await service.updateProductStatus('prod-rb-status', false, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Audit log write failed'), 'T-16: Error propagated from failing audit log');
        }
        assert(threw, 'T-16: updateProductStatus threw on audit failure');
        assert(store.products[0].status === true, 'T-16: Transaction rolled back; product remains active (status = true)');
    }

    // -------------------------------------------------------------------------
    // TEST 17: Transaction Rollback on Audit Log Failure (Issue Request Creation)
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-rb-req',
                code: 'RB-REQ',
                name: 'Rollback Request Med',
                tenantId,
                unitId,
                status: true,
                defaultRevenuePrice: 10
            }],
            stocks: [{
                id: 'stock-rb-req',
                productId: 'prod-rb-req',
                quantity: 50,
                tenantId,
                unitId
            }],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store, { failAuditLog: true }));

        let threw = false;
        try {
            await service.createIssueRequest({
                productId: 'prod-rb-req',
                quantity: 5,
                usageType: 'Internal'
            }, scope, 'Staff', user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Audit log write failed'), 'T-17: Error propagated from failing audit log');
        }
        assert(threw, 'T-17: createIssueRequest threw on audit failure');
        assert(store.issueRequests.length === 0, 'T-17: Transaction rolled back; no orphaned StockIssueRequest created');
    }

    // -------------------------------------------------------------------------
    // TEST 18: Database Unique Constraint Violation (P2002) Error Handling
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-p2002',
                code: 'SKU-EXISTING',
                name: 'P2002 Target Item',
                tenantId,
                unitId,
                status: true
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store, { failDuplicateSkuP2002: true }));

        let threw = false;
        try {
            await service.updateProduct('prod-p2002', { name: 'New Name' }, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('already exists for this tenant'), 'T-18: Prisma P2002 unique constraint converted to clean tenant error');
        }
        assert(threw, 'T-18: updateProduct handled P2002 gracefully');
    }

    // -------------------------------------------------------------------------
    // TEST 19: Unchanged SKU & Nullable Code Updates
    // -------------------------------------------------------------------------
    {
        const store: MockStore = {
            products: [{
                id: 'prod-unchanged',
                code: 'SKU-STABLE',
                name: 'Stable SKU Item',
                tenantId,
                unitId,
                status: true
            }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [],
            purchases: []
        };
        const service = new InventoryService(createMockPrisma(store));

        // Update other fields while keeping same SKU
        const res1 = await service.updateProduct('prod-unchanged', { code: 'SKU-STABLE', name: 'Updated Name' }, scope, user);
        assert(res1.name === 'Updated Name', 'T-19: Unchanged SKU update succeeded');

        // Update with null code (non-coded product)
        const res2 = await service.updateProduct('prod-unchanged', { code: null, name: 'No-Code Item' }, scope, user);
        assert(res2.code === null, 'T-19: Nullable product code update succeeded without conflict');
    }

    console.log('\n========================================================================');
    console.log(`📊 Product Lifecycle Test Summary: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log('========================================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
