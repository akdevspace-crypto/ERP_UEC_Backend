import { z } from 'zod';

export const adlSchema = z.object({
    patientId: z.string().uuid(),
    assignmentId: z.string().uuid().optional(),
    activityCategory: z.string().min(1),
    isMandatory: z.boolean().default(false),
    assignedStaffId: z.string().uuid().optional(),
    scheduledDate: z.string().datetime().optional(),
    mobility: z.string().optional(),
    hygiene: z.string().optional(),
    feeding: z.string().optional(),
    notes: z.string().optional().default('')
});

export const adlStatusSchema = z.object({
    status: z.enum(['ASSIGNED', 'COMPLETED', 'REFUSED', 'MISSED', 'VERIFICATION_REQUIRED', 'VERIFIED']),
    verificationNotes: z.string().optional()
});

export const nutritionSchema = z.object({
    patientId: z.string().uuid(),
    calories: z.number().int().positive().optional(),
    dietPlan: z.string().min(1),
    mealSchedule: z.string().optional(),
    dietaryRestrictions: z.string().optional(),
    notes: z.string().optional(),
    assignedStaffId: z.string().uuid().optional(),
    status: z.string().default('ACTIVE')
});

export const nutritionRecordSchema = z.object({
    patientId: z.string().uuid(),
    assignmentId: z.string().uuid().optional(),
    meal: z.string().min(1),
    careDate: z.string().datetime(),
    status: z.string().min(1),
    remarks: z.string().optional()
});

export const createNursingRevenueSchema = z.object({
    assignmentId: z.string().uuid({ message: 'assignmentId must be a valid UUID' }),
    careDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'careDate must be in YYYY-MM-DD format' }).or(z.string().datetime()),
    category: z.string().min(1, { message: 'category is required' }),
    description: z.string().min(1, { message: 'description is required' }),
    quantity: z.number().positive({ message: 'quantity must be positive' }),
    rate: z.number().min(0, { message: 'rate cannot be negative' }),
    tenantId: z.string().optional(),
    unitId: z.string().optional()
});


