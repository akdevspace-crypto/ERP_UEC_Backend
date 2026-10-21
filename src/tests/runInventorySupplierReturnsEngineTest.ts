/**
 * InventoryApp D9.1 — Supplier Returns Engine & Stock Integration Test Suite
 * Run with: npx tsx src/tests/runInventorySupplierReturnsEngineTest.ts
 */

import { InventoryService } from '../modules/inventory/service.js';

interface MockStore {
    vendors: any[];
    products: any[];
    stocks: any[];
    batches: any[];
    movements: any[];
    auditLogs: any[];
    purchaseOrders: any[];
    purchaseOrderItems: any[];
    goodsReceiptNotes: any[];
    goodsReceiptItems: any[];
    purchases: any[];
    supplierReturns: any[];
    supplierReturnItems: any[];
    refCounters: any[];
}

function createMockPrisma(store: MockStore, options: { failAuditLog?: boolean; failStock?: boolean } = {}) {
    let mockTx: any = null;

    const client = {
        vendor: {
            findFirst: async ({ where }: any) => {
                return store.vendors.find(v => {
                    if (where.id && v.id !== where.id) return false;
                    if (where.tenantId && v.tenantId !== where.tenantId) return false;
                    if (where.isDeleted !== undefined && v.isDeleted !== where.isDeleted) return false;
                    return true;
                }) || null;
            }
        },
        product: {
            findFirst: async ({ where }: any) => {
                return store.products.find(p => {
                    if (where.id && p.id !== where.id) return false;
                    if (where.tenantId && p.tenantId !== where.tenantId) return false;
                    return true;
                }) || null;
            }
        },
        stock: {
            findFirst: async ({ where }: any) => {
                return store.stocks.find(s => s.productId === where.productId && s.tenantId === where.tenantId && (!where.unitId || s.unitId === where.unitId)) || null;
            },
            findUnique: async ({ where }: any) => {
                const { productId, tenantId, unitId } = where.productId_tenantId_unitId || {};
                return store.stocks.find(s => s.productId === productId && s.tenantId === tenantId && s.unitId === unitId) || null;
            },
            updateMany: async ({ where, data }: any) => {
                if (options.failStock) throw new Error("Stock write failed: Simulated fault");
                const stock = store.stocks.find(s => s.id === where.id);
                if (!stock) return { count: 0 };
                if (where.quantity?.gte !== undefined && stock.quantity < where.quantity.gte) {
                    return { count: 0 };
                }
                if (data.quantity?.decrement !== undefined) {
                    stock.quantity -= data.quantity.decrement;
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
            updateMany: async ({ where, data }: any) => {
                const batch = store.batches.find(b => b.id === where.id);
                if (!batch) return { count: 0 };
                if (where.quantity?.gte !== undefined && batch.quantity < where.quantity.gte) {
                    return { count: 0 };
                }
                if (data.quantity?.decrement !== undefined) {
                    batch.quantity -= data.quantity.decrement;
                }
                return { count: 1 };
            }
        },
        stockMovement: {
            create: async ({ data }: any) => {
                const item = {
                    id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    ...data,
                    isDeleted: false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                store.movements.push(item);
                return item;
            },
            findMany: async ({ where }: any) => {
                return store.movements.filter(m => {
                    if (where.tenantId && m.tenantId !== where.tenantId) return false;
                    if (where.unitId && m.unitId !== where.unitId) return false;
                    if (where.movementType && m.movementType !== where.movementType) return false;
                    if (where.referenceType && m.referenceType !== where.referenceType) return false;
                    if (where.referenceId && m.referenceId !== where.referenceId) return false;
                    if (where.productId && m.productId !== where.productId) return false;
                    if (where.isDeleted !== undefined && m.isDeleted !== where.isDeleted) return false;
                    return true;
                });
            },
            findFirst: async ({ where }: any) => {
                return store.movements.find(m => {
                    if (where.id && m.id !== where.id) return false;
                    if (where.tenantId && m.tenantId !== where.tenantId) return false;
                    if (where.movementType && m.movementType !== where.movementType) return false;
                    return true;
                }) || null;
            },
            count: async ({ where }: any) => {
                return store.movements.filter(m => {
                    if (where.tenantId && m.tenantId !== where.tenantId) return false;
                    if (where.movementType && m.movementType !== where.movementType) return false;
                    return true;
                }).length;
            }
        },
        goodsReceiptNote: {
            findFirst: async ({ where }: any) => {
                const grn = store.goodsReceiptNotes.find(g => {
                    if (where.id && g.id !== where.id) return false;
                    if (where.tenantId && g.tenantId !== where.tenantId) return false;
                    if (where.isDeleted !== undefined && g.isDeleted !== where.isDeleted) return false;
                    return true;
                });
                if (!grn) return null;
                return {
                    ...grn,
                    items: store.goodsReceiptItems.filter(i => i.goodsReceiptNoteId === grn.id && (!where.items?.where?.isDeleted || !i.isDeleted))
                };
            }
        },
        purchase: {
            findFirst: async ({ where }: any) => {
                return store.purchases.find(p => {
                    if (where.id && p.id !== where.id) return false;
                    if (where.tenantId && p.tenantId !== where.tenantId) return false;
                    return true;
                }) || null;
            }
        },
        supplierReturn: {
            create: async ({ data, include }: any) => {
                const ret = {
                    id: data.id || `ret-${Date.now()}`,
                    returnNumber: data.returnNumber,
                    vendorId: data.vendorId,
                    sourceType: data.sourceType,
                    sourceReference: data.sourceReference,
                    grnId: data.grnId,
                    purchaseId: data.purchaseId,
                    idempotencyKey: data.idempotencyKey,
                    returnDate: data.returnDate || new Date(),
                    reason: data.reason,
                    status: data.status || 'COMPLETED',
                    totalQuantity: data.totalQuantity,
                    notes: data.notes,
                    returnedById: data.returnedById,
                    returnedByName: data.returnedByName,
                    tenantId: data.tenantId,
                    unitId: data.unitId,
                    isDeleted: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    items: [] as any[]
                };
                if (data.items?.create) {
                    for (const it of data.items.create) {
                        const itemRecord = {
                            id: it.id || `item-${Date.now()}`,
                            supplierReturnId: ret.id,
                            productId: it.productId,
                            batchId: it.batchId,
                            batchNumber: it.batchNumber,
                            expiryDate: it.expiryDate,
                            returnQuantity: it.returnQuantity,
                            reason: it.reason,
                            stockMovementId: it.stockMovementId,
                            tenantId: it.tenantId,
                            unitId: it.unitId,
                            isDeleted: false
                        };
                        store.supplierReturnItems.push(itemRecord);
                        ret.items.push(itemRecord);
                    }
                }
                store.supplierReturns.push(ret);
                return ret;
            },
            findFirst: async ({ where }: any) => {
                const ret = store.supplierReturns.find(r => {
                    if (where.id && r.id !== where.id) return false;
                    if (where.idempotencyKey && r.idempotencyKey !== where.idempotencyKey) return false;
                    if (where.tenantId && r.tenantId !== where.tenantId) return false;
                    if (where.isDeleted !== undefined && r.isDeleted !== where.isDeleted) return false;
                    return true;
                });
                if (!ret) return null;
                const items = store.supplierReturnItems.filter(i => i.supplierReturnId === ret.id);
                return {
                    ...ret,
                    vendor: store.vendors.find(v => v.id === ret.vendorId) || null,
                    items: items.map(i => ({
                        ...i,
                        product: store.products.find(p => p.id === i.productId) || null,
                        batch: store.batches.find(b => b.id === i.batchId) || null
                    }))
                };
            },
            findMany: async ({ where, skip = 0, take = 20 }: any) => {
                const filtered = store.supplierReturns.filter(r => {
                    if (where.tenantId && r.tenantId !== where.tenantId) return false;
                    if (where.unitId && r.unitId !== where.unitId) return false;
                    if (where.vendorId && r.vendorId !== where.vendorId) return false;
                    if (where.isDeleted !== undefined && r.isDeleted !== where.isDeleted) return false;
                    return true;
                });
                return filtered.slice(skip, skip + take).map(r => ({
                    ...r,
                    vendor: store.vendors.find(v => v.id === r.vendorId) || null,
                    items: store.supplierReturnItems.filter(i => i.supplierReturnId === r.id)
                }));
            },
            count: async ({ where }: any) => {
                return store.supplierReturns.filter(r => {
                    if (where.tenantId && r.tenantId !== where.tenantId) return false;
                    if (where.isDeleted !== undefined && r.isDeleted !== where.isDeleted) return false;
                    return true;
                }).length;
            }
        },
        refCounter: {
            upsert: async ({ where }: any) => {
                const prefix = where.prefix_tenantId?.prefix || where.tenantId_unitId_prefix?.prefix || 'RET';
                const tenantId = where.prefix_tenantId?.tenantId || where.tenantId_unitId_prefix?.tenantId || 'tenant-1';
                let c = store.refCounters.find(rc => rc.prefix === prefix && rc.tenantId === tenantId);
                if (c) {
                    c.current += 1;
                } else {
                    c = {
                        tenantId,
                        prefix,
                        current: 1
                    };
                    store.refCounters.push(c);
                }
                return c;
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
        $queryRaw: async (strings: any, ...values: any[]) => {
            const rawSql = Array.isArray(strings) ? strings.join('?') : (typeof strings === 'string' ? strings : strings?.strings?.join('?') || '');
            if (rawSql.includes('"Product"') || rawSql.includes('Product')) {
                const prodId = values[0] || (strings?.values ? strings.values[0] : null);
                const tenantId = values[1];
                const unitId = values[2];
                const prod = store.products.find(p => p.id === prodId && (!tenantId || p.tenantId === tenantId) && (!unitId || !p.unitId || p.unitId === unitId));
                return prod ? [prod] : [];
            }
            if (rawSql.includes('RefCounter') && rawSql.includes('RET')) {
                let c = store.refCounters.find(rc => rc.prefix === 'RET');
                if (c) {
                    c.current += 1;
                } else {
                    c = { prefix: 'RET', current: 1, tenantId: 'tenant-1', unitId: 'unit-1' };
                    store.refCounters.push(c);
                }
                return [{ current: c.current }];
            }
            return [];
        },
        $transaction: async (cb: any) => {
            // Take deep copy snapshot for rollback
            const snapshot = JSON.stringify(store);
            try {
                return await cb(client);
            } catch (err) {
                // Restore state on rollback
                const restored = JSON.parse(snapshot);
                Object.keys(store).forEach(k => {
                    (store as any)[k] = restored[k];
                });
                throw err;
            }
        }
    };

    mockTx = client;
    return client;
}

let passed = 0;
let failed = 0;

function report(condition: boolean, name: string) {
    if (condition) {
        passed++;
        console.log(`  ✓ PASS: ${name}`);
    } else {
        failed++;
        console.error(`  ✗ FAIL: ${name}`);
    }
}

async function runTests() {
    console.log("===============================================================================");
    console.log("📦 InventoryApp D9.1 — Supplier Returns Engine & Stock Integration Test Suite");
    console.log("===============================================================================\n");

    const baseVendor = {
        id: 'vendor-1',
        code: 'VEND-001',
        name: 'Apex Pharma Supplies',
        category: 'Medical',
        status: true,
        tenantId: 'tenant-1',
        unitId: 'unit-1',
        isDeleted: false
    };

    const batchProduct = {
        id: 'prod-batch-1',
        name: 'Paracetamol 500mg IP',
        code: 'MED-PCM-500',
        category: 'Medical',
        unit: 'Strip',
        isBatchTracked: true,
        status: true,
        tenantId: 'tenant-1',
        unitId: 'unit-1'
    };

    const standardProduct = {
        id: 'prod-std-1',
        name: 'Surgical Gloves L',
        code: 'MED-GLV-L',
        category: 'Medical',
        unit: 'Box',
        isBatchTracked: false,
        status: true,
        tenantId: 'tenant-1',
        unitId: 'unit-1'
    };

    const scope = { tenantId: 'tenant-1', unitId: 'unit-1' };
    const user = { id: 'user-1', name: 'Pharmacist John', email: 'john@eldercare.org' };

    // -------------------------------------------------------------------------
    // 1. Valid Supplier Return against GRN
    // -------------------------------------------------------------------------
    console.log("--- 1. Valid Supplier Return against GRN ---");
    {
        const store: MockStore = {
            vendors: [baseVendor],
            products: [batchProduct, standardProduct],
            stocks: [
                { id: 'stock-1', productId: batchProduct.id, quantity: 100, tenantId: 'tenant-1', unitId: 'unit-1' },
                { id: 'stock-2', productId: standardProduct.id, quantity: 50, tenantId: 'tenant-1', unitId: 'unit-1' }
            ],
            batches: [
                { id: 'batch-1', productId: batchProduct.id, batchNumber: 'BAT-2026-01', expiryDate: new Date('2027-12-31'), quantity: 100, tenantId: 'tenant-1', unitId: 'unit-1' }
            ],
            movements: [],
            auditLogs: [],
            purchaseOrders: [],
            purchaseOrderItems: [],
            goodsReceiptNotes: [
                { id: 'grn-1', grnNumber: 'GRN-000001', vendorId: 'vendor-1', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }
            ],
            goodsReceiptItems: [
                { id: 'gri-1', goodsReceiptNoteId: 'grn-1', productId: batchProduct.id, receivedQuantity: 30, rejectedQuantity: 5, batchId: 'batch-1', batchNumber: 'BAT-2026-01', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false },
                { id: 'gri-2', goodsReceiptNoteId: 'grn-1', productId: standardProduct.id, receivedQuantity: 20, rejectedQuantity: 0, batchId: null, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }
            ],
            purchases: [],
            supplierReturns: [],
            supplierReturnItems: [],
            refCounters: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma);

        const ret = await service.createSupplierReturn({
            vendorId: 'vendor-1',
            sourceType: 'GRN',
            sourceReferenceId: 'grn-1',
            returnDate: '2026-10-12',
            reason: 'Damaged packaging discovered during quality inspection',
            idempotencyKey: 'idem-return-1',
            items: [
                {
                    productId: batchProduct.id,
                    batchId: 'batch-1',
                    batchNumber: 'BAT-2026-01',
                    returnQuantity: 10,
                    goodsReceiptItemId: 'gri-1',
                    reason: 'Leaking blisters'
                },
                {
                    productId: standardProduct.id,
                    returnQuantity: 5,
                    goodsReceiptItemId: 'gri-2',
                    reason: 'Crushed box'
                }
            ]
        }, scope, user);

        report(Boolean(ret?.returnNumber), "Generates return number (e.g. RET-000001)");
        report(ret?.totalQuantity === 15, "Total quantity matches sum of line returns (10 + 5 = 15)");

        // Verify stock decrements
        const stock1 = store.stocks.find(s => s.productId === batchProduct.id);
        const stock2 = store.stocks.find(s => s.productId === standardProduct.id);
        report(stock1.quantity === 90, "Batch product stock decremented exactly from 100 to 90 (-10)");
        report(stock2.quantity === 45, "Standard product stock decremented exactly from 50 to 45 (-5)");

        // Verify batch decrement
        const batch1 = store.batches.find(b => b.id === 'batch-1');
        report(batch1.quantity === 90, "ProductBatch quantity decremented from 100 to 90 (-10)");

        // Verify stock movements
        report(store.movements.length === 2, "Creates exactly 2 StockMovement entries for the return items");
        const mov1 = store.movements.find(m => m.productId === batchProduct.id);
        report(mov1?.movementType === 'SUPPLIER_RETURN', "StockMovement movementType is SUPPLIER_RETURN");
        report(mov1?.quantity === -10, "StockMovement quantity is negative (-10) representing outbound stock deduction");
        report(mov1?.balanceAfter === 90, "StockMovement balanceAfter records new stock balance (90)");
        report(mov1?.referenceType === 'GoodsReceiptNote', "StockMovement referenceType is GoodsReceiptNote");
        report(mov1?.referenceId === 'grn-1', "StockMovement referenceId points to GRN");

        // Verify AuditLog
        const log = store.auditLogs.find(a => a.action === 'CREATE_SUPPLIER_RETURN');
        report(Boolean(log), "Records CREATE_SUPPLIER_RETURN audit log entry");
        report(log?.payload?.vendorId === 'vendor-1', "AuditLog includes vendorId");
        report(log?.payload?.totalQuantity === 15, "AuditLog includes totalQuantity 15");
    }

    // -------------------------------------------------------------------------
    // 2. Cumulative Return Eligibility Enforcement
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Cumulative Return Eligibility Enforcement ---");
    {
        // Accepted qty in GRN = 25 (30 received - 5 rejected). Past return = 15. Remaining eligible = 10.
        const store: MockStore = {
            vendors: [baseVendor],
            products: [batchProduct],
            stocks: [{ id: 'stock-1', productId: batchProduct.id, quantity: 100, tenantId: 'tenant-1', unitId: 'unit-1' }],
            batches: [{ id: 'batch-1', productId: batchProduct.id, batchNumber: 'BAT-2026-01', quantity: 100, tenantId: 'tenant-1', unitId: 'unit-1' }],
            movements: [
                // Past return movement of 15
                {
                    id: 'mov-past-1',
                    productId: batchProduct.id,
                    movementType: 'SUPPLIER_RETURN',
                    quantity: -15,
                    referenceType: 'GoodsReceiptNote',
                    referenceId: 'grn-1',
                    tenantId: 'tenant-1',
                    unitId: 'unit-1',
                    isDeleted: false
                }
            ],
            auditLogs: [],
            purchaseOrders: [],
            purchaseOrderItems: [],
            goodsReceiptNotes: [
                { id: 'grn-1', grnNumber: 'GRN-000001', vendorId: 'vendor-1', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }
            ],
            goodsReceiptItems: [
                { id: 'gri-1', goodsReceiptNoteId: 'grn-1', productId: batchProduct.id, receivedQuantity: 30, rejectedQuantity: 5, batchId: 'batch-1', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }
            ],
            purchases: [],
            supplierReturns: [],
            supplierReturnItems: [],
            refCounters: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma);

        // Attempt to return 11 (eligible is only 10)
        let caughtError = false;
        try {
            await service.createSupplierReturn({
                vendorId: 'vendor-1',
                sourceType: 'GRN',
                sourceReferenceId: 'grn-1',
                reason: 'Defective batch return attempt',
                items: [{ productId: batchProduct.id, batchId: 'batch-1', returnQuantity: 11, goodsReceiptItemId: 'gri-1' }]
            }, scope, user);
        } catch (err: any) {
            caughtError = true;
            report(err.message.includes('exceeds remaining eligible returnable balance'), "Rejects return exceeding cumulative eligible balance (remaining 10, tried 11)");
        }
        report(caughtError, "Excessive cumulative return threw exception");

        // Verify that returning exactly eligible remaining (10) succeeds
        const validRet = await service.createSupplierReturn({
            vendorId: 'vendor-1',
            sourceType: 'GRN',
            sourceReferenceId: 'grn-1',
            reason: 'Returning all remaining eligible units from batch',
            items: [{ productId: batchProduct.id, batchId: 'batch-1', returnQuantity: 10, goodsReceiptItemId: 'gri-1' }]
        }, scope, user);
        report(Boolean(validRet), "Return of exact remaining eligible quantity (10) succeeds");
        report(store.stocks[0].quantity === 90, "Stock decremented from 100 to 90");
    }

    // -------------------------------------------------------------------------
    // 3. Insufficient Available Stock & Negative-Stock Prevention
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Insufficient Available Stock & Negative-Stock Prevention ---");
    {
        const store: MockStore = {
            vendors: [baseVendor],
            products: [standardProduct],
            stocks: [{ id: 'stock-1', productId: standardProduct.id, quantity: 3, tenantId: 'tenant-1', unitId: 'unit-1' }],
            batches: [],
            movements: [],
            auditLogs: [],
            purchaseOrders: [],
            purchaseOrderItems: [],
            goodsReceiptNotes: [
                { id: 'grn-1', grnNumber: 'GRN-000001', vendorId: 'vendor-1', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }
            ],
            goodsReceiptItems: [
                { id: 'gri-1', goodsReceiptNoteId: 'grn-1', productId: standardProduct.id, receivedQuantity: 50, rejectedQuantity: 0, batchId: null, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }
            ],
            purchases: [],
            supplierReturns: [],
            supplierReturnItems: [],
            refCounters: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma);

        // Even though GRN accepted 50, physical warehouse stock only has 3 left (the rest were issued/consumed)
        let caught = false;
        try {
            await service.createSupplierReturn({
                vendorId: 'vendor-1',
                sourceType: 'GRN',
                sourceReferenceId: 'grn-1',
                reason: 'Recalled goods return attempt',
                items: [{ productId: standardProduct.id, returnQuantity: 10, goodsReceiptItemId: 'gri-1' }]
            }, scope, user);
        } catch (err: any) {
            caught = true;
            report(err.message.includes('Insufficient available stock'), "Rejects return when available physical stock is less than return quantity (3 < 10)");
        }
        report(caught, "Insufficient stock threw exception");
        report(store.stocks[0].quantity === 3, "Stock remained untouched (still 3, not negative)");
    }

    // -------------------------------------------------------------------------
    // 4. Batch Requirements & Mismatches
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Batch Requirements & Mismatches ---");
    {
        const store: MockStore = {
            vendors: [baseVendor],
            products: [batchProduct],
            stocks: [{ id: 'stock-1', productId: batchProduct.id, quantity: 50, tenantId: 'tenant-1', unitId: 'unit-1' }],
            batches: [{ id: 'batch-1', productId: batchProduct.id, batchNumber: 'BAT-01', quantity: 5, tenantId: 'tenant-1', unitId: 'unit-1' }],
            movements: [],
            auditLogs: [],
            purchaseOrders: [],
            purchaseOrderItems: [],
            goodsReceiptNotes: [{ id: 'grn-1', vendorId: 'vendor-1', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }],
            goodsReceiptItems: [{ id: 'gri-1', goodsReceiptNoteId: 'grn-1', productId: batchProduct.id, receivedQuantity: 20, rejectedQuantity: 0, batchId: 'batch-1', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }],
            purchases: [],
            supplierReturns: [],
            supplierReturnItems: [],
            refCounters: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma);

        // Missing batch on batch-tracked product
        let err1 = false;
        try {
            await service.createSupplierReturn({
                vendorId: 'vendor-1',
                sourceType: 'GRN',
                sourceReferenceId: 'grn-1',
                reason: 'Batch missing test',
                items: [{ productId: batchProduct.id, returnQuantity: 5, goodsReceiptItemId: 'gri-1' }]
            }, scope, user);
        } catch (err: any) {
            err1 = true;
            report(err.message.includes('Batch details are required'), "Rejects batch-tracked product when batch number is missing");
        }
        report(err1, "Missing batch threw exception");

        // Insufficient quantity in the specific batch (batch has 5, trying to return 8)
        let err2 = false;
        try {
            await service.createSupplierReturn({
                vendorId: 'vendor-1',
                sourceType: 'GRN',
                sourceReferenceId: 'grn-1',
                reason: 'Batch balance test',
                items: [{ productId: batchProduct.id, batchId: 'batch-1', returnQuantity: 8, goodsReceiptItemId: 'gri-1' }]
            }, scope, user);
        } catch (err: any) {
            err2 = true;
            report(err.message.includes('Insufficient batch stock'), "Rejects return when selected batch quantity is insufficient (5 < 8)");
        }
        report(err2, "Insufficient batch stock threw exception");
    }

    // -------------------------------------------------------------------------
    // 5. Inactive Vendor or Cross-Vendor Mismatch
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Inactive Vendor or Cross-Vendor Mismatch ---");
    {
        const inactiveVendor = { ...baseVendor, id: 'vend-inactive', name: 'Inactive Supplier', status: false };
        const store: MockStore = {
            vendors: [inactiveVendor, baseVendor],
            products: [standardProduct],
            stocks: [{ id: 'stock-1', productId: standardProduct.id, quantity: 50, tenantId: 'tenant-1', unitId: 'unit-1' }],
            batches: [],
            movements: [],
            auditLogs: [],
            purchaseOrders: [],
            purchaseOrderItems: [],
            goodsReceiptNotes: [{ id: 'grn-1', vendorId: 'vendor-1', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }],
            goodsReceiptItems: [{ id: 'gri-1', goodsReceiptNoteId: 'grn-1', productId: standardProduct.id, receivedQuantity: 20, rejectedQuantity: 0, batchId: null, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }],
            purchases: [],
            supplierReturns: [],
            supplierReturnItems: [],
            refCounters: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma);

        // Inactive vendor
        let err1 = false;
        try {
            await service.createSupplierReturn({
                vendorId: 'vend-inactive',
                sourceType: 'GRN',
                reason: 'Inactive vendor test',
                items: [{ productId: standardProduct.id, returnQuantity: 5 }]
            }, scope, user);
        } catch (err: any) {
            err1 = true;
            report(err.message.includes('inactive and cannot accept returns'), "Rejects return to deactivated supplier");
        }
        report(err1, "Inactive vendor threw exception");

        // Vendor mismatch (GRN belongs to vendor-1, but return sent to another vendor)
        const vendor2 = { ...baseVendor, id: 'vendor-2', name: 'Other Vendor Ltd' };
        store.vendors.push(vendor2);

        let err2 = false;
        try {
            await service.createSupplierReturn({
                vendorId: 'vendor-2',
                sourceType: 'GRN',
                sourceReferenceId: 'grn-1',
                reason: 'Vendor mismatch test',
                items: [{ productId: standardProduct.id, returnQuantity: 5, goodsReceiptItemId: 'gri-1' }]
            }, scope, user);
        } catch (err: any) {
            err2 = true;
            report(err.message.includes('GRN vendor mismatch'), "Rejects return when GRN belongs to a different supplier");
        }
        report(err2, "Vendor mismatch threw exception");
    }

    // -------------------------------------------------------------------------
    // 6. Safe Idempotency Retry Protection (No Double Deduction)
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Safe Idempotency Retry Protection ---");
    {
        const store: MockStore = {
            vendors: [baseVendor],
            products: [standardProduct],
            stocks: [{ id: 'stock-1', productId: standardProduct.id, quantity: 50, tenantId: 'tenant-1', unitId: 'unit-1' }],
            batches: [],
            movements: [],
            auditLogs: [],
            purchaseOrders: [],
            purchaseOrderItems: [],
            goodsReceiptNotes: [{ id: 'grn-1', vendorId: 'vendor-1', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }],
            goodsReceiptItems: [{ id: 'gri-1', goodsReceiptNoteId: 'grn-1', productId: standardProduct.id, receivedQuantity: 30, rejectedQuantity: 0, batchId: null, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }],
            purchases: [],
            supplierReturns: [],
            supplierReturnItems: [],
            refCounters: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma);

        const payload = {
            vendorId: 'vendor-1',
            sourceType: 'GRN',
            sourceReferenceId: 'grn-1',
            reason: 'Damaged item return with idempotency',
            idempotencyKey: 'safe-retry-key-777',
            items: [{ productId: standardProduct.id, returnQuantity: 10, goodsReceiptItemId: 'gri-1' }]
        };

        // First attempt
        const firstRet = await service.createSupplierReturn(payload, scope, user);
        report(Boolean(firstRet), "First return attempt succeeds");
        report(store.stocks[0].quantity === 40, "Stock decremented from 50 to 40 on first attempt");
        report(store.movements.length === 1, "Exactly 1 stock movement created on first attempt");

        // Retry with IDENTICAL idempotency key
        const retryRet = await service.createSupplierReturn(payload, scope, user);
        report(retryRet?.id === firstRet?.id, "Idempotent retry returns identical existing return record");
        report(store.stocks[0].quantity === 40, "Stock balance NOT doubled on retry (remains 40)");
        report(store.movements.length === 1, "Zero additional stock movements created on retry");
    }

    // -------------------------------------------------------------------------
    // 7. Transaction Rollback on Failure
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Transaction Rollback on Failure ---");
    {
        const store: MockStore = {
            vendors: [baseVendor],
            products: [standardProduct],
            stocks: [{ id: 'stock-1', productId: standardProduct.id, quantity: 50, tenantId: 'tenant-1', unitId: 'unit-1' }],
            batches: [],
            movements: [],
            auditLogs: [],
            purchaseOrders: [],
            purchaseOrderItems: [],
            goodsReceiptNotes: [{ id: 'grn-1', vendorId: 'vendor-1', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }],
            goodsReceiptItems: [{ id: 'gri-1', goodsReceiptNoteId: 'grn-1', productId: standardProduct.id, receivedQuantity: 30, rejectedQuantity: 0, batchId: null, tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false }],
            purchases: [],
            supplierReturns: [],
            supplierReturnItems: [],
            refCounters: []
        };

        // Simulate failure during AuditLog insertion
        const mockPrisma = createMockPrisma(store, { failAuditLog: true });
        const service = new InventoryService(mockPrisma);

        let caught = false;
        try {
            await service.createSupplierReturn({
                vendorId: 'vendor-1',
                sourceType: 'GRN',
                sourceReferenceId: 'grn-1',
                reason: 'Rollback test submission',
                items: [{ productId: standardProduct.id, returnQuantity: 10, goodsReceiptItemId: 'gri-1' }]
            }, scope, user);
        } catch (err: any) {
            caught = true;
            report(err.message.includes('AuditLog failure injected'), "Transaction caught injected failure");
        }
        report(caught, "Transaction threw error as expected");
        report(store.stocks[0].quantity === 50, "Stock was rolled back completely (remains 50)");
        report(store.movements.length === 0, "No orphaned stock movements left after rollback");
        report(store.supplierReturns.length === 0, "No orphaned supplier returns left after rollback");
    }

    // -------------------------------------------------------------------------
    // 8. List & Detail Query Methods
    // -------------------------------------------------------------------------
    console.log("\n--- 8. List & Detail Query Methods ---");
    {
        const store: MockStore = {
            vendors: [baseVendor],
            products: [standardProduct],
            stocks: [{ id: 'stock-1', productId: standardProduct.id, quantity: 50, tenantId: 'tenant-1', unitId: 'unit-1' }],
            batches: [],
            movements: [],
            auditLogs: [],
            purchaseOrders: [],
            purchaseOrderItems: [],
            goodsReceiptNotes: [],
            goodsReceiptItems: [],
            purchases: [],
            supplierReturns: [
                {
                    id: 'ret-uuid-1',
                    returnNumber: 'RET-000001',
                    vendorId: 'vendor-1',
                    sourceType: 'GRN',
                    sourceReference: 'GRN-000001',
                    returnDate: new Date(),
                    reason: 'Quality rejection return',
                    status: 'COMPLETED',
                    totalQuantity: 10,
                    returnedByName: 'John',
                    tenantId: 'tenant-1',
                    unitId: 'unit-1',
                    isDeleted: false
                }
            ],
            supplierReturnItems: [
                {
                    id: 'item-uuid-1',
                    supplierReturnId: 'ret-uuid-1',
                    productId: standardProduct.id,
                    returnQuantity: 10,
                    reason: 'Broken seals',
                    isDeleted: false
                }
            ],
            refCounters: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma);

        const list = await service.getSupplierReturns(scope);
        report(list.data.length === 1, "List returns 1 supplier return");
        report(list.data[0].returnNumber === 'RET-000001', "List includes returnNumber");
        report(list.pagination.total === 1, "List pagination total is 1");

        const detail = await service.getSupplierReturnById('ret-uuid-1', scope);
        report(Boolean(detail), "Detail returns requested record");
        report(detail.items.length === 1, "Detail includes line items");
        report(detail.items[0].returnQuantity === 10, "Line item returnQuantity is 10");
    }

    console.log("\n===============================================================================");
    console.log(` Summary: ${passed} passed, ${failed} failed across 8 test suites.`);
    console.log("===============================================================================\n");

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error("Fatal test runner error:", err);
    process.exit(1);
});
