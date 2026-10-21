import { z } from 'zod';

export const taskSchema = z.object({
    title: z.string().min(1, 'Task title is required'),
    description: z.string().optional().nullable(),
    assigneeId: z.string().optional().nullable(),
    assignedStaffId: z.string().optional().nullable(),
    approvalAuthorityId: z.string().optional().nullable(),
    type: z.enum(['DAILY', 'SCHEDULED']).default('DAILY').optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM').optional(),
    dueDate: z.string().optional().nullable(),
    unitId: z.string().optional().nullable()
});

export const updateTaskStatusSchema = z.object({
    status: z.enum(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'APPROVED', 'REJECTED']),
    completedAt: z.string().optional().nullable(),
    remarks: z.string().optional().nullable()
});
