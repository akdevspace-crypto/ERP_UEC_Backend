import { prisma } from '../app/prisma.js';
import { buildSessionUser, isAdminRole, resolveUserAccess } from '../modules/auth/access.js';
import { markMyAttendance, getMyAttendanceLogs, createMyLeaveRequest } from '../modules/hr/service.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: any) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ [PASS] ${testName}`);
    } else {
        console.error(`  ❌ [FAIL] ${testName}`, details ? details : '');
        throw new Error(`Test failed: ${testName}`);
    }
}

async function runRegressionTestSuite() {
    console.log('======================================================================');
    console.log('🧪 RUNNING REGRESSION TEST SUITE: ERP SSO & HR STAFF MAPPING');
    console.log('======================================================================\n');

    // 1. Fetch the primary target user: raghav@uec.com
    const raghav = await (prisma as any).user.findFirst({
        where: { email: { equals: 'raghav@uec.com', mode: 'insensitive' } },
        include: {
            role: true,
            tenant: true,
            unit: true,
            staff: true
        }
    });

    if (!raghav) {
        throw new Error('User raghav@uec.com not found in database');
    }

    // 2. Fetch an unlinked account for unlinked tests: admin@example.com
    const unlinkedUser = await (prisma as any).user.findFirst({
        where: { email: { equals: 'admin@example.com', mode: 'insensitive' } },
        include: {
            role: true,
            tenant: true,
            unit: true,
            staff: true
        }
    });

    if (!unlinkedUser) {
        throw new Error('Unlinked test user admin@example.com not found in database');
    }

    console.log('--- TEST GROUP 1: ERP SSO & Session User Construction ---');
    {
        assert(raghav.staff !== null, 'raghav@uec.com has an active linked staff record');
        assert(raghav.staff?.userId === raghav.id, 'Staff userId matches User.id');
        assert(raghav.staff?.empId === 'EMP-000011', 'Staff empId is correctly EMP-000011');

        const sessionUser = buildSessionUser(raghav);
        assert(sessionUser.id === raghav.id, 'Session user id matches User id');
        assert(sessionUser.staffId === raghav.staff?.id, 'Session user staffId matches Staff id');
        assert(sessionUser.empId === raghav.staff?.empId, 'Session user empId matches Staff empId');
        assert(sessionUser.permissions.includes('ALL_ACCESS'), 'Session user retains ALL_ACCESS permissions');
        assert(sessionUser.unitAccess.includes('*'), 'Session user retains wildcard unit access [*]');
        assert(isAdminRole(sessionUser.role), 'isAdminRole confirms Super Admin identity');
    }

    console.log('\n--- TEST GROUP 2: Existing CRM Login & RBAC Role Isolation ---');
    {
        // An agent user should NOT have ALL_ACCESS or admin role
        const agentUser = {
            id: 'mock-agent-id',
            role: { name: 'Agent' },
            staff: { id: 'mock-staff-id', metadata: null }
        };
        const agentAccess = resolveUserAccess(agentUser);
        assert(!agentAccess.permissions.includes('ALL_ACCESS'), 'Agent role does NOT receive ALL_ACCESS');
        assert(!isAdminRole(agentUser.role), 'isAdminRole returns false for Agent role');

        // Admin role must always receive ALL_ACCESS regardless of staff profile
        const adminAccess = resolveUserAccess(raghav);
        assert(adminAccess.permissions.includes('ALL_ACCESS'), 'Super Admin user receives ALL_ACCESS even with staff profile');
        assert(adminAccess.unitAccess.includes('*'), 'Super Admin unit access is wildcard [*]');
    }

    console.log('\n--- TEST GROUP 3: Attendance Flow for Linked Staff ---');
    {
        const tenant = await (prisma as any).tenant.findUnique({ where: { id: raghav.tenantId } });
        const unit = raghav.unitId ? await (prisma as any).unit.findUnique({ where: { id: raghav.unitId } }) : null;
        
        // Clean up any existing attendance log for today before running test
        const todayUtc = new Date();
        todayUtc.setUTCHours(0, 0, 0, 0);
        await (prisma as any).attendanceLog.deleteMany({
            where: { staffId: raghav.staff.id, date: todayUtc }
        });

        // 3a. Check-in
        const checkInResult = await markMyAttendance(raghav.tenantId, raghav.id, {
            action: 'CHECK_IN',
            note: 'Regression test automated check-in'
        });
        assert(checkInResult.id === raghav.staff.id, 'Check-in links to correct staff profile');
        assert(checkInResult.checkIn !== '-', 'Check-in records valid checkIn time');
        assert(checkInResult.status === 'Present', 'Attendance status marked as Present');

        // 3b. Duplicate check-in must fail
        let duplicateCheckInError: any = null;
        try {
            await markMyAttendance(raghav.tenantId, raghav.id, {
                action: 'CHECK_IN',
                note: 'Duplicate check-in should fail'
            });
        } catch (err: any) {
            duplicateCheckInError = err;
        }
        assert(
            duplicateCheckInError?.message?.includes('already checked in for today'),
            'Duplicate check-in on the same day is rejected with validation error'
        );

        // 3c. Check-out
        const checkOutResult = await markMyAttendance(raghav.tenantId, raghav.id, {
            action: 'CHECK_OUT',
            note: 'Regression test automated check-out'
        });
        assert(checkOutResult.id === raghav.staff.id, 'Check-out links to correct staff profile');
        assert(checkOutResult.checkOut !== '-', 'Check-out records valid checkOut time');

        // 3d. Duplicate check-out must fail
        let duplicateCheckOutError: any = null;
        try {
            await markMyAttendance(raghav.tenantId, raghav.id, {
                action: 'CHECK_OUT',
                note: 'Duplicate check-out should fail'
            });
        } catch (err: any) {
            duplicateCheckOutError = err;
        }
        assert(
            duplicateCheckOutError?.message?.includes('already checked out for today'),
            'Duplicate check-out on the same day is rejected with validation error'
        );

        // 3e. Verify getMyAttendanceLogs
        const logs = await getMyAttendanceLogs(raghav.tenantId, raghav.id);
        assert(Array.isArray(logs) && logs.length > 0, 'getMyAttendanceLogs returns non-empty list of attendance records');

        // Clean up test attendance records
        await (prisma as any).attendanceLog.deleteMany({
            where: { staffId: raghav.staff.id, date: todayUtc }
        });
    }

    console.log('\n--- TEST GROUP 4: Unlinked Account Rejection ---');
    {
        assert(unlinkedUser.staff === null, 'admin@example.com is unlinked (staff: null)');

        let unlinkedAttendanceError: any = null;
        try {
            await markMyAttendance(unlinkedUser.tenantId, unlinkedUser.id, {
                action: 'CHECK_IN'
            });
        } catch (err: any) {
            unlinkedAttendanceError = err;
        }
        assert(
            (unlinkedAttendanceError?.status === 404 || unlinkedAttendanceError?.statusCode === 404) &&
            unlinkedAttendanceError?.message === 'No staff profile is linked to this login',
            'Unlinked account calling markMyAttendance throws 404: No staff profile is linked to this login'
        );

        const unlinkedLogs = await getMyAttendanceLogs(unlinkedUser.tenantId, unlinkedUser.id);
        assert(Array.isArray(unlinkedLogs) && unlinkedLogs.length === 0, 'Unlinked account getMyAttendanceLogs returns empty array safely');
    }

    console.log('\n--- TEST GROUP 5: Leave Requests for Linked vs Unlinked Accounts ---');
    {
        // 5a. Unlinked account attempting leave request
        let unlinkedLeaveError: any = null;
        try {
            await createMyLeaveRequest(unlinkedUser.tenantId, unlinkedUser.id, {
                leaveType: 'CASUAL',
                fromDate: '2026-11-20',
                toDate: '2026-11-21',
                reason: 'Unlinked test'
            });
        } catch (err: any) {
            unlinkedLeaveError = err;
        }
        assert(
            (unlinkedLeaveError?.status === 404 || unlinkedLeaveError?.statusCode === 404) &&
            unlinkedLeaveError?.message === 'No staff profile is linked to this login',
            'Unlinked account calling createMyLeaveRequest throws 404: No staff profile is linked to this login'
        );

        // 5b. Linked account leave request
        const leaveRequest = await createMyLeaveRequest(raghav.tenantId, raghav.id, {
            leaveType: 'CASUAL',
            fromDate: '2026-12-01',
            toDate: '2026-12-02',
            reason: 'Automated regression test leave request'
        });
        assert(leaveRequest?.status === 'PENDING', 'Leave request created successfully with status PENDING');
        assert(leaveRequest?.staffId === raghav.staff.id, 'Leave request is correctly associated with staffId');

        // Clean up test leave request
        if (leaveRequest?.id) {
            await (prisma as any).leaveRequest.delete({
                where: { id: leaveRequest.id }
            });
        }
    }

    console.log('\n--- TEST GROUP 6: Cross-Tenant Access Isolation ---');
    {
        const invalidTenantId = 'e0000000-0000-0000-0000-000000000000';

        // 6a. Attendance with mismatched tenantId
        let crossTenantAttendanceError: any = null;
        try {
            await markMyAttendance(invalidTenantId, raghav.id, {
                action: 'CHECK_IN'
            });
        } catch (err: any) {
            crossTenantAttendanceError = err;
        }
        assert(
            (crossTenantAttendanceError?.status === 404 || crossTenantAttendanceError?.statusCode === 404) &&
            crossTenantAttendanceError?.message === 'No staff profile is linked to this login',
            'Cross-tenant markMyAttendance is rejected with 404: No staff profile is linked to this login'
        );

        // 6b. Leave request with mismatched tenantId
        let crossTenantLeaveError: any = null;
        try {
            await createMyLeaveRequest(invalidTenantId, raghav.id, {
                leaveType: 'CASUAL',
                fromDate: '2026-12-10',
                toDate: '2026-12-11',
                reason: 'Cross tenant test'
            });
        } catch (err: any) {
            crossTenantLeaveError = err;
        }
        assert(
            (crossTenantLeaveError?.status === 404 || crossTenantLeaveError?.statusCode === 404) &&
            crossTenantLeaveError?.message === 'No staff profile is linked to this login',
            'Cross-tenant createMyLeaveRequest is rejected with 404: No staff profile is linked to this login'
        );
    }

    console.log('\n======================================================================');
    console.log(`🎉 ALL TESTS PASSED: ${passedTests}/${totalTests} assertions verified!`);
    console.log('======================================================================\n');
}

runRegressionTestSuite()
    .catch((err) => {
        console.error('❌ Regression Test Suite Failed:', err);
        process.exit(1);
    })
    .finally(async () => {
        await (prisma as any).$disconnect();
    });
