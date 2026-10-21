import { z } from 'zod';

export const createFundingCategorySchema = z.object({
    name: z.string().min(1, 'Category name is required'),
    description: z.string().optional()
});

export const createProjectClassificationSchema = z.object({
    name: z.string().min(1, 'Classification name is required'),
    description: z.string().optional()
});

export const createProjectSchema = z.object({
    name: z.string().min(1, 'Project name is required'),
    description: z.string().optional(),
    categoryId: z.string().uuid('Invalid category ID format').optional().nullable(),
    classificationId: z.string().uuid('Invalid classification ID format').optional().nullable(),
    totalBudget: z.preprocess(
        v => (v === undefined || v === null || v === '') ? undefined : (isNaN(Number(v)) ? v : Number(v)),
        z.number({ message: 'Total budget must be a valid number' }).min(0, 'Total budget must be non-negative')
    ),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable()
});

export const createFundingAllocationSchema = z.object({
    projectId: z.string().uuid('Project ID must be a valid UUID'),
    amount: z.preprocess(
        v => (v === undefined || v === null || v === '') ? undefined : (isNaN(Number(v)) ? v : Number(v)),
        z.number({ message: 'Allocation amount is required and must be a valid number' })
         .positive('Allocation amount must be strictly greater than zero')
         .finite('Allocation amount must be a finite number')
         .refine(v => Math.round(v * 100) === v * 100, { message: 'Allocation amount cannot exceed 2 decimal places' })
    ),
    sourceType: z.enum(['DONATION', 'GENERAL_FUND', 'GRANT', 'CSR_GRANT']).default('DONATION'),
    sourceDonationId: z.string().uuid('sourceDonationId must be a valid UUID').optional().nullable(),
    sourceAccountId: z.string().optional().nullable(),
    sourceReference: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
    idempotencyKey: z.string().max(100).optional().nullable()
}).refine(data => {
    if (data.sourceType === 'DONATION' && (!data.sourceDonationId || data.sourceDonationId.trim() === '')) {
        return false;
    }
    return true;
}, {
    message: 'sourceDonationId is required when sourceType is DONATION',
    path: ['sourceDonationId']
});

export const createProjectExpenditureSchema = z.object({
    projectId: z.string().uuid('Project ID must be a valid UUID'),
    amount: z.preprocess(
        v => (v === undefined || v === null || v === '') ? undefined : (isNaN(Number(v)) ? v : Number(v)),
        z.number({ message: 'Expenditure amount is required and must be a valid number' })
         .positive('Expenditure amount must be strictly greater than zero')
         .finite('Expenditure amount must be a finite number')
         .refine(v => Math.round(v * 100) === v * 100, { message: 'Expenditure amount cannot exceed 2 decimal places' })
    ),
    category: z.string().min(1, 'Expense category is required'),
    description: z.string().min(1, 'Description is required'),
    justification: z.string().max(1000).optional().nullable(),
    receiptRef: z.string().max(200).optional().nullable(),
    idempotencyKey: z.string().max(100).optional().nullable()
});

export const approveExpenditureSchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().optional().nullable()
}).refine(data => {
    if (data.status === 'REJECTED' && (!data.rejectionReason || data.rejectionReason.trim().length === 0)) {
        return false;
    }
    return true;
}, {
    message: 'Rejection reason is strictly required when rejecting an expenditure request',
    path: ['rejectionReason']
});

export const processPaymentSchema = z.object({
    paymentMode: z.enum(['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI', 'ONLINE']),
    paymentReference: z.string().max(100).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    idempotencyKey: z.string().max(100).optional().nullable()
});

export const cancelExpenditureSchema = z.object({
    reason: z.string().min(1, 'Cancellation reason is required')
});

export const issueVoucherSchema = z.object({
    paymentMode: z.enum(['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI', 'ONLINE']),
    paymentReference: z.string().max(100).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    idempotencyKey: z.string().max(100).optional().nullable()
});

export const confirmPaymentDisbursementSchema = z.object({
    paymentReference: z.string().min(1, 'Payment evidence or reference number (e.g. Bank UTR, transaction ID, cheque number) is required'),
    disbursementDate: z.string().optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    idempotencyKey: z.string().max(100).optional().nullable()
});
