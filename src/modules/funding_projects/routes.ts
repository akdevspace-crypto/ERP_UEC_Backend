import express from 'express';
import {
    getFundingCategories, createFundingCategory,
    getVolunteers, createVolunteer,
    getProjectClassifications, createProjectClassification,
    getProjects, createProject,
    getFundingSources,
    getFundingAllocations, createFundingAllocation,
    getProjectExpenditures, getProjectCapacity, createProjectExpenditure,
    approveExpenditure, issuePaymentVoucherHandler, confirmPaymentDisbursementHandler,
    cancelExpenditure
} from './controller.js';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { requireRoles, requireAnyPermission } from '../../shared/middleware/rbac.middleware.js';

const router = express.Router();

router.use(auth);
router.use(enforceTenant);

const projectRoles = ['SUPER_ADMIN', 'SUPERADMIN', 'ADMIN', 'UNCF_ADMIN', 'DONOR_COORDINATOR', 'FINANCE_MANAGER'];
const projectAdminRoles = ['SUPER_ADMIN', 'SUPERADMIN', 'ADMIN', 'UNCF_ADMIN'];
const financeRoles = ['SUPER_ADMIN', 'SUPERADMIN', 'ADMIN', 'UNCF_ADMIN', 'FINANCE_MANAGER', 'ELDER_FINANCE_MANAGER'];
const financePermissions = ['Finance', 'Project Expenditures', 'Funding Allocations', 'Donors & Volunteers', 'ALL_ACCESS'];
const projectPermissions = ['Funding Projects', 'Projects', 'Funding Allocations', 'Project Expenditures', 'Donors & Volunteers', 'ALL_ACCESS'];

// Categories & Classifications (Master Data)
router.get('/funding-categories', requireAnyPermission(projectPermissions, projectRoles), getFundingCategories);
router.post('/funding-categories', requireRoles(projectAdminRoles), createFundingCategory);

router.get('/project-classifications', requireAnyPermission(projectPermissions, projectRoles), getProjectClassifications);
router.post('/project-classifications', requireRoles(projectAdminRoles), createProjectClassification);

// Projects
router.get('/projects', requireAnyPermission(projectPermissions, projectRoles), getProjects);
router.post('/projects', requireRoles(projectRoles), createProject);
router.get('/projects/:projectId/capacity', requireAnyPermission(projectPermissions, projectRoles), getProjectCapacity);

// Funding Sources (Authoritative source evaluation)
router.get('/funding-sources', requireAnyPermission(projectPermissions, projectRoles), getFundingSources);

// Funding Allocations
router.get('/funding-allocations', requireAnyPermission(projectPermissions, projectRoles), getFundingAllocations);
router.post('/funding-allocations', requireRoles(projectRoles), createFundingAllocation);

// Project Expenditures
router.get('/project-expenditures', requireAnyPermission(projectPermissions, projectRoles), getProjectExpenditures);
router.post('/project-expenditures', requireRoles(projectRoles), createProjectExpenditure);
router.patch('/project-expenditures/:id/approve', requireAnyPermission(financePermissions, financeRoles), approveExpenditure);

// Stage 1: Issue Finance Payment Voucher (AccountTransaction status = CREATED, expenditure.paymentStatus = VOUCHER_ISSUED)
router.post('/project-expenditures/:id/payments', requireAnyPermission(financePermissions, financeRoles), issuePaymentVoucherHandler);
router.post('/project-expenditures/:id/vouchers', requireAnyPermission(financePermissions, financeRoles), issuePaymentVoucherHandler);

// Stage 2: Confirm Actual Payment Disbursement (AccountTransaction status = POSTED, expenditure.paymentStatus = PAID)
router.post('/project-expenditures/:id/confirm-payment', requireAnyPermission(financePermissions, financeRoles), confirmPaymentDisbursementHandler);

router.post('/project-expenditures/:id/cancel', requireAnyPermission(financePermissions, financeRoles), cancelExpenditure);


// Volunteers
router.get('/volunteers', requireAnyPermission(projectPermissions, projectRoles), getVolunteers);
router.post('/volunteers', requireRoles(projectRoles), createVolunteer);

export default router;
