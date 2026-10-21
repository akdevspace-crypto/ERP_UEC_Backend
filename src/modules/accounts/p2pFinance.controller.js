import { p2pFinanceService } from './p2pFinance.service.js';
import { getReadScope } from '../../shared/utils/rbac.js';
export const getP2PSummaryHandler = async (req, res) => {
    try {
        const scope = getReadScope(req);
        const data = await p2pFinanceService.getP2PSummary(scope);
        res.status(200).json({
            success: true,
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Internal error retrieving P2P summary',
            error: error.message
        });
    }
};
export const getGRNAccrualsHandler = async (req, res) => {
    try {
        const scope = getReadScope(req);
        const page = req.query.page ? Number(req.query.page) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const search = req.query.search ? String(req.query.search) : undefined;
        const result = await p2pFinanceService.getGRNAccruals(scope, { page, limit, search });
        res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination,
            schemaStatus: result.schemaStatus
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Internal error retrieving GRN accruals',
            error: error.message
        });
    }
};
export const getVendorBillsHandler = async (req, res) => {
    try {
        const scope = getReadScope(req);
        const page = req.query.page ? Number(req.query.page) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const status = req.query.status ? String(req.query.status) : undefined;
        const vendorId = req.query.vendorId ? String(req.query.vendorId) : undefined;
        const search = req.query.search ? String(req.query.search) : undefined;
        const result = await p2pFinanceService.getVendorBills(scope, { page, limit, status, vendorId, search });
        res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination,
            schemaStatus: result.schemaStatus
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Internal error retrieving Vendor Bills',
            error: error.message
        });
    }
};
export const getVendorBillByIdHandler = async (req, res) => {
    try {
        const scope = getReadScope(req);
        const bill = await p2pFinanceService.getVendorBillById(String(req.params.id), scope);
        if (!bill) {
            res.status(404).json({
                success: false,
                message: 'Vendor Bill not found'
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: bill
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Internal error retrieving Vendor Bill',
            error: error.message
        });
    }
};
export const createVendorBillHandler = async (req, res) => {
    try {
        const user = req.user;
        const scope = {
            tenantId: req.tenantId || user?.tenantId,
            unitId: req.unitId || user?.unitId
        };
        const bill = await p2pFinanceService.createVendorBill(req.body, scope, user);
        res.status(201).json({
            success: true,
            message: 'Vendor Bill registered successfully',
            data: bill
        });
    }
    catch (error) {
        if (error.message?.includes('P2P_MIGRATION_PENDING')) {
            res.status(503).json({
                success: false,
                code: 'MIGRATION_PENDING',
                message: error.message
            });
            return;
        }
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to register Vendor Bill',
            error: error.message
        });
    }
};
export const approveVendorBillHandler = async (req, res) => {
    try {
        const user = req.user;
        const scope = {
            tenantId: req.tenantId || user?.tenantId,
            unitId: req.unitId || user?.unitId
        };
        const approvedBill = await p2pFinanceService.approveVendorBill(String(req.params.id), scope, user);
        res.status(200).json({
            success: true,
            message: 'Vendor Bill approved and AP liability posted to General Ledger',
            data: approvedBill
        });
    }
    catch (error) {
        if (error.message?.includes('P2P_MIGRATION_PENDING')) {
            res.status(503).json({
                success: false,
                code: 'MIGRATION_PENDING',
                message: error.message
            });
            return;
        }
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to approve Vendor Bill',
            error: error.message
        });
    }
};
export const recordVendorBillPaymentHandler = async (req, res) => {
    try {
        const user = req.user;
        const scope = {
            tenantId: req.tenantId || user?.tenantId,
            unitId: req.unitId || user?.unitId
        };
        const paymentResult = await p2pFinanceService.recordVendorBillPayment(String(req.params.id), req.body, scope, user);
        res.status(200).json({
            success: true,
            message: 'Vendor Bill payment recorded and settlement posted to General Ledger',
            data: paymentResult
        });
    }
    catch (error) {
        if (error.message?.includes('P2P_MIGRATION_PENDING')) {
            res.status(503).json({
                success: false,
                code: 'MIGRATION_PENDING',
                message: error.message
            });
            return;
        }
        res.status(400).json({
            success: false,
            message: error.message || 'Failed to record Vendor Bill payment',
            error: error.message
        });
    }
};
