import { getP2PSummaryHandler, getGRNAccrualsHandler } from './p2pFinance.controller.js';
import { Router } from 'express';
import {
    handleCreateInvoice,
    handleListInvoices,
    handleGetFinanceForecast,
    handleCreateIncome,
    handleCreateExpense,
    handleGetCashbox,
    handleRecordInvoicePayment,
    handleApproveTransaction,
    handleUpdateTransaction,
    handleDeleteTransaction
} from './controller.js';
import { protect } from '../../shared/middleware/auth.middleware.js';
import { enforceTenant } from '../../shared/middleware/tenant.middleware.js';
import { requireAnyPermission } from '../../shared/middleware/rbac.middleware.js';

const router = Router();

router.use(protect);
router.use(enforceTenant);
const financeRoles = ['SUPER_ADMIN', 'SUPERADMIN', 'ADMIN', 'UNCF_ADMIN', 'FINANCE_MANAGER'];
const financePermissions = [
    'Finance',
    'Finance Dashboard',
    'Invoice',
    'Cashbox',
    'Income',
    'Expense',
    'Pending Payments',
    'Cashbox Pending',
    'Allowance Tracking',
    'Renewals',
    'ALL_ACCESS'
];

router.use(requireAnyPermission(financePermissions, financeRoles));


router.post('/invoice/:id/payment', handleRecordInvoicePayment);
router.post('/invoice', handleCreateInvoice);
router.get('/invoice', handleListInvoices);
router.get('/finance/forecast', handleGetFinanceForecast);
router.get('/p2p/summary', getP2PSummaryHandler);
router.get('/p2p/grn-accruals', getGRNAccrualsHandler);
router.get('/finance/p2p/summary', getP2PSummaryHandler);
router.get('/finance/p2p/grn-accruals', getGRNAccrualsHandler);

router.post('/income', handleCreateIncome);
router.post('/expense', handleCreateExpense);
router.get('/cashbox', handleGetCashbox);
router.put('/:id/approve', handleApproveTransaction);
router.put('/finance/transactions/:id/approve', handleApproveTransaction);
router.put('/transactions/:id/approve', handleApproveTransaction);
router.put('/:id', handleUpdateTransaction);
router.delete('/:id', handleDeleteTransaction);

export default router;
