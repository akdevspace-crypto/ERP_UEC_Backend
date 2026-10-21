import { z } from 'zod';

export const enquirySchema = z.object({
    clientName: z.string().min(1, 'Name is required'),
    mobile: z.string().min(10, 'Mobile must be at least 10 characters'),
    email: z.string().email().optional().or(z.literal('')),
    service: z.string().optional().or(z.literal('')),
    unitId: z.string().optional().nullable().or(z.literal('')),
    mode: z.enum(['Call', 'Walk-in', 'Website', 'Reference']).optional(),
    comments: z.string().optional().or(z.literal('')),
    status: z.enum(['Open', 'In Progress', 'Converted', 'Lost', 'Emergency', 'Important', 'Just Enquiry']).optional(),
    patientName: z.string().optional().or(z.literal('')),
    patientAge: z.string().optional().or(z.literal('')),
    patientGender: z.string().optional().or(z.literal('')),
    patientHealthCondition: z.string().optional().or(z.literal('')),
    clientAddress: z.string().optional().or(z.literal('')),
    clientLocation: z.string().optional().or(z.literal('')),
    remarks: z.string().optional().or(z.literal('')),
    serviceRequirements: z.object({
        staffRequired: z.number().int().positive().optional(),
        shift: z.string().optional(),
        startDate: z.string().optional(),
        frequency: z.string().optional(),
        careRequirements: z.union([
            z.array(z.string()),
            z.string().transform((val) => (val ? val.split(',').map((s) => s.trim()).filter(Boolean) : []))
        ]).optional(),
        specialInstructions: z.string().optional()
    }).optional()
});

export const followUpSchema = z.object({
    notes: z.string().min(1, 'Notes are required'),
    nextDate: z.string().datetime(),
    staffId: z.string().optional(),
    channel: z.string().optional(),
    outcome: z.string().optional(),
    attachmentName: z.string().optional().or(z.literal('')),
    clientInterest: z.string().optional(),
    readyToPayAmount: z.number().optional(),
    paymentMode: z.string().optional(),
    nextFollowupStatus: z.string().optional()
});

export const admissionConversionSchema = z.object({
    patientName: z.string().optional().or(z.literal('')),
    status: z.string().optional().or(z.literal('')),
    dob: z.string().optional().or(z.literal('')),
    age: z.coerce.number().optional(),
    gender: z.string().optional().or(z.literal('')),
    bloodGroup: z.string().optional().or(z.literal('')),
    primaryContact: z.string().optional().or(z.literal('')),
    emergencyContact: z.string().optional().or(z.literal('')),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    address: z.string().optional().or(z.literal('')),
    admissionPriority: z.string().optional().or(z.literal('')),
    healthCondition: z.string().optional().or(z.literal('')),
    clinicalStatus: z.string().optional().or(z.literal('')),
    floor: z.string().optional().or(z.literal('')),
    room: z.string().optional().or(z.literal('')),
    bed: z.string().optional().or(z.literal('')),
    unitId: z.string().min(1, 'Destination unit is required')
});

export const existingPatientSchema = z.object({
    clientName: z.string().min(1, 'Family/client name is required'),
    patientName: z.string().min(1, 'Patient name is required'),
    mobile: z.string().min(10, 'Mobile must be at least 10 characters'),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional().or(z.literal('')),
    careType: z.enum(['HOME_CARE', 'CLINICAL', 'IN_HOUSE', 'OTHERS']).default('HOME_CARE'),
    admissionDate: z.string().optional().or(z.literal('')),
    serviceName: z.string().optional().or(z.literal('')),
    serviceAmount: z.coerce.number().min(0).optional(),
    roomNo: z.string().optional().or(z.literal('')),
    healthCondition: z.string().optional().or(z.literal('')),
    currentMedicines: z.string().optional().or(z.literal('')),
    routineNotes: z.string().optional().or(z.literal('')),
    openingBalance: z.coerce.number().min(0).optional()
});

export const admissionClientPortalAccessSchema = z.object({
    email: z.string().email('Valid login email is required'),
    mobile: z.string().optional().or(z.literal('')),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    roleName: z.enum(['Family Member', 'Client Family Member']).default('Family Member')
});

export const clientPortalAccessSchema = z.object({
    email: z.string().email('Valid login email is required'),
    mobile: z.string().optional().or(z.literal('')),
    password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
    roleName: z.enum(['Family Member', 'Client Family Member']).default('Family Member')
});

export const renewalFollowUpOutcomeSchema = z.object({
    followUpId: z.string().optional(),
    outcome: z.enum(['INTERESTED', 'NOT_INTERESTED', 'CALL_LATER', 'CONVERTED_TO_NEW_SERVICE', 'CLOSED']),
    notes: z.string().optional().or(z.literal('')),
    nextDate: z.string().datetime().optional(),
    service: z.string().optional().or(z.literal(''))
});
