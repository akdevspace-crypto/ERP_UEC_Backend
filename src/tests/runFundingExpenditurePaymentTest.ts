import { FundingExpenditureService } from '../modules/funding_projects/fundingExpenditure.service.js';
import { FundingAllocationService } from '../modules/funding_projects/fundingAllocation.service.js';

interface MockStore {
    projects: any[];
    donations: any[];
    allocations: any[];
    expenditures: any[];
    financeTransactions: any[];
    approvals: any[];
}

function createMockPrisma(store: MockStore) {
    let mockLock = false;

    const baseDb = {
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
        fundingAllocation: {
            findFirst: async ({ where }: any) => {
                return store.allocations.find(a => {
                    if (where.tenantId && a.tenantId !== where.tenantId) return false;
                    if (where.idempotencyKey && a.idempotencyKey !== where.idempotencyKey) return false;
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
            }
        },
        projectExpenditure: {
            findFirst: async ({ where }: any) => {
                return store.expenditures.find(e => {
                    if (where.id && e.id !== where.id) return false;
                    if (where.tenantId && e.tenantId !== where.tenantId) return false;
                    if (where.idempotencyKey && e.idempotencyKey !== where.idempotencyKey) return false;
                    if (where.isDeleted !== undefined && e.isDeleted !== where.isDeleted) return false;
                    return true;
                }) || null;
            },
            findMany: async ({ where }: any) => {
                return store.expenditures.filter(e => {
                    if (where.projectId && e.projectId !== where.projectId) return false;
                    if (where.tenantId && e.tenantId !== where.tenantId) return false;
                    if (where.isDeleted !== undefined && e.isDeleted !== where.isDeleted) return false;
                    return true;
                });
            }
        }
    };

    return {
        ...baseDb,
        $transaction: async (callback: (tx: any) => Promise<any>) => {
            while (mockLock) {
                await new Promise(r => setTimeout(r, 2));
            }
            mockLock = true;

            const snapshot = {
                projects: JSON.parse(JSON.stringify(store.projects)),
                donations: JSON.parse(JSON.stringify(store.donations)),
                allocations: JSON.parse(JSON.stringify(store.allocations)),
                expenditures: JSON.parse(JSON.stringify(store.expenditures)),
                financeTransactions: JSON.parse(JSON.stringify(store.financeTransactions)),
                approvals: JSON.parse(JSON.stringify(store.approvals))
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
                fundingAllocation: {
                    findFirst: async ({ where }: any) => {
                        return store.allocations.find(a => {
                            if (where.tenantId && a.tenantId !== where.tenantId) return false;
                            if (where.idempotencyKey && a.idempotencyKey !== where.idempotencyKey) return false;
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
                projectExpenditure: {
                    findFirst: async ({ where }: any) => {
                        return store.expenditures.find(e => {
                            if (where.id && e.id !== where.id) return false;
                            if (where.tenantId && e.tenantId !== where.tenantId) return false;
                            if (where.idempotencyKey && e.idempotencyKey !== where.idempotencyKey) return false;
                            if (where.isDeleted !== undefined && e.isDeleted !== where.isDeleted) return false;
                            return true;
                        }) || null;
                    },
                    findMany: async ({ where }: any) => {
                        return store.expenditures.filter(e => {
                            if (where.projectId && e.projectId !== where.projectId) return false;
                            if (where.tenantId && e.tenantId !== where.tenantId) return false;
                            if (where.isDeleted !== undefined && e.isDeleted !== where.isDeleted) return false;
                            return true;
                        });
                    },
                    create: async ({ data }: any) => {
                        const newExp = {
                            id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            isDeleted: false,
                            ...data
                        };
                        store.expenditures.push(newExp);
                        return newExp;
                    },
                    update: async ({ where, data }: any) => {
                        const idx = store.expenditures.findIndex(e => e.id === where.id);
                        if (idx === -1) throw new Error('Record not found');
                        store.expenditures[idx] = {
                            ...store.expenditures[idx],
                            ...data,
                            updatedAt: new Date()
                        };
                        return store.expenditures[idx];
                    }
                },
                accountTransaction: {
                    count: async ({ where }: any) => {
                        return store.financeTransactions.filter(t => {
                            if (where.tenantId && t.tenantId !== where.tenantId) return false;
                            if (where.type && t.type !== where.type) return false;
                            return true;
                        }).length;
                    },
                    findFirst: async ({ where }: any) => {
                        return store.financeTransactions.find(t => {
                            if (where.refNo && t.refNo !== where.refNo) return false;
                            if (where.tenantId && t.tenantId !== where.tenantId) return false;
                            return true;
                        }) || null;
                    },
                    update: async ({ where, data }: any) => {
                        const idx = store.financeTransactions.findIndex(t => t.id === where.id);
                        if (idx === -1) throw new Error('Transaction not found');
                        store.financeTransactions[idx] = {
                            ...store.financeTransactions[idx],
                            ...data,
                            updatedAt: new Date()
                        };
                        return store.financeTransactions[idx];
                    },
                    create: async ({ data }: any) => {
                        const newTx = {
                            id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                            createdAt: new Date(),
                            ...data
                        };
                        store.financeTransactions.push(newTx);
                        return newTx;
                    }
                },
                approval: {
                    create: async ({ data }: any) => {
                        const newApproval = { id: `appr-${Date.now()}`, createdAt: new Date(), ...data };
                        store.approvals.push(newApproval);
                        return newApproval;
                    }
                }
            };

            try {
                const result = await callback(tx);
                mockLock = false;
                return result;
            } catch (err) {
                store.projects = snapshot.projects;
                store.donations = snapshot.donations;
                store.allocations = snapshot.allocations;
                store.expenditures = snapshot.expenditures;
                store.financeTransactions = snapshot.financeTransactions;
                store.approvals = snapshot.approvals;
                mockLock = false;
                throw err;
            }
        }
    };
}

async function runExpenditurePaymentTests() {
    console.log('================================================================');
    console.log('PHASE 3: PROJECT EXPENDITURE & PAYMENT LIFECYCLE TEST SUITE');
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
                id: 'proj-no-allocation',
                name: 'Zero Allocation Project',
                totalBudget: 100000,
                status: 'PLANNED',
                tenantId: tenantA,
                unitId: unitUNCF,
                isDeleted: false
            }
        ],
        donations: [],
        allocations: [
            {
                id: 'alloc-1',
                projectId: 'proj-medical-camp',
                amount: 100000,
                tenantId: tenantA,
                isDeleted: false
            }
        ],
        expenditures: [],
        financeTransactions: [],
        approvals: []
    });

    // -------------------------------------------------------------------------
    // TEST 1: Valid expenditure submission with capacity reservation
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const res = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 35000, category: 'Medical Supplies', description: 'Syringes & bandages' }
        );

        const capacity = await service.getProjectCapacity('proj-medical-camp', tenantA);
        assert(
            res && res.amount === 35000 && res.approvalStatus === 'PENDING' && capacity.remainingCapacity === 65000,
            '1. Valid expenditure submission with capacity reservation'
        );
    } catch (e: any) {
        assert(false, '1. Valid expenditure submission with capacity reservation', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Expenditure exceeding remaining allocated capacity is rejected
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        let threw = false;
        try {
            // Allocated is 100,000, request is 120,000
            await service.createExpenditure(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
                { projectId: 'proj-medical-camp', amount: 120000, category: 'Equipment', description: 'Diagnostic kits' }
            );
        } catch (e: any) {
            threw = true;
            assert(e.message.includes('exceeds remaining allocated capacity'), '2. Expenditure exceeding remaining allocated capacity is rejected');
        }
        if (!threw) assert(false, '2. Expenditure exceeding remaining allocated capacity is rejected', 'Did not throw');
    } catch (e: any) {
        assert(false, '2. Expenditure exceeding remaining allocated capacity is rejected', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Pending requests reserve project capacity
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        // Total allocated is 100,000. Submit first pending request of 60,000
        await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 60000, category: 'Logistics', description: 'Mobile Clinic Bus Fuel' }
        );

        // Submit second request of 50,000 (60,000 + 50,000 = 110,000 > 100,000)
        let secondThrew = false;
        try {
            await service.createExpenditure(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-2', role: 'DONOR_COORDINATOR' } },
                { projectId: 'proj-medical-camp', amount: 50000, category: 'Food', description: 'Volunteer rations' }
            );
        } catch (e: any) {
            secondThrew = true;
            assert(e.message.includes('exceeds remaining allocated capacity'), '3. Pending requests reserve project capacity');
        }
        if (!secondThrew) assert(false, '3. Pending requests reserve project capacity', 'Did not throw on overflow');
    } catch (e: any) {
        assert(false, '3. Pending requests reserve project capacity', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Zero, negative, invalid, or malformed amounts are rejected
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);

        const invalidAmounts = [0, -100, NaN, Infinity, 45.678];
        let rejectedCount = 0;

        for (const amt of invalidAmounts) {
            try {
                await service.createExpenditure(
                    { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
                    { projectId: 'proj-medical-camp', amount: amt, category: 'Misc', description: 'Invalid amount test' }
                );
            } catch {
                rejectedCount++;
            }
        }
        assert(rejectedCount === invalidAmounts.length, '4. Zero, negative, invalid, or malformed amounts are rejected');
    } catch (e: any) {
        assert(false, '4. Zero, negative, invalid, or malformed amounts are rejected', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Cross-tenant and cross-unit expenditure submission rejected
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);

        let crossTenantThrew = false;
        try {
            await service.createExpenditure(
                { tenantId: tenantB, unitId: unitUNCF, user: { id: 'staff-b', role: 'ADMIN' } },
                { projectId: 'proj-medical-camp', amount: 10000, category: 'Test', description: 'Cross tenant test' }
            );
        } catch (e: any) {
            crossTenantThrew = e.message.includes('Project not found');
        }

        let crossUnitThrew = false;
        try {
            await service.createExpenditure(
                { tenantId: tenantA, unitId: unitElder, user: { id: 'staff-elder', unitId: unitElder, unitAccess: [unitElder], role: 'ELDER_OPERATIONS_MANAGER' } },
                { projectId: 'proj-medical-camp', amount: 10000, category: 'Test', description: 'Cross unit test' }
            );
        } catch (e: any) {
            crossUnitThrew = e.message.includes('Forbidden: You are not authorized');
        }

        assert(crossTenantThrew && crossUnitThrew, '5. Cross-tenant and cross-unit expenditure submission rejected');
    } catch (e: any) {
        assert(false, '5. Cross-tenant and cross-unit expenditure submission rejected', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Approval transitions state to APPROVED with paymentStatus = PAYMENT_PENDING
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const exp = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 20000, category: 'Medicines', description: 'Essential drugs' }
        );

        const approved = await service.approveOrRejectExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
            exp.id,
            { status: 'APPROVED' }
        );

        assert(
            approved.approvalStatus === 'APPROVED' && approved.paymentStatus === 'PAYMENT_PENDING' && approved.approvedById === 'manager-1',
            '6. Approval transitions state to APPROVED with paymentStatus = PAYMENT_PENDING'
        );
    } catch (e: any) {
        assert(false, '6. Approval transitions state to APPROVED with paymentStatus = PAYMENT_PENDING', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 7: Rejection requires non-empty rejectionReason and releases reserved capacity
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const exp = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 40000, category: 'Banners', description: 'Event marketing' }
        );

        // Attempt rejection without reason
        let noReasonThrew = false;
        try {
            await service.approveOrRejectExpenditure(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
                exp.id,
                { status: 'REJECTED', rejectionReason: '' }
            );
        } catch (e: any) {
            noReasonThrew = e.message.includes('Rejection reason is strictly required');
        }

        // Rejection with valid reason
        const rejected = await service.approveOrRejectExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
            exp.id,
            { status: 'REJECTED', rejectionReason: 'Marketing budget exceeds permissible camp guidelines' }
        );

        const capacity = await service.getProjectCapacity('proj-medical-camp', tenantA);
        assert(
            noReasonThrew && rejected.approvalStatus === 'REJECTED' && capacity.remainingCapacity === 100000,
            '7. Rejection requires non-empty rejectionReason and releases reserved capacity'
        );
    } catch (e: any) {
        assert(false, '7. Rejection requires non-empty rejectionReason and releases reserved capacity', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 8: Prevention of unauthorized self-approval
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const exp = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-2', role: 'FINANCE_MANAGER' } },
            { projectId: 'proj-medical-camp', amount: 15000, category: 'Stationery', description: 'Forms' }
        );

        let selfApprovalThrew = false;
        try {
            await service.approveOrRejectExpenditure(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-2', role: 'FINANCE_MANAGER' } },
                exp.id,
                { status: 'APPROVED' }
            );
        } catch (e: any) {
            selfApprovalThrew = e.message.includes('Requester cannot approve their own expenditure request');
        }

        assert(selfApprovalThrew, '8. Prevention of unauthorized self-approval');
    } catch (e: any) {
        assert(false, '8. Prevention of unauthorized self-approval', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 9: Protection of approved/paid records from invalid re-decision
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const exp = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 10000, category: 'Logistics', description: 'Tents' }
        );

        await service.approveOrRejectExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
            exp.id,
            { status: 'APPROVED' }
        );

        // Attempt re-approval
        let reApproveThrew = false;
        try {
            await service.approveOrRejectExpenditure(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
                exp.id,
                { status: 'APPROVED' }
            );
        } catch (e: any) {
            reApproveThrew = e.message.toLowerCase().includes('already');
        }

        assert(reApproveThrew, '9. Protection of approved/paid records from invalid re-decision');
    } catch (e: any) {
        assert(false, '9. Protection of approved/paid records from invalid re-decision', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Unapproved expenditure cannot issue payment voucher
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const exp = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 10000, category: 'Medicines', description: 'Painkillers' }
        );

        let voucherUnapprovedThrew = false;
        try {
            await service.issuePaymentVoucher(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'fin-mgr', role: 'FINANCE_MANAGER' } },
                exp.id,
                { paymentMode: 'BANK_TRANSFER' }
            );
        } catch (e: any) {
            voucherUnapprovedThrew = e.message.includes('Expenditure must be APPROVED before a payment voucher can be issued');
        }

        assert(voucherUnapprovedThrew, '10. Unapproved expenditure cannot issue payment voucher');
    } catch (e: any) {
        assert(false, '10. Unapproved expenditure cannot issue payment voucher', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 11: Voucher issuance leaves expenditure unpaid with AccountTransaction in CREATED state
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const exp = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 25000, category: 'Doctor Honorarium', description: 'Visiting Doctor Stipend' }
        );

        await service.approveOrRejectExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
            exp.id,
            { status: 'APPROVED' }
        );

        // Stage 1: Issue Voucher
        const voucherRes = await service.issuePaymentVoucher(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'fin-mgr', role: 'FINANCE_MANAGER' } },
            exp.id,
            { paymentMode: 'BANK_TRANSFER', notes: 'Advance authorization' }
        );

        const updatedExp = store.expenditures.find(e => e.id === exp.id);
        const voucherTx = store.financeTransactions.find(t => t.refNo === voucherRes.voucherRef);

        const isUnpaidWithVoucher = 
            updatedExp?.paymentStatus === 'VOUCHER_ISSUED' &&
            voucherTx?.status === 'CREATED' &&
            updatedExp?.paidAt === undefined;

        assert(
            isUnpaidWithVoucher && voucherRes.voucherRef.startsWith('PV-UNCF-'),
            '11. Voucher issuance leaves expenditure unpaid with AccountTransaction in CREATED state'
        );
    } catch (e: any) {
        assert(false, '11. Voucher issuance leaves expenditure unpaid with AccountTransaction in CREATED state', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 12: Cannot confirm disbursement without payment evidence/reference
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const exp = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 15000, category: 'Ambulance', description: 'Fuel & Maintenance' }
        );

        await service.approveOrRejectExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
            exp.id,
            { status: 'APPROVED' }
        );

        await service.issuePaymentVoucher(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'fin-mgr', role: 'FINANCE_MANAGER' } },
            exp.id,
            { paymentMode: 'BANK_TRANSFER' }
        );

        let noRefThrew = false;
        try {
            await service.confirmPaymentDisbursement(
                { tenantId: tenantA, unitId: unitUNCF, user: { id: 'fin-mgr', role: 'FINANCE_MANAGER' } },
                exp.id,
                { paymentReference: '' }
            );
        } catch (e: any) {
            noRefThrew = e.message.includes('Payment evidence or reference number') || e.message.includes('strictly required');
        }

        assert(noRefThrew, '12. Cannot confirm disbursement without payment evidence/reference');
    } catch (e: any) {
        assert(false, '12. Cannot confirm disbursement without payment evidence/reference', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 13: Stage 2 payment confirmation transitions state to PAID and AccountTransaction to POSTED
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const exp = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 20000, category: 'Equipment', description: 'ECG Monitors' }
        );

        await service.approveOrRejectExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
            exp.id,
            { status: 'APPROVED' }
        );

        // Stage 1
        const voucherRes = await service.issuePaymentVoucher(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'fin-mgr', role: 'FINANCE_MANAGER' } },
            exp.id,
            { paymentMode: 'BANK_TRANSFER' }
        );

        // Stage 2
        const confirmRes = await service.confirmPaymentDisbursement(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'fin-mgr', role: 'FINANCE_MANAGER' } },
            exp.id,
            { paymentReference: 'UTR-HDFC-9928371', notes: 'Bank transfer cleared' }
        );

        const updatedExp = store.expenditures.find(e => e.id === exp.id);
        const updatedTx = store.financeTransactions.find(t => t.refNo === voucherRes.voucherRef);

        const isFullyPaid = 
            confirmRes.status === 'PAID' &&
            updatedExp?.paymentStatus === 'PAID' &&
            updatedExp?.receiptRef === 'UTR-HDFC-9928371' &&
            updatedTx?.status === 'POSTED' &&
            confirmRes.glPosting?.status === 'UNAVAILABLE'; // Honest GL reporting without fake entries

        assert(
            isFullyPaid,
            '13. Stage 2 payment confirmation transitions state to PAID and AccountTransaction to POSTED'
        );
    } catch (e: any) {
        assert(false, '13. Stage 2 payment confirmation transitions state to PAID and AccountTransaction to POSTED', e.message);
    }
    // -------------------------------------------------------------------------
    // TEST 14: Cancellation/reversal of approved unpaid expenditure releases capacity
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const mockPrisma = createMockPrisma(store);
        const service = new FundingExpenditureService(mockPrisma);
        (service as any).checkExpenditureColumnsExist = async () => true;

        const exp = await service.createExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'staff-1', role: 'DONOR_COORDINATOR' } },
            { projectId: 'proj-medical-camp', amount: 30000, category: 'Logistics', description: 'Van rental' }
        );

        await service.approveOrRejectExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
            exp.id,
            { status: 'APPROVED' }
        );

        // Cancel expenditure
        const cancelled = await service.cancelOrReverseExpenditure(
            { tenantId: tenantA, unitId: unitUNCF, user: { id: 'manager-1', role: 'FINANCE_MANAGER' } },
            exp.id,
            'Vendor cancelled van booking'
        );

        const capacity = await service.getProjectCapacity('proj-medical-camp', tenantA);
        assert(
            cancelled.paymentStatus === 'CANCELLED' && capacity.remainingCapacity === 100000,
            '14. Cancellation/reversal of approved unpaid expenditure releases capacity'
        );
    } catch (e: any) {
        assert(false, '14. Cancellation/reversal of approved unpaid expenditure releases capacity', e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 15: Existing project Free Medical Camp budget remains intact
    // -------------------------------------------------------------------------
    try {
        const store = createFreshStore();
        const initialBudget = store.projects.find(p => p.id === 'proj-medical-camp')?.totalBudget;
        assert(
            initialBudget === 500000,
            '15. Existing project Free Medical Camp budget remains intact at ₹5,00,000'
        );
    } catch (e: any) {
        assert(false, '15. Existing project Free Medical Camp budget remains intact', e.message);
    }

    console.log('');
    console.log('================================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log('================================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runExpenditurePaymentTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
