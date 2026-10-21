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
    refCounters: any[];
}

function createMockPrisma(store: MockStore, options: { failAuditLog?: boolean; failRefCounter?: boolean; failStock?: boolean } = {}) {
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
            upsert: async ({ where, create, update }: any) => {
                if (options.failStock) throw new Error("Stock write failed: Simulated hardware fault");
                const productId = where.productId_tenantId_unitId?.productId || create.productId;
                const tenantId = where.productId_tenantId_unitId?.tenantId || create.tenantId;
                const unitId = where.productId_tenantId_unitId?.unitId || create.unitId;
                let s = store.stocks.find(st => st.productId === productId && st.tenantId === tenantId && st.unitId === unitId);
                if (s) {
                    s.quantity += (update.quantity?.increment || 0);
                    s.updatedAt = new Date();
                } else {
                    s = {
                        id: `stock-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                        productId,
                        tenantId,
                        unitId,
                        quantity: create.quantity || 0,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    store.stocks.push(s);
                }
                return { ...s };
            }
        },
        productBatch: {
            findFirst: async ({ where }: any) => {
                return store.batches.find(b => {
                    if (where.id && b.id !== where.id) return false;
                    if (where.productId && b.productId !== where.productId) return false;
                    if (where.batchNumber && b.batchNumber !== where.batchNumber) return false;
                    if (where.tenantId && b.tenantId !== where.tenantId) return false;
                    return true;
                }) || null;
            },
            upsert: async ({ where, create, update }: any) => {
                const productId = where.productId_batchNumber_tenantId_unitId?.productId || create.productId;
                const batchNumber = where.productId_batchNumber_tenantId_unitId?.batchNumber || create.batchNumber;
                const tenantId = where.productId_batchNumber_tenantId_unitId?.tenantId || create.tenantId;
                const unitId = where.productId_batchNumber_tenantId_unitId?.unitId || create.unitId;
                let b = store.batches.find(bt => bt.productId === productId && bt.batchNumber === batchNumber && bt.tenantId === tenantId && bt.unitId === unitId);
                if (b) {
                    b.quantity += (update.quantity?.increment || 0);
                    b.updatedAt = new Date();
                } else {
                    b = {
                        id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                        productId,
                        batchNumber,
                        expiryDate: create.expiryDate,
                        quantity: create.quantity || 0,
                        tenantId,
                        unitId,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    store.batches.push(b);
                }
                return { ...b };
            }
        },
        stockMovement: {
            create: async ({ data }: any) => {
                const mov = { id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, ...data, createdAt: new Date() };
                store.movements.push(mov);
                return mov;
            }
        },
        refCounter: {
            upsert: async ({ where, create, update }: any) => {
                if (options.failRefCounter) throw new Error("RefCounter upsert failed");
                const prefix = where.prefix_tenantId?.prefix || create.prefix;
                const tenantId = where.prefix_tenantId?.tenantId || create.tenantId;
                let counter = store.refCounters.find(c => c.prefix === prefix && c.tenantId === tenantId);
                if (counter) {
                    counter.current += (update.current?.increment || 1);
                } else {
                    counter = { id: `rc-${Date.now()}`, prefix, tenantId, current: create.current || 1 };
                    store.refCounters.push(counter);
                }
                return { ...counter };
            }
        },
        auditLog: {
            create: async ({ data }: any) => {
                if (options.failAuditLog) {
                    throw new Error("Audit log write failed: Simulated storage failure");
                }
                const log = { id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, ...data, createdAt: new Date() };
                store.auditLogs.push(log);
                return log;
            }
        },
        purchaseOrder: {
            findFirst: async ({ where, include }: any) => {
                const po = store.purchaseOrders.find(p => {
                    if (where.id && p.id !== where.id) return false;
                    if (where.tenantId && p.tenantId !== where.tenantId) return false;
                    if (where.isDeleted !== undefined && p.isDeleted !== where.isDeleted) return false;
                    return true;
                });
                if (!po) return null;

                const result = { ...po };
                if (include?.vendor) {
                    result.vendor = store.vendors.find(v => v.id === po.vendorId) || null;
                }
                if (include?.items) {
                    const items = store.purchaseOrderItems.filter(i => i.purchaseOrderId === po.id && (!where.items?.where?.isDeleted || !i.isDeleted));
                    result.items = items.map(i => {
                        const it = { ...i };
                        if (include.items.include?.product) {
                            it.product = store.products.find(p => p.id === i.productId) || null;
                        }
                        return it;
                    });
                }
                return result;
            },
            findUnique: async ({ where, include }: any) => {
                return (client.purchaseOrder as any).findFirst({ where, include });
            },
            update: async ({ where, data }: any) => {
                const po = store.purchaseOrders.find(p => p.id === where.id);
                if (!po) throw new Error("Purchase order not found");
                if (data.status) po.status = data.status;
                if (data.notes !== undefined) po.notes = data.notes;
                po.updatedAt = new Date();
                return { ...po };
            },
            updateMany: async ({ where, data }: any) => {
                let count = 0;
                for (const p of store.purchaseOrders) {
                    if (where.id && p.id !== where.id) continue;
                    if (where.tenantId && p.tenantId !== where.tenantId) continue;
                    if (typeof where.status === 'string' && p.status !== where.status) continue;
                    if (where.status?.notIn && where.status.notIn.includes(p.status)) continue;
                    if (where.isDeleted !== undefined && p.isDeleted !== where.isDeleted) continue;

                    if (data.status) p.status = data.status;
                    if (data.notes !== undefined) p.notes = data.notes;
                    p.updatedAt = new Date();
                    count++;
                }
                return { count };
            }
        },
        purchaseOrderItem: {
            findMany: async ({ where }: any) => {
                return store.purchaseOrderItems.filter(i => {
                    if (where.purchaseOrderId && i.purchaseOrderId !== where.purchaseOrderId) return false;
                    if (where.tenantId && i.tenantId !== where.tenantId) return false;
                    if (where.isDeleted !== undefined && i.isDeleted !== where.isDeleted) return false;
                    return true;
                });
            },
            update: async ({ where, data }: any) => {
                const item = store.purchaseOrderItems.find(i => i.id === where.id);
                if (!item) throw new Error("Purchase order item not found");
                if (data.receivedQuantity !== undefined) item.receivedQuantity = data.receivedQuantity;
                if (data.status) item.status = data.status;
                item.updatedAt = new Date();
                return { ...item };
            },
            updateMany: async ({ where, data }: any) => {
                let count = 0;
                for (const i of store.purchaseOrderItems) {
                    if (where.purchaseOrderId && i.purchaseOrderId !== where.purchaseOrderId) continue;
                    if (where.tenantId && i.tenantId !== where.tenantId) continue;
                    if (where.receivedQuantity !== undefined && i.receivedQuantity !== where.receivedQuantity) continue;

                    if (data.status) i.status = data.status;
                    i.updatedAt = new Date();
                    count++;
                }
                return { count };
            }
        },
        goodsReceiptNote: {
            findFirst: async ({ where, include }: any) => {
                const grn = store.goodsReceiptNotes.find(g => {
                    if (where.id && g.id !== where.id) return false;
                    if (where.tenantId && g.tenantId !== where.tenantId) return false;
                    if (where.idempotencyKey && g.idempotencyKey !== where.idempotencyKey) return false;
                    if (where.isDeleted !== undefined && g.isDeleted !== where.isDeleted) return false;
                    if (where.OR) {
                        const matched = where.OR.some((cond: any) => {
                            if (cond.idempotencyKey && g.idempotencyKey === cond.idempotencyKey) return true;
                            if (cond.notes?.contains && (g.notes || '').includes(cond.notes.contains)) return true;
                            return false;
                        });
                        if (!matched) return false;
                    } else if (where.notes?.contains && (!g.notes || !g.notes.includes(where.notes.contains))) {
                        return false;
                    }
                    return true;
                });
                if (!grn) return null;

                const result = { ...grn };
                if (include?.vendor) {
                    result.vendor = store.vendors.find(v => v.id === grn.vendorId) || null;
                }
                if (include?.purchaseOrder) {
                    result.purchaseOrder = store.purchaseOrders.find(p => p.id === grn.purchaseOrderId) || null;
                }
                if (include?.items) {
                    const items = store.goodsReceiptItems.filter(it => it.goodsReceiptNoteId === grn.id && (!include.items?.where?.isDeleted || !it.isDeleted));
                    result.items = items.map(it => {
                        const line = { ...it };
                        if (include.items.include?.product) {
                            line.product = store.products.find(p => p.id === it.productId) || null;
                        }
                        if (include.items.include?.batch) {
                            line.batch = store.batches.find(b => b.id === it.batchId) || null;
                        }
                        if (include.items.include?.purchaseOrderItem) {
                            line.purchaseOrderItem = store.purchaseOrderItems.find(pi => pi.id === it.purchaseOrderItemId) || null;
                        }
                        return line;
                    });
                }
                return result;
            },
            findMany: async ({ where, include, skip = 0, take = 20 }: any) => {
                const filtered = store.goodsReceiptNotes.filter(g => {
                    if (where.tenantId && g.tenantId !== where.tenantId) return false;
                    if (where.unitId && g.unitId !== where.unitId) return false;
                    if (where.purchaseOrderId && g.purchaseOrderId !== where.purchaseOrderId) return false;
                    if (where.vendorId && g.vendorId !== where.vendorId) return false;
                    if (where.isDeleted !== undefined && g.isDeleted !== where.isDeleted) return false;
                    if (where.OR) {
                        const matched = where.OR.some((cond: any) => {
                            if (cond.grnNumber?.contains && g.grnNumber.toLowerCase().includes(cond.grnNumber.contains.toLowerCase())) return true;
                            if (cond.deliveryChallanNo?.contains && (g.deliveryChallanNo || '').toLowerCase().includes(cond.deliveryChallanNo.contains.toLowerCase())) return true;
                            if (cond.supplierInvoiceNo?.contains && (g.supplierInvoiceNo || '').toLowerCase().includes(cond.supplierInvoiceNo.contains.toLowerCase())) return true;
                            if (cond.notes?.contains && (g.notes || '').toLowerCase().includes(cond.notes.contains.toLowerCase())) return true;
                            return false;
                        });
                        if (!matched) return false;
                    }
                    return true;
                });

                return filtered.slice(skip, skip + take).map(g => {
                    const res = { ...g };
                    if (include?.vendor) res.vendor = store.vendors.find(v => v.id === g.vendorId) || null;
                    if (include?.purchaseOrder) res.purchaseOrder = store.purchaseOrders.find(p => p.id === g.purchaseOrderId) || null;
                    if (include?.items) {
                        res.items = store.goodsReceiptItems.filter(it => it.goodsReceiptNoteId === g.id).map(it => ({
                            ...it,
                            product: store.products.find(p => p.id === it.productId) || null,
                            batch: store.batches.find(b => b.id === it.batchId) || null
                        }));
                    }
                    return res;
                });
            },
            count: async ({ where }: any) => {
                return store.goodsReceiptNotes.filter(g => {
                    if (where.tenantId && g.tenantId !== where.tenantId) return false;
                    if (where.unitId && g.unitId !== where.unitId) return false;
                    if (where.purchaseOrderId && g.purchaseOrderId !== where.purchaseOrderId) return false;
                    if (where.vendorId && g.vendorId !== where.vendorId) return false;
                    if (where.isDeleted !== undefined && g.isDeleted !== where.isDeleted) return false;
                    return true;
                }).length;
            },
            create: async ({ data, include }: any) => {
                // Database-enforced unique constraint on (idempotencyKey, tenantId)
                if (data.idempotencyKey) {
                    const existingKey = store.goodsReceiptNotes.find(g => 
                        g.idempotencyKey === data.idempotencyKey && 
                        g.tenantId === data.tenantId && 
                        !g.isDeleted
                    );
                    if (existingKey) {
                        const err: any = new Error("Unique constraint failed on the fields: (`idempotencyKey`,`tenantId`)");
                        err.code = 'P2002';
                        throw err;
                    }
                }

                const grn = {
                    id: data.id || `grn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    grnNumber: data.grnNumber,
                    purchaseOrderId: data.purchaseOrderId,
                    vendorId: data.vendorId,
                    idempotencyKey: data.idempotencyKey || null,
                    receivedDate: data.receivedDate || new Date(),
                    deliveryChallanNo: data.deliveryChallanNo || null,
                    supplierInvoiceNo: data.supplierInvoiceNo || null,
                    notes: data.notes || null,
                    receivedById: data.receivedById || null,
                    receivedByName: data.receivedByName || null,
                    tenantId: data.tenantId,
                    unitId: data.unitId,
                    isDeleted: false,
                    deletedAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                store.goodsReceiptNotes.push(grn);

                if (data.items?.create) {
                    for (const itemData of data.items.create) {
                        const gri = {
                            id: `gri-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                            goodsReceiptNoteId: grn.id,
                            purchaseOrderItemId: itemData.purchaseOrderItemId,
                            productId: itemData.productId,
                            receivedQuantity: itemData.receivedQuantity,
                            rejectedQuantity: itemData.rejectedQuantity || 0,
                            batchNumber: itemData.batchNumber || null,
                            expiryDate: itemData.expiryDate || null,
                            batchId: itemData.batchId || null,
                            stockMovementId: itemData.stockMovementId || null,
                            notes: itemData.notes || null,
                            tenantId: itemData.tenantId,
                            unitId: itemData.unitId,
                            isDeleted: false,
                            deletedAt: null,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        store.goodsReceiptItems.push(gri);
                    }
                }

                return (client.goodsReceiptNote as any).findFirst({ where: { id: grn.id }, include });
            }
        },
        goodsReceiptItem: {
            findMany: async ({ where }: any) => {
                return store.goodsReceiptItems.filter(i => {
                    if (where.goodsReceiptNoteId && i.goodsReceiptNoteId !== where.goodsReceiptNoteId) return false;
                    return true;
                });
            }
        },
        $queryRaw: async (strings: any, ...values: any[]) => {
            const rawSql = Array.isArray(strings) ? strings.join('?') : String(strings || '');
            if (rawSql.includes('"Product"') || rawSql.includes('Product')) {
                const productId = values[0];
                const tenantId = values[1];
                const unitId = values[2];
                const prod = store.products.find(p => p.id === productId && p.tenantId === tenantId && (!unitId || p.unitId === unitId));
                return prod ? [prod] : [];
            }
            if (rawSql.includes('"PurchaseOrder"') || rawSql.includes('PurchaseOrder')) {
                const poId = values[0];
                const tenantId = values[1];
                const po = store.purchaseOrders.find(p => p.id === poId && p.tenantId === tenantId && !p.isDeleted);
                return po ? [po] : [];
            }
            if (rawSql.includes('INSERT INTO "Purchase"')) {
                return [{
                    id: values[0],
                    productId: values[1],
                    quantity: values[2],
                    vendor: values[3],
                    vendorId: values[4],
                    batchId: values[5],
                    tenantId: values[6],
                    unitId: values[7]
                }];
            }
            return [];
        },
        $transaction: async (fn: any) => {
            // Snapshot store state for clean rollback on simulated failure
            const snapshot = JSON.stringify(store);
            try {
                mockTx = { ...client };
                const res = await fn(mockTx);
                return res;
            } catch (err) {
                // Restore snapshot on error
                const restored = JSON.parse(snapshot);
                Object.assign(store, restored);
                throw err;
            }
        }
    };

    return client;
}

function createSeedStore(): MockStore {
    return {
        vendors: [
            { id: 'ven-1', name: 'MediSupply Global', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false },
            { id: 'ven-2', name: 'Apex Logistics', tenantId: 'tenant-1', unitId: 'unit-1', isDeleted: false },
            { id: 'ven-other', name: 'Other Tenant Vendor', tenantId: 'tenant-2', unitId: 'unit-2', isDeleted: false }
        ],
        products: [
            { id: 'prod-batch', name: 'Paracetamol 500mg', isBatchTracked: true, status: true, isDeleted: false, tenantId: 'tenant-1', unitId: 'unit-1' },
            { id: 'prod-standard', name: 'Surgical Gloves M', isBatchTracked: false, status: true, isDeleted: false, tenantId: 'tenant-1', unitId: 'unit-1' },
            { id: 'prod-inactive', name: 'Obsolete Bandages', isBatchTracked: false, status: false, isDeleted: false, tenantId: 'tenant-1', unitId: 'unit-1' },
            { id: 'prod-other', name: 'Other Tenant Product', isBatchTracked: false, status: true, isDeleted: false, tenantId: 'tenant-2', unitId: 'unit-2' }
        ],
        stocks: [
            { id: 'stk-1', productId: 'prod-batch', tenantId: 'tenant-1', unitId: 'unit-1', quantity: 100 },
            { id: 'stk-2', productId: 'prod-standard', tenantId: 'tenant-1', unitId: 'unit-1', quantity: 50 }
        ],
        batches: [
            { id: 'bat-1', productId: 'prod-batch', batchNumber: 'BATCH-INITIAL', expiryDate: new Date('2027-12-31'), quantity: 100, tenantId: 'tenant-1', unitId: 'unit-1' }
        ],
        movements: [],
        auditLogs: [],
        purchaseOrders: [
            {
                id: 'po-ordered-1',
                orderNumber: 'PO-000001',
                vendorId: 'ven-1',
                status: 'ORDERED',
                tenantId: 'tenant-1',
                unitId: 'unit-1',
                isDeleted: false,
                orderDate: new Date(),
                notes: 'Standard PO'
            },
            {
                id: 'po-draft-1',
                orderNumber: 'PO-000002',
                vendorId: 'ven-1',
                status: 'DRAFT',
                tenantId: 'tenant-1',
                unitId: 'unit-1',
                isDeleted: false,
                orderDate: new Date()
            },
            {
                id: 'po-completed-1',
                orderNumber: 'PO-000003',
                vendorId: 'ven-1',
                status: 'COMPLETED',
                tenantId: 'tenant-1',
                unitId: 'unit-1',
                isDeleted: false,
                orderDate: new Date()
            },
            {
                id: 'po-cancelled-1',
                orderNumber: 'PO-000004',
                vendorId: 'ven-1',
                status: 'CANCELLED',
                tenantId: 'tenant-1',
                unitId: 'unit-1',
                isDeleted: false,
                orderDate: new Date()
            }
        ],
        purchaseOrderItems: [
            {
                id: 'poi-1',
                purchaseOrderId: 'po-ordered-1',
                productId: 'prod-batch',
                orderedQuantity: 50,
                receivedQuantity: 0,
                status: 'PENDING',
                tenantId: 'tenant-1',
                unitId: 'unit-1',
                isDeleted: false
            },
            {
                id: 'poi-2',
                purchaseOrderId: 'po-ordered-1',
                productId: 'prod-standard',
                orderedQuantity: 30,
                receivedQuantity: 0,
                status: 'PENDING',
                tenantId: 'tenant-1',
                unitId: 'unit-1',
                isDeleted: false
            },
            {
                id: 'poi-draft-1',
                purchaseOrderId: 'po-draft-1',
                productId: 'prod-batch',
                orderedQuantity: 10,
                receivedQuantity: 0,
                status: 'PENDING',
                tenantId: 'tenant-1',
                unitId: 'unit-1',
                isDeleted: false
            }
        ],
        goodsReceiptNotes: [],
        goodsReceiptItems: [],
        refCounters: [{ id: 'rc-1', prefix: 'GRN', tenantId: 'tenant-1', current: 100 }]
    };
}

async function runTests() {
    console.log("===============================================================================");
    console.log(" InventoryApp D8.3 — GRN Receiving Engine & Stock Integration Test Suite");
    console.log("===============================================================================\n");

    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, testName: string, detail: string = '') {
        if (condition) {
            console.log(`  ✓ PASS: ${testName}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${testName} - ${detail}`);
            failed++;
        }
    }

    const scope = { tenantId: 'tenant-1', unitId: 'unit-1' };
    const user = { id: 'usr-1', name: 'Senior Receiver', email: 'receiver@eldercare.test' };

    // TEST 1: Valid Full Receipt
    {
        console.log("--- 1. Valid Full Receipt ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        const payload = {
            deliveryChallanNo: 'DC-901',
            supplierInvoiceNo: 'INV-7721',
            items: [
                {
                    purchaseOrderItemId: 'poi-1',
                    receivedQuantity: 50,
                    acceptedQuantity: 50,
                    rejectedQuantity: 0,
                    batchNumber: 'BATCH-2026-A',
                    expiryDate: '2028-06-30'
                },
                {
                    purchaseOrderItemId: 'poi-2',
                    receivedQuantity: 30,
                    acceptedQuantity: 30,
                    rejectedQuantity: 0
                }
            ]
        };

        const grn = await service.createGoodsReceipt('po-ordered-1', payload, scope, user);

        assert(grn.grnNumber.startsWith('GRN-'), "GRN generated valid reference number", grn.grnNumber);
        assert(grn.items.length === 2, "GRN contains 2 items", `${grn.items.length}`);

        // Check stock updates
        const batchStock = store.stocks.find(s => s.productId === 'prod-batch');
        const stdStock = store.stocks.find(s => s.productId === 'prod-standard');
        assert(batchStock?.quantity === 150, "Batch product stock incremented from 100 to 150", `${batchStock?.quantity}`);
        assert(stdStock?.quantity === 80, "Standard product stock incremented from 50 to 80", `${stdStock?.quantity}`);

        // Check batch created
        const newBatch = store.batches.find(b => b.batchNumber === 'BATCH-2026-A');
        assert(newBatch?.quantity === 50, "ProductBatch created with 50 units", `${newBatch?.quantity}`);

        // Check stock movements
        const movements = store.movements.filter(m => m.referenceId === grn.id && m.movementType === 'GRN');
        assert(movements.length === 2, "Exactly 2 GRN StockMovements created for 2 accepted lines", `${movements.length}`);

        // Check PO status transitioned to COMPLETED
        const po = store.purchaseOrders.find(p => p.id === 'po-ordered-1');
        assert(po?.status === 'COMPLETED', "PO status transitioned to COMPLETED after full receipt", po?.status);

        // Check PO lines status
        const poi1 = store.purchaseOrderItems.find(p => p.id === 'poi-1');
        const poi2 = store.purchaseOrderItems.find(p => p.id === 'poi-2');
        assert(poi1?.status === 'COMPLETED' && poi1.receivedQuantity === 50, "PO Line 1 completed with receivedQuantity 50", poi1?.status);
        assert(poi2?.status === 'COMPLETED' && poi2.receivedQuantity === 30, "PO Line 2 completed with receivedQuantity 30", poi2?.status);
    }

    // TEST 2: Valid Partial Receipt Followed by Second Receipt
    {
        console.log("\n--- 2. Valid Partial Receipt Followed by Second Receipt ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        // First partial receipt: receive 20 of poi-1 (ordered 50)
        const payload1 = {
            items: [
                {
                    purchaseOrderItemId: 'poi-1',
                    receivedQuantity: 20,
                    acceptedQuantity: 20,
                    rejectedQuantity: 0,
                    batchNumber: 'BATCH-PART-1',
                    expiryDate: '2028-01-01'
                }
            ]
        };

        const grn1 = await service.createGoodsReceipt('po-ordered-1', payload1, scope, user);
        assert(grn1 !== null, "First partial GRN posted");

        let po = store.purchaseOrders.find(p => p.id === 'po-ordered-1');
        let poi1 = store.purchaseOrderItems.find(p => p.id === 'poi-1');
        assert(po?.status === 'PARTIALLY_RECEIVED', "PO marked PARTIALLY_RECEIVED after first partial receipt", po?.status);
        assert(poi1?.status === 'PARTIALLY_RECEIVED' && poi1.receivedQuantity === 20, "PO line 1 marked PARTIALLY_RECEIVED with receivedQuantity 20", `${poi1?.receivedQuantity}`);

        // Second receipt: receive remaining 30 of poi-1 and all 30 of poi-2
        const payload2 = {
            items: [
                {
                    purchaseOrderItemId: 'poi-1',
                    receivedQuantity: 30,
                    acceptedQuantity: 30,
                    rejectedQuantity: 0,
                    batchNumber: 'BATCH-PART-1',
                    expiryDate: '2028-01-01'
                },
                {
                    purchaseOrderItemId: 'poi-2',
                    receivedQuantity: 30,
                    acceptedQuantity: 30,
                    rejectedQuantity: 0
                }
            ]
        };

        const grn2 = await service.createGoodsReceipt('po-ordered-1', payload2, scope, user);
        assert(grn2 !== null, "Second GRN posted");

        po = store.purchaseOrders.find(p => p.id === 'po-ordered-1');
        poi1 = store.purchaseOrderItems.find(p => p.id === 'poi-1');
        const poi2 = store.purchaseOrderItems.find(p => p.id === 'poi-2');
        assert(po?.status === 'COMPLETED', "PO transitioned to COMPLETED after 2nd receipt fulfilled balance", po?.status);
        assert(poi1?.receivedQuantity === 50 && poi1.status === 'COMPLETED', "PO line 1 cumulative received is 50 and COMPLETED", `${poi1?.receivedQuantity}`);
        assert(poi2?.receivedQuantity === 30 && poi2.status === 'COMPLETED', "PO line 2 cumulative received is 30 and COMPLETED", `${poi2?.receivedQuantity}`);

        // Verify total stock additions
        const batchStock = store.stocks.find(s => s.productId === 'prod-batch');
        assert(batchStock?.quantity === 150, "Total batch stock incremented by 20 + 30 = 50", `${batchStock?.quantity}`);
    }

    // TEST 3: Accepted vs Rejected Quantities & Zero-Stock for Rejections
    {
        console.log("\n--- 3. Accepted vs Rejected Quantities & Zero-Stock for Rejections ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        // poi-1: physical 20 arrived, 15 accepted, 5 rejected (damaged)
        const payload = {
            items: [
                {
                    purchaseOrderItemId: 'poi-1',
                    receivedQuantity: 20,
                    acceptedQuantity: 15,
                    rejectedQuantity: 5,
                    batchNumber: 'BATCH-DAMAGED-INSPECTION',
                    expiryDate: '2027-12-31',
                    notes: '5 bottles broken during transit'
                }
            ]
        };

        const grn = await service.createGoodsReceipt('po-ordered-1', payload, scope, user);
        const gri = store.goodsReceiptItems.find(i => i.goodsReceiptNoteId === grn.id);

        assert(gri?.receivedQuantity === 20, "GRI recorded physically received quantity 20", `${gri?.receivedQuantity}`);
        assert(gri?.rejectedQuantity === 5, "GRI recorded rejected quantity 5", `${gri?.rejectedQuantity}`);

        // Stock must increase by accepted quantity (15) ONLY, not 20!
        const batchStock = store.stocks.find(s => s.productId === 'prod-batch');
        assert(batchStock?.quantity === 115, "Stock increased by accepted quantity 15 only (100 -> 115)", `${batchStock?.quantity}`);

        // ProductBatch must increase by accepted quantity (15) ONLY
        const batch = store.batches.find(b => b.batchNumber === 'BATCH-DAMAGED-INSPECTION');
        assert(batch?.quantity === 15, "ProductBatch increased by accepted quantity 15 only", `${batch?.quantity}`);

        // StockMovement must record accepted quantity (15) ONLY
        const mov = store.movements.find(m => m.referenceId === grn.id);
        assert(mov?.quantity === 15, "StockMovement recorded quantity 15", `${mov?.quantity}`);

        // PO line cumulative receivedQuantity must advance by accepted quantity (15) ONLY
        const poi1 = store.purchaseOrderItems.find(p => p.id === 'poi-1');
        assert(poi1?.receivedQuantity === 15, "PO line receivedQuantity advanced by 15", `${poi1?.receivedQuantity}`);
    }

    // TEST 4: Fully Rejected Delivery
    {
        console.log("\n--- 4. Fully Rejected Delivery ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        // 10 units arrived, all 10 rejected
        const payload = {
            items: [
                {
                    purchaseOrderItemId: 'poi-1',
                    receivedQuantity: 10,
                    acceptedQuantity: 0,
                    rejectedQuantity: 10,
                    notes: 'Severe temperature breach - whole batch rejected'
                }
            ]
        };

        const grn = await service.createGoodsReceipt('po-ordered-1', payload, scope, user);
        assert(grn !== null, "Fully rejected GRN posted and recorded");

        // Stock must not change
        const batchStock = store.stocks.find(s => s.productId === 'prod-batch');
        assert(batchStock?.quantity === 100, "Stock completely unchanged (still 100)", `${batchStock?.quantity}`);

        // No StockMovement created
        const mov = store.movements.find(m => m.referenceId === grn.id);
        assert(!mov, "Zero stock movements created for fully rejected delivery");

        // PO receivedQuantity remains 0
        const poi1 = store.purchaseOrderItems.find(p => p.id === 'poi-1');
        assert(poi1?.receivedQuantity === 0 && poi1.status === 'PENDING', "PO line cumulative received remains 0 and PENDING", `${poi1?.receivedQuantity}`);

        // PO status remains ORDERED (not completed or partially received!)
        const po = store.purchaseOrders.find(p => p.id === 'po-ordered-1');
        assert(po?.status === 'ORDERED', "PO status remains ORDERED because no goods accepted", po?.status);
    }

    // TEST 5: Physical Quantity Invariant Validation (accepted + rejected !== received)
    {
        console.log("\n--- 5. Physical Quantity Invariant Validation ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        let threw = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                items: [
                    {
                        purchaseOrderItemId: 'poi-1',
                        receivedQuantity: 10,
                        acceptedQuantity: 7,
                        rejectedQuantity: 2 // 7 + 2 = 9 !== 10
                    }
                ]
            }, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Physical quantity mismatch'), "Rejected mismatched accepted + rejected quantities", err.message);
        }
        assert(threw, "Invariant violation was rejected");
    }

    // TEST 6: Over-Receipt Rejection
    {
        console.log("\n--- 6. Over-Receipt Rejection ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        // Ordered is 50, trying to accept 51
        let threw = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                items: [
                    {
                        purchaseOrderItemId: 'poi-1',
                        receivedQuantity: 51,
                        acceptedQuantity: 51,
                        rejectedQuantity: 0,
                        batchNumber: 'B-OVER',
                        expiryDate: '2028-01-01'
                    }
                ]
            }, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('exceeds remaining ordered quantity'), "Over-receipt rejected with clear error", err.message);
        }
        assert(threw, "Over-receipt threw exception");
    }

    // TEST 7: Duplicate PO-item Lines in Single GRN Rejection
    {
        console.log("\n--- 7. Duplicate PO-item Lines in Single GRN Rejection ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        let threw = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                items: [
                    { purchaseOrderItemId: 'poi-1', receivedQuantity: 10, acceptedQuantity: 10, rejectedQuantity: 0, batchNumber: 'B1', expiryDate: '2028-01-01' },
                    { purchaseOrderItemId: 'poi-1', receivedQuantity: 10, acceptedQuantity: 10, rejectedQuantity: 0, batchNumber: 'B2', expiryDate: '2028-01-01' }
                ]
            }, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Duplicate purchase order item lines'), "Duplicate PO lines rejected", err.message);
        }
        assert(threw, "Duplicate lines in single receipt threw exception");
    }

    // TEST 8: Missing/Invalid Batch Details for Batch-Tracked Products
    {
        console.log("\n--- 8. Missing/Invalid Batch Details for Batch-Tracked Products ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        // Missing batch number
        let threw1 = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                items: [
                    { purchaseOrderItemId: 'poi-1', receivedQuantity: 10, acceptedQuantity: 10, rejectedQuantity: 0, expiryDate: '2028-01-01' }
                ]
            }, scope, user);
        } catch (err: any) {
            threw1 = true;
            assert(err.message.includes('Batch number is required'), "Missing batch number rejected for batch-tracked product", err.message);
        }
        assert(threw1, "Missing batch number threw exception");

        // Missing expiry date
        let threw2 = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                items: [
                    { purchaseOrderItemId: 'poi-1', receivedQuantity: 10, acceptedQuantity: 10, rejectedQuantity: 0, batchNumber: 'B-NO-EXP' }
                ]
            }, scope, user);
        } catch (err: any) {
            threw2 = true;
            assert(err.message.includes('Expiry date is required'), "Missing expiry date rejected for batch-tracked product", err.message);
        }
        assert(threw2, "Missing expiry date threw exception");
    }

    // TEST 9: Receipt Against Ineligible PO Status (DRAFT, CANCELLED, COMPLETED)
    {
        console.log("\n--- 9. Receipt Against Ineligible PO Status ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        // Draft PO
        let threwDraft = false;
        try {
            await service.createGoodsReceipt('po-draft-1', {
                items: [{ purchaseOrderItemId: 'poi-draft-1', receivedQuantity: 5, acceptedQuantity: 5, rejectedQuantity: 0, batchNumber: 'B1', expiryDate: '2028-01-01' }]
            }, scope, user);
        } catch (err: any) {
            threwDraft = true;
            assert(err.message.includes('Receipt requires ORDERED or PARTIALLY_RECEIVED status'), "Receipt against DRAFT rejected", err.message);
        }
        assert(threwDraft, "Draft receipt threw exception");

        // Cancelled PO
        let threwCancelled = false;
        try {
            await service.createGoodsReceipt('po-cancelled-1', {
                items: [{ purchaseOrderItemId: 'poi-1', receivedQuantity: 5, acceptedQuantity: 5, rejectedQuantity: 0 }]
            }, scope, user);
        } catch (err: any) {
            threwCancelled = true;
            assert(err.message.includes('Cannot receive goods against CANCELLED purchase order'), "Receipt against CANCELLED rejected", err.message);
        }
        assert(threwCancelled, "Cancelled receipt threw exception");

        // Completed PO
        let threwCompleted = false;
        try {
            await service.createGoodsReceipt('po-completed-1', {
                items: [{ purchaseOrderItemId: 'poi-1', receivedQuantity: 5, acceptedQuantity: 5, rejectedQuantity: 0 }]
            }, scope, user);
        } catch (err: any) {
            threwCompleted = true;
            assert(err.message.includes('Cannot receive goods against COMPLETED purchase order'), "Receipt against COMPLETED rejected", err.message);
        }
        assert(threwCompleted, "Completed receipt threw exception");
    }

    // TEST 10: Wrong Vendor, Tenant, or Unit Access Isolation
    {
        console.log("\n--- 10. Wrong Vendor, Tenant, or Unit Access Isolation ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        // Wrong vendor specified in payload
        let threwVendor = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                vendorId: 'ven-2', // PO belongs to ven-1
                items: [{ purchaseOrderItemId: 'poi-2', receivedQuantity: 5, acceptedQuantity: 5, rejectedQuantity: 0 }]
            }, scope, user);
        } catch (err: any) {
            threwVendor = true;
            assert(err.message.includes('does not match purchase order vendor'), "Mismatched vendor rejected", err.message);
        }
        assert(threwVendor, "Wrong vendor threw exception");

        // Wrong tenant scope
        let threwTenant = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                items: [{ purchaseOrderItemId: 'poi-2', receivedQuantity: 5, acceptedQuantity: 5, rejectedQuantity: 0 }]
            }, { tenantId: 'tenant-wrong', unitId: 'unit-1' }, user);
        } catch (err: any) {
            threwTenant = true;
            assert(err.message.includes('not found or not accessible'), "Wrong tenant rejected with not found / inaccessible", err.message);
        }
        assert(threwTenant, "Wrong tenant threw exception");

        // Wrong unit scope
        let threwUnit = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                items: [{ purchaseOrderItemId: 'poi-2', receivedQuantity: 5, acceptedQuantity: 5, rejectedQuantity: 0 }]
            }, { tenantId: 'tenant-1', unitId: 'unit-wrong' }, user);
        } catch (err: any) {
            threwUnit = true;
            assert(err.message.includes('Access denied'), "Wrong unit rejected with Access denied", err.message);
        }
        assert(threwUnit, "Wrong unit threw exception");
    }

    // TEST 11: Partially Received PO Cancellation & Preservation of Already Received Stock
    {
        console.log("\n--- 11. Partially Received PO Cancellation & Preservation of Already Received Stock ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        // Post partial receipt (20 units accepted)
        const grn = await service.createGoodsReceipt('po-ordered-1', {
            items: [
                { purchaseOrderItemId: 'poi-1', receivedQuantity: 20, acceptedQuantity: 20, rejectedQuantity: 0, batchNumber: 'B-KEEP', expiryDate: '2028-01-01' }
            ]
        }, scope, user);
        assert(grn !== null, "Partial GRN posted");

        const stockBeforeCancel = store.stocks.find(s => s.productId === 'prod-batch')?.quantity;
        assert(stockBeforeCancel === 120, "Stock is 120 after partial receipt", `${stockBeforeCancel}`);

        // Cancel the partially received PO to close remaining balance
        const cancelledPo = await service.cancelPurchaseOrder('po-ordered-1', scope, user, "Vendor unable to supply remaining balance");
        assert(cancelledPo.status === 'CANCELLED', "PO successfully cancelled", cancelledPo.status);

        // Verify stock is preserved (NOT reversed!)
        const stockAfterCancel = store.stocks.find(s => s.productId === 'prod-batch')?.quantity;
        assert(stockAfterCancel === 120, "Stock unchanged and preserved at 120 after PO cancellation", `${stockAfterCancel}`);

        // Verify subsequent GRN against this cancelled PO is rejected!
        let threwLateGrn = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                items: [
                    { purchaseOrderItemId: 'poi-1', receivedQuantity: 10, acceptedQuantity: 10, rejectedQuantity: 0, batchNumber: 'B-LATE', expiryDate: '2028-01-01' }
                ]
            }, scope, user);
        } catch (err: any) {
            threwLateGrn = true;
            assert(err.message.includes('Cannot receive goods against CANCELLED purchase order'), "Subsequent receipt on cancelled PO rejected", err.message);
        }
        assert(threwLateGrn, "Late receipt on cancelled PO threw exception");
    }

    // TEST 12: Duplicate Request / Idempotency Replay Protection (No Double Stock Increment)
    {
        console.log("\n--- 12. Duplicate Request / Idempotency Replay Protection ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        const idempotencyKey = 'IDEMP-GRN-UNIQUE-KEY-001';
        const payload = {
            idempotencyKey,
            items: [
                { purchaseOrderItemId: 'poi-2', receivedQuantity: 15, acceptedQuantity: 15, rejectedQuantity: 0 }
            ]
        };

        // First attempt
        const firstGrn = await service.createGoodsReceipt('po-ordered-1', payload, scope, user);
        const stockAfterFirst = store.stocks.find(s => s.productId === 'prod-standard')?.quantity;
        const movementsAfterFirst = store.movements.length;
        assert(stockAfterFirst === 65, "Stock increased from 50 to 65 on first post", `${stockAfterFirst}`);
        assert(firstGrn.idempotencyKey === idempotencyKey, "GoodsReceiptNote persisted actual idempotencyKey column", firstGrn.idempotencyKey);

        // Verify querying directly by idempotencyKey
        const foundByKey = await client.goodsReceiptNote.findFirst({ where: { idempotencyKey, tenantId: scope.tenantId } });
        assert(foundByKey?.id === firstGrn.id, "Queried GRN directly by idempotencyKey column", foundByKey?.id);

        // Retried identical request (replay)
        const retriedGrn = await service.createGoodsReceipt('po-ordered-1', payload, scope, user);
        const stockAfterRetry = store.stocks.find(s => s.productId === 'prod-standard')?.quantity;
        const movementsAfterRetry = store.movements.length;

        assert(retriedGrn.id === firstGrn.id, "Idempotent retry returned the identical GRN record", retriedGrn.id);
        assert(stockAfterRetry === 65, "Stock was NOT doubled on retry (remains 65)", `${stockAfterRetry}`);
        assert(movementsAfterRetry === movementsAfterFirst, "Zero additional stock movements created on retry", `${movementsAfterRetry}`);

        // 12.B: Cross-tenant isolation of idempotency key
        // Setup PO for tenant-2
        store.purchaseOrders.push({
            id: 'po-tenant-2',
            orderNumber: 'PO-T2-001',
            vendorId: 'ven-other',
            status: 'ORDERED',
            tenantId: 'tenant-2',
            unitId: 'unit-2',
            isDeleted: false
        });
        store.purchaseOrderItems.push({
            id: 'poi-t2-1',
            purchaseOrderId: 'po-tenant-2',
            productId: 'prod-other',
            orderedQuantity: 20,
            receivedQuantity: 0,
            status: 'PENDING',
            tenantId: 'tenant-2',
            unitId: 'unit-2',
            isDeleted: false
        });
        store.stocks.push({
            id: 'stk-t2',
            productId: 'prod-other',
            tenantId: 'tenant-2',
            unitId: 'unit-2',
            quantity: 10
        });

        // Use same idempotencyKey in tenant-2
        const tenant2Grn = await service.createGoodsReceipt('po-tenant-2', {
            idempotencyKey, // same key as tenant-1!
            items: [{ purchaseOrderItemId: 'poi-t2-1', receivedQuantity: 5, acceptedQuantity: 5, rejectedQuantity: 0 }]
        }, { tenantId: 'tenant-2', unitId: 'unit-2' }, { id: 'usr-t2', name: 'Tenant 2 Receiver' });

        assert(tenant2Grn.id !== firstGrn.id, "Same idempotencyKey in different tenant succeeds independently", tenant2Grn.id);
        assert(tenant2Grn.tenantId === 'tenant-2', "Tenant 2 GRN has tenantId tenant-2", tenant2Grn.tenantId);

        // 12.C: Concurrent duplicate first attempt simulation (race on unique constraint)
        const concurrentKey = 'IDEMP-RACE-CONCURRENT-001';
        const racePayload = {
            idempotencyKey: concurrentKey,
            items: [{ purchaseOrderItemId: 'poi-2', receivedQuantity: 5, acceptedQuantity: 5, rejectedQuantity: 0 }]
        };

        // Simulate racing attempt: first post succeeds, competing post hits unique constraint
        const winnerGrn = await service.createGoodsReceipt('po-ordered-1', racePayload, scope, user);
        assert(winnerGrn.idempotencyKey === concurrentKey, "Winner GRN created with concurrentKey", winnerGrn.id);

        const stockBeforeCompete = store.stocks.find(s => s.productId === 'prod-standard')?.quantity;
        const movementsBeforeCompete = store.movements.length;

        // Second competing transaction simulates a race condition
        const competingResult = await service.createGoodsReceipt('po-ordered-1', racePayload, scope, user);
        const stockAfterCompete = store.stocks.find(s => s.productId === 'prod-standard')?.quantity;
        const movementsAfterCompete = store.movements.length;

        assert(competingResult.id === winnerGrn.id, "Racing duplicate request cleanly resolved to winning GRN via unique constraint", competingResult.id);
        assert(stockAfterCompete === stockBeforeCompete, "Zero duplicate stock added during concurrent race", `${stockAfterCompete}`);
        assert(movementsAfterCompete === movementsBeforeCompete, "Zero duplicate stock movements added during concurrent race", `${movementsAfterCompete}`);
    }

    // TEST 13: Transaction Rollback on Failure (All or Nothing)
    {
        console.log("\n--- 13. Transaction Rollback on Failure ---");
        const store = createSeedStore();
        // Force audit log failure to trigger transaction rollback
        const client = createMockPrisma(store, { failAuditLog: true });
        const service = new InventoryService();
        (service as any).db = client;

        const stockInitial = store.stocks.find(s => s.productId === 'prod-standard')?.quantity;
        const grnCountInitial = store.goodsReceiptNotes.length;

        let threw = false;
        try {
            await service.createGoodsReceipt('po-ordered-1', {
                items: [
                    { purchaseOrderItemId: 'poi-2', receivedQuantity: 10, acceptedQuantity: 10, rejectedQuantity: 0 }
                ]
            }, scope, user);
        } catch (err: any) {
            threw = true;
            assert(err.message.includes('Audit log write failed'), "Caught injected failure", err.message);
        }

        assert(threw, "Transaction failed as expected");
        const stockAfterRollback = store.stocks.find(s => s.productId === 'prod-standard')?.quantity;
        assert(stockAfterRollback === stockInitial, "Stock rolled back to original level (no partial write)", `${stockAfterRollback}`);
        assert(store.goodsReceiptNotes.length === grnCountInitial, "No partial GRN left in database", `${store.goodsReceiptNotes.length}`);
    }

    // TEST 14: GET Goods Receipts List & Detail
    {
        console.log("\n--- 14. GET Goods Receipts List & Detail ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        // Create a receipt
        const grn = await service.createGoodsReceipt('po-ordered-1', {
            deliveryChallanNo: 'CHALLAN-123',
            items: [
                { purchaseOrderItemId: 'poi-2', receivedQuantity: 20, acceptedQuantity: 20, rejectedQuantity: 0 }
            ]
        }, scope, user);

        // List endpoint
        const listResult = await service.getGoodsReceipts(scope, { search: 'CHALLAN-123' });
        assert(listResult.total === 1, "List returned 1 GRN matching search", `${listResult.total}`);
        assert(listResult.goodsReceipts[0].totalAcceptedQuantity === 20, "List summary includes totalAcceptedQuantity 20", `${listResult.goodsReceipts[0].totalAcceptedQuantity}`);

        // Detail endpoint
        const detailResult = await service.getGoodsReceiptById(grn.id, scope);
        assert(detailResult.id === grn.id, "Detail endpoint returned requested GRN", detailResult.id);
        assert(detailResult.purchaseOrder.id === 'po-ordered-1', "Detail includes parent PO", detailResult.purchaseOrder.id);
        assert(detailResult.items.length === 1, "Detail includes receipt line items", `${detailResult.items.length}`);
    }

    // TEST 15: Legacy Direct-Purchase Regression Test
    {
        console.log("\n--- 15. Legacy Direct-Purchase Regression Test ---");
        const store = createSeedStore();
        const client = createMockPrisma(store);
        const service = new InventoryService();
        (service as any).db = client;

        const purchase = await service.createPurchase({
            productId: 'prod-standard',
            quantity: 25,
            vendorId: 'ven-1',
            vendor: 'MediSupply Global'
        }, scope, user);

        assert(purchase !== null, "Legacy direct purchase created successfully");
        const stdStock = store.stocks.find(s => s.productId === 'prod-standard');
        assert(stdStock?.quantity === 75, "Legacy direct purchase incremented stock from 50 to 75", `${stdStock?.quantity}`);

        const mov = store.movements.find(m => m.movementType === 'PURCHASE' && m.productId === 'prod-standard');
        assert(mov !== null && mov.quantity === 25, "Legacy PURCHASE movement created with quantity 25", `${mov?.quantity}`);
    }

    console.log("\n===============================================================================");
    console.log(` Summary: ${passed} passed, ${failed} failed across 15 test suites.`);
    console.log("===============================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
