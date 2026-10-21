
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.TenantScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  plan: 'plan',
  timezone: 'timezone',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UnitScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  logoUrl: 'logoUrl',
  shortName: 'shortName',
  unitType: 'unitType',
  locationId: 'locationId',
  address: 'address',
  pincode: 'pincode',
  email: 'email',
  phone: 'phone',
  timezone: 'timezone',
  status: 'status',
  tenantId: 'tenantId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  tenantId: 'tenantId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PermissionScalarFieldEnum = {
  id: 'id',
  module: 'module',
  action: 'action',
  description: 'description',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RolePermissionScalarFieldEnum = {
  id: 'id',
  roleId: 'roleId',
  permissionId: 'permissionId',
  tenantId: 'tenantId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  mustChangePassword: 'mustChangePassword',
  tokenVersion: 'tokenVersion',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  firstName: 'firstName',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  lastName: 'lastName',
  mobile: 'mobile',
  roleId: 'roleId',
  tenantId: 'tenantId',
  unitId: 'unitId'
};

exports.Prisma.PasswordResetTokenScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  tokenHash: 'tokenHash',
  expiresAt: 'expiresAt',
  isUsed: 'isUsed',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StaffScalarFieldEnum = {
  id: 'id',
  empId: 'empId',
  firstName: 'firstName',
  lastName: 'lastName',
  designation: 'designation',
  department: 'department',
  phone: 'phone',
  email: 'email',
  joiningDate: 'joiningDate',
  status: 'status',
  photoUrl: 'photoUrl',
  userId: 'userId',
  metadata: 'metadata',
  skills: 'skills',
  location: 'location',
  isAvailable: 'isAvailable',
  performanceScore: 'performanceScore',
  workload: 'workload',
  currentWorkload: 'currentWorkload',
  latitude: 'latitude',
  longitude: 'longitude',
  shiftStart: 'shiftStart',
  shiftEnd: 'shiftEnd',
  capacity: 'capacity',
  stressLevel: 'stressLevel',
  lastActiveAt: 'lastActiveAt',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StaffDocumentScalarFieldEnum = {
  id: 'id',
  staffId: 'staffId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  documentType: 'documentType',
  fileName: 'fileName',
  fileUrl: 'fileUrl',
  filePath: 'filePath',
  status: 'status',
  uploadedAt: 'uploadedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StaffSalaryScalarFieldEnum = {
  id: 'id',
  staffId: 'staffId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  monthlySalary: 'monthlySalary',
  fixedAllowance: 'fixedAllowance',
  fixedDeduction: 'fixedDeduction',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttendanceLogScalarFieldEnum = {
  id: 'id',
  staffId: 'staffId',
  date: 'date',
  checkIn: 'checkIn',
  checkOut: 'checkOut',
  method: 'method',
  status: 'status',
  metadata: 'metadata',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LeaveRequestScalarFieldEnum = {
  id: 'id',
  staffId: 'staffId',
  leaveType: 'leaveType',
  startDate: 'startDate',
  endDate: 'endDate',
  reason: 'reason',
  status: 'status',
  requestedBy: 'requestedBy',
  approvedBy: 'approvedBy',
  remarks: 'remarks',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PayrollRecordScalarFieldEnum = {
  id: 'id',
  staffId: 'staffId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  month: 'month',
  workingDays: 'workingDays',
  presentDays: 'presentDays',
  approvedLeaveDays: 'approvedLeaveDays',
  absentDays: 'absentDays',
  baseSalary: 'baseSalary',
  fixedAllowance: 'fixedAllowance',
  fixedDeduction: 'fixedDeduction',
  grossPay: 'grossPay',
  deductions: 'deductions',
  netPay: 'netPay',
  status: 'status',
  processedAt: 'processedAt',
  processedBy: 'processedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StaffIncidentLogScalarFieldEnum = {
  id: 'id',
  staffId: 'staffId',
  category: 'category',
  description: 'description',
  date: 'date',
  reportedBy: 'reportedBy',
  actionTaken: 'actionTaken',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CityScalarFieldEnum = {
  id: 'id',
  name: 'name',
  state: 'state',
  country: 'country',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LocationScalarFieldEnum = {
  id: 'id',
  name: 'name',
  state: 'state',
  country: 'country',
  pincode: 'pincode',
  createdAt: 'createdAt'
};

exports.Prisma.ClientScalarFieldEnum = {
  id: 'id',
  refNo: 'refNo',
  name: 'name',
  mobile: 'mobile',
  email: 'email',
  address: 'address',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JobApplicationScalarFieldEnum = {
  id: 'id',
  applicationNo: 'applicationNo',
  companyUnit: 'companyUnit',
  applyFor: 'applyFor',
  experience: 'experience',
  location: 'location',
  applicantName: 'applicantName',
  mobileNo: 'mobileNo',
  email: 'email',
  resumeUrl: 'resumeUrl',
  followupStatus: 'followupStatus',
  interestStatus: 'interestStatus',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EnquiryScalarFieldEnum = {
  id: 'id',
  refNo: 'refNo',
  clientId: 'clientId',
  serviceId: 'serviceId',
  mode: 'mode',
  source: 'source',
  channelId: 'channelId',
  rawMessage: 'rawMessage',
  description: 'description',
  status: 'status',
  priority: 'priority',
  intent: 'intent',
  sentiment: 'sentiment',
  summary: 'summary',
  urgency: 'urgency',
  isConverted: 'isConverted',
  convertedAt: 'convertedAt',
  serviceRequirements: 'serviceRequirements',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AdmissionScalarFieldEnum = {
  id: 'id',
  enquiryId: 'enquiryId',
  patientId: 'patientId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  status: 'status',
  admissionPriority: 'admissionPriority',
  healthCondition: 'healthCondition',
  clinicalStatus: 'clinicalStatus',
  floor: 'floor',
  room: 'room',
  bed: 'bed',
  admittedAt: 'admittedAt',
  dischargedAt: 'dischargedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FollowUpScalarFieldEnum = {
  id: 'id',
  enquiryId: 'enquiryId',
  notes: 'notes',
  scheduledAt: 'scheduledAt',
  actualAt: 'actualAt',
  channel: 'channel',
  category: 'category',
  priority: 'priority',
  response: 'response',
  converted: 'converted',
  responseAt: 'responseAt',
  outcome: 'outcome',
  variant: 'variant',
  successScore: 'successScore',
  clientInterest: 'clientInterest',
  readyToPayAmount: 'readyToPayAmount',
  paymentMode: 'paymentMode',
  nextFollowupStatus: 'nextFollowupStatus',
  assignedStaffId: 'assignedStaffId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AllocationScalarFieldEnum = {
  id: 'id',
  refNo: 'refNo',
  enquiryId: 'enquiryId',
  admissionId: 'admissionId',
  type: 'type',
  staffId: 'staffId',
  startDate: 'startDate',
  endDate: 'endDate',
  status: 'status',
  metadata: 'metadata',
  allocationScore: 'allocationScore',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AccountTransactionScalarFieldEnum = {
  id: 'id',
  refNo: 'refNo',
  allocationId: 'allocationId',
  type: 'type',
  amount: 'amount',
  paymentMode: 'paymentMode',
  category: 'category',
  clientName: 'clientName',
  status: 'status',
  notes: 'notes',
  discountAmount: 'discountAmount',
  discountApprovedBy: 'discountApprovedBy',
  metadata: 'metadata',
  date: 'date',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaskScalarFieldEnum = {
  id: 'id',
  refNo: 'refNo',
  title: 'title',
  description: 'description',
  priority: 'priority',
  aiSummary: 'aiSummary',
  aiUrgency: 'aiUrgency',
  enquiryId: 'enquiryId',
  assigneeId: 'assigneeId',
  assignedStaffId: 'assignedStaffId',
  approvalAuthorityId: 'approvalAuthorityId',
  type: 'type',
  dueDate: 'dueDate',
  status: 'status',
  completedAt: 'completedAt',
  feedbackScore: 'feedbackScore',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ComplaintScalarFieldEnum = {
  id: 'id',
  refNo: 'refNo',
  title: 'title',
  type: 'type',
  description: 'description',
  status: 'status',
  priority: 'priority',
  sentiment: 'sentiment',
  urgency: 'urgency',
  serviceTag: 'serviceTag',
  channel: 'channel',
  channelId: 'channelId',
  metadata: 'metadata',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkflowLogScalarFieldEnum = {
  id: 'id',
  entityType: 'entityType',
  entityId: 'entityId',
  fromState: 'fromState',
  toState: 'toState',
  actionBy: 'actionBy',
  notes: 'notes',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ApprovalScalarFieldEnum = {
  id: 'id',
  entityType: 'entityType',
  entityId: 'entityId',
  approverId: 'approverId',
  status: 'status',
  comments: 'comments',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  module: 'module',
  action: 'action',
  payload: 'payload',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FileStorageScalarFieldEnum = {
  id: 'id',
  fileName: 'fileName',
  fileUrl: 'fileUrl',
  fileType: 'fileType',
  fileSize: 'fileSize',
  entityType: 'entityType',
  entityId: 'entityId',
  category: 'category',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RefCounterScalarFieldEnum = {
  id: 'id',
  prefix: 'prefix',
  current: 'current',
  tenantId: 'tenantId',
  unitId: 'unitId'
};

exports.Prisma.BlogScalarFieldEnum = {
  id: 'id',
  unitName: 'unitName',
  title: 'title',
  date: 'date',
  keywords: 'keywords',
  description: 'description',
  images: 'images',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ClientServiceScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  category: 'category',
  price: 'price',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DepartmentScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  head: 'head',
  totalStaff: 'totalStaff',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LabourServiceScalarFieldEnum = {
  id: 'id',
  code: 'code',
  type: 'type',
  rate: 'rate',
  agency: 'agency',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PaymentCategoryScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  type: 'type',
  description: 'description',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VendorScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  category: 'category',
  contact: 'contact',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockMovementScalarFieldEnum = {
  id: 'id',
  productId: 'productId',
  movementType: 'movementType',
  quantity: 'quantity',
  balanceAfter: 'balanceAfter',
  referenceType: 'referenceType',
  referenceId: 'referenceId',
  batchId: 'batchId',
  notes: 'notes',
  performedBy: 'performedBy',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RoomScalarFieldEnum = {
  id: 'id',
  code: 'code',
  floor: 'floor',
  type: 'type',
  capacity: 'capacity',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VitalSignScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  bp: 'bp',
  pulse: 'pulse',
  temp: 'temp',
  spO2: 'spO2',
  bloodSugar: 'bloodSugar',
  notes: 'notes',
  photoUrl: 'photoUrl',
  shift: 'shift',
  recordedAt: 'recordedAt',
  department: 'department',
  recordedById: 'recordedById',
  verified: 'verified',
  verifiedBy: 'verifiedBy',
  verificationNotes: 'verificationNotes',
  assignmentId: 'assignmentId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WelcomeCallScalarFieldEnum = {
  id: 'id',
  clientId: 'clientId',
  status: 'status',
  notes: 'notes',
  callDate: 'callDate',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FeedbackScalarFieldEnum = {
  id: 'id',
  allocationId: 'allocationId',
  rating: 'rating',
  comments: 'comments',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AutomationRuleScalarFieldEnum = {
  id: 'id',
  module: 'module',
  name: 'name',
  conditions: 'conditions',
  action: 'action',
  actionValue: 'actionValue',
  priority: 'priority',
  status: 'status',
  baseWeight: 'baseWeight',
  performanceWeight: 'performanceWeight',
  conversionRate: 'conversionRate',
  triggerCount: 'triggerCount',
  conversionCount: 'conversionCount',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AutomationWorkflowScalarFieldEnum = {
  id: 'id',
  module: 'module',
  triggerEvent: 'triggerEvent',
  conditions: 'conditions',
  actionType: 'actionType',
  actionConfig: 'actionConfig',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AutomationScoreScalarFieldEnum = {
  id: 'id',
  entityId: 'entityId',
  module: 'module',
  score: 'score',
  label: 'label',
  probability: 'probability',
  confidence: 'confidence',
  historyScore: 'historyScore',
  factors: 'factors',
  tenantId: 'tenantId',
  unitId: 'unitId',
  complaintId: 'complaintId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AutomationTaskScalarFieldEnum = {
  id: 'id',
  entityId: 'entityId',
  module: 'module',
  taskType: 'taskType',
  description: 'description',
  assignedTo: 'assignedTo',
  status: 'status',
  priority: 'priority',
  attempts: 'attempts',
  maxAttempts: 'maxAttempts',
  dependsOnTaskId: 'dependsOnTaskId',
  metadata: 'metadata',
  scheduledAt: 'scheduledAt',
  completedAt: 'completedAt',
  lastError: 'lastError',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AutomationLogScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  module: 'module',
  entityId: 'entityId',
  event: 'event',
  score: 'score',
  label: 'label',
  triggeredRules: 'triggeredRules',
  payload: 'payload',
  traceData: 'traceData',
  actionResults: 'actionResults',
  feedbackSummary: 'feedbackSummary',
  conversationId: 'conversationId',
  createdAt: 'createdAt'
};

exports.Prisma.AutomationSuggestionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  module: 'module',
  conditions: 'conditions',
  suggestedScore: 'suggestedScore',
  confidence: 'confidence',
  status: 'status',
  reasoning: 'reasoning',
  createdAt: 'createdAt'
};

exports.Prisma.CommunicationLogScalarFieldEnum = {
  id: 'id',
  entityType: 'entityType',
  entityId: 'entityId',
  conversationId: 'conversationId',
  channel: 'channel',
  channelId: 'channelId',
  direction: 'direction',
  message: 'message',
  status: 'status',
  templateName: 'templateName',
  externalMessageId: 'externalMessageId',
  metadata: 'metadata',
  rawPayload: 'rawPayload',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt'
};

exports.Prisma.ConversationScalarFieldEnum = {
  id: 'id',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  clientId: 'clientId',
  enquiryId: 'enquiryId',
  entityId: 'entityId',
  entityType: 'entityType',
  externalThreadId: 'externalThreadId',
  lastInboundChannel: 'lastInboundChannel',
  lastMessageAt: 'lastMessageAt',
  metadata: 'metadata',
  subject: 'subject',
  tenantId: 'tenantId',
  unitId: 'unitId',
  channel: 'channel'
};

exports.Prisma.MessageScalarFieldEnum = {
  id: 'id',
  conversationId: 'conversationId',
  status: 'status',
  createdAt: 'createdAt',
  body: 'body',
  channel: 'channel',
  deliveredAt: 'deliveredAt',
  deliveryStatus: 'deliveryStatus',
  direction: 'direction',
  externalMessageId: 'externalMessageId',
  externalUserId: 'externalUserId',
  metadata: 'metadata',
  readAt: 'readAt',
  recipient: 'recipient',
  sender: 'sender',
  sentAt: 'sentAt',
  templateName: 'templateName',
  tenantId: 'tenantId',
  unitId: 'unitId',
  variant: 'variant'
};

exports.Prisma.RevenueForecastScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  forecastDate: 'forecastDate',
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  scope: 'scope',
  expectedRevenue: 'expectedRevenue',
  projectedRevenue: 'projectedRevenue',
  baselineRevenue: 'baselineRevenue',
  pipelineRevenue: 'pipelineRevenue',
  growthRate: 'growthRate',
  confidence: 'confidence',
  contributingData: 'contributingData',
  reasoning: 'reasoning',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AutomationFeedbackScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  module: 'module',
  entityId: 'entityId',
  event: 'event',
  responseRate: 'responseRate',
  conversionRate: 'conversionRate',
  completionRate: 'completionRate',
  optimizationScore: 'optimizationScore',
  signals: 'signals',
  appliedChanges: 'appliedChanges',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AgentRunScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  module: 'module',
  entityId: 'entityId',
  agentType: 'agentType',
  priority: 'priority',
  status: 'status',
  dependsOnRunId: 'dependsOnRunId',
  attempt: 'attempt',
  maxAttempts: 'maxAttempts',
  input: 'input',
  output: 'output',
  error: 'error',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MessageTemplateScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  channel: 'channel',
  name: 'name',
  subject: 'subject',
  content: 'content',
  variant: 'variant',
  status: 'status',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OutboundCampaignScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  name: 'name',
  channel: 'channel',
  templateName: 'templateName',
  status: 'status',
  audienceType: 'audienceType',
  filters: 'filters',
  sentCount: 'sentCount',
  deliveredCount: 'deliveredCount',
  failedCount: 'failedCount',
  scheduledAt: 'scheduledAt',
  launchedAt: 'launchedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PatientScalarFieldEnum = {
  id: 'id',
  elderId: 'elderId',
  name: 'name',
  dob: 'dob',
  age: 'age',
  gender: 'gender',
  bloodGroup: 'bloodGroup',
  primaryContact: 'primaryContact',
  emergencyContact: 'emergencyContact',
  email: 'email',
  phone: 'phone',
  address: 'address',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PatientPortalAccountScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  mobile: 'mobile',
  password: 'password',
  name: 'name',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PatientPortalSessionScalarFieldEnum = {
  id: 'id',
  accountId: 'accountId',
  token: 'token',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt'
};

exports.Prisma.MedicationScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  name: 'name',
  dosage: 'dosage',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PrescriptionScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  doctorId: 'doctorId',
  medication: 'medication',
  dosage: 'dosage',
  frequency: 'frequency',
  startDate: 'startDate',
  endDate: 'endDate',
  instructions: 'instructions',
  isRestricted: 'isRestricted',
  isApproved: 'isApproved',
  approvedBy: 'approvedBy',
  tenantId: 'tenantId',
  unitId: 'unitId',
  productId: 'productId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MedicationLogScalarFieldEnum = {
  id: 'id',
  prescriptionId: 'prescriptionId',
  patientId: 'patientId',
  medication: 'medication',
  dosageGiven: 'dosageGiven',
  administeredBy: 'administeredBy',
  administeredAt: 'administeredAt',
  isVerified: 'isVerified',
  verifiedBy: 'verifiedBy',
  notes: 'notes',
  assignmentId: 'assignmentId',
  tenantId: 'tenantId',
  unitId: 'unitId'
};

exports.Prisma.DoctorVisitScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  doctorId: 'doctorId',
  visitDate: 'visitDate',
  chiefComplaint: 'chiefComplaint',
  clinicalNotes: 'clinicalNotes',
  nextFollowUp: 'nextFollowUp',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NutritionScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  calories: 'calories',
  dietPlan: 'dietPlan',
  mealSchedule: 'mealSchedule',
  dietaryRestrictions: 'dietaryRestrictions',
  notes: 'notes',
  status: 'status',
  assignedStaffId: 'assignedStaffId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NutritionRecordScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  assignmentId: 'assignmentId',
  meal: 'meal',
  careDate: 'careDate',
  status: 'status',
  remarks: 'remarks',
  recordedBy: 'recordedBy',
  recordedAt: 'recordedAt',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MaintenanceScalarFieldEnum = {
  id: 'id',
  type: 'type',
  status: 'status',
  description: 'description',
  attachments: 'attachments',
  vehicleId: 'vehicleId',
  resolvedBy: 'resolvedBy',
  unitId: 'unitId',
  tenantId: 'tenantId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LaundryScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  status: 'status',
  category: 'category',
  itemCount: 'itemCount',
  trackingIdentifier: 'trackingIdentifier',
  photoUrl: 'photoUrl',
  unitId: 'unitId',
  tenantId: 'tenantId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WasteLogScalarFieldEnum = {
  id: 'id',
  category: 'category',
  weight: 'weight',
  handlerName: 'handlerName',
  disposalMethod: 'disposalMethod',
  status: 'status',
  approvedBy: 'approvedBy',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  category: 'category',
  subCategory: 'subCategory',
  unitId: 'unitId',
  tenantId: 'tenantId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  unit: 'unit',
  minStockLevel: 'minStockLevel',
  isBatchTracked: 'isBatchTracked',
  defaultRevenuePrice: 'defaultRevenuePrice',
  averageCost: 'averageCost',
  chargeableInCareRevenue: 'chargeableInCareRevenue',
  status: 'status'
};

exports.Prisma.StockScalarFieldEnum = {
  id: 'id',
  productId: 'productId',
  quantity: 'quantity',
  unitId: 'unitId',
  tenantId: 'tenantId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductBatchScalarFieldEnum = {
  id: 'id',
  productId: 'productId',
  batchNumber: 'batchNumber',
  expiryDate: 'expiryDate',
  quantity: 'quantity',
  unitCost: 'unitCost',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseScalarFieldEnum = {
  id: 'id',
  productId: 'productId',
  quantity: 'quantity',
  vendor: 'vendor',
  vendorId: 'vendorId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  batchId: 'batchId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderScalarFieldEnum = {
  id: 'id',
  orderNumber: 'orderNumber',
  vendorId: 'vendorId',
  status: 'status',
  orderDate: 'orderDate',
  expectedDeliveryDate: 'expectedDeliveryDate',
  notes: 'notes',
  subtotal: 'subtotal',
  taxAmount: 'taxAmount',
  totalAmount: 'totalAmount',
  currency: 'currency',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdById: 'createdById',
  createdByName: 'createdByName',
  approvedById: 'approvedById',
  approvedByName: 'approvedByName',
  approvedAt: 'approvedAt',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderItemScalarFieldEnum = {
  id: 'id',
  purchaseOrderId: 'purchaseOrderId',
  productId: 'productId',
  orderedQuantity: 'orderedQuantity',
  receivedQuantity: 'receivedQuantity',
  unitPrice: 'unitPrice',
  taxRate: 'taxRate',
  taxAmount: 'taxAmount',
  totalAmount: 'totalAmount',
  status: 'status',
  notes: 'notes',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.GoodsReceiptNoteScalarFieldEnum = {
  id: 'id',
  grnNumber: 'grnNumber',
  purchaseOrderId: 'purchaseOrderId',
  vendorId: 'vendorId',
  idempotencyKey: 'idempotencyKey',
  receivedDate: 'receivedDate',
  deliveryChallanNo: 'deliveryChallanNo',
  supplierInvoiceNo: 'supplierInvoiceNo',
  invoiceNo: 'invoiceNo',
  invoiceDate: 'invoiceDate',
  totalAmount: 'totalAmount',
  notes: 'notes',
  receivedById: 'receivedById',
  receivedByName: 'receivedByName',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.GoodsReceiptItemScalarFieldEnum = {
  id: 'id',
  goodsReceiptNoteId: 'goodsReceiptNoteId',
  purchaseOrderItemId: 'purchaseOrderItemId',
  productId: 'productId',
  receivedQuantity: 'receivedQuantity',
  rejectedQuantity: 'rejectedQuantity',
  unitCost: 'unitCost',
  taxRate: 'taxRate',
  taxAmount: 'taxAmount',
  totalCost: 'totalCost',
  batchNumber: 'batchNumber',
  expiryDate: 'expiryDate',
  batchId: 'batchId',
  stockMovementId: 'stockMovementId',
  notes: 'notes',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierReturnScalarFieldEnum = {
  id: 'id',
  returnNumber: 'returnNumber',
  vendorId: 'vendorId',
  sourceType: 'sourceType',
  sourceReference: 'sourceReference',
  grnId: 'grnId',
  purchaseId: 'purchaseId',
  idempotencyKey: 'idempotencyKey',
  returnDate: 'returnDate',
  reason: 'reason',
  status: 'status',
  totalQuantity: 'totalQuantity',
  notes: 'notes',
  returnedById: 'returnedById',
  returnedByName: 'returnedByName',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierReturnItemScalarFieldEnum = {
  id: 'id',
  supplierReturnId: 'supplierReturnId',
  productId: 'productId',
  batchId: 'batchId',
  batchNumber: 'batchNumber',
  expiryDate: 'expiryDate',
  returnQuantity: 'returnQuantity',
  unitCost: 'unitCost',
  totalCost: 'totalCost',
  reason: 'reason',
  stockMovementId: 'stockMovementId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PhysicalCountScalarFieldEnum = {
  id: 'id',
  auditNumber: 'auditNumber',
  productId: 'productId',
  batchId: 'batchId',
  batchNumber: 'batchNumber',
  systemQuantityAtCount: 'systemQuantityAtCount',
  physicalQuantity: 'physicalQuantity',
  variance: 'variance',
  status: 'status',
  reason: 'reason',
  notes: 'notes',
  countedById: 'countedById',
  countedByName: 'countedByName',
  countedAt: 'countedAt',
  reconciledById: 'reconciledById',
  reconciledByName: 'reconciledByName',
  reconciledAt: 'reconciledAt',
  reconciliationMovementId: 'reconciliationMovementId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InvoiceScalarFieldEnum = {
  createdAt: 'createdAt',
  id: 'id',
  amount: 'amount',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  updatedAt: 'updatedAt',
  clientId: 'clientId',
  contractEndDate: 'contractEndDate',
  contractStartDate: 'contractStartDate',
  isFinalized: 'isFinalized',
  metadata: 'metadata',
  patientId: 'patientId',
  refNo: 'refNo',
  isSent: 'isSent',
  sentAt: 'sentAt'
};

exports.Prisma.ExpenseScalarFieldEnum = {
  id: 'id',
  amount: 'amount',
  category: 'category',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DonorScalarFieldEnum = {
  id: 'id',
  donorNo: 'donorNo',
  name: 'name',
  residentialAddress: 'residentialAddress',
  permanentAddress: 'permanentAddress',
  mobile: 'mobile',
  email: 'email',
  panNumber: 'panNumber',
  dob: 'dob',
  isCorporate: 'isCorporate',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdBy: 'createdBy',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  fatherOrHusbandName: 'fatherOrHusbandName',
  whatsappNumber: 'whatsappNumber'
};

exports.Prisma.DonationScalarFieldEnum = {
  id: 'id',
  receiptNo: 'receiptNo',
  donorId: 'donorId',
  date: 'date',
  amount: 'amount',
  amountInWords: 'amountInWords',
  paymentMode: 'paymentMode',
  materialDetails: 'materialDetails',
  category: 'category',
  purpose: 'purpose',
  occasionName: 'occasionName',
  occasionRelation: 'occasionRelation',
  occasionDate: 'occasionDate',
  occasionMobile: 'occasionMobile',
  recurringPlan: 'recurringPlan',
  taxDeduction: 'taxDeduction',
  receivedBy: 'receivedBy',
  verifiedBy: 'verifiedBy',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdBy: 'createdBy',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isReceiptSent: 'isReceiptSent',
  receiptSentAt: 'receiptSentAt',
  preferredVisitDate: 'preferredVisitDate',
  specialPrayerMessage: 'specialPrayerMessage',
  preferredPrayerDate: 'preferredPrayerDate',
  wishToVisitHome: 'wishToVisitHome',
  honouredPersonImage: 'honouredPersonImage',
  reconciliationStatus: 'reconciliationStatus',
  reconciledAt: 'reconciledAt',
  reconciledById: 'reconciledById',
  allocatedAmount: 'allocatedAmount'
};

exports.Prisma.DonationReferenceScalarFieldEnum = {
  id: 'id',
  donationId: 'donationId',
  name: 'name',
  mobile: 'mobile',
  tenantId: 'tenantId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VisitorProfileScalarFieldEnum = {
  id: 'id',
  mobile: 'mobile',
  name: 'name',
  category: 'category',
  company: 'company',
  photoUrl: 'photoUrl',
  email: 'email',
  bloodGroup: 'bloodGroup',
  residentialAddress: 'residentialAddress',
  pincode: 'pincode',
  whatsapp: 'whatsapp',
  dob: 'dob',
  tenantId: 'tenantId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VisitorPassScalarFieldEnum = {
  id: 'id',
  visitorId: 'visitorId',
  passType: 'passType',
  purpose: 'purpose',
  department: 'department',
  hostName: 'hostName',
  hostMobile: 'hostMobile',
  vehicleNo: 'vehicleNo',
  materialDetails: 'materialDetails',
  checkInAt: 'checkInAt',
  checkOutAt: 'checkOutAt',
  expectedAt: 'expectedAt',
  status: 'status',
  qrCodeUrl: 'qrCodeUrl',
  tenantId: 'tenantId',
  unitId: 'unitId',
  recordedBy: 'recordedBy',
  approvedByUserId: 'approvedByUserId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ResidentTimelineScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  category: 'category',
  action: 'action',
  details: 'details',
  performedBy: 'performedBy',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockIssueRequestScalarFieldEnum = {
  id: 'id',
  productId: 'productId',
  productName: 'productName',
  category: 'category',
  quantity: 'quantity',
  usageType: 'usageType',
  issuedTo: 'issuedTo',
  notes: 'notes',
  status: 'status',
  requestedBy: 'requestedBy',
  requestedAt: 'requestedAt',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  rejectedBy: 'rejectedBy',
  rejectedAt: 'rejectedAt',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  allocationId: 'allocationId',
  patientId: 'patientId',
  rate: 'rate',
  amount: 'amount',
  prescriptionId: 'prescriptionId'
};

exports.Prisma.AdminFileRegisterScalarFieldEnum = {
  id: 'id',
  group: 'group',
  fileType: 'fileType',
  relatedName: 'relatedName',
  fileNo: 'fileNo',
  fileName: 'fileName',
  maintainedBy: 'maintainedBy',
  date: 'date',
  issueDate: 'issueDate',
  expiryDate: 'expiryDate',
  renewalReminderDate: 'renewalReminderDate',
  status: 'status',
  remarks: 'remarks',
  uploadedFileId: 'uploadedFileId',
  uploadedFileName: 'uploadedFileName',
  uploadedFileUrl: 'uploadedFileUrl',
  uploadedAt: 'uploadedAt',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CallHistoryScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  conversationId: 'conversationId',
  customerName: 'customerName',
  customerPhone: 'customerPhone',
  agentName: 'agentName',
  agentEmail: 'agentEmail',
  provider: 'provider',
  direction: 'direction',
  status: 'status',
  duration: 'duration',
  recordingUrl: 'recordingUrl',
  callSid: 'callSid',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  aiSummary: 'aiSummary',
  createdAt: 'createdAt'
};

exports.Prisma.CandidateScalarFieldEnum = {
  id: 'id',
  serialNo: 'serialNo',
  name: 'name',
  mobileNo: 'mobileNo',
  sourceAgent: 'sourceAgent',
  preferredRole: 'preferredRole',
  stage: 'stage',
  isPlaced: 'isPlaced',
  details: 'details',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  termsAcceptedAt: 'termsAcceptedAt',
  termsVersion: 'termsVersion'
};

exports.Prisma.InterviewScalarFieldEnum = {
  id: 'id',
  candidateId: 'candidateId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  scheduledAt: 'scheduledAt',
  interviewer: 'interviewer',
  interviewType: 'interviewType',
  status: 'status',
  score: 'score',
  feedback: 'feedback',
  result: 'result',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CaregiverRevenueSheetScalarFieldEnum = {
  id: 'id',
  allocationId: 'allocationId',
  patientId: 'patientId',
  patientName: 'patientName',
  clientName: 'clientName',
  month: 'month',
  items: 'items',
  signatures: 'signatures',
  totalAmount: 'totalAmount',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdBy: 'createdBy',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CaregiverVitalChartScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  patientName: 'patientName',
  age: 'age',
  sex: 'sex',
  month: 'month',
  entries: 'entries',
  signatures: 'signatures',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdBy: 'createdBy',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChannelIdentityScalarFieldEnum = {
  id: 'id',
  externalUserId: 'externalUserId',
  channel: 'channel',
  clientId: 'clientId',
  conversationId: 'conversationId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DailyOperationTaskScalarFieldEnum = {
  id: 'id',
  taskNo: 'taskNo',
  taskDate: 'taskDate',
  phase: 'phase',
  department: 'department',
  title: 'title',
  assignedStaffId: 'assignedStaffId',
  assignedTo: 'assignedTo',
  status: 'status',
  completedAt: 'completedAt',
  remarks: 'remarks',
  source: 'source',
  patientId: 'patientId',
  assignmentId: 'assignmentId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdBy: 'createdBy',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MedicalAssignmentScalarFieldEnum = {
  id: 'id',
  refNo: 'refNo',
  staffId: 'staffId',
  patientId: 'patientId',
  admissionId: 'admissionId',
  enquiryId: 'enquiryId',
  taskId: 'taskId',
  allocationId: 'allocationId',
  dutyType: 'dutyType',
  role: 'role',
  location: 'location',
  startAt: 'startAt',
  endAt: 'endAt',
  status: 'status',
  priority: 'priority',
  notes: 'notes',
  metadata: 'metadata',
  assignedById: 'assignedById',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PatientDailyCostScalarFieldEnum = {
  id: 'id',
  costNo: 'costNo',
  allocationId: 'allocationId',
  admissionId: 'admissionId',
  patientId: 'patientId',
  patientName: 'patientName',
  clientName: 'clientName',
  serviceType: 'serviceType',
  costDate: 'costDate',
  category: 'category',
  description: 'description',
  quantity: 'quantity',
  rate: 'rate',
  amount: 'amount',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  status: 'status',
  invoiceId: 'invoiceId',
  invoiceRefNo: 'invoiceRefNo',
  sentAt: 'sentAt',
  sentVia: 'sentVia',
  familyContact: 'familyContact',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdBy: 'createdBy',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  metadata: 'metadata'
};

exports.Prisma.ADLRecordScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  mobility: 'mobility',
  hygiene: 'hygiene',
  feeding: 'feeding',
  notes: 'notes',
  status: 'status',
  recordedById: 'recordedById',
  activityCategory: 'activityCategory',
  isMandatory: 'isMandatory',
  isCompleted: 'isCompleted',
  requiresVerification: 'requiresVerification',
  verifiedBy: 'verifiedBy',
  assignedStaffId: 'assignedStaffId',
  assignmentId: 'assignmentId',
  scheduledDate: 'scheduledDate',
  verificationNotes: 'verificationNotes',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.IncidentScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  title: 'title',
  description: 'description',
  date: 'date',
  severity: 'severity',
  witnesses: 'witnesses',
  actionTaken: 'actionTaken',
  category: 'category',
  attachments: 'attachments',
  status: 'status',
  closedBy: 'closedBy',
  notifiedRoles: 'notifiedRoles',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReferralPartnerScalarFieldEnum = {
  id: 'id',
  name: 'name',
  type: 'type',
  contact: 'contact',
  email: 'email',
  status: 'status',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReferralScalarFieldEnum = {
  id: 'id',
  partnerId: 'partnerId',
  enquiryId: 'enquiryId',
  status: 'status',
  notes: 'notes',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MarketingCampaignScalarFieldEnum = {
  id: 'id',
  title: 'title',
  type: 'type',
  budget: 'budget',
  status: 'status',
  startDate: 'startDate',
  endDate: 'endDate',
  leadsGen: 'leadsGen',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FacilityVisitScalarFieldEnum = {
  id: 'id',
  visitorName: 'visitorName',
  contact: 'contact',
  patientId: 'patientId',
  purpose: 'purpose',
  checkIn: 'checkIn',
  checkOut: 'checkOut',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FundingCategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectClassificationScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  categoryId: 'categoryId',
  classificationId: 'classificationId',
  totalBudget: 'totalBudget',
  startDate: 'startDate',
  endDate: 'endDate',
  status: 'status',
  approvalStatus: 'approvalStatus',
  approvedById: 'approvedById',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FundingAllocationScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  unitId: 'unitId',
  amount: 'amount',
  sourceType: 'sourceType',
  sourceDonationId: 'sourceDonationId',
  sourceAccountId: 'sourceAccountId',
  sourceReference: 'sourceReference',
  source: 'source',
  notes: 'notes',
  idempotencyKey: 'idempotencyKey',
  allocatedById: 'allocatedById',
  date: 'date',
  tenantId: 'tenantId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectExpenditureScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  unitId: 'unitId',
  amount: 'amount',
  description: 'description',
  category: 'category',
  date: 'date',
  approvalStatus: 'approvalStatus',
  approvedById: 'approvedById',
  rejectionReason: 'rejectionReason',
  submittedById: 'submittedById',
  decidedAt: 'decidedAt',
  paymentStatus: 'paymentStatus',
  paymentVoucherRef: 'paymentVoucherRef',
  paymentMode: 'paymentMode',
  paidAt: 'paidAt',
  paidById: 'paidById',
  justification: 'justification',
  receiptRef: 'receiptRef',
  idempotencyKey: 'idempotencyKey',
  tenantId: 'tenantId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  title: 'title',
  body: 'body',
  type: 'type',
  userId: 'userId',
  role: 'role',
  isRead: 'isRead',
  entityType: 'entityType',
  entityId: 'entityId',
  metadata: 'metadata',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationTemplateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  title: 'title',
  body: 'body',
  type: 'type',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ServiceContractScalarFieldEnum = {
  id: 'id',
  contractNumber: 'contractNumber',
  admissionId: 'admissionId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  startDate: 'startDate',
  endDate: 'endDate',
  status: 'status',
  staffRequired: 'staffRequired',
  shift: 'shift',
  frequency: 'frequency',
  careRequirements: 'careRequirements',
  specialInstructions: 'specialInstructions',
  servicePrice: 'servicePrice',
  billingCycle: 'billingCycle',
  termsSnapshot: 'termsSnapshot',
  termsAcceptedAt: 'termsAcceptedAt',
  termsAcceptedById: 'termsAcceptedById',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ServiceClosureScalarFieldEnum = {
  id: 'id',
  admissionId: 'admissionId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  medicalCleared: 'medicalCleared',
  medicalClearedById: 'medicalClearedById',
  medicalClearedAt: 'medicalClearedAt',
  financeCleared: 'financeCleared',
  financeClearedById: 'financeClearedById',
  financeClearedAt: 'financeClearedAt',
  assetCleared: 'assetCleared',
  assetClearedById: 'assetClearedById',
  assetClearedAt: 'assetClearedAt',
  status: 'status',
  closingRemarks: 'closingRemarks',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ResidentOutingRequestScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  reason: 'reason',
  destination: 'destination',
  expectedExitAt: 'expectedExitAt',
  expectedReturnAt: 'expectedReturnAt',
  status: 'status',
  requestedByUserId: 'requestedByUserId',
  companionType: 'companionType',
  companionStaffId: 'companionStaffId',
  companionVisitorProfileId: 'companionVisitorProfileId',
  companionName: 'companionName',
  companionPhone: 'companionPhone',
  companionRelation: 'companionRelation',
  materials: 'materials',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ResidentGateMovementScalarFieldEnum = {
  id: 'id',
  outingRequestId: 'outingRequestId',
  patientId: 'patientId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  exitAt: 'exitAt',
  actualReturnAt: 'actualReturnAt',
  status: 'status',
  exitRecordedByUserId: 'exitRecordedByUserId',
  returnRecordedByUserId: 'returnRecordedByUserId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StaffDailyMovementScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  staffId: 'staffId',
  entryAt: 'entryAt',
  finalExitAt: 'finalExitAt',
  entryRecordedByUserId: 'entryRecordedByUserId',
  finalExitRecordedByUserId: 'finalExitRecordedByUserId',
  status: 'status',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StaffGateTripScalarFieldEnum = {
  id: 'id',
  movementId: 'movementId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  exitAt: 'exitAt',
  returnAt: 'returnAt',
  reason: 'reason',
  expectedReturnAt: 'expectedReturnAt',
  companionType: 'companionType',
  companionStaffId: 'companionStaffId',
  companionVisitorProfileId: 'companionVisitorProfileId',
  companionName: 'companionName',
  companionPhone: 'companionPhone',
  companionRelation: 'companionRelation',
  materials: 'materials',
  exitRecordedByUserId: 'exitRecordedByUserId',
  returnRecordedByUserId: 'returnRecordedByUserId',
  status: 'status',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VehicleMovementScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  unitId: 'unitId',
  vehicleNo: 'vehicleNo',
  vehicleType: 'vehicleType',
  driverName: 'driverName',
  driverMobile: 'driverMobile',
  companyName: 'companyName',
  purpose: 'purpose',
  materialDetails: 'materialDetails',
  remarks: 'remarks',
  entryAt: 'entryAt',
  exitAt: 'exitAt',
  entryUserId: 'entryUserId',
  exitUserId: 'exitUserId',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VitalMonitoringRequirementScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  assignmentId: 'assignmentId',
  monitoringType: 'monitoringType',
  frequency: 'frequency',
  customIntervalMinutes: 'customIntervalMinutes',
  startAt: 'startAt',
  endAt: 'endAt',
  isActive: 'isActive',
  notes: 'notes',
  createdBy: 'createdBy',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PatientAttentionScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  assignmentId: 'assignmentId',
  category: 'category',
  priority: 'priority',
  observation: 'observation',
  status: 'status',
  createdBy: 'createdBy',
  resolvedById: 'resolvedById',
  resolvedAt: 'resolvedAt',
  resolutionNotes: 'resolutionNotes',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ResidentConsentScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  admissionId: 'admissionId',
  consentType: 'consentType',
  title: 'title',
  version: 'version',
  content: 'content',
  status: 'status',
  signedByName: 'signedByName',
  signerRelation: 'signerRelation',
  signedAt: 'signedAt',
  signatureUrl: 'signatureUrl',
  notes: 'notes',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdById: 'createdById',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AmbulanceVehicleScalarFieldEnum = {
  id: 'id',
  vehicleNo: 'vehicleNo',
  type: 'type',
  status: 'status',
  baseLocation: 'baseLocation',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AmbulanceTripScalarFieldEnum = {
  id: 'id',
  refNo: 'refNo',
  clientName: 'clientName',
  mobile: 'mobile',
  pickupLocation: 'pickupLocation',
  destination: 'destination',
  priority: 'priority',
  status: 'status',
  dispatchTime: 'dispatchTime',
  kmStart: 'kmStart',
  kmEnd: 'kmEnd',
  tripNotes: 'tripNotes',
  totalAmount: 'totalAmount',
  vehicleId: 'vehicleId',
  driverId: 'driverId',
  supportStaffId: 'supportStaffId',
  patientId: 'patientId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VendorBillScalarFieldEnum = {
  id: 'id',
  billNumber: 'billNumber',
  vendorId: 'vendorId',
  purchaseOrderId: 'purchaseOrderId',
  goodsReceiptNoteId: 'goodsReceiptNoteId',
  billDate: 'billDate',
  dueDate: 'dueDate',
  status: 'status',
  subtotal: 'subtotal',
  taxAmount: 'taxAmount',
  discountAmount: 'discountAmount',
  totalAmount: 'totalAmount',
  paidAmount: 'paidAmount',
  balanceAmount: 'balanceAmount',
  notes: 'notes',
  idempotencyKey: 'idempotencyKey',
  accountTransactionId: 'accountTransactionId',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VendorBillItemScalarFieldEnum = {
  id: 'id',
  vendorBillId: 'vendorBillId',
  productId: 'productId',
  goodsReceiptItemId: 'goodsReceiptItemId',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  taxRate: 'taxRate',
  taxAmount: 'taxAmount',
  totalAmount: 'totalAmount',
  tenantId: 'tenantId',
  unitId: 'unitId',
  isDeleted: 'isDeleted',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.GLAccountScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  accountType: 'accountType',
  normalBalance: 'normalBalance',
  description: 'description',
  isActive: 'isActive',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JournalEntryScalarFieldEnum = {
  id: 'id',
  entryNumber: 'entryNumber',
  entryDate: 'entryDate',
  sourceModule: 'sourceModule',
  sourceReference: 'sourceReference',
  description: 'description',
  status: 'status',
  isReversed: 'isReversed',
  reversalOfId: 'reversalOfId',
  idempotencyKey: 'idempotencyKey',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JournalLineScalarFieldEnum = {
  id: 'id',
  journalEntryId: 'journalEntryId',
  accountId: 'accountId',
  debit: 'debit',
  credit: 'credit',
  description: 'description',
  tenantId: 'tenantId',
  unitId: 'unitId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.EnquiryStatus = exports.$Enums.EnquiryStatus = {
  NEW: 'NEW',
  FOLLOW_UP: 'FOLLOW_UP',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED: 'CLOSED'
};

exports.AllocationType = exports.$Enums.AllocationType = {
  HOME_CARE: 'HOME_CARE',
  CLINICAL: 'CLINICAL',
  IN_HOUSE: 'IN_HOUSE',
  OTHERS: 'OTHERS'
};

exports.AllocationStatus = exports.$Enums.AllocationStatus = {
  PENDING: 'PENDING',
  ALLOCATED: 'ALLOCATED',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED'
};

exports.TransactionType = exports.$Enums.TransactionType = {
  INVOICE: 'INVOICE',
  RECEIPT: 'RECEIPT',
  EXPENSE: 'EXPENSE',
  REFUND: 'REFUND'
};

exports.TransactionStatus = exports.$Enums.TransactionStatus = {
  CREATED: 'CREATED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  POSTED: 'POSTED',
  REJECTED: 'REJECTED'
};

exports.TaskStatus = exports.$Enums.TaskStatus = {
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  APPROVED: 'APPROVED'
};

exports.ComplaintStatus = exports.$Enums.ComplaintStatus = {
  OPEN: 'OPEN',
  ASSIGNED: 'ASSIGNED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED'
};

exports.ApprovalStatus = exports.$Enums.ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

exports.ConversationStatus = exports.$Enums.ConversationStatus = {
  OPEN: 'OPEN',
  WAITING: 'WAITING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED'
};

exports.MessageDirection = exports.$Enums.MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
  SYSTEM: 'SYSTEM'
};

exports.MedicalAssignmentStatus = exports.$Enums.MedicalAssignmentStatus = {
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  APPROVED: 'APPROVED'
};

exports.ContractStatus = exports.$Enums.ContractStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED'
};

exports.ClosureStatus = exports.$Enums.ClosureStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  READY: 'READY',
  EXECUTED: 'EXECUTED'
};

exports.OutingRequestStatus = exports.$Enums.OutingRequestStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED'
};

exports.CompanionType = exports.$Enums.CompanionType = {
  STAFF: 'STAFF',
  VISITOR: 'VISITOR',
  EXTERNAL: 'EXTERNAL'
};

exports.ResidentMovementStatus = exports.$Enums.ResidentMovementStatus = {
  OUTSIDE: 'OUTSIDE',
  RETURNED: 'RETURNED'
};

exports.StaffDailyMovementStatus = exports.$Enums.StaffDailyMovementStatus = {
  INSIDE: 'INSIDE',
  COMPLETED: 'COMPLETED'
};

exports.StaffGateTripStatus = exports.$Enums.StaffGateTripStatus = {
  OUTSIDE: 'OUTSIDE',
  RETURNED: 'RETURNED'
};

exports.VehicleMovementStatus = exports.$Enums.VehicleMovementStatus = {
  INSIDE: 'INSIDE',
  COMPLETED: 'COMPLETED'
};

exports.AmbulanceVehicleStatus = exports.$Enums.AmbulanceVehicleStatus = {
  AVAILABLE: 'AVAILABLE',
  ON_TRIP: 'ON_TRIP',
  MAINTENANCE: 'MAINTENANCE'
};

exports.AmbulanceTripStatus = exports.$Enums.AmbulanceTripStatus = {
  REQUESTED: 'REQUESTED',
  DISPATCH_READY: 'DISPATCH_READY',
  DISPATCHED: 'DISPATCHED',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  COMPLETED: 'COMPLETED',
  BILLED: 'BILLED',
  CANCELLED: 'CANCELLED'
};

exports.Prisma.ModelName = {
  Tenant: 'Tenant',
  Unit: 'Unit',
  Role: 'Role',
  Permission: 'Permission',
  RolePermission: 'RolePermission',
  User: 'User',
  PasswordResetToken: 'PasswordResetToken',
  Staff: 'Staff',
  StaffDocument: 'StaffDocument',
  StaffSalary: 'StaffSalary',
  AttendanceLog: 'AttendanceLog',
  LeaveRequest: 'LeaveRequest',
  PayrollRecord: 'PayrollRecord',
  StaffIncidentLog: 'StaffIncidentLog',
  City: 'City',
  Location: 'Location',
  Client: 'Client',
  JobApplication: 'JobApplication',
  Enquiry: 'Enquiry',
  Admission: 'Admission',
  FollowUp: 'FollowUp',
  Allocation: 'Allocation',
  AccountTransaction: 'AccountTransaction',
  Task: 'Task',
  Complaint: 'Complaint',
  WorkflowLog: 'WorkflowLog',
  Approval: 'Approval',
  AuditLog: 'AuditLog',
  FileStorage: 'FileStorage',
  RefCounter: 'RefCounter',
  Blog: 'Blog',
  ClientService: 'ClientService',
  Department: 'Department',
  LabourService: 'LabourService',
  PaymentCategory: 'PaymentCategory',
  Vendor: 'Vendor',
  StockMovement: 'StockMovement',
  Room: 'Room',
  VitalSign: 'VitalSign',
  WelcomeCall: 'WelcomeCall',
  Feedback: 'Feedback',
  AutomationRule: 'AutomationRule',
  AutomationWorkflow: 'AutomationWorkflow',
  AutomationScore: 'AutomationScore',
  AutomationTask: 'AutomationTask',
  AutomationLog: 'AutomationLog',
  AutomationSuggestion: 'AutomationSuggestion',
  CommunicationLog: 'CommunicationLog',
  Conversation: 'Conversation',
  Message: 'Message',
  RevenueForecast: 'RevenueForecast',
  AutomationFeedback: 'AutomationFeedback',
  AgentRun: 'AgentRun',
  MessageTemplate: 'MessageTemplate',
  OutboundCampaign: 'OutboundCampaign',
  Patient: 'Patient',
  PatientPortalAccount: 'PatientPortalAccount',
  PatientPortalSession: 'PatientPortalSession',
  Medication: 'Medication',
  Prescription: 'Prescription',
  MedicationLog: 'MedicationLog',
  DoctorVisit: 'DoctorVisit',
  Nutrition: 'Nutrition',
  NutritionRecord: 'NutritionRecord',
  Maintenance: 'Maintenance',
  Laundry: 'Laundry',
  WasteLog: 'WasteLog',
  Product: 'Product',
  Stock: 'Stock',
  ProductBatch: 'ProductBatch',
  Purchase: 'Purchase',
  PurchaseOrder: 'PurchaseOrder',
  PurchaseOrderItem: 'PurchaseOrderItem',
  GoodsReceiptNote: 'GoodsReceiptNote',
  GoodsReceiptItem: 'GoodsReceiptItem',
  SupplierReturn: 'SupplierReturn',
  SupplierReturnItem: 'SupplierReturnItem',
  PhysicalCount: 'PhysicalCount',
  Invoice: 'Invoice',
  Expense: 'Expense',
  Donor: 'Donor',
  Donation: 'Donation',
  DonationReference: 'DonationReference',
  VisitorProfile: 'VisitorProfile',
  VisitorPass: 'VisitorPass',
  ResidentTimeline: 'ResidentTimeline',
  StockIssueRequest: 'StockIssueRequest',
  AdminFileRegister: 'AdminFileRegister',
  CallHistory: 'CallHistory',
  Candidate: 'Candidate',
  Interview: 'Interview',
  CaregiverRevenueSheet: 'CaregiverRevenueSheet',
  CaregiverVitalChart: 'CaregiverVitalChart',
  ChannelIdentity: 'ChannelIdentity',
  DailyOperationTask: 'DailyOperationTask',
  MedicalAssignment: 'MedicalAssignment',
  PatientDailyCost: 'PatientDailyCost',
  ADLRecord: 'ADLRecord',
  Incident: 'Incident',
  ReferralPartner: 'ReferralPartner',
  Referral: 'Referral',
  MarketingCampaign: 'MarketingCampaign',
  FacilityVisit: 'FacilityVisit',
  FundingCategory: 'FundingCategory',
  ProjectClassification: 'ProjectClassification',
  Project: 'Project',
  FundingAllocation: 'FundingAllocation',
  ProjectExpenditure: 'ProjectExpenditure',
  Notification: 'Notification',
  NotificationTemplate: 'NotificationTemplate',
  ServiceContract: 'ServiceContract',
  ServiceClosure: 'ServiceClosure',
  ResidentOutingRequest: 'ResidentOutingRequest',
  ResidentGateMovement: 'ResidentGateMovement',
  StaffDailyMovement: 'StaffDailyMovement',
  StaffGateTrip: 'StaffGateTrip',
  VehicleMovement: 'VehicleMovement',
  VitalMonitoringRequirement: 'VitalMonitoringRequirement',
  PatientAttention: 'PatientAttention',
  ResidentConsent: 'ResidentConsent',
  AmbulanceVehicle: 'AmbulanceVehicle',
  AmbulanceTrip: 'AmbulanceTrip',
  VendorBill: 'VendorBill',
  VendorBillItem: 'VendorBillItem',
  GLAccount: 'GLAccount',
  JournalEntry: 'JournalEntry',
  JournalLine: 'JournalLine'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
