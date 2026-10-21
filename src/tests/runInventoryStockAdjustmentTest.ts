import { InventoryService } from '../modules/inventory/service.js';

interface MockStore {
    products: any[];
    stocks: any[];
    batches: any[];
    movements: any[];
    auditLogs: any[];
    queryRawCalled: boolean;
}

function createMockPrisma(store: MockStore, options: { failOnMovement?: boolean } = {}) {
    return {
        $transaction: async (callback: (tx: any) => Promise<any>, _opts?: any) => {
            // Snapshot store state for transactional rollback support
            const snapshot = {
                products: JSON.parse(JSON.stringify(store.products)),
                stocks: JSON.parse(JSON.stringify(store.stocks)),
                batches: JSON.parse(JSON.stringify(store.batches)),
                movements: JSON.parse(JSON.stringify(store.movements)),
                auditLogs: JSON.parse(JSON.stringify(store.auditLogs))
            };

            const tx = {
                product: {
                    findFirst: async ({ where }: any) => {
                        return store.products.find(p => {
                            if (where.id && p.id !== where.id) return false;
                            if (where.tenantId && p.tenantId !== where.tenantId) return false;
                            return true;
                        }) || null;
                    }
                },
                $queryRaw: async (_strings: any, ...values: any[]) => {
                    store.queryRawCalled = true;
                    const productId = values[0];
                    const tenantId = values[1];
                    const unitId = values[2];
                    const stock = store.stocks.find(s => s.productId === productId && s.tenantId === tenantId && s.unitId === unitId);
                    return stock ? [stock] : [];
                },
                stock: {
                    findFirst: async ({ where }: any) => {
                        return store.stocks.find(s => s.productId === where.productId && s.tenantId === where.tenantId && s.unitId === where.unitId) || null;
                    },
                    findUnique: async ({ where }: any) => {
                        const key = where.productId_tenantId_unitId;
                        return store.stocks.find(s => s.productId === key.productId && s.tenantId === key.tenantId && s.unitId === key.unitId) || null;
                    },
                    upsert: async ({ where, update, create }: any) => {
                        const key = where.productId_tenantId_unitId;
                        let item = store.stocks.find(s => s.productId === key.productId && s.tenantId === key.tenantId && s.unitId === key.unitId);
                        if (item) {
                            if (update.quantity?.increment !== undefined) {
                                item.quantity += update.quantity.increment;
                            }
                            return item;
                        } else {
                            const newItem = { id: `stock-${Date.now()}-${Math.random()}`, ...create };
                            store.stocks.push(newItem);
                            return newItem;
                        }
                    },
                    updateMany: async ({ where, data }: any) => {
                        const item = store.stocks.find(s => s.id === where.id);
                        if (!item) return { count: 0 };
                        if (where.quantity?.gte !== undefined && item.quantity < where.quantity.gte) {
                            return { count: 0 };
                        }
                        if (data.quantity?.decrement !== undefined) {
                            item.quantity -= data.quantity.decrement;
                        }
                        return { count: 1 };
                    }
                },
                productBatch: {
                    findFirst: async ({ where }: any) => {
                        return store.batches.find(b => {
                            if (where.id && b.id !== where.id) return false;
                            if (where.productId && b.productId !== where.productId) return false;
                            if (where.batchNumber && b.batchNumber !== where.batchNumber) return false;
                            if (where.tenantId && b.tenantId !== where.tenantId) return false;
                            if (where.unitId && b.unitId !== where.unitId) return false;
                            return true;
                        }) || null;
                    },
                    upsert: async ({ where, update, create }: any) => {
                        const key = where.productId_batchNumber_tenantId_unitId;
                        let item = store.batches.find(b => b.productId === key.productId && b.batchNumber === key.batchNumber && b.tenantId === key.tenantId && b.unitId === key.unitId);
                        if (item) {
                            if (update.quantity?.increment !== undefined) {
                                item.quantity += update.quantity.increment;
                            }
                            return item;
                        } else {
                            const newItem = { id: `batch-${Date.now()}-${Math.random()}`, ...create };
                            store.batches.push(newItem);
                            return newItem;
                        }
                    },
                    update: async ({ where, data }: any) => {
                        const item = store.batches.find(b => b.id === where.id);
                        if (!item) throw new Error('Batch not found');
                        if (data.quantity?.increment !== undefined) {
                            item.quantity += data.quantity.increment;
                        }
                        return item;
                    },
                    updateMany: async ({ where, data }: any) => {
                        const item = store.batches.find(b => b.id === where.id);
                        if (!item) return { count: 0 };
                        if (where.quantity?.gte !== undefined && item.quantity < where.quantity.gte) {
                            return { count: 0 };
                        }
                        if (data.quantity?.decrement !== undefined) {
                            item.quantity -= data.quantity.decrement;
                        }
                        return { count: 1 };
                    }
                },
                stockMovement: {
                    create: async ({ data }: any) => {
                        if (options.failOnMovement) {
                            throw new Error('Simulated database error in stockMovement creation');
                        }
                        const item = { id: `sm-${Date.now()}-${Math.random()}`, ...data };
                        store.movements.push(item);
                        return item;
                    }
                },
                auditLog: {
                    create: async ({ data }: any) => {
                        const item = { id: `al-${Date.now()}-${Math.random()}`, ...data };
                        store.auditLogs.push(item);
                        return item;
                    }
                }
            };

            try {
                return await callback(tx);
            } catch (err) {
                // Rollback on transaction failure
                store.products = snapshot.products;
                store.stocks = snapshot.stocks;
                store.batches = snapshot.batches;
                store.movements = snapshot.movements;
                store.auditLogs = snapshot.auditLogs;
                throw err;
            }
        }
    };
}

async function runTests() {
    console.log('========================================================================');
    console.log('🚀 InventoryApp D7.2 — Stock Adjustment Integrity Verification Suite');
    console.log('========================================================================\n');

    let passed = 0;
    let failed = 0;

    const assert = (condition: boolean, testName: string, detail?: string) => {
        if (condition) {
            console.log(`  ✅ [PASS] ${testName}`);
            passed++;
        } else {
            console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
            failed++;
        }
    };

    const scope = { tenantId: 'tenant-100', unitId: 'unit-101' };
    const user = { id: 'usr-1', name: 'Dr. John', email: 'john@example.com' };

    // --- TEST 1: Positive adjustment of non-batch-tracked product ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-non-batch', name: 'Stationery Pen', category: 'stationary', isBatchTracked: false, tenantId: 'tenant-100' }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        const res = await service.updateStock({ productId: 'prod-non-batch', quantity: 15 }, scope, user);
        assert(res.quantity === 15, 'T-01: Positive adjustment of non-batch product increases stock', `got ${res?.quantity}`);
        assert(store.batches.length === 0, 'T-01: No batch records created for non-batch item');
        assert(store.movements[0]?.movementType === 'ADJUSTMENT' && store.movements[0]?.quantity === 15, 'T-01: StockMovement recorded');
    }

    // --- TEST 2: Positive adjustment of batch-tracked product ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-batch-1', name: 'Paracetamol 500mg', category: 'medical', isBatchTracked: true, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-batch-1', quantity: 10, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        const res = await service.updateStock({
            productId: 'prod-batch-1',
            quantity: 20,
            batchNumber: 'BATCH-2026-X',
            expiryDate: '2027-06-30'
        }, scope, user);

        assert(res.quantity === 30, 'T-02: Positive adjustment increases aggregate stock (10 -> 30)', `got ${res?.quantity}`);
        assert(store.batches[0]?.quantity === 20 && store.batches[0]?.batchNumber === 'BATCH-2026-X', 'T-02: ProductBatch created with 20 units');
        assert(store.movements[0]?.batchId === store.batches[0]?.id, 'T-02: StockMovement links to created batch');
    }

    // --- TEST 3: Missing batch info on batch-tracked positive adjustment ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-batch-1', name: 'Paracetamol 500mg', category: 'medical', isBatchTracked: true, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-batch-1', quantity: 10, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.updateStock({ productId: 'prod-batch-1', quantity: 20 }, scope, user);
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('Batch number and expiry date are required'), 'T-03: Missing batch info correctly rejected');
        }
        assert(threw, 'T-03: Throws error when batch info missing');
        assert(store.stocks[0].quantity === 10, 'T-03: Stock balance remains untouched');
    }

    // --- TEST 4: Valid negative adjustment on non-batch product ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-non-batch', name: 'Stationery Pen', category: 'stationary', isBatchTracked: false, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-non-batch', quantity: 25, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        const res = await service.updateStock({ productId: 'prod-non-batch', quantity: -10 }, scope, user);
        assert(res.quantity === 15, 'T-04: Valid negative adjustment reduces stock (25 -> 15)', `got ${res?.quantity}`);
        assert(store.movements[0]?.balanceAfter === 15, 'T-04: Movement balanceAfter is 15');
    }

    // --- TEST 5: Excessive negative adjustment on non-batch product ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-non-batch', name: 'Stationery Pen', category: 'stationary', isBatchTracked: false, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-non-batch', quantity: 5, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.updateStock({ productId: 'prod-non-batch', quantity: -10 }, scope, user);
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('Insufficient stock balance'), 'T-05: Excessive deduction throws insufficient stock error');
        }
        assert(threw, 'T-05: Throws error on excessive deduction');
        assert(store.stocks[0].quantity === 5, 'T-05: Stock balance remains 5 (not negative)');
        assert(store.movements.length === 0, 'T-05: Zero movements written');
    }

    // --- TEST 6: Negative adjustment with no existing Stock record ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-non-batch', name: 'Stationery Pen', category: 'stationary', isBatchTracked: false, tenantId: 'tenant-100' }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.updateStock({ productId: 'prod-non-batch', quantity: -1 }, scope, user);
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('Insufficient stock balance'), 'T-06: Missing stock row throws insufficient balance');
        }
        assert(threw, 'T-06: Throws error when no stock record exists');
        assert(store.stocks.length === 0, 'T-06: No negative stock row created');
    }

    // --- TEST 7: Batch quantity insufficient for deduction ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-batch-1', name: 'Paracetamol', category: 'medical', isBatchTracked: true, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-batch-1', quantity: 50, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [{ id: 'b-1', productId: 'prod-batch-1', batchNumber: 'B-001', quantity: 3, tenantId: 'tenant-100', unitId: 'unit-101' }],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.updateStock({ productId: 'prod-batch-1', quantity: -5, batchId: 'b-1' }, scope, user);
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('insufficient quantity'), 'T-07: Insufficient batch stock throws error');
        }
        assert(threw, 'T-07: Throws error');
        assert(store.stocks[0].quantity === 50, 'T-07: Aggregate stock unchanged');
        assert(store.batches[0].quantity === 3, 'T-07: Batch quantity unchanged');
    }

    // --- TEST 8: Invalid or cross-unit batch ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-batch-1', name: 'Paracetamol', category: 'medical', isBatchTracked: true, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-batch-1', quantity: 50, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [{ id: 'b-other-unit', productId: 'prod-batch-1', batchNumber: 'B-OTHER', quantity: 20, tenantId: 'tenant-100', unitId: 'unit-999' }],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.updateStock({ productId: 'prod-batch-1', quantity: -5, batchId: 'b-other-unit' }, scope, user);
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('valid existing batch in the current unit is required'), 'T-08: Cross-unit batch correctly rejected');
        }
        assert(threw, 'T-08: Throws error on cross-unit batch');
    }

    // --- TEST 9: Cross-tenant product reference ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-tenant-2', name: 'Other Tenant Item', category: 'medical', tenantId: 'tenant-999' }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        let threw = false;
        try {
            await service.updateStock({ productId: 'prod-tenant-2', quantity: 10 }, scope, user);
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('Product not found or not accessible within this tenant'), 'T-09: Cross-tenant product rejected');
        }
        assert(threw, 'T-09: Throws error on cross-tenant product');
    }

    // --- TEST 10: Concurrent deductions against the same stock ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-non-batch', name: 'Masks', category: 'supplies', isBatchTracked: false, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-non-batch', quantity: 10, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        // First deduction: -8 (balance becomes 2)
        const res1 = await service.updateStock({ productId: 'prod-non-batch', quantity: -8 }, scope, user);
        assert(res1.quantity === 2, 'T-10: First deduction of 8 leaves balance 2');

        // Second simultaneous deduction of 8 (fails because only 2 remains)
        let threw = false;
        try {
            await service.updateStock({ productId: 'prod-non-batch', quantity: -8 }, scope, user);
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('Insufficient stock balance'), 'T-10: Second deduction of 8 rejected due to insufficient stock');
        }
        assert(threw, 'T-10: Second deduction threw error');
        assert(store.stocks[0].quantity === 2, 'T-10: Final balance never drops below zero');
    }

    // --- TEST 11: Transaction rollback on failure ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-non-batch', name: 'Gloves', category: 'supplies', isBatchTracked: false, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-non-batch', quantity: 100, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store, { failOnMovement: true }));

        let threw = false;
        try {
            await service.updateStock({ productId: 'prod-non-batch', quantity: -10 }, scope, user);
        } catch {
            threw = true;
        }
        assert(threw, 'T-11: Operation threw on simulated movement creation failure');
        assert(store.stocks[0].quantity === 100, 'T-11: Stock balance rolled back to initial 100');
        assert(store.movements.length === 0, 'T-11: Zero movements persisted');
    }

    // --- TEST 12: Preservation of movement metadata and actor attribution ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-non-batch', name: 'Desk Chair', category: 'assets', isBatchTracked: false, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-non-batch', quantity: 5, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        await service.updateStock({
            productId: 'prod-non-batch',
            quantity: -2,
            usageType: 'Damage / Breakage',
            referenceNo: 'INC-2026-99',
            storageLocation: 'Ward B Storage',
            issuedTo: 'Maintenance Dept',
            notes: 'Damaged during relocation'
        }, scope, user);

        const mv = store.movements[0];
        assert(mv?.referenceType === 'Damage / Breakage', 'T-12: Reference type preserved');
        assert(mv?.referenceId === 'INC-2026-99', 'T-12: Reference ID preserved');
        assert(mv?.performedBy === 'Dr. John', 'T-12: Actor attribution preserved');
        assert(mv?.notes?.includes('Location: Ward B Storage'), 'T-12: Storage location in notes');
        assert(mv?.notes?.includes('Issued To: Maintenance Dept'), 'T-12: Issued to recipient in notes');
    }

    // --- TEST 13: Backward compatibility with legacy signature (productId, quantity, scope, user) ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-legacy', name: 'Legacy Item', category: 'general', isBatchTracked: false, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-legacy', quantity: 10, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        const res = await service.updateStock('prod-legacy', 5, scope, user);
        assert(res.quantity === 15, 'T-13: Legacy 4-argument call signature works seamlessly', `got ${res?.quantity}`);
    }

    // --- TEST 14: Opening stock resilient initialization for batch-tracked product ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-med-op', name: 'Saline Solution', category: 'medical', isBatchTracked: true, tenantId: 'tenant-100' }],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        const res = await service.updateStock({
            productId: 'prod-med-op',
            quantity: 50,
            usageType: 'Initial Opening Stock',
            notes: 'Opening balance created during product registration'
        }, scope, user);

        assert(res.quantity === 50, 'T-14: Opening stock created for batch-tracked product (50 units)');
        assert(store.batches.length === 1 && store.batches[0]?.quantity === 50, 'T-14: Resilient opening batch created with 50 units');
        assert(store.batches[0]?.batchNumber === 'OPENING-STOCK', 'T-14: Batch assigned OPENING-STOCK identifier');
    }

    // --- TEST 15: Valid negative adjustment on batch-tracked product synchronizes both records ---
    {
        const store: MockStore = {
            products: [{ id: 'prod-batch-sync', name: 'Antibiotic 250mg', category: 'medical', isBatchTracked: true, tenantId: 'tenant-100' }],
            stocks: [{ id: 's-1', productId: 'prod-batch-sync', quantity: 40, tenantId: 'tenant-100', unitId: 'unit-101' }],
            batches: [{ id: 'b-sync-1', productId: 'prod-batch-sync', batchNumber: 'LOT-99', quantity: 40, tenantId: 'tenant-100', unitId: 'unit-101' }],
            movements: [],
            auditLogs: [],
            queryRawCalled: false
        };
        const service = new InventoryService(createMockPrisma(store));

        const res = await service.updateStock({
            productId: 'prod-batch-sync',
            quantity: -15,
            batchId: 'b-sync-1'
        }, scope, user);

        assert(res.quantity === 25, 'T-15: Aggregate stock reduced from 40 to 25');
        assert(store.batches[0].quantity === 25, 'T-15: Batch quantity synchronously reduced from 40 to 25');
        assert(store.movements[0].batchId === 'b-sync-1', 'T-15: Stock movement linked to adjusted batch');
    }

    console.log('\n========================================================================');
    console.log(`📊 Test Summary: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log('========================================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
});
