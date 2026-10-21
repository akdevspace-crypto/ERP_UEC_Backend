import { Router } from 'express';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { requireAnyPermission } from '../../shared/middleware/rbac.middleware.js';
import { getP2PSummaryHandler, getGRNAccrualsHandler, getVendorBillsHandler, getVendorBillByIdHandler, createVendorBillHandler, approveVendorBillHandler, recordVendorBillPaymentHandler } from './p2pFinance.controller.js';
const router = Router();
router.use(auth);
router.use(enforceTenant);
const financeRoles = [
    'SUPER_ADMIN',
    'SUPERADMIN',
    'ADMIN',
    'UNCF_ADMIN',
    'FINANCE_MANAGER',
    'ELDER_FINANCE_MANAGER'
];
const financePermissions = [
    'Finance',
    'Finance Dashboard',
    'Invoice',
    'Cashbox',
    'Pending Payments',
    'P2P Finance',
    'Accounts Payable',
    'ALL_ACCESS'
];
router.get('/p2p/summary', requireAnyPermission(financePermissions, financeRoles), getP2PSummaryHandler);
router.get('/p2p/grn-accruals', requireAnyPermission(financePermissions, financeRoles), getGRNAccrualsHandler);
router.get('/p2p/bills', requireAnyPermission(financePermissions, financeRoles), getVendorBillsHandler);
router.get('/p2p/bills/:id', requireAnyPermission(financePermissions, financeRoles), getVendorBillByIdHandler);
router.post('/p2p/bills', requireAnyPermission(financePermissions, financeRoles), createVendorBillHandler);
router.post('/p2p/bills/:id/approve', requireAnyPermission(financePermissions, financeRoles), approveVendorBillHandler);
router.post('/p2p/bills/:id/payments', requireAnyPermission(financePermissions, financeRoles), recordVendorBillPaymentHandler);
export default router;
