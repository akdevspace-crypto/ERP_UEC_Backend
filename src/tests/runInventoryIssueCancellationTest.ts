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

function createMockPrisma(
    store: MockStore,
    options: {
        failAuditLog?: boolean;
        lockLog?: string[];
        simulatedConcurrentStatus?: 'APPROVED' | 'REJECTED' | 'CANCELLED';
    } = {}
) {
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
                            return true;
                        }) || null;
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
                            if (where.id && r.id !== where.id) return false;
                            if (where.productId && r.productId !== where.productId) return false;
                            if (where.tenantId && r.tenantId !== where.tenantId) return false;
                            if (where.status && r.status !== where.status) return false;
                            if (where.isDeleted !== undefined && r.isDeleted !== where.isDeleted) return false;
                            return true;
                        }) || null;
                    },
                    findUnique: async ({ where }: any) => {
                        return store.issueRequests.find(r => r.id === where.id) || null;
                    },
                    updateMany: async ({ where, data }: any) => {
                        let count = 0;
                        for (const r of store.issueRequests) {
                            if (where.id && r.id !== where.id) continue;
                            if (where.status && r.status !== where.status) continue;
                            Object.assign(r, data);
                            count++;
                        }
                        return { count };
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
                    }
                },
                stockMovement: {
                    create: async ({ data }: any) => {
                        const mov = { id: `mov-${Date.now()}`, ...data, createdAt: new Date() };
                        store.movements.push(mov);
                        return mov;
                    }
                },
                $queryRaw: async (strings: any, ...values: any[]) => {
                    const rawSql = Array.isArray(strings) ? strings.join('?') : String(strings || '');

                    if (rawSql.includes('"StockIssueRequest"') || rawSql.includes('StockIssueRequest')) {
                        const id = values[0];
                        const tenantId = values[1];
                        const unitId = values.length >= 3 ? values[2] : null;

                        if (options.lockLog) {
                            options.lockLog.push(`LOCKED_ISSUE_REQUEST:${id}`);
                        }

                        const req = store.issueRequests.find(r => {
                            if (id && r.id !== id) return false;
                            if (tenantId && r.tenantId !== tenantId) return false;
                            if (unitId && r.unitId !== unitId) return false;
                            if (r.isDeleted === true) return false;
                            return true;
                        });

                        if (!req) return [];

                        // If simulated concurrency race occurred
                        if (options.simulatedConcurrentStatus) {
                            req.status = options.simulatedConcurrentStatus;
                        }

                        return [req];
                    }

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

                    return [];
                }
            };

            try {
                return await callback(tx);
            } catch (err) {
                // Rollback store on error
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
                    return true;
                }) || null;
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
            }
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
    console.log('🚀 InventoryApp D7.3 — Stock Issue Request Cancellation Test Suite');
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

    const tenantA = 'tenant-cancellation-test';
    const unit1 = 'unit-1';
    const unit2 = 'unit-2';

    // -------------------------------------------------------------------------
    // TEST 1: Requester cancels own eligible pending request successfully
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Requester cancels own eligible pending request ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-1', name: 'Paracetamol', tenantId: tenantA, unitId: unit1, status: true }],
            stocks: [{ productId: 'prod-1', quantity: 50, tenantId: tenantA, unitId: unit1 }],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-1',
                productId: 'prod-1',
                productName: 'Paracetamol',
                quantity: 10,
                status: 'PENDING',
                requestedBy: 'nurse.sarah@hospital.org',
                notes: 'Morning ward stock',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const lockLog: string[] = [];
        const mockPrisma = createMockPrisma(store, { lockLog });
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const user = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };

        const result = await service.cancelIssueRequest('req-1', scope, user, 'Patient discharged early', false);

        assert(result.status === 'CANCELLED', 'Request status transitions to CANCELLED');
        assert(result.notes.includes('[Cancelled]: Patient discharged early'), 'Cancellation reason appended to notes');
        assert(lockLog.includes('LOCKED_ISSUE_REQUEST:req-1'), 'Pessimistic FOR UPDATE row lock acquired before status change');
        assert(store.auditLogs.length === 1, 'Audit log created');
        assert(store.auditLogs[0].action === 'CANCEL_STOCK_ISSUE_REQUEST', 'Audit log action is CANCEL_STOCK_ISSUE_REQUEST');
        assert(store.auditLogs[0].payload.previousStatus === 'PENDING', 'Audit log records previous status PENDING');
        assert(store.auditLogs[0].payload.newStatus === 'CANCELLED', 'Audit log records new status CANCELLED');
        assert(store.auditLogs[0].payload.reason === 'Patient discharged early', 'Audit log captures cancellation reason');
    }

    // -------------------------------------------------------------------------
    // TEST 2: Requester ownership match by Name or ID
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Requester ownership matched by user name ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-2',
                productId: 'prod-1',
                productName: 'Bandages',
                quantity: 5,
                status: 'PENDING',
                requestedBy: 'Dr. John Smith',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const user = { id: 'user-john-id', name: 'Dr. John Smith', email: 'john@hospital.org', role: 'DOCTOR' };

        const result = await service.cancelIssueRequest('req-2', scope, user, 'Duplicate requisition', false);
        assert(result.status === 'CANCELLED', 'Ownership successfully recognized via user.name');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Different requester cannot cancel another person's request
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Unauthorized non-owner requester cannot cancel ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-3',
                productId: 'prod-1',
                productName: 'Bandages',
                quantity: 5,
                status: 'PENDING',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const intruderUser = { id: 'user-bob', name: 'Bob Tech', email: 'bob@hospital.org', role: 'STAFF' };

        let errMessage = '';
        try {
            await service.cancelIssueRequest('req-3', scope, intruderUser, 'Malicious cancel', false);
        } catch (err: any) {
            errMessage = err.message;
        }

        assert(errMessage.includes('Unauthorized: You can only cancel your own stock issue requests'), 'Non-owner rejected with unauthorized error');
        assert(store.issueRequests[0].status === 'PENDING', 'Request status remains PENDING in store');
        assert(store.auditLogs.length === 0, 'No audit log created for unauthorized attempt');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Admin role privilege override
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Admin role override can cancel any requisition ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-4',
                productId: 'prod-1',
                productName: 'Syringes',
                quantity: 20,
                status: 'PENDING',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const adminUser = { id: 'admin-1', name: 'Hospital Admin', email: 'admin@hospital.org', role: 'ADMIN' };

        const result = await service.cancelIssueRequest('req-4', scope, adminUser, 'Cancelled per inventory audit', false);
        assert(result.status === 'CANCELLED', 'Admin successfully cancelled requisition on behalf of requester');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Cross-tenant isolation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Cross-tenant isolation ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-5',
                productId: 'prod-1',
                productName: 'Syringes',
                quantity: 20,
                status: 'PENDING',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: 'tenant-other',
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 }; // different tenant
        const user = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };

        let errMessage = '';
        try {
            await service.cancelIssueRequest('req-5', scope, user, 'Cancel attempt', false);
        } catch (err: any) {
            errMessage = err.message;
        }

        assert(errMessage.includes('Stock issue request not found or not accessible within this tenant/unit scope'), 'Cross-tenant access strictly blocked');
        assert(store.issueRequests[0].status === 'PENDING', 'Cross-tenant request untouched');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Cross-unit isolation when canReadAll is false
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Cross-unit isolation ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-6',
                productId: 'prod-1',
                productName: 'Syringes',
                quantity: 20,
                status: 'PENDING',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: tenantA,
                unitId: unit2, // Unit 2
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 }; // Unit 1 scope
        const user = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };

        let errMessage = '';
        try {
            await service.cancelIssueRequest('req-6', scope, user, 'Cancel attempt', false);
        } catch (err: any) {
            errMessage = err.message;
        }

        assert(errMessage.includes('Stock issue request not found or not accessible within this tenant/unit scope'), 'Cross-unit access blocked without canReadAll');
    }

    // -------------------------------------------------------------------------
    // TEST 7: Ineligible status: APPROVED request cannot be cancelled
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Ineligible APPROVED request rejection ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-7',
                productId: 'prod-1',
                productName: 'Antibiotics',
                quantity: 15,
                status: 'APPROVED',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const user = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };

        let errMessage = '';
        try {
            await service.cancelIssueRequest('req-7', scope, user, 'Cannot cancel fulfilled', false);
        } catch (err: any) {
            errMessage = err.message;
        }

        assert(errMessage.includes("Cannot cancel stock issue request with status 'APPROVED'"), 'APPROVED request cancellation rejected');
        assert(store.issueRequests[0].status === 'APPROVED', 'Status remains APPROVED');
    }

    // -------------------------------------------------------------------------
    // TEST 8: Ineligible status: REJECTED request cannot be cancelled
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Ineligible REJECTED request rejection ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-8',
                productId: 'prod-1',
                productName: 'Antibiotics',
                quantity: 15,
                status: 'REJECTED',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const user = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };

        let errMessage = '';
        try {
            await service.cancelIssueRequest('req-8', scope, user, 'Cannot cancel rejected', false);
        } catch (err: any) {
            errMessage = err.message;
        }

        assert(errMessage.includes("Cannot cancel stock issue request with status 'REJECTED'"), 'REJECTED request cancellation rejected');
        assert(store.issueRequests[0].status === 'REJECTED', 'Status remains REJECTED');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Repeated cancellation rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Already CANCELLED request cannot be cancelled again ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-9',
                productId: 'prod-1',
                productName: 'Antibiotics',
                quantity: 15,
                status: 'CANCELLED',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const user = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };

        let errMessage = '';
        try {
            await service.cancelIssueRequest('req-9', scope, user, 'Second cancel', false);
        } catch (err: any) {
            errMessage = err.message;
        }

        assert(errMessage.includes('Stock issue request is already cancelled'), 'Already CANCELLED request cancellation rejected');
        assert(store.issueRequests[0].status === 'CANCELLED', 'Status remains CANCELLED');
    }

    // -------------------------------------------------------------------------
    // TEST 10: Stock balances and movements remain untouched
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Stock balances and ledger records untouched ---');
    {
        const initialStock = 42;
        const store: MockStore = {
            products: [{ id: 'prod-10', name: 'Surgical Gloves', tenantId: tenantA, unitId: unit1, status: true }],
            stocks: [{ productId: 'prod-10', quantity: initialStock, tenantId: tenantA, unitId: unit1 }],
            batches: [{ id: 'b-1', productId: 'prod-10', quantity: initialStock }],
            movements: [{ id: 'm-initial', productId: 'prod-10', movementType: 'OPENING', quantity: initialStock }],
            auditLogs: [],
            issueRequests: [{
                id: 'req-10',
                productId: 'prod-10',
                productName: 'Surgical Gloves',
                quantity: 10,
                status: 'PENDING',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const user = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };

        await service.cancelIssueRequest('req-10', scope, user, 'Gloves not required', false);

        assert(store.stocks[0].quantity === initialStock, `Stock quantity remains exactly ${initialStock} (zero deduction/reversal)`);
        assert(store.batches[0].quantity === initialStock, `Batch quantity remains exactly ${initialStock}`);
        assert(store.movements.length === 1, 'No new stock movements created during cancellation');
        assert(store.movements[0].movementType === 'OPENING', 'Original opening movement untouched');
    }

    // -------------------------------------------------------------------------
    // TEST 11: Transaction rollback on audit log failure
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: Transaction rollback on audit failure ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-11',
                productId: 'prod-1',
                productName: 'Ointment',
                quantity: 2,
                status: 'PENDING',
                requestedBy: 'nurse.sarah@hospital.org',
                notes: 'Original note',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store, { failAuditLog: true });
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const user = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };

        let rollbackError = '';
        try {
            await service.cancelIssueRequest('req-11', scope, user, 'Cancel reason', false);
        } catch (err: any) {
            rollbackError = err.message;
        }

        assert(rollbackError.includes('Audit log write failed'), 'Expected audit log error thrown');
        assert(store.issueRequests[0].status === 'PENDING', 'Status rolled back to PENDING after transaction failure');
        assert(store.issueRequests[0].notes === 'Original note', 'Notes restored to original state without cancellation text');
    }

    // -------------------------------------------------------------------------
    // TEST 12: Product deactivation unblocked after cancellation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 12: Product deactivation unblocked after cancellation ---');
    {
        const store: MockStore = {
            products: [{ id: 'prod-12', name: 'Obsolete Medicine', tenantId: tenantA, unitId: unit1, status: true }],
            stocks: [{ productId: 'prod-12', quantity: 0, tenantId: tenantA, unitId: unit1 }],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-12',
                productId: 'prod-12',
                productName: 'Obsolete Medicine',
                quantity: 5,
                status: 'PENDING',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        const mockPrisma = createMockPrisma(store);
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const nurseUser = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };
        const adminUser = { id: 'user-admin', name: 'Admin', email: 'admin@hospital.org', role: 'ADMIN' };

        // Before cancellation: product deactivation should fail because of pending request
        let deactError = '';
        try {
            await service.updateProductStatus('prod-12', false, scope, adminUser);
        } catch (err: any) {
            deactError = err.message;
        }
        assert(deactError.includes('active pending stock issue requests'), 'Product deactivation blocked while request is PENDING');

        // Cancel the issue request
        await service.cancelIssueRequest('req-12', scope, nurseUser, 'Order no longer needed', false);
        assert(store.issueRequests[0].status === 'CANCELLED', 'Issue request cancelled');

        // After cancellation: product deactivation should now succeed
        const deactResult = await service.updateProductStatus('prod-12', false, scope, adminUser);
        assert(deactResult.status === false, 'Product deactivation succeeds after cancellation unblocks it');
    }

    // -------------------------------------------------------------------------
    // TEST 13: Concurrency race with simulated simultaneous approval
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 13: Concurrency serialization: race with approval ---');
    {
        const store: MockStore = {
            products: [],
            stocks: [],
            batches: [],
            movements: [],
            auditLogs: [],
            issueRequests: [{
                id: 'req-13',
                productId: 'prod-1',
                productName: 'Saline Bag',
                quantity: 4,
                status: 'PENDING',
                requestedBy: 'nurse.sarah@hospital.org',
                tenantId: tenantA,
                unitId: unit1,
                isDeleted: false
            }],
            purchases: []
        };

        // Simulate that while waiting for lock, a concurrent approval transaction committed first and changed status to APPROVED
        const mockPrisma = createMockPrisma(store, { simulatedConcurrentStatus: 'APPROVED' });
        const service = new InventoryService(mockPrisma as any);

        const scope = { tenantId: tenantA, unitId: unit1 };
        const user = { id: 'user-sarah', name: 'Nurse Sarah', email: 'nurse.sarah@hospital.org', role: 'NURSE' };

        let raceError = '';
        try {
            await service.cancelIssueRequest('req-13', scope, user, 'Cancel during approval', false);
        } catch (err: any) {
            raceError = err.message;
        }

        assert(raceError.includes("Cannot cancel stock issue request with status 'APPROVED'"), 'Concurrent approval detected post-lock and cancellation aborted safely');
    }

    console.log('\n========================================================================');
    console.log(`🏁 Verification Results: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
