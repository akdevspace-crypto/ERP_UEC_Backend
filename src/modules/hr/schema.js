import { z } from 'zod';

const booleanish = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

export const staffSchema = z.object({
  empId: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().min(2, "Employee ID must be at least 2 characters").optional()
  ),
  photoUrl: z.string().optional(),
  firstName: z.string().min(2, "First Name is required"),
  lastName: z.string().optional(),
  designation: z.string().optional(),
  department: z.string().optional(),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email("Valid email is required").optional().or(z.literal('')),
  joiningDate: z.string().datetime().optional().or(z.string().optional()),
  unitId: z.string().optional(),
  status: z.string().optional(),
  metadata: z.any().optional(),
  userId: z.string().optional()
});

export const jobApplicationSchema = z.object({
  applicationNo: z.string().min(1),
  companyUnit: z.string().min(1),
  applyFor: z.string().min(1),
  experience: z.string().optional(),
  location: z.string().optional(),
  applicantName: z.string().min(1),
  mobileNo: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  resumeUrl: z.string().optional(),
  followupStatus: z.string().optional(),
  interestStatus: z.string().optional()
});


export const staffMenuPrivilegeSchema = z.object({
  unitAccessMode: z.enum(['all', 'individual']).default('individual'),
  selectedUnitIds: z.array(z.string()).optional().default([]),
  permissions: z.record(
    z.string(),
    z.object({
      view: booleanish.optional().default(false),
      createUpdate: booleanish.optional().default(false)
    })
  ).optional().default({})
});

export const leaveRequestSchema = z.object({
  staffId: z.string().min(1, 'Staff is required'),
  leaveType: z.string().min(2, 'Leave type is required'),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  reason: z.string().optional().or(z.literal(''))
});

export const myLeaveRequestSchema = leaveRequestSchema.omit({ staffId: true });

export const leaveActionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  remarks: z.string().optional().or(z.literal(''))
});

export const attendanceActionSchema = z.object({
  action: z.enum(['CHECK_IN', 'CHECK_OUT']),
  note: z.string().optional().or(z.literal(''))
});

export const processPayrollSchema = z.object({
  staffId: z.string().min(1, 'Staff is required'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Payroll month must be in YYYY-MM format')
});

export const staffSalarySchema = z.object({
    monthlySalary: z.number().min(0, { message: "Salary must be positive" }),
    fixedAllowance: z.number().min(0, { message: "Allowance must be positive" }).default(0),
    fixedDeduction: z.number().min(0, { message: "Deduction must be positive" }).default(0)
});

export const candidateSchema = z.object({
  serialNo: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  mobileNo: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  department: z.string().optional(),
  experienceYears: z.union([z.number(), z.string()]).optional(),
  expectedSalary: z.union([z.number(), z.string()]).optional(),
  sourceAgent: z.string().optional(),
  preferredRole: z.string().optional(),
  stage: z.string().default('APPLIED'),
  isPlaced: z.boolean().default(false),
  details: z.any().optional(),
  unitId: z.string().optional(),
  termsAccepted: z.boolean().optional()
}).passthrough();

export const candidateUpdateSchema = candidateSchema.partial();

export const interviewSchema = z.object({
  candidateId: z.string().min(1, 'Candidate ID is required'),
  scheduledAt: z.string().datetime(),
  interviewer: z.string().optional(),
  interviewType: z.string().default('General'),
  status: z.string().default('SCHEDULED'),
  score: z.number().optional(),
  feedback: z.string().optional(),
  result: z.string().optional()
});

export const interviewUpdateSchema = interviewSchema.partial();


export const provisionAccountSchema = z.object({
  roleId: z.string().min(1, 'Role ID is required'),
  passwordMethod: z.enum(['SELF_ACTIVATION', 'HR_TEMPORARY']).optional().default('SELF_ACTIVATION'),
  generateTemporaryPassword: z.boolean().optional()
});

export const resetStaffPasswordSchema = z.object({
  method: z.enum(['SEND_RESET_LINK', 'HR_TEMPORARY']),
  temporaryPassword: z.string().min(6).optional()
});

