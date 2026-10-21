import { z } from 'zod';

export const contractDraftSchema = z.object({
    admissionId: z.string().uuid().optional(),
    enquiryId: z.string().uuid().optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime().nullable().optional(),
    staffRequired: z.number().int().positive().nullable().optional(),
    shift: z.string().nullable().optional(),
    frequency: z.string().nullable().optional(),
    careRequirements: z.any().nullable().optional(),
    specialInstructions: z.string().nullable().optional(),
    servicePrice: z.number().nonnegative().nullable().optional(),
    billingCycle: z.string().nullable().optional()
}).refine((data) => data.admissionId || data.enquiryId, {
    message: 'Either admissionId or enquiryId must be provided'
});

export const contractUpdateSchema = z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().nullable().optional(),
    staffRequired: z.number().int().positive().nullable().optional(),
    shift: z.string().nullable().optional(),
    frequency: z.string().nullable().optional(),
    careRequirements: z.any().nullable().optional(),
    specialInstructions: z.string().nullable().optional(),
    servicePrice: z.number().nonnegative().nullable().optional(),
    billingCycle: z.string().nullable().optional(),
    termsSnapshot: z.any().nullable().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'CANCELLED', 'COMPLETED', 'EXPIRED']).optional(),
    amendmentReason: z.string().optional(),
    reason: z.string().optional()
});
