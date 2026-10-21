import { FundingAllocationService } from '../modules/funding_projects/fundingAllocation.service.js';
import { FundingSourceService } from '../modules/funding_projects/fundingSource.service.js';

interface MockStore {
    projects: any[];
    donations: any[];
    allocations: any[];
    financeTransactions: any[];
}

function createMockPrisma(store: MockStore) {
    let mockLock = false;

    return {
        $transaction: async (callback: (tx: any) => Promise<any>) => {
            // Wait if simple lock is held to simulate database row serialization
            while (mockLock) {
                await new Promise(r => setTimeout(r, 2));
            }
            mockLock = true;

            // Deep clone snapshot for atomic rollback simulation
            const snapshot = {
                projects: JSON.parse(JSON.stringify(store.projects)),
                donations: JSON.parse(JSON.stringify(store.donations)),
                allocations: JSON.parse(JSON.stringify(store.allocations)),
                financeTransactions: JSON.parse(JSON.stringify(store.financeTransactions))
            };

            const tx = {
                project: {
                    findFirst: async ({ where }: any) => {
                        return store.projects.find(p => {
                            if (where.id && p.id !== where.id) return false;
                            if (where.tenantId && p.tenantId !== where.tenantId) return false;
                            if (where.isDeleted !== undefined && p.isDeleted !== where.isDeleted) return false;
                            return true;
                        }) || null;
                    }
                },
                donation: {
                    findFirst: async ({ where }: any) => {
                        return store.donations.find(d => {
                            if (where.id && d.id !== where.id) return false;
                            if (where.tenantId && d.tenantId !== where.tenantId) return false;
                            if (where.isDeleted !== undefined && d.isDeleted !== where.isDeleted) return false;
                            return true;
                        }) || null;
                    },
                    findMany: async ({ where }: any) => {
                        return store.donations.filter(d => {
                            if (where.tenantId && d.tenantId !== where.tenantId) return false;
                            if (where.isDeleted !== undefined && d.isDeleted !== where.isDeleted) return false;
                            return true;
                        });
                    }
                },
                fundingAllocation: {
                    findFirst: async ({ where }: any) => {
                        return store.allocations.find(a => {
                            if (where.tenantId && a.tenantId !== where.tenantId) return false;
                            if (where.idempotencyKey && a.idempotencyKey !== where.idempotencyKey) return false;
                            if (where.isDeleted !== undefined && a.isDeleted !== where.isDeleted) return false;
                            return true;
                        }) || null;
                    },
                    findMany: async ({ where }: any) => {
                        return store.allocations.filter(a => {
                            if (where.projectId && a.projectId !== where.projectId) return false;
                            if (where.tenantId && a.tenantId !== where.tenantId) return false;
                            if (where.isDeleted !== undefined && a.isDeleted !== where.isDeleted) return false;
                            return true;
                        });
                    },
                    create: async ({ data }: any) => {
                        const newAlloc = {
                            id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            isDeleted: false,
                            ...data
                        };
                        store.allocations.push(newAlloc);
                        return newAlloc;
                    }
                },
                $executeRaw: async (queryParts: any, ...values: any[]) => {
                    // Simulate: UPDATE "Donation" SET "allocatedAmount" = "allocatedAmount" + amount WHERE id = donation.id AND ("amount" - "allocatedAmount") >= amount
                    const amount = values[0];
                    const donationId = values[1];
                    const targetDonation = store.donations.find(d => d.id === donationId);
                    if (!targetDonation) return 0;

                    const available = targetDonation.amount - (targetDonation.allocatedAmount || 0);
                    if (available < amount) {
                        return 0; // 0 rows updated
                    }

                    targetDonation.allocatedAmount = (targetDonation.allocatedAmount || 0) + amount;
                    return 1; // 1 row updated
                }
            };

            try {
                const result = await callback(tx);
                mockLock = false;
                return result;
            } catch (err) {
                // Rollback store to snapshot on error
                store.projects = snapshot.projects;
                store.donations = snapshot.donations;
                store.allocations = snapshot.allocations;
                store.financeTransactions = snapshot.financeTransactions;
                mockLock = false;
                throw err;
            }
        }
    };
}

async function runAllTests() {
    console.log('================================================================');
    console.log('DONORS & VOLUNTEERS: FUNDING ALLOCATION INTEGRITY TEST SUITE');
    console.log('================================================================');
console.log('');

    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, testName: string, detail?: string) {
        if (condition) {
            console.log(`✅ PASS: ${testName}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
            failed++;
        }
    }

    const tenantA = 'tenant-100-alpha';
    const tenantB = 'tenant-200-beta';
    const unitUNCF = 'unit-uncf-001';
    const unitElder = 'unit-elder-002';

    // Mock initial state fixture
    const createFreshStore = (): MockStore => ({
        projects: [
            {
                id: 'proj-medical-camp',
                name: 'Free Medical Camp',
                totalBudget: 500000,
                status: 'PLANNED',
                tenantId: tenantA,
                unitId: unitUNCF,
                isDeleted: false
            },
            {
                id: 'proj-elder-care',
                name: 'Elderly Support Drive',
                totalBudget: 100000,
                status: 'ACTIVE',
                tenantId: tenantA,
                unitId: unitElder,
                isDeleted: false
            },
            {
                id: 'proj-completed',
                name: 'Completed Project',
                totalBudget: 50000,
                status: 'COMPLETED',
                tenantId: tenantA,
                unitId: unitUNCF,
                isDeleted: false
            }
        ],
        donations: [
            {
                id: 'don-cleared-50k',
                receiptNo: 'UNCF-2026-0001',
                amount: 50000,
                allocatedAmount: 0,
                paymentMode: 'CASH',
                reconciliationStatus: 'CLEARED',
                tenantId: tenantA,
                unitId: unitUNCF,
                isDeleted: false
            },
            {
                id: 'don-unreconciled-50k',
                receiptNo: 'UNCF-2026-0002',
                amount: 50000,
                allocatedAmount: 0,
                paymentMode: 'CASH',
                reconciliationStatus: 'PENDING',
                tenantId: tenantA,
                unitId: unitUNCF,
                isDeleted: false
            },
            {
                id: 'don-unit-restricted-elder',
                receiptNo: 'UNCF-2026-0003',
                amount: 40000,
                allocatedAmount: 0,
                paymentMode: 'BANK_TRANSFER',
                reconciliationStatus: 'CLEARED',
                tenantId: tenantA,
                unitId: unitElder,
                isDeleted: false
            },
            {
                id: 'don-material-food',
                receiptNo: 'UNCF-2026-0004',
                amount: 25000,
                allocatedAmount: 0,
                paymentMode: 'MATERIAL',
                materialDetails: 'Wheat bags and rice sacks',
                reconciliationStatus: 'CLEARED',
                tenantId: tenantA,
                unitId: unitUNCF,
                isDeleted: false
            }
        ],
        allocations: [],
        financeTransactions: [
            { id: 'tx-001', refNo: 'TX-REF-001', amount: 50000, type: 'RECEIPT', status: 'POSTED' }
        ]
    });

    // -------------------------------------------------------------------------
    // TEST 1: Eligible cleared donation can be allocated when sufficient funds exist
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        // Override columns check to return true
        (service as any).fundingSourceService = { checkColumnsExist: async () => true };

        const result = await service.createAllocation(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
            { projectId: 'proj-medical-camp', amount: 30000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
        );

        const donation = store.donations.find(d => d.id === 'don-cleared-50k');
        assert(
            result && result.amount === 30000 && donation?.allocatedAmount === 30000,
            '1. Eligible cleared donation can be allocated when sufficient funds exist'
        );
    } catch (e: any) {
        assert(false, '1. Eligible cleared donation can be allocated when sufficient funds exist', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Unreconciled or unverified donation cannot be allocated
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        let threw = false;
        try {
            await service.createAllocation(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
                { projectId: 'proj-medical-camp', amount: 10000, sourceType: 'DONATION', sourceDonationId: 'don-unreconciled-50k' }
            );
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('unreconciled'), '2. Unreconciled or unverified donation cannot be allocated');
        }
        if (!threw) assert(false, '2. Unreconciled or unverified donation cannot be allocated', 'Did not throw');
    } catch (e: any) {
        assert(false, '2. Unreconciled or unverified donation cannot be allocated', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Restricted funding cannot be allocated to an ineligible project (Cross-unit restriction)
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        let threw = false;
        try {
            // Attempt to allocate Elder unit donation to UNCF project
            await service.createAllocation(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, unitAccess: ['*'], role: 'SUPER_ADMIN' } },
                { projectId: 'proj-medical-camp', amount: 10000, sourceType: 'DONATION', sourceDonationId: 'don-unit-restricted-elder' }
            );
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('Cross-unit allocation of unit-restricted donations is not permitted'), '3. Restricted funding cannot be allocated to an ineligible project');
        }
        if (!threw) assert(false, '3. Restricted funding cannot be allocated to an ineligible project', 'Did not throw');
    } catch (e: any) {
        assert(false, '3. Restricted funding cannot be allocated to an ineligible project', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Allocation exceeding source availability is rejected
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        let threw = false;
        try {
            // Available is 50,000, request 60,000
            await service.createAllocation(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
                { projectId: 'proj-medical-camp', amount: 60000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
            );
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('Insufficient available balance'), '4. Allocation exceeding source availability is rejected');
        }
        if (!threw) assert(false, '4. Allocation exceeding source availability is rejected', 'Did not throw');
    } catch (e: any) {
        assert(false, '4. Allocation exceeding source availability is rejected', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Allocation exceeding the remaining project budget is rejected
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        // Set an existing allocation of 480,000 against 500,000 budget
        store.allocations.push({
            id: 'alloc-prior',
            projectId: 'proj-medical-camp',
            amount: 480000,
            tenantId: tenantA,
            isDeleted: false
        });
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        let threw = false;
        try {
            // Remaining budget is 20,000, request 30,000
            await service.createAllocation(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
                { projectId: 'proj-medical-camp', amount: 30000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
            );
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('exceeds remaining project budget'), '5. Allocation exceeding the remaining project budget is rejected');
        }
        if (!threw) assert(false, '5. Allocation exceeding the remaining project budget is rejected', 'Did not throw');
    } catch (e: any) {
        assert(false, '5. Allocation exceeding the remaining project budget is rejected', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Zero, negative, invalid, or malformed amounts are rejected
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        const invalidAmounts = [0, -500, NaN, Infinity, 10.555];
        let rejectedCount = 0;

        for (const amt of invalidAmounts) {
            try {
                await service.createAllocation(
                    { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
                    { projectId: 'proj-medical-camp', amount: amt, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
                );
            } catch {
                rejectedCount++;
            }
        }
        assert(rejectedCount === invalidAmounts.length, '6. Zero, negative, invalid, or malformed amounts are rejected');
    } catch (e: any) {
        assert(false, '6. Zero, negative, invalid, or malformed amounts are rejected', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 7: Cross-tenant allocation attempts are rejected
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        let threw = false;
        try {
            // User from Tenant B attempts to allocate to Tenant A project
            await service.createAllocation(
                { tenantId: tenantB, unitId: unitUNCF, user: { id: 'usr-b', unitId: unitUNCF, role: 'ADMIN' } },
                { projectId: 'proj-medical-camp', amount: 5000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
            );
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('Project not found'), '7. Cross-tenant allocation attempts are rejected');
        }
        if (!threw) assert(false, '7. Cross-tenant allocation attempts are rejected', 'Did not throw');
    } catch (e: any) {
        assert(false, '7. Cross-tenant allocation attempts are rejected', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 8: Unauthorized cross-unit allocation attempts are rejected
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        let threw = false;
        try {
            // User bound to Elder unit attempts to allocate to UNCF project without facility-wide grant
            await service.createAllocation(
                { tenantId: tenantA, unitId: unitElder, user: { id: 'usr-elder', unitId: unitElder, unitAccess: [unitElder], role: 'ELDER_OPERATIONS_MANAGER' } },
                { projectId: 'proj-medical-camp', amount: 5000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
            );
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('Forbidden: You are not authorized to allocate funds to a project in another operating unit'), '8. Unauthorized cross-unit allocation attempts are rejected');
        }
        if (!threw) assert(false, '8. Unauthorized cross-unit allocation attempts are rejected', 'Did not throw');
    } catch (e: any) {
        assert(false, '8. Unauthorized cross-unit allocation attempts are rejected', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 9: A valid authorized same-unit allocation succeeds
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        const res = await service.createAllocation(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-uncf', unitId: unitUNCF, unitAccess: [unitUNCF], role: 'UNCF_ADMIN' } },
            { projectId: 'proj-medical-camp', amount: 15000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
        );

        assert(res && res.amount === 15000 && res.unitId === unitUNCF, '9. A valid authorized same-unit allocation succeeds');
    } catch (e: any) {
        assert(false, '9. A valid authorized same-unit allocation succeeds', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Concurrent requests cannot over-allocate the same funding source
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        // Source has 50,000 available. Launch two concurrent requests for 35,000 each.
        // Exactly one must succeed and one must fail.
        const req1 = service.createAllocation(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
            { projectId: 'proj-medical-camp', amount: 35000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
        );
        const req2 = service.createAllocation(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-2', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
            { projectId: 'proj-medical-camp', amount: 35000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
        );

        const results = await Promise.allSettled([req1, req2]);
        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        const donation = store.donations.find(d => d.id === 'don-cleared-50k');
        assert(
            fulfilled.length === 1 && rejected.length === 1 && donation?.allocatedAmount === 35000,
            '10. Concurrent requests cannot over-allocate the same funding source'
        );
    } catch (e: any) {
        assert(false, '10. Concurrent requests cannot over-allocate the same funding source', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 11: Concurrent requests cannot exceed the project's allocation limit
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        // Project budget is 100,000. Add cleared donation of 150,000.
        store.donations.push({
            id: 'don-large',
            receiptNo: 'UNCF-2026-9999',
            amount: 150000,
            allocatedAmount: 0,
            paymentMode: 'CASH',
            reconciliationStatus: 'CLEARED',
            tenantId: tenantA,
            unitId: unitElder,
            isDeleted: false
        });
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        // Project has remaining budget 100,000. Launch two concurrent requests for 60,000 each.
        const req1 = service.createAllocation(
            { tenantId: tenantA, unitId: unitElder, user: { id: 'usr-elder', unitId: unitElder, role: 'ADMIN' } },
            { projectId: 'proj-elder-care', amount: 60000, sourceType: 'DONATION', sourceDonationId: 'don-large' }
        );
        const req2 = service.createAllocation(
            { tenantId: tenantA, unitId: unitElder, user: { id: 'usr-elder', unitId: unitElder, role: 'ADMIN' } },
            { projectId: 'proj-elder-care', amount: 60000, sourceType: 'DONATION', sourceDonationId: 'don-large' }
        );

        const results = await Promise.allSettled([req1, req2]);
        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        const totalAllocated = store.allocations
            .filter(a => a.projectId === 'proj-elder-care')
            .reduce((s, a) => s + a.amount, 0);

        assert(
            fulfilled.length === 1 && rejected.length === 1 && totalAllocated <= 100000,
            '11. Concurrent requests cannot exceed the project allocation limit'
        );
    } catch (e: any) {
        assert(false, '11. Concurrent requests cannot exceed the project allocation limit', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 12: Failed transactions leave no partial allocation or incorrect reservation
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        const initialDonationState = JSON.stringify(store.donations.find(d => d.id === 'don-cleared-50k'));
        const initialAllocCount = store.allocations.length;

        try {
            // Attempt allocation that fails midway
            await service.createAllocation(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
                { projectId: 'proj-completed', amount: 10000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
            );
        } catch {
            // Expected to fail because project is COMPLETED
        }

        const finalDonationState = JSON.stringify(store.donations.find(d => d.id === 'don-cleared-50k'));
        const finalAllocCount = store.allocations.length;

        assert(
            initialDonationState === finalDonationState && initialAllocCount === finalAllocCount,
            '12. Failed transactions leave no partial allocation or incorrect reservation'
        );
    } catch (e: any) {
        assert(false, '12. Failed transactions leave no partial allocation or incorrect reservation', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 13: Duplicate or retried requests follow the intended idempotency behavior
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        const idempotencyKey = 'unique-key-retry-12345';
        const res1 = await service.createAllocation(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
            { projectId: 'proj-medical-camp', amount: 10000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k', idempotencyKey }
        );

        // Immediate retry with identical key
        const res2 = await service.createAllocation(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
            { projectId: 'proj-medical-camp', amount: 10000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k', idempotencyKey }
        );

        const donation = store.donations.find(d => d.id === 'don-cleared-50k');
        assert(
            res1.id === res2.id && donation?.allocatedAmount === 10000 && store.allocations.length === 1,
            '13. Duplicate or retried requests follow intended idempotency behavior'
        );
    } catch (e: any) {
        assert(false, '13. Duplicate or retried requests follow intended idempotency behavior', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 14: Existing donor and project records remain unchanged
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const originalProjectBudget = store.projects.find(p => p.id === 'proj-medical-camp')?.totalBudget;
        const originalDonationAmount = store.donations.find(d => d.id === 'don-cleared-50k')?.amount;

        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        await service.createAllocation(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
            { projectId: 'proj-medical-camp', amount: 20000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
        );

        const postProjectBudget = store.projects.find(p => p.id === 'proj-medical-camp')?.totalBudget;
        const postDonationAmount = store.donations.find(d => d.id === 'don-cleared-50k')?.amount;

        assert(
            originalProjectBudget === postProjectBudget && originalDonationAmount === postDonationAmount,
            '14. Existing donor and project records remain unchanged'
        );
    } catch (e: any) {
        assert(false, '14. Existing donor and project records remain unchanged', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 15: Existing Finance balances and accounting records are not modified by allocation alone
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const originalFinanceTx = JSON.stringify(store.financeTransactions);

        const mockPrisma = createMockPrisma(store);
        const service = new FundingAllocationService(mockPrisma, { checkColumnsExist: async () => true });

        await service.createAllocation(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'usr-1', unitId: unitUNCF, role: 'UNCF_ADMIN' } },
            { projectId: 'proj-medical-camp', amount: 20000, sourceType: 'DONATION', sourceDonationId: 'don-cleared-50k' }
        );

        const postFinanceTx = JSON.stringify(store.financeTransactions);

        assert(
            originalFinanceTx === postFinanceTx,
            '15. Existing Finance balances and accounting records are not modified by allocation alone'
        );
    } catch (e: any) {
        assert(false, '15. Existing Finance balances and accounting records are not modified by allocation alone', e.message);
    }

    console.log('================================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log('================================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
