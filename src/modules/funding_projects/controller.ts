import { volunteerService } from './volunteer.service.js';
import { 
    getFundingCategories as getFundingCategoriesService,
    createFundingCategory as createFundingCategoryService,
    getProjectClassifications as getProjectClassificationsService,
    createProjectClassification as createProjectClassificationService,
    getProjects as getProjectsService,
    createProject as createProjectService,
    getFundingSources as getFundingSourcesService,
    getFundingAllocations as getFundingAllocationsService,
    createFundingAllocation as createFundingAllocationService,
    getProjectExpenditures as getProjectExpendituresService,
    getProjectCapacity as getProjectCapacityService,
    createProjectExpenditure as createProjectExpenditureService,
    approveExpenditure as approveExpenditureService,
    issuePaymentVoucher as issuePaymentVoucherService,
    confirmPaymentDisbursement as confirmPaymentDisbursementService,
    cancelExpenditure as cancelExpenditureService
} from './service.js';
import { 
    createFundingCategorySchema, createProjectClassificationSchema,
    createProjectSchema, createFundingAllocationSchema,
    createProjectExpenditureSchema, approveExpenditureSchema,
    processPaymentSchema, confirmPaymentDisbursementSchema, cancelExpenditureSchema
} from './validation.js';

export const getFundingCategories = async (req: any, res: any) => {
    try {
        const data = await getFundingCategoriesService(req.tenantId || req.user.tenantId);
        res.json({ success: true, data });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
};

export const createFundingCategory = async (req: any, res: any) => {
    try {
        const validated = createFundingCategorySchema.parse(req.body);
        const data = await createFundingCategoryService(req.tenantId || req.user.tenantId, req.unitId || req.user.unitId, validated);
        res.json({ success: true, data });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
};

export const getProjectClassifications = async (req: any, res: any) => {
    try {
        const data = await getProjectClassificationsService(req.tenantId || req.user.tenantId);
        res.json({ success: true, data });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
};

export const createProjectClassification = async (req: any, res: any) => {
    try {
        const validated = createProjectClassificationSchema.parse(req.body);
        const data = await createProjectClassificationService(req.tenantId || req.user.tenantId, req.unitId || req.user.unitId, validated);
        res.json({ success: true, data });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
};

export const getProjects = async (req: any, res: any) => {
    try {
        const data = await getProjectsService(req.tenantId || req.user.tenantId, req.unitId || req.user.unitId);
        res.json({ success: true, data });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
};

export const createProject = async (req: any, res: any) => {
    try {
        const validated = createProjectSchema.parse(req.body);
        const data = await createProjectService(
            req.tenantId || req.user.tenantId,
            req.unitId || req.user.unitId,
            {
                ...validated,
                startDate: validated.startDate ? new Date(validated.startDate) : undefined,
                endDate: validated.endDate ? new Date(validated.endDate) : undefined
            }
        );
        res.json({ success: true, data });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
};

// --- Funding Sources ---
export const getFundingSources = async (req: any, res: any) => {
    try {
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId
        };
        const data = await getFundingSourcesService(scope, { projectId: req.query.projectId });
        res.json({ success: true, data });
    } catch (error: any) {
        const status = error.status || 400;
        res.status(status).json({ success: false, message: error.message });
    }
};

// --- Funding Allocations ---
export const getFundingAllocations = async (req: any, res: any) => {
    try {
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId
        };
        const data = await getFundingAllocationsService(scope, req.query.projectId);
        res.json({ success: true, data });
    } catch (error: any) {
        const status = error.status || 400;
        res.status(status).json({ success: false, message: error.message });
    }
};

export const createFundingAllocation = async (req: any, res: any) => {
    try {
        const validated = createFundingAllocationSchema.parse(req.body);
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId,
            user: req.user
        };
        const data = await createFundingAllocationService(scope, validated);
        res.json({ success: true, data, message: 'Funding allocation created successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            const issues = error.issues || error.errors || [];
            const message = issues.map((i: any) => i.message).join('; ') || 'Validation error';
            return res.status(400).json({ success: false, message, errors: issues });
        }
        const status = error.status || (error.code === 'P2002' ? 409 : 400);
        res.status(status).json({ success: false, message: error.message });
    }
};

// --- Project Expenditures ---
export const getProjectExpenditures = async (req: any, res: any) => {
    try {
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId
        };
        const data = await getProjectExpendituresService(scope, req.query.projectId);
        res.json({ success: true, data });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
};

export const getProjectCapacity = async (req: any, res: any) => {
    try {
        const data = await getProjectCapacityService(req.params.projectId, req.tenantId || req.user.tenantId);
        res.json({ success: true, data });
    } catch (error: any) {
        const status = error.status || 400;
        res.status(status).json({ success: false, message: error.message });
    }
};

export const createProjectExpenditure = async (req: any, res: any) => {
    try {
        const validated = createProjectExpenditureSchema.parse(req.body);
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId,
            user: req.user
        };
        const data = await createProjectExpenditureService(scope, validated);
        res.json({ success: true, data, message: 'Project expenditure request submitted successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            const issues = error.issues || error.errors || [];
            const message = issues.map((i: any) => i.message).join('; ') || 'Validation error';
            return res.status(400).json({ success: false, message, errors: issues });
        }
        const status = error.status || 400;
        res.status(status).json({ success: false, message: error.message });
    }
};

export const approveExpenditure = async (req: any, res: any) => {
    try {
        const validated = approveExpenditureSchema.parse(req.body);
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId,
            user: req.user
        };
        const data = await approveExpenditureService(scope, req.params.id, validated);
        res.json({ success: true, data, message: `Expenditure request ${validated.status.toLowerCase()} successfully` });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            const issues = error.issues || error.errors || [];
            const message = issues.map((i: any) => i.message).join('; ') || 'Validation error';
            return res.status(400).json({ success: false, message, errors: issues });
        }
        const status = error.status || 400;
        res.status(status).json({ success: false, message: error.message });
    }
};

// Stage 1: Issue Payment Voucher (Voucher prepared in Finance, AccountTransaction CREATED)
export const issuePaymentVoucherHandler = async (req: any, res: any) => {
    try {
        const validated = processPaymentSchema.parse(req.body);
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId,
            user: req.user
        };
        const data = await issuePaymentVoucherService(scope, req.params.id, validated);
        res.json({ 
            success: true, 
            data, 
            message: data.message || `Payment voucher ${data.voucherRef} issued successfully in Finance module` 
        });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            const issues = error.issues || error.errors || [];
            const message = issues.map((i: any) => i.message).join('; ') || 'Validation error';
            return res.status(400).json({ success: false, message, errors: issues });
        }
        const status = error.status || 400;
        res.status(status).json({ success: false, message: error.message });
    }
};

// Stage 2: Confirm Payment Disbursement (Recorded payment proof/reference, AccountTransaction POSTED)
export const confirmPaymentDisbursementHandler = async (req: any, res: any) => {
    try {
        const validated = confirmPaymentDisbursementSchema.parse(req.body);
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId,
            user: req.user
        };
        const data = await confirmPaymentDisbursementService(scope, req.params.id, validated);
        res.json({ 
            success: true, 
            data, 
            message: data.message || 'Payment disbursement confirmed successfully' 
        });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            const issues = error.issues || error.errors || [];
            const message = issues.map((i: any) => i.message).join('; ') || 'Validation error';
            return res.status(400).json({ success: false, message, errors: issues });
        }
        const status = error.status || 400;
        res.status(status).json({ success: false, message: error.message });
    }
};

export const processExpenditurePayment = issuePaymentVoucherHandler;

export const cancelExpenditure = async (req: any, res: any) => {
    try {
        const validated = cancelExpenditureSchema.parse(req.body);
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId,
            user: req.user
        };
        const data = await cancelExpenditureService(scope, req.params.id, validated.reason);
        res.json({ success: true, data, message: 'Expenditure request cancelled successfully' });
    } catch (error: any) {
        if (error.name === 'ZodError') {
            const issues = error.issues || error.errors || [];
            const message = issues.map((i: any) => i.message).join('; ') || 'Validation error';
            return res.status(400).json({ success: false, message, errors: issues });
        }
        const status = error.status || 400;
        res.status(status).json({ success: false, message: error.message });
    }
};

// --- Volunteers ---
export const getVolunteers = async (req: any, res: any) => {
    try {
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId
        };
        const data = await volunteerService.getVolunteers(scope);
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const createVolunteer = async (req: any, res: any) => {
    try {
        const scope = {
            tenantId: req.tenantId || req.user.tenantId,
            unitId: req.unitId || req.user.unitId,
            user: req.user
        };
        const data = await volunteerService.createVolunteer(scope, req.body);
        res.json({ success: true, data, message: 'Volunteer registered successfully' });
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message });
    }
};
