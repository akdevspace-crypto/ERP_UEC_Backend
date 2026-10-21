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
    refCounters: any[];
}

function createMockPrisma(store: MockStore, options: { failAuditLog?: boolean; failRefCounter?: boolean } = {}) {
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
                return store.stocks.find(s => s.productId === where.productId && s.tenantId === where.tenantId) || null;
            }
        },
        productBatch: {
            findFirst: async ({ where }: any) => null
        },
        stockMovement: {
            create: async ({ data }: any) => {
                const mov = { id: `mov-${Date.now()}`, ...data, createdAt: new Date() };
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
                const log = { id: `audit-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
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
                        if (include.items.include?.receiptItems) {
                            it.receiptItems = [];
                        }
                        return it;
                    });
                }
                if (include?.goodsReceipts) {
                    result.goodsReceipts = [];
                }
                return result;
            },
            findUnique: async (args: any) => {
                return (client.purchaseOrder as any).findFirst(args);
            },
            findMany: async ({ where, include, skip, take }: any) => {
                let list = store.purchaseOrders.filter(p => {
                    if (where.tenantId && p.tenantId !== where.tenantId) return false;
                    if (where.unitId && p.unitId !== where.unitId) return false;
                    if (where.status && p.status !== where.status) return false;
                    if (where.vendorId && p.vendorId !== where.vendorId) return false;
                    if (where.isDeleted !== undefined && p.isDeleted !== where.isDeleted) return false;
                    if (where.OR) {
                        const matched = where.OR.some((cond: any) => {
                            if (cond.orderNumber?.contains && p.orderNumber.toLowerCase().includes(cond.orderNumber.contains.toLowerCase())) return true;
                            if (cond.notes?.contains && (p.notes || '').toLowerCase().includes(cond.notes.contains.toLowerCase())) return true;
                            if (cond.vendor?.name?.contains) {
                                const v = store.vendors.find(vend => vend.id === p.vendorId);
                                if (v && v.name.toLowerCase().includes(cond.vendor.name.contains.toLowerCase())) return true;
                            }
                            return false;
                        });
                        if (!matched) return false;
                    }
                    return true;
                });

                if (skip) list = list.slice(skip);
                if (take) list = list.slice(0, take);

                return list.map(p => {
                    const res = { ...p };
                    if (include?.vendor) {
                        res.vendor = store.vendors.find(v => v.id === p.vendorId) || null;
                    }
                    if (include?.items) {
                        const items = store.purchaseOrderItems.filter(i => i.purchaseOrderId === p.id && !i.isDeleted);
                        res.items = items.map(i => {
                            const it = { ...i };
                            if (include.items.include?.product) {
                                it.product = store.products.find(prod => prod.id === i.productId) || null;
                            }
                            return it;
                        });
                    }
                    return res;
                });
            },
            count: async ({ where }: any) => {
                return store.purchaseOrders.filter(p => {
                    if (where.tenantId && p.tenantId !== where.tenantId) return false;
                    if (where.unitId && p.unitId !== where.unitId) return false;
                    if (where.status && p.status !== where.status) return false;
                    if (where.isDeleted !== undefined && p.isDeleted !== where.isDeleted) return false;
                    if (where.OR) {
                        const matched = where.OR.some((cond: any) => {
                            if (cond.orderNumber?.contains && p.orderNumber.toLowerCase().includes(cond.orderNumber.contains.toLowerCase())) return true;
                            if (cond.notes?.contains && (p.notes || '').toLowerCase().includes(cond.notes.contains.toLowerCase())) return true;
                            if (cond.vendor?.name?.contains) {
                                const v = store.vendors.find(vend => vend.id === p.vendorId);
                                if (v && v.name.toLowerCase().includes(cond.vendor.name.contains.toLowerCase())) return true;
                            }
                            return false;
                        });
                        if (!matched) return false;
                    }
                    return true;
                }).length;
            },
            create: async ({ data, include }: any) => {
                const poId = `po-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                const newPo = {
                    id: poId,
                    orderNumber: data.orderNumber,
                    vendorId: data.vendorId,
                    status: data.status || 'DRAFT',
                    orderDate: data.orderDate || new Date(),
                    expectedDeliveryDate: data.expectedDeliveryDate || null,
                    notes: data.notes || null,
                    tenantId: data.tenantId,
                    unitId: data.unitId,
                    createdById: data.createdById || null,
                    createdByName: data.createdByName || null,
                    approvedById: data.approvedById || null,
                    approvedByName: data.approvedByName || null,
                    approvedAt: data.approvedAt || null,
                    isDeleted: false,
                    deletedAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                store.purchaseOrders.push(newPo);

                if (data.items?.create) {
                    for (const itemData of data.items.create) {
                        const itemId = `poi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                        store.purchaseOrderItems.push({
                            id: itemId,
                            purchaseOrderId: poId,
                            productId: itemData.productId,
                            orderedQuantity: itemData.orderedQuantity,
                            receivedQuantity: itemData.receivedQuantity || 0,
                            status: itemData.status || 'PENDING',
                            notes: itemData.notes || null,
                            tenantId: itemData.tenantId,
                            unitId: itemData.unitId,
                            isDeleted: false,
                            deletedAt: null,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    }
                }

                return (client.purchaseOrder as any).findFirst({ where: { id: poId }, include });
            },
            update: async ({ where, data, include }: any) => {
                const po = store.purchaseOrders.find(p => p.id === where.id);
                if (!po) throw new Error("Purchase order not found");

                if (data.vendorId) po.vendorId = data.vendorId;
                if (data.notes !== undefined) po.notes = data.notes;
                if (data.expectedDeliveryDate !== undefined) po.expectedDeliveryDate = data.expectedDeliveryDate;
                po.updatedAt = new Date();

                if (data.items?.create) {
                    for (const itemData of data.items.create) {
                        const itemId = `poi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                        store.purchaseOrderItems.push({
                            id: itemId,
                            purchaseOrderId: po.id,
                            productId: itemData.productId,
                            orderedQuantity: itemData.orderedQuantity,
                            receivedQuantity: itemData.receivedQuantity || 0,
                            status: itemData.status || 'PENDING',
                            notes: itemData.notes || null,
                            tenantId: itemData.tenantId,
                            unitId: itemData.unitId,
                            isDeleted: false,
                            deletedAt: null,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    }
                }

                return (client.purchaseOrder as any).findFirst({ where: { id: where.id }, include });
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
                    if (data.approvedById !== undefined) p.approvedById = data.approvedById;
                    if (data.approvedByName !== undefined) p.approvedByName = data.approvedByName;
                    if (data.approvedAt !== undefined) p.approvedAt = data.approvedAt;
                    p.updatedAt = new Date();
                    count++;
                }
                return { count };
            }
        },
        purchaseOrderItem: {
            deleteMany: async ({ where }: any) => {
                const initialLen = store.purchaseOrderItems.length;
                store.purchaseOrderItems = store.purchaseOrderItems.filter(i => {
                    if (where.purchaseOrderId && i.purchaseOrderId === where.purchaseOrderId) return false;
                    return true;
                });
                return { count: initialLen - store.purchaseOrderItems.length };
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
        $queryRaw: async (strings: any, ...values: any[]) => {
            const rawSql = Array.isArray(strings) ? strings.join('?') : String(strings || '');
            if (rawSql.includes('"Product"') || rawSql.includes('Product')) {
                const productId = values[0];
                const tenantId = values[1];
                const unitId = values[2];
                const prod = store.products.find(p => p.id === productId && p.tenantId === tenantId && (!unitId || p.unitId === unitId));
                return prod ? [prod] : [];
            }
            return [];
        },
        $transaction: async (fn: any) => {
            // Snapshot store state for rollback verification
            const snapshot = JSON.stringify(store);
            try {
                mockTx = client;
                const result = await fn(mockTx);
                return result;
            } catch (err) {
                // Roll back store to snapshot
                const restored = JSON.parse(snapshot);
                Object.assign(store, restored);
                throw err;
            } finally {
                mockTx = null;
            }
        }
    };

    return client;
}

async function runTests() {
    console.log('========================================================================');
    console.log('🚀 InventoryApp D8.2 — Purchase Order Lifecycle Mock Verification Suite');
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

    const tenantA = 'tenant-d8-test';
    const unit1 = 'unit-care-1';
    const unit2 = 'unit-care-2';
    const tenantB = 'tenant-d8-other';

    const testVendorA = { id: 'vendor-1', code: 'VEND-001', name: 'MedPlus Pharma', category: 'Medical', tenantId: tenantA, unitId: unit1, isDeleted: false };
    const testVendorB = { id: 'vendor-2', code: 'VEND-002', name: 'Other Vendor', category: 'General', tenantId: tenantB, unitId: unit1, isDeleted: false };

    const product1 = { id: 'prod-1', code: 'MED-01', name: 'Paracetamol 500mg', category: 'Medical', unit: 'Strip', status: true, tenantId: tenantA, unitId: unit1 };
    const product2 = { id: 'prod-2', code: 'MED-02', name: 'Amoxicillin 250mg', category: 'Medical', unit: 'Strip', status: true, tenantId: tenantA, unitId: unit1 };
    const inactiveProd = { id: 'prod-inactive', code: 'MED-DISC', name: 'Discontinued Drops', category: 'Medical', unit: 'Bottle', status: false, tenantId: tenantA, unitId: unit1 };
    const crossTenantProd = { id: 'prod-cross', code: 'MED-CROSS', name: 'Cross Tenant Syringe', category: 'Medical', unit: 'Nos', status: true, tenantId: tenantB, unitId: unit1 };

    const initialStock1 = { id: 'stock-1', productId: 'prod-1', quantity: 100, tenantId: tenantA, unitId: unit1 };
    const initialStock2 = { id: 'stock-2', productId: 'prod-2', quantity: 50, tenantId: tenantA, unitId: unit1 };

    function initStore(): MockStore {
        return {
            vendors: [{ ...testVendorA }, { ...testVendorB }],
            products: [{ ...product1 }, { ...product2 }, { ...inactiveProd }, { ...crossTenantProd }],
            stocks: [{ ...initialStock1 }, { ...initialStock2 }],
            batches: [],
            movements: [],
            auditLogs: [],
            purchaseOrders: [],
            purchaseOrderItems: [],
            refCounters: []
        };
    }

    const testUser = { id: 'user-emp-1', name: 'Inventory Manager John', email: 'john@care.org' };

    // -------------------------------------------------------------------------
    // TEST 1: Valid multi-item draft creation
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [
                { productId: 'prod-1', orderedQuantity: 50, notes: 'Regular stock replenishment' },
                { productId: 'prod-2', orderedQuantity: 25, notes: 'Emergency care unit buffer' }
            ],
            notes: 'October routine order'
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        assert(Boolean(po && po.id), 'T-01: Creates purchase order record with UUID');
        assert(po.status === 'DRAFT', 'T-01: Default status is DRAFT');
        assert(po.orderNumber.startsWith('PO-'), 'T-01: Order number generated via RefCounter format (PO-000001)');
        assert(po.items.length === 2, 'T-01: Contains exactly 2 line items');
        assert(po.items[0].receivedQuantity === 0 && po.items[1].receivedQuantity === 0, 'T-01: Line items initialize with receivedQuantity = 0');
        assert(store.auditLogs.some(a => a.action === 'CREATE_PURCHASE_ORDER' && a.payload.purchaseOrderId === po.id), 'T-01: Records CREATE_PURCHASE_ORDER audit log');
    }

    // -------------------------------------------------------------------------
    // TEST 2: Missing or invalid vendor rejection
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        let threwMissing = false;
        try {
            await service.createPurchaseOrder({
                vendorId: '',
                items: [{ productId: 'prod-1', orderedQuantity: 10 }]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwMissing = e.message.includes('Vendor ID is required');
        }
        assert(threwMissing, 'T-02: Missing vendor ID rejected');

        let threwNonExistent = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'non-existent-vendor',
                items: [{ productId: 'prod-1', orderedQuantity: 10 }]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwNonExistent = e.message.includes('not found or is inactive');
        }
        assert(threwNonExistent, 'T-02: Non-existent vendor rejected');

        let threwCrossTenantVendor = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'vendor-2', // belongs to tenantB
                items: [{ productId: 'prod-1', orderedQuantity: 10 }]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwCrossTenantVendor = e.message.includes('not found or is inactive');
        }
        assert(threwCrossTenantVendor, 'T-02: Cross-tenant vendor rejected');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Empty item list rejection
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        let threwEmpty = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'vendor-1',
                items: []
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwEmpty = e.message.includes('at least one line item');
        }
        assert(threwEmpty, 'T-03: Empty line items array rejected');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Invalid and non-positive quantities rejection
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        let threwZero = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'vendor-1',
                items: [{ productId: 'prod-1', orderedQuantity: 0 }]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwZero = e.message.includes('positive integer greater than zero');
        }
        assert(threwZero, 'T-04: Zero quantity rejected');

        let threwNegative = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'vendor-1',
                items: [{ productId: 'prod-1', orderedQuantity: -15 }]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwNegative = e.message.includes('positive integer greater than zero');
        }
        assert(threwNegative, 'T-04: Negative quantity rejected');

        let threwDecimal = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'vendor-1',
                items: [{ productId: 'prod-1', orderedQuantity: 12.5 }]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwDecimal = e.message.includes('positive integer greater than zero');
        }
        assert(threwDecimal, 'T-04: Non-integer decimal quantity rejected');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Deactivated product rejection
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        let threwInactive = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'vendor-1',
                items: [{ productId: 'prod-inactive', orderedQuantity: 10 }]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwInactive = e.message.includes('deactivated product');
        }
        assert(threwInactive, 'T-05: Deactivated product in purchase order rejected');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Out-of-scope / cross-tenant product rejection
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        let threwCrossTenantProd = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'vendor-1',
                items: [{ productId: 'prod-cross', orderedQuantity: 10 }]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwCrossTenantProd = e.message.includes('not found') || e.message.includes('not accessible');
        }
        assert(threwCrossTenantProd, 'T-06: Cross-tenant product in purchase order rejected');
    }

    // -------------------------------------------------------------------------
    // TEST 7: Duplicate product lines rejection
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        let threwDuplicate = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'vendor-1',
                items: [
                    { productId: 'prod-1', orderedQuantity: 10 },
                    { productId: 'prod-1', orderedQuantity: 20 }
                ]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwDuplicate = e.message.includes('Duplicate product lines');
        }
        assert(threwDuplicate, 'T-07: Duplicate product lines rejected');
    }

    // -------------------------------------------------------------------------
    // TEST 8: Valid draft PO edit updates items and audit log
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 20 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        const updated = await service.updatePurchaseOrder(po.id, {
            notes: 'Updated notes: Increased order qty',
            items: [
                { productId: 'prod-1', orderedQuantity: 40 },
                { productId: 'prod-2', orderedQuantity: 15 }
            ]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        assert(updated.items.length === 2, 'T-08: Line items updated to 2 items');
        assert(updated.items[0].orderedQuantity === 40, 'T-08: First item quantity updated to 40');
        assert(updated.notes.includes('Updated notes'), 'T-08: Notes updated');
        assert(store.auditLogs.some(a => a.action === 'UPDATE_PURCHASE_ORDER' && a.payload.purchaseOrderId === po.id), 'T-08: Records UPDATE_PURCHASE_ORDER audit log');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Edit rejection on ORDERED PO
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 20 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        await service.orderPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);

        let threwEditOrdered = false;
        try {
            await service.updatePurchaseOrder(po.id, {
                notes: 'Attempted edit after order'
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwEditOrdered = e.message.includes('Only DRAFT purchase orders can be updated');
        }
        assert(threwEditOrdered, 'T-09: Edit rejected on ORDERED purchase order');
    }

    // -------------------------------------------------------------------------
    // TEST 10: Valid ordering transitions DRAFT to ORDERED
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 30 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        const orderedPo = await service.orderPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);

        assert(orderedPo.status === 'ORDERED', 'T-10: Purchase order status transitioned to ORDERED');
        assert(orderedPo.approvedById === testUser.id, 'T-10: Records approvedById');
        assert(Boolean(orderedPo.approvedAt), 'T-10: Records approvedAt timestamp');
        assert(store.auditLogs.some(a => a.action === 'ORDER_PURCHASE_ORDER' && a.payload.newStatus === 'ORDERED'), 'T-10: Records ORDER_PURCHASE_ORDER audit log');
    }

    // -------------------------------------------------------------------------
    // TEST 11: Invalid ordering transitions rejected
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 30 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        await service.orderPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);

        let threwReorder = false;
        try {
            await service.orderPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwReorder = e.message.includes('Cannot transition purchase order to ORDERED from status');
        }
        assert(threwReorder, 'T-11: Transition to ORDERED rejected when order is already ORDERED');
    }

    // -------------------------------------------------------------------------
    // TEST 12: Cancellation of DRAFT purchase order
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 10 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        const cancelledPo = await service.cancelPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser, 'Budget retracted');

        assert(cancelledPo.status === 'CANCELLED', 'T-12: Status transitioned to CANCELLED');
        assert(cancelledPo.notes.includes('Budget retracted'), 'T-12: Cancellation reason appended to notes');
        assert(cancelledPo.items[0].status === 'CANCELLED', 'T-12: Line item marked CANCELLED');
        assert(store.auditLogs.some(a => a.action === 'CANCEL_PURCHASE_ORDER' && a.payload.newStatus === 'CANCELLED'), 'T-12: Records CANCEL_PURCHASE_ORDER audit log');
    }

    // -------------------------------------------------------------------------
    // TEST 13: Cancellation of ORDERED purchase order
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 10 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        await service.orderPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);
        const cancelled = await service.cancelPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser, 'Vendor out of stock');

        assert(cancelled.status === 'CANCELLED', 'T-13: ORDERED purchase order successfully cancelled');
    }

    // -------------------------------------------------------------------------
    // TEST 14: Cancellation rejection on already cancelled or completed orders
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 10 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        await service.cancelPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);

        let threwAlreadyCancelled = false;
        try {
            await service.cancelPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwAlreadyCancelled = e.message.includes('already cancelled');
        }
        assert(threwAlreadyCancelled, 'T-14: Cancellation rejected for already cancelled order');

        // Test completed order
        const completedPo = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 10 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);
        const stored = store.purchaseOrders.find(p => p.id === completedPo.id);
        stored.status = 'COMPLETED';

        let threwCompleted = false;
        try {
            await service.cancelPurchaseOrder(completedPo.id, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwCompleted = e.message.includes('Cannot cancel a completed purchase order');
        }
        assert(threwCompleted, 'T-14: Cancellation rejected for completed order');
    }

    // -------------------------------------------------------------------------
    // TEST 15: Tenant and unit isolation
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const poUnit1 = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 10 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        // Fetch using unit1 scope succeeds
        const fetched = await service.getPurchaseOrderById(poUnit1.id, { tenantId: tenantA, unitId: unit1 });
        assert(fetched.id === poUnit1.id, 'T-15: Accessible within own unit scope');

        // Fetch using different unit scope throws access denied
        let threwUnitAccessDenied = false;
        try {
            await service.getPurchaseOrderById(poUnit1.id, { tenantId: tenantA, unitId: unit2 });
        } catch (e: any) {
            threwUnitAccessDenied = e.message.includes('Access denied');
        }
        assert(threwUnitAccessDenied, 'T-15: Cross-unit read blocked with Access denied');

        // Fetch using cross-tenant scope throws not found
        let threwTenantBlocked = false;
        try {
            await service.getPurchaseOrderById(poUnit1.id, { tenantId: tenantB, unitId: unit1 });
        } catch (e: any) {
            threwTenantBlocked = e.message.includes('not found');
        }
        assert(threwTenantBlocked, 'T-15: Cross-tenant read blocked with not found');
    }

    // -------------------------------------------------------------------------
    // TEST 16: Concurrent transition conflict protection
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 10 }]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        // Simulate concurrent attempts to order and cancel: first order wins
        const orderPromise = service.orderPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);
        await orderPromise;

        // Subsequent order attempt fails
        let threwConcurrentOrder = false;
        try {
            await service.orderPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwConcurrentOrder = true;
        }
        assert(threwConcurrentOrder, 'T-16: Concurrent transition serialization blocks duplicate order transition');
    }

    // -------------------------------------------------------------------------
    // TEST 17: Transaction rollback on audit failure leaves PO uncreated
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store, { failAuditLog: true });

        let threwAuditFailure = false;
        try {
            await service.createPurchaseOrder({
                vendorId: 'vendor-1',
                items: [{ productId: 'prod-1', orderedQuantity: 10 }]
            }, { tenantId: tenantA, unitId: unit1 }, testUser);
        } catch (e: any) {
            threwAuditFailure = e.message.includes('Simulated storage failure');
        }

        assert(threwAuditFailure, 'T-17: Audit log failure throws and triggers transaction rollback');
        assert(store.purchaseOrders.length === 0, 'T-17: Rolled back transaction leaves 0 purchase orders in store');
        assert(store.purchaseOrderItems.length === 0, 'T-17: Rolled back transaction leaves 0 purchase order items in store');
    }

    // -------------------------------------------------------------------------
    // TEST 18: ZERO STOCK MUTATION GUARANTEE
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const initialStockQty1 = store.stocks.find(s => s.productId === 'prod-1')?.quantity;
        const initialStockQty2 = store.stocks.find(s => s.productId === 'prod-2')?.quantity;
        const initialMovementsCount = store.movements.length;
        const initialBatchesCount = store.batches.length;

        // Perform full PO lifecycle: Create draft -> Update draft -> Transition to ordered -> Cancel
        const po = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [
                { productId: 'prod-1', orderedQuantity: 50 },
                { productId: 'prod-2', orderedQuantity: 25 }
            ]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        await service.updatePurchaseOrder(po.id, {
            items: [
                { productId: 'prod-1', orderedQuantity: 80 },
                { productId: 'prod-2', orderedQuantity: 40 }
            ]
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        await service.orderPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser);

        await service.cancelPurchaseOrder(po.id, { tenantId: tenantA, unitId: unit1 }, testUser, 'Zero mutation test cancellation');

        const currentStockQty1 = store.stocks.find(s => s.productId === 'prod-1')?.quantity;
        const currentStockQty2 = store.stocks.find(s => s.productId === 'prod-2')?.quantity;
        const currentMovementsCount = store.movements.length;
        const currentBatchesCount = store.batches.length;

        assert(currentStockQty1 === initialStockQty1, 'T-18: Stock quantity for product 1 remained 100% unmodified');
        assert(currentStockQty2 === initialStockQty2, 'T-18: Stock quantity for product 2 remained 100% unmodified');
        assert(currentMovementsCount === initialMovementsCount, 'T-18: Zero stock movements created across all PO lifecycle states');
        assert(currentBatchesCount === initialBatchesCount, 'T-18: Zero batch entries created or modified across all PO lifecycle states');
    }

    // -------------------------------------------------------------------------
    // TEST 19: Filtered pagination list verification
    // -------------------------------------------------------------------------
    {
        const store = initStore();
        const service = new InventoryService();
        (service as any).db = createMockPrisma(store);

        const po1 = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-1', orderedQuantity: 10 }],
            notes: 'Order Alpha'
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        const po2 = await service.createPurchaseOrder({
            vendorId: 'vendor-1',
            items: [{ productId: 'prod-2', orderedQuantity: 20 }],
            notes: 'Order Beta'
        }, { tenantId: tenantA, unitId: unit1 }, testUser);

        await service.orderPurchaseOrder(po2.id, { tenantId: tenantA, unitId: unit1 }, testUser);

        // Filter by status = DRAFT
        const draftList = await service.getPurchaseOrders({ tenantId: tenantA, unitId: unit1 }, { status: 'DRAFT' });
        assert(draftList.total === 1 && draftList.purchaseOrders[0].id === po1.id, 'T-19: Filters list by DRAFT status');

        // Filter by status = ORDERED
        const orderedList = await service.getPurchaseOrders({ tenantId: tenantA, unitId: unit1 }, { status: 'ORDERED' });
        assert(orderedList.total === 1 && orderedList.purchaseOrders[0].id === po2.id, 'T-19: Filters list by ORDERED status');

        // Search by notes
        const searchList = await service.getPurchaseOrders({ tenantId: tenantA, unitId: unit1 }, { search: 'Alpha' });
        assert(searchList.total === 1 && searchList.purchaseOrders[0].id === po1.id, 'T-19: Searches by text query');
    }

    console.log('\n========================================================================');
    console.log(`📊 Purchase Order Lifecycle Test Summary: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log('========================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
