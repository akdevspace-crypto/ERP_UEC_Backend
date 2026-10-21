import { z } from 'zod';

const emptyToUndefined = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
};

const booleanish = z.preprocess((value) => {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
    }
    return value;
}, z.boolean());

const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional().nullable());
const optionalString = z.preprocess(emptyToUndefined, z.string().optional().nullable());
const optionalDateString = z.preprocess(emptyToUndefined, z.string().optional().nullable());

const addDateRangeValidation = (schema) => schema.superRefine((data, ctx) => {
    if (!data.startAt || !data.endAt) return;

    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return;

    if (endAt < startAt) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endAt'],
            message: 'End time must be after start time'
        });
    }
});

export const medicalAssignmentStatusSchema = z.enum([
    'PENDING',
    'ASSIGNED',
    'IN_PROGRESS',
    'ON_HOLD',
    'COMPLETED',
    'CANCELLED',
    'WAITING_APPROVAL',
    'APPROVED'
]);

const medicalAssignmentBaseSchema = z.object({
    staffId: z.string().uuid('Staff ID is required'),
    patientId: optionalUuid,
    admissionId: optionalUuid,
    enquiryId: optionalUuid,
    taskId: optionalUuid,
    allocationId: optionalUuid,
    dutyType: z.preprocess(emptyToUndefined, z.string().min(1).default('ROUND')),
    role: optionalString,
    location: optionalString,
    startAt: optionalDateString,
    endAt: optionalDateString,
    status: medicalAssignmentStatusSchema.default('ASSIGNED'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    notes: optionalString,
    metadata: z.any().optional()
});

export const createMedicalAssignmentSchema = addDateRangeValidation(medicalAssignmentBaseSchema).superRefine((data, ctx) => {
    if (data.dutyType === 'NURSING_CARE' && !data.patientId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['patientId'],
            message: "Patient is required for a Nursing Clinical Duty."
        });
    }
});

export const updateMedicalAssignmentSchema = addDateRangeValidation(medicalAssignmentBaseSchema.partial().extend({
    staffId: optionalUuid
})).superRefine((data, ctx) => {
    if (data.dutyType === 'NURSING_CARE' && data.patientId === null) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['patientId'],
            message: "Patient is required for a Nursing Clinical Duty."
        });
    }
});

export const updateMedicalAssignmentStatusSchema = z.object({
    status: medicalAssignmentStatusSchema,
    notes: optionalString
});

export const medicalAssignmentQuerySchema = z.object({
    status: medicalAssignmentStatusSchema.optional(),
    staffId: optionalUuid,
    patientId: optionalUuid,
    allocationId: optionalUuid,
    dutyType: optionalString,
    search: optionalString,
    from: optionalDateString,
    to: optionalDateString,
    activeOnly: booleanish.optional(),
    homeCare: booleanish.optional()
});

export const createDoctorVisitSchema = z.object({
    patientId: z.string().uuid('Patient ID is required'),
    doctorId: z.string().uuid('Doctor ID is required'),
    visitDate: optionalDateString,
    chiefComplaint: optionalString,
    clinicalNotes: optionalString,
    nextFollowUp: optionalDateString,
    medicalOrders: z.any().optional(),
    chargeConsultation: booleanish.optional(),
    consultationAmount: z.number().optional()
});

export const updateDoctorVisitSchema = createDoctorVisitSchema.partial();

