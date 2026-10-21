import { Router } from 'express';
import { auth, enforceTenant } from '../../shared/middleware/auth.middleware.js';
import { requireAnyPermission } from '../../shared/middleware/rbac.middleware.js';
import {
    getP2PSummaryHandler,
    getGRNAccrualsHandler,
    getVendorBillsHandler,
    getVendorBillByIdHandler,
    createVendorBillHandler,
    approveVendorBillHandler,
    recordVendorBillPaymentHandler
} from './p2pFinance.controller.js';
import { bankReconciliationService } from './bankReconciliation.service.js';
import { gstReportService } from './gstReport.service.js';

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

// P2P Routes
router.get('/p2p/summary', requireAnyPermission(financePermissions, financeRoles), getP2PSummaryHandler);
router.get('/p2p/grn-accruals', requireAnyPermission(financePermissions, financeRoles), getGRNAccrualsHandler);
router.get('/p2p/bills', requireAnyPermission(financePermissions, financeRoles), getVendorBillsHandler);
router.get('/p2p/bills/:id', requireAnyPermission(financePermissions, financeRoles), getVendorBillByIdHandler);
router.post('/p2p/bills', requireAnyPermission(financePermissions, financeRoles), createVendorBillHandler);
router.post('/p2p/bills/:id/approve', requireAnyPermission(financePermissions, financeRoles), approveVendorBillHandler);
router.post('/p2p/bills/:id/payments', requireAnyPermission(financePermissions, financeRoles), recordVendorBillPaymentHandler);

// Bank Reconciliation Routes
router.post('/bank-reconciliation/parse', requireAnyPermission(financePermissions, financeRoles), async (req: any, res: any) => {
    try {
        const { rawText, lines } = req.body;
        const tenantId = req.user?.tenantId || req.tenantId;
        const unitId = req.headers['x-unit-id'] || req.query.unitId || null;

        let statementLines = lines;
        if (!statementLines && rawText) {
            statementLines = bankReconciliationService.parseStatement(rawText);
        }
        if (!Array.isArray(statementLines) || statementLines.length === 0) {
            return res.status(400).json({ success: false, message: 'Valid bank statement lines or rawText is required.' });
        }

        const matchCandidates = await bankReconciliationService.matchStatementLines(
            { tenantId, unitId: unitId === 'ALL_UNITS' ? null : unitId },
            statementLines
        );

        res.json({
            success: true,
            data: {
                totalLines: statementLines.length,
                matchedCount: matchCandidates.filter(m => m.matchType !== 'NO_MATCH').length,
                unmatchedCount: matchCandidates.filter(m => m.matchType === 'NO_MATCH').length,
                candidates: matchCandidates
            }
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/bank-reconciliation/reconcile', requireAnyPermission(financePermissions, financeRoles), async (req: any, res: any) => {
    try {
        const { statementLine, targetRecordId, recordType } = req.body;
        const tenantId = req.user?.tenantId || req.tenantId;
        const unitId = req.headers['x-unit-id'] || req.user?.unitId || 'default-unit';

        if (!statementLine || !targetRecordId || !recordType) {
            return res.status(400).json({ success: false, message: 'statementLine, targetRecordId, and recordType are required.' });
        }

        const result = await bankReconciliationService.reconcileRecord(
            { tenantId, unitId },
            req.user,
            { statementLine, targetRecordId, recordType }
        );

        res.json({ success: true, data: result, message: 'Transaction reconciled successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GST Tax Compliance Routes
router.get('/gst/summary', requireAnyPermission(financePermissions, financeRoles), async (req: any, res: any) => {
    try {
        const tenantId = req.user?.tenantId || req.tenantId;
        const unitId = req.headers['x-unit-id'] || req.query.unitId || null;
        const { fromDate, toDate } = req.query;

        const summary = await gstReportService.getGstSummary(
            { tenantId, unitId: unitId === 'ALL_UNITS' ? null : unitId },
            { fromDate: fromDate ? String(fromDate) : undefined, toDate: toDate ? String(toDate) : undefined }
        );

        res.json({ success: true, data: summary });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/gst/e-invoice-export', requireAnyPermission(financePermissions, financeRoles), async (req: any, res: any) => {
    try {
        const tenantId = req.user?.tenantId || req.tenantId;
        const unitId = req.headers['x-unit-id'] || req.query.unitId || null;
        const { fromDate, toDate, format } = req.query;

        const exportData = await gstReportService.generateEInvoiceExport(
            { tenantId, unitId: unitId === 'ALL_UNITS' ? null : unitId },
            {
                fromDate: fromDate ? String(fromDate) : undefined,
                toDate: toDate ? String(toDate) : undefined,
                format: format === 'csv' ? 'csv' : 'json'
            }
        );

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
            return res.send(exportData.content);
        }

        res.json({ success: true, data: exportData });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
