import { z } from 'zod';

export const caregiverVitalEntrySchema = z.object({
    day: z.number().int().min(1).max(31),
    tempMor: z.string().optional().default(''),
    tempEve: z.string().optional().default(''),
    bpMor: z.string().optional().default(''),
    bpEve: z.string().optional().default(''),
    pulseMor: z.string().optional().default(''),
    pulseEve: z.string().optional().default(''),
    spo2Mor: z.string().optional().default(''),
    spo2Eve: z.string().optional().default(''),
    rrMor: z.string().optional().default(''),
    rrEve: z.string().optional().default(''),
    glucoseBf: z.string().optional().default(''),
    glucoseAf: z.string().optional().default(''),
    weight: z.string().optional().default(''),
    intakeBf: z.string().optional().default(''),
    intakeLunch: z.string().optional().default(''),
    intakeDinner: z.string().optional().default(''),
    urine: z.string().optional().default(''),
    stool: z.string().optional().default(''),
    sign: z.string().optional().default(''),
    remarks: z.string().optional().default('')
});

export const caregiverVitalChartSchema = z.object({
    patientId: z.string().uuid(),
    admissionId: z.string().uuid().optional(),
    enquiryId: z.string().uuid().optional(),
    allocationId: z.string().uuid().optional(),
    patientName: z.string().optional().default(''),
    age: z.string().optional().default(''),
    sex: z.string().optional().default(''),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
    entries: z.array(caregiverVitalEntrySchema).default([]),
    signatures: z.object({
        doctor: z.string().optional().default(''),
        nurse: z.string().optional().default(''),
        attender: z.string().optional().default(''),
        manager: z.string().optional().default('')
    }).optional().default({ doctor: '', nurse: '', attender: '', manager: '' }),
    status: z.string().optional().default('DRAFT')
});

export const vitalSignSchema = z.object({
    patientId: z.string().uuid(),
    assignmentId: z.string().uuid().optional(),
    shift: z.enum(['MORNING', 'EVENING']),
    recordedAt: z.string().datetime().optional(),
    bp: z.string().optional().or(z.literal('')),
    pulse: z.coerce.number().optional(),
    temp: z.coerce.number().optional(),
    spO2: z.coerce.number().optional(),
    bloodSugar: z.string().optional().or(z.literal('')),
    notes: z.string().optional().or(z.literal(''))
});

export const prescriptionSchema = z.object({
    patientId: z.string().uuid(),
    medication: z.string().min(1),
    dosage: z.string().min(1),
    frequency: z.string().min(1),
    startDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid startDate format" }),
    endDate: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), { message: "Invalid endDate format" }),
    instructions: z.string().optional(),
    isRestricted: z.boolean().optional().default(false)
});

export const medicationLogSchema = z.object({
    prescriptionId: z.string().uuid().optional(),
    patientId: z.string().uuid(),
    medication: z.string().min(1),
    dosageGiven: z.string().min(1),
    notes: z.string().optional()
});



export const medicationScheduleSchema = z.object({
    medicineIssueId: z.string().min(1),
    medicineName: z.string().min(1),
    patientName: z.string().min(1),
    dose: z.string().min(1),
    frequency: z.string().min(1),
    times: z.array(z.string().min(1)).min(1),
    startDate: z.string().min(1),
    notes: z.string().optional().default('')
});

export const administerDoseSchema = z.object({
    slot: z.string().min(1),
    remarks: z.string().optional().default('')
});
