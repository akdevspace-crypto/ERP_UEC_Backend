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
