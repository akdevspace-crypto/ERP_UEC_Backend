CREATE TYPE "CompanionType" AS ENUM ('STAFF', 'VISITOR', 'EXTERNAL');

-- CreateEnum

CREATE TYPE "OutingRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum

CREATE TYPE "ResidentMovementStatus" AS ENUM ('OUTSIDE', 'RETURNED');

-- CreateEnum

CREATE TYPE "StaffDailyMovementStatus" AS ENUM ('INSIDE', 'COMPLETED');

-- CreateEnum

CREATE TYPE "StaffGateTripStatus" AS ENUM ('OUTSIDE', 'RETURNED');

-- CreateEnum

CREATE TYPE "VehicleMovementStatus" AS ENUM ('INSIDE', 'COMPLETED');

-- CreateTable

CREATE TABLE "ADLRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "mobility" TEXT,
    "hygiene" TEXT,
    "feeding" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL,
    "recordedById" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activityCategory" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "requiresVerification" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "assignedStaffId" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "verificationNotes" TEXT,
    "assignmentId" TEXT,

    CONSTRAINT "ADLRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable


-- CreateTable

CREATE TABLE "AttendanceLog" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "method" TEXT NOT NULL DEFAULT 'Manual',
    "metadata" JSONB,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Present',

    CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobileNo" TEXT NOT NULL,
    "sourceAgent" TEXT,
    "preferredRole" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "isPlaced" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "CaregiverRevenueSheet" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "clientName" TEXT,
    "month" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "signatures" JSONB NOT NULL DEFAULT '{}',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaregiverRevenueSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "CaregiverVitalChart" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "age" TEXT,
    "sex" TEXT,
    "month" TEXT NOT NULL,
    "entries" JSONB NOT NULL DEFAULT '[]',
    "signatures" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaregiverVitalChart_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "DailyOperationTask" (
    "id" TEXT NOT NULL,
    "taskNo" TEXT NOT NULL,
    "taskDate" DATE NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'MORNING_OPERATIONS',
    "department" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignedStaffId" TEXT,
    "assignedTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignmentId" TEXT,
    "patientId" TEXT,

    CONSTRAINT "DailyOperationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "DoctorVisit" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chiefComplaint" TEXT,
    "clinicalNotes" TEXT,
    "nextFollowUp" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountInWords" TEXT,
    "paymentMode" TEXT NOT NULL,
    "materialDetails" TEXT,
    "category" TEXT,
    "purpose" TEXT,
    "occasionName" TEXT,
    "occasionRelation" TEXT,
    "occasionDate" TIMESTAMP(3),
    "occasionMobile" TEXT,
    "recurringPlan" TEXT,
    "taxDeduction" BOOLEAN NOT NULL DEFAULT false,
    "receivedBy" TEXT,
    "verifiedBy" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isReceiptSent" BOOLEAN NOT NULL DEFAULT false,
    "receiptSentAt" TIMESTAMP(3),
    "preferredVisitDate" TIMESTAMP(3),
    "specialPrayerMessage" TEXT,
    "preferredPrayerDate" TIMESTAMP(3),
    "wishToVisitHome" BOOLEAN NOT NULL DEFAULT false,
    "honouredPersonImage" TEXT,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "DonationReference" (
    "id" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "Donor" (
    "id" TEXT NOT NULL,
    "donorNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "residentialAddress" TEXT,
    "permanentAddress" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "panNumber" TEXT,
    "dob" TIMESTAMP(3),
    "isCorporate" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fatherOrHusbandName" TEXT,
    "whatsappNumber" TEXT,

    CONSTRAINT "Donor_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "FacilityVisit" (
    "id" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "contact" TEXT,
    "patientId" TEXT,
    "purpose" TEXT,
    "checkIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOut" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "FundingAllocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "FundingCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "severity" TEXT NOT NULL,
    "witnesses" TEXT,
    "actionTaken" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "attachments" JSONB,
    "category" TEXT,
    "closedBy" TEXT,
    "notifiedRoles" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "interviewer" TEXT,
    "interviewType" TEXT NOT NULL DEFAULT 'General',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,
    "requestedBy" TEXT,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "leadsGen" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "MedicationLog" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "patientId" TEXT NOT NULL,
    "medication" TEXT NOT NULL,
    "dosageGiven" TEXT NOT NULL,
    "administeredBy" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "notes" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "assignmentId" TEXT,

    CONSTRAINT "MedicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "userId" TEXT,
    "role" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "NutritionRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "meal" TEXT NOT NULL,
    "careDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "remarks" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "unitId" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "PatientAttention" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL_OBSERVATION',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "observation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAttention_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "PatientDailyCost" (
    "id" TEXT NOT NULL,
    "costNo" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "admissionId" TEXT,
    "patientId" TEXT,
    "patientName" TEXT NOT NULL,
    "clientName" TEXT,
    "serviceType" TEXT NOT NULL,
    "costDate" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoiceId" TEXT,
    "invoiceRefNo" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentVia" TEXT,
    "familyContact" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdBy" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "PatientDailyCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "PatientPortalAccount" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "PatientPortalSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "PayrollRecord" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "presentDays" INTEGER NOT NULL,
    "approvedLeaveDays" INTEGER NOT NULL,
    "absentDays" INTEGER NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "fixedAllowance" DOUBLE PRECISION NOT NULL,
    "fixedDeduction" DOUBLE PRECISION NOT NULL,
    "grossPay" DOUBLE PRECISION NOT NULL,
    "deductions" DOUBLE PRECISION NOT NULL,
    "netPay" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "medication" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "instructions" TEXT,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "ProductBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "classificationId" TEXT,
    "totalBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "ProjectClassification" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "ProjectExpenditure" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "tenantId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectExpenditure_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "ReferralPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "ResidentGateMovement" (
    "id" TEXT NOT NULL,
    "outingRequestId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "exitAt" TIMESTAMP(3),
    "actualReturnAt" TIMESTAMP(3),
    "status" "ResidentMovementStatus",
    "exitRecordedByUserId" TEXT,
    "returnRecordedByUserId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentGateMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "ResidentOutingRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "reason" TEXT,
    "destination" TEXT,
    "expectedExitAt" TIMESTAMP(3),
    "expectedReturnAt" TIMESTAMP(3),
    "status" "OutingRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedByUserId" TEXT,
    "companionType" "CompanionType",
    "companionStaffId" TEXT,
    "companionVisitorProfileId" TEXT,
    "companionName" TEXT,
    "companionPhone" TEXT,
    "companionRelation" TEXT,
    "materials" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentOutingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "ResidentTimeline" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "performedBy" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "StaffDailyMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "entryAt" TIMESTAMP(3),
    "finalExitAt" TIMESTAMP(3),
    "entryRecordedByUserId" TEXT,
    "finalExitRecordedByUserId" TEXT,
    "status" "StaffDailyMovementStatus" NOT NULL DEFAULT 'INSIDE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffDailyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "StaffDocument" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "StaffGateTrip" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "exitAt" TIMESTAMP(3),
    "returnAt" TIMESTAMP(3),
    "reason" TEXT,
    "expectedReturnAt" TIMESTAMP(3),
    "companionType" "CompanionType",
    "companionStaffId" TEXT,
    "companionVisitorProfileId" TEXT,
    "companionName" TEXT,
    "companionPhone" TEXT,
    "companionRelation" TEXT,
    "materials" JSONB,
    "exitRecordedByUserId" TEXT,
    "returnRecordedByUserId" TEXT,
    "status" "StaffGateTripStatus",
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffGateTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "StaffIncidentLog" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedBy" TEXT,
    "actionTaken" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffIncidentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "StaffSalary" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "monthlySalary" DOUBLE PRECISION NOT NULL,
    "fixedAllowance" DOUBLE PRECISION NOT NULL,
    "fixedDeduction" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "StockIssueRequest" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "usageType" TEXT NOT NULL,
    "issuedTo" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "allocationId" TEXT,
    "patientId" TEXT,
    "rate" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,

    CONSTRAINT "StockIssueRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "performedBy" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchId" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "VehicleMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "vehicleType" TEXT,
    "driverName" TEXT NOT NULL,
    "driverMobile" TEXT,
    "companyName" TEXT,
    "purpose" TEXT NOT NULL,
    "materialDetails" TEXT,
    "remarks" TEXT,
    "entryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitAt" TIMESTAMP(3),
    "entryUserId" TEXT NOT NULL,
    "exitUserId" TEXT,
    "status" "VehicleMovementStatus" NOT NULL DEFAULT 'INSIDE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "VisitorPass" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "passType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "purpose" TEXT,
    "department" TEXT,
    "hostName" TEXT,
    "hostMobile" TEXT,
    "vehicleNo" TEXT,
    "materialDetails" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "qrCodeUrl" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedByUserId" TEXT,

    CONSTRAINT "VisitorPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "VisitorProfile" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GUEST',
    "company" TEXT,
    "photoUrl" TEXT,
    "email" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bloodGroup" TEXT,
    "pincode" TEXT,
    "residentialAddress" TEXT,
    "dob" TEXT,
    "whatsapp" TEXT,

    CONSTRAINT "VisitorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "VitalMonitoringRequirement" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "monitoringType" TEXT NOT NULL DEFAULT 'VITALS',
    "frequency" TEXT NOT NULL DEFAULT 'EVERY_4_HOURS',
    "customIntervalMinutes" INTEGER,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdBy" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VitalMonitoringRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE TABLE "WasteLog" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "handlerName" TEXT,
    "disposalMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WasteLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable

CREATE INDEX "ADLRecord_patientId_createdAt_idx" ON "ADLRecord"("patientId", "createdAt");

-- CreateIndex


-- CreateIndex


-- CreateIndex


-- CreateIndex


-- CreateIndex

CREATE INDEX "AttendanceLog_status_date_idx" ON "AttendanceLog"("status", "date");

-- CreateIndex

CREATE INDEX "AttendanceLog_tenantId_unitId_date_idx" ON "AttendanceLog"("tenantId", "unitId", "date");

-- CreateIndex

CREATE UNIQUE INDEX "AttendanceLog_staffId_date_key" ON "AttendanceLog"("staffId", "date");

-- CreateIndex

CREATE UNIQUE INDEX "Candidate_serialNo_key" ON "Candidate"("serialNo");

-- CreateIndex

CREATE INDEX "Candidate_tenantId_stage_idx" ON "Candidate"("tenantId", "stage");

-- CreateIndex

CREATE INDEX "Candidate_tenantId_unitId_idx" ON "Candidate"("tenantId", "unitId");

-- CreateIndex

CREATE INDEX "Candidate_tenantId_unitId_stage_idx" ON "Candidate"("tenantId", "unitId", "stage");

-- CreateIndex

CREATE INDEX "CaregiverRevenueSheet_month_idx" ON "CaregiverRevenueSheet"("month");

-- CreateIndex

CREATE INDEX "CaregiverRevenueSheet_tenant_unit_idx" ON "CaregiverRevenueSheet"("tenantId", "unitId");

-- CreateIndex

CREATE INDEX "CaregiverVitalChart_month_idx" ON "CaregiverVitalChart"("month");

-- CreateIndex

CREATE INDEX "CaregiverVitalChart_tenant_unit_idx" ON "CaregiverVitalChart"("tenantId", "unitId");

-- CreateIndex

CREATE UNIQUE INDEX "DailyOperationTask_taskNo_key" ON "DailyOperationTask"("taskNo");

-- CreateIndex

CREATE INDEX "DailyOperationTask_department_idx" ON "DailyOperationTask"("department");

-- CreateIndex

CREATE INDEX "DailyOperationTask_scope_date_idx" ON "DailyOperationTask"("tenantId", "unitId", "taskDate");

-- CreateIndex

CREATE INDEX "DailyOperationTask_status_idx" ON "DailyOperationTask"("status");

-- CreateIndex

CREATE UNIQUE INDEX "Donation_receiptNo_key" ON "Donation"("receiptNo");

-- CreateIndex

CREATE INDEX "Donation_tenantId_date_idx" ON "Donation"("tenantId", "date");

-- CreateIndex

CREATE INDEX "Donation_tenantId_receiptNo_idx" ON "Donation"("tenantId", "receiptNo");

-- CreateIndex

CREATE INDEX "DonationReference_tenantId_donationId_idx" ON "DonationReference"("tenantId", "donationId");

-- CreateIndex

CREATE UNIQUE INDEX "Donor_donorNo_key" ON "Donor"("donorNo");

-- CreateIndex

CREATE INDEX "Donor_tenantId_mobile_idx" ON "Donor"("tenantId", "mobile");

-- CreateIndex

CREATE INDEX "Donor_tenantId_name_idx" ON "Donor"("tenantId", "name");

-- CreateIndex

CREATE INDEX "FacilityVisit_checkIn_idx" ON "FacilityVisit"("checkIn");

-- CreateIndex

CREATE INDEX "FacilityVisit_tenantId_idx" ON "FacilityVisit"("tenantId");

-- CreateIndex

CREATE INDEX "FacilityVisit_unitId_idx" ON "FacilityVisit"("unitId");

-- CreateIndex

CREATE INDEX "Incident_patientId_createdAt_idx" ON "Incident"("patientId", "createdAt");

-- CreateIndex

CREATE INDEX "Interview_candidateId_idx" ON "Interview"("candidateId");

-- CreateIndex

CREATE INDEX "Interview_tenantId_unitId_idx" ON "Interview"("tenantId", "unitId");

-- CreateIndex

CREATE INDEX "Interview_tenantId_unitId_scheduledAt_idx" ON "Interview"("tenantId", "unitId", "scheduledAt");

-- CreateIndex

CREATE INDEX "MarketingCampaign_tenantId_idx" ON "MarketingCampaign"("tenantId");

-- CreateIndex

CREATE INDEX "MarketingCampaign_unitId_idx" ON "MarketingCampaign"("unitId");

-- CreateIndex

CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex

CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex

CREATE INDEX "Notification_unitId_idx" ON "Notification"("unitId");

-- CreateIndex

CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex

CREATE INDEX "NotificationTemplate_tenantId_idx" ON "NotificationTemplate"("tenantId");

-- CreateIndex

CREATE UNIQUE INDEX "NotificationTemplate_name_tenantId_key" ON "NotificationTemplate"("name", "tenantId");

-- CreateIndex

CREATE INDEX "NutritionRecord_tenantId_idx" ON "NutritionRecord"("tenantId");

-- CreateIndex

CREATE INDEX "NutritionRecord_unitId_idx" ON "NutritionRecord"("unitId");

-- CreateIndex

CREATE UNIQUE INDEX "NutritionRecord_patientId_meal_careDate_key" ON "NutritionRecord"("patientId", "meal", "careDate");

-- CreateIndex

CREATE INDEX "PatientAttention_patientId_status_idx" ON "PatientAttention"("patientId", "status");

-- CreateIndex

CREATE INDEX "PatientAttention_priority_status_idx" ON "PatientAttention"("priority", "status");

-- CreateIndex

CREATE INDEX "PatientAttention_tenantId_unitId_idx" ON "PatientAttention"("tenantId", "unitId");

-- CreateIndex

CREATE UNIQUE INDEX "PatientDailyCost_costNo_key" ON "PatientDailyCost"("costNo");

-- CreateIndex

CREATE INDEX "PatientDailyCost_allocationId_idx" ON "PatientDailyCost"("allocationId");

-- CreateIndex

CREATE INDEX "PatientDailyCost_allocation_idx" ON "PatientDailyCost"("allocationId");

-- CreateIndex

CREATE INDEX "PatientDailyCost_costDate_idx" ON "PatientDailyCost"("costDate");

-- CreateIndex

CREATE INDEX "PatientDailyCost_sourceType_sourceId_idx" ON "PatientDailyCost"("sourceType", "sourceId");

-- CreateIndex

CREATE INDEX "PatientDailyCost_source_idx" ON "PatientDailyCost"("sourceType", "sourceId");

-- CreateIndex

CREATE INDEX "PatientDailyCost_status_idx" ON "PatientDailyCost"("status");

-- CreateIndex

CREATE INDEX "PatientDailyCost_tenantId_unitId_idx" ON "PatientDailyCost"("tenantId", "unitId");

-- CreateIndex

CREATE INDEX "PatientDailyCost_tenant_unit_idx" ON "PatientDailyCost"("tenantId", "unitId");

-- CreateIndex

CREATE UNIQUE INDEX "PatientPortalAccount_mobile_key" ON "PatientPortalAccount"("mobile");

-- CreateIndex

CREATE INDEX "PatientPortalAccount_mobile_idx" ON "PatientPortalAccount"("mobile");

-- CreateIndex

CREATE INDEX "PatientPortalAccount_patientId_idx" ON "PatientPortalAccount"("patientId");

-- CreateIndex

CREATE UNIQUE INDEX "PatientPortalSession_token_key" ON "PatientPortalSession"("token");

-- CreateIndex

CREATE INDEX "PatientPortalSession_accountId_idx" ON "PatientPortalSession"("accountId");

-- CreateIndex

CREATE INDEX "PatientPortalSession_token_idx" ON "PatientPortalSession"("token");

-- CreateIndex

CREATE INDEX "PayrollRecord_staffId_month_idx" ON "PayrollRecord"("staffId", "month");

-- CreateIndex

CREATE INDEX "PayrollRecord_tenantId_unitId_month_idx" ON "PayrollRecord"("tenantId", "unitId", "month");

-- CreateIndex

CREATE UNIQUE INDEX "PayrollRecord_staffId_month_key" ON "PayrollRecord"("staffId", "month");

-- CreateIndex

CREATE INDEX "ProductBatch_expiryDate_idx" ON "ProductBatch"("expiryDate");

-- CreateIndex

CREATE INDEX "ProductBatch_tenantId_idx" ON "ProductBatch"("tenantId");

-- CreateIndex

CREATE INDEX "ProductBatch_unitId_idx" ON "ProductBatch"("unitId");

-- CreateIndex

CREATE UNIQUE INDEX "ProductBatch_productId_batchNumber_tenantId_unitId_key" ON "ProductBatch"("productId", "batchNumber", "tenantId", "unitId");

-- CreateIndex

CREATE UNIQUE INDEX "Referral_enquiryId_key" ON "Referral"("enquiryId");

-- CreateIndex

CREATE INDEX "Referral_tenantId_idx" ON "Referral"("tenantId");

-- CreateIndex

CREATE INDEX "Referral_unitId_idx" ON "Referral"("unitId");

-- CreateIndex

CREATE INDEX "ReferralPartner_tenantId_idx" ON "ReferralPartner"("tenantId");

-- CreateIndex

CREATE INDEX "ReferralPartner_unitId_idx" ON "ReferralPartner"("unitId");

-- CreateIndex

CREATE UNIQUE INDEX "ResidentGateMovement_outingRequestId_key" ON "ResidentGateMovement"("outingRequestId");

-- CreateIndex

CREATE INDEX "ResidentGateMovement_actualReturnAt_idx" ON "ResidentGateMovement"("actualReturnAt");

-- CreateIndex

CREATE INDEX "ResidentGateMovement_exitAt_idx" ON "ResidentGateMovement"("exitAt");

-- CreateIndex

CREATE INDEX "ResidentGateMovement_outingRequestId_idx" ON "ResidentGateMovement"("outingRequestId");

-- CreateIndex

CREATE INDEX "ResidentGateMovement_patientId_idx" ON "ResidentGateMovement"("patientId");

-- CreateIndex

CREATE INDEX "ResidentGateMovement_status_idx" ON "ResidentGateMovement"("status");

-- CreateIndex

CREATE INDEX "ResidentGateMovement_tenantId_idx" ON "ResidentGateMovement"("tenantId");

-- CreateIndex

CREATE INDEX "ResidentGateMovement_unitId_idx" ON "ResidentGateMovement"("unitId");

-- CreateIndex

CREATE INDEX "ResidentOutingRequest_expectedReturnAt_idx" ON "ResidentOutingRequest"("expectedReturnAt");

-- CreateIndex

CREATE INDEX "ResidentOutingRequest_patientId_idx" ON "ResidentOutingRequest"("patientId");

-- CreateIndex

CREATE INDEX "ResidentOutingRequest_status_idx" ON "ResidentOutingRequest"("status");

-- CreateIndex

CREATE INDEX "ResidentOutingRequest_tenantId_idx" ON "ResidentOutingRequest"("tenantId");

-- CreateIndex

CREATE INDEX "ResidentOutingRequest_unitId_idx" ON "ResidentOutingRequest"("unitId");

-- CreateIndex

CREATE INDEX "ResidentTimeline_category_idx" ON "ResidentTimeline"("category");

-- CreateIndex

CREATE INDEX "ResidentTimeline_createdAt_idx" ON "ResidentTimeline"("createdAt");

-- CreateIndex

CREATE INDEX "ResidentTimeline_patientId_idx" ON "ResidentTimeline"("patientId");

-- CreateIndex

CREATE INDEX "ResidentTimeline_tenantId_idx" ON "ResidentTimeline"("tenantId");

-- CreateIndex

CREATE INDEX "StaffDailyMovement_entryAt_idx" ON "StaffDailyMovement"("entryAt");

-- CreateIndex

CREATE INDEX "StaffDailyMovement_finalExitAt_idx" ON "StaffDailyMovement"("finalExitAt");

-- CreateIndex

CREATE INDEX "StaffDailyMovement_staffId_idx" ON "StaffDailyMovement"("staffId");

-- CreateIndex

CREATE INDEX "StaffDailyMovement_status_idx" ON "StaffDailyMovement"("status");

-- CreateIndex

CREATE INDEX "StaffDailyMovement_tenantId_idx" ON "StaffDailyMovement"("tenantId");

-- CreateIndex

CREATE INDEX "StaffDailyMovement_unitId_idx" ON "StaffDailyMovement"("unitId");

-- CreateIndex

CREATE INDEX "StaffDocument_staffId_idx" ON "StaffDocument"("staffId");

-- CreateIndex

CREATE INDEX "StaffDocument_tenantId_idx" ON "StaffDocument"("tenantId");

-- CreateIndex

CREATE INDEX "StaffDocument_unitId_idx" ON "StaffDocument"("unitId");

-- CreateIndex

CREATE INDEX "StaffGateTrip_exitAt_idx" ON "StaffGateTrip"("exitAt");

-- CreateIndex

CREATE INDEX "StaffGateTrip_movementId_idx" ON "StaffGateTrip"("movementId");

-- CreateIndex

CREATE INDEX "StaffGateTrip_returnAt_idx" ON "StaffGateTrip"("returnAt");

-- CreateIndex

CREATE INDEX "StaffGateTrip_status_idx" ON "StaffGateTrip"("status");

-- CreateIndex

CREATE INDEX "StaffGateTrip_tenantId_idx" ON "StaffGateTrip"("tenantId");

-- CreateIndex

CREATE INDEX "StaffGateTrip_unitId_idx" ON "StaffGateTrip"("unitId");

-- CreateIndex

CREATE UNIQUE INDEX "StaffSalary_staffId_key" ON "StaffSalary"("staffId");

-- CreateIndex

CREATE INDEX "StaffSalary_tenantId_unitId_idx" ON "StaffSalary"("tenantId", "unitId");

-- CreateIndex

CREATE INDEX "StockIssueRequest_allocationId_idx" ON "StockIssueRequest"("allocationId");

-- CreateIndex

CREATE INDEX "StockIssueRequest_patientId_createdAt_idx" ON "StockIssueRequest"("patientId", "createdAt");

-- CreateIndex

CREATE INDEX "StockIssueRequest_productId_idx" ON "StockIssueRequest"("productId");

-- CreateIndex

CREATE INDEX "StockIssueRequest_status_idx" ON "StockIssueRequest"("status");

-- CreateIndex

CREATE INDEX "StockIssueRequest_tenantId_idx" ON "StockIssueRequest"("tenantId");

-- CreateIndex

CREATE INDEX "StockIssueRequest_unitId_idx" ON "StockIssueRequest"("unitId");

-- CreateIndex

CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex

CREATE INDEX "StockMovement_movementType_idx" ON "StockMovement"("movementType");

-- CreateIndex

CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex

CREATE INDEX "StockMovement_referenceId_idx" ON "StockMovement"("referenceId");

-- CreateIndex

CREATE INDEX "StockMovement_tenantId_idx" ON "StockMovement"("tenantId");

-- CreateIndex

CREATE INDEX "StockMovement_unitId_idx" ON "StockMovement"("unitId");

-- CreateIndex

CREATE INDEX "VehicleMovement_entryAt_idx" ON "VehicleMovement"("entryAt");

-- CreateIndex

CREATE INDEX "VehicleMovement_exitAt_idx" ON "VehicleMovement"("exitAt");

-- CreateIndex

CREATE INDEX "VehicleMovement_status_idx" ON "VehicleMovement"("status");

-- CreateIndex

CREATE INDEX "VehicleMovement_tenantId_idx" ON "VehicleMovement"("tenantId");

-- CreateIndex

CREATE INDEX "VehicleMovement_tenantId_unitId_status_idx" ON "VehicleMovement"("tenantId", "unitId", "status");

-- CreateIndex

CREATE INDEX "VehicleMovement_unitId_idx" ON "VehicleMovement"("unitId");

-- CreateIndex

CREATE INDEX "VehicleMovement_vehicleNo_idx" ON "VehicleMovement"("vehicleNo");

-- CreateIndex

CREATE INDEX "VisitorPass_status_idx" ON "VisitorPass"("status");

-- CreateIndex

CREATE INDEX "VisitorPass_tenantId_idx" ON "VisitorPass"("tenantId");

-- CreateIndex

CREATE INDEX "VisitorPass_visitorId_idx" ON "VisitorPass"("visitorId");

-- CreateIndex

CREATE INDEX "VisitorProfile_tenantId_idx" ON "VisitorProfile"("tenantId");

-- CreateIndex

CREATE UNIQUE INDEX "VisitorProfile_tenantId_mobile_key" ON "VisitorProfile"("tenantId", "mobile");

-- CreateIndex

CREATE INDEX "VitalMonitoringRequirement_patientId_isActive_idx" ON "VitalMonitoringRequirement"("patientId", "isActive");

-- CreateIndex

CREATE INDEX "VitalMonitoringRequirement_tenantId_unitId_idx" ON "VitalMonitoringRequirement"("tenantId", "unitId");

-- CreateIndex

CREATE INDEX "WasteLog_tenantId_idx" ON "WasteLog"("tenantId");

-- CreateIndex

CREATE INDEX "WasteLog_unitId_idx" ON "WasteLog"("unitId");

-- CreateIndex

ALTER TABLE "ADLRecord" ADD CONSTRAINT "ADLRecord_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MedicalAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ADLRecord" ADD CONSTRAINT "ADLRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "DailyOperationTask" ADD CONSTRAINT "DailyOperationTask_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MedicalAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "DailyOperationTask" ADD CONSTRAINT "DailyOperationTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "DoctorVisit" ADD CONSTRAINT "DoctorVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "DonationReference" ADD CONSTRAINT "DonationReference_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "FacilityVisit" ADD CONSTRAINT "FacilityVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "FundingAllocation" ADD CONSTRAINT "FundingAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "FundingAllocation" ADD CONSTRAINT "FundingAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "FundingCategory" ADD CONSTRAINT "FundingCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Incident" ADD CONSTRAINT "Incident_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Interview" ADD CONSTRAINT "Interview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MedicalAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "NutritionRecord" ADD CONSTRAINT "NutritionRecord_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MedicalAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "NutritionRecord" ADD CONSTRAINT "NutritionRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "PatientAttention" ADD CONSTRAINT "PatientAttention_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MedicalAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "PatientAttention" ADD CONSTRAINT "PatientAttention_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Project" ADD CONSTRAINT "Project_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FundingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Project" ADD CONSTRAINT "Project_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "ProjectClassification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ProjectClassification" ADD CONSTRAINT "ProjectClassification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ProjectExpenditure" ADD CONSTRAINT "ProjectExpenditure_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ProjectExpenditure" ADD CONSTRAINT "ProjectExpenditure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Referral" ADD CONSTRAINT "Referral_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "Referral" ADD CONSTRAINT "Referral_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ReferralPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ResidentGateMovement" ADD CONSTRAINT "ResidentGateMovement_exitRecordedByUserId_fkey" FOREIGN KEY ("exitRecordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ResidentGateMovement" ADD CONSTRAINT "ResidentGateMovement_outingRequestId_fkey" FOREIGN KEY ("outingRequestId") REFERENCES "ResidentOutingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ResidentGateMovement" ADD CONSTRAINT "ResidentGateMovement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ResidentGateMovement" ADD CONSTRAINT "ResidentGateMovement_returnRecordedByUserId_fkey" FOREIGN KEY ("returnRecordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ResidentOutingRequest" ADD CONSTRAINT "ResidentOutingRequest_companionStaffId_fkey" FOREIGN KEY ("companionStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ResidentOutingRequest" ADD CONSTRAINT "ResidentOutingRequest_companionVisitorProfileId_fkey" FOREIGN KEY ("companionVisitorProfileId") REFERENCES "VisitorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ResidentOutingRequest" ADD CONSTRAINT "ResidentOutingRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ResidentOutingRequest" ADD CONSTRAINT "ResidentOutingRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "ResidentTimeline" ADD CONSTRAINT "ResidentTimeline_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffDailyMovement" ADD CONSTRAINT "StaffDailyMovement_entryRecordedByUserId_fkey" FOREIGN KEY ("entryRecordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffDailyMovement" ADD CONSTRAINT "StaffDailyMovement_finalExitRecordedByUserId_fkey" FOREIGN KEY ("finalExitRecordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffDailyMovement" ADD CONSTRAINT "StaffDailyMovement_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffDocument" ADD CONSTRAINT "StaffDocument_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffGateTrip" ADD CONSTRAINT "StaffGateTrip_companionStaffId_fkey" FOREIGN KEY ("companionStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffGateTrip" ADD CONSTRAINT "StaffGateTrip_companionVisitorProfileId_fkey" FOREIGN KEY ("companionVisitorProfileId") REFERENCES "VisitorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffGateTrip" ADD CONSTRAINT "StaffGateTrip_exitRecordedByUserId_fkey" FOREIGN KEY ("exitRecordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffGateTrip" ADD CONSTRAINT "StaffGateTrip_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StaffDailyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffGateTrip" ADD CONSTRAINT "StaffGateTrip_returnRecordedByUserId_fkey" FOREIGN KEY ("returnRecordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffIncidentLog" ADD CONSTRAINT "StaffIncidentLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StaffSalary" ADD CONSTRAINT "StaffSalary_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StockIssueRequest" ADD CONSTRAINT "StockIssueRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StockIssueRequest" ADD CONSTRAINT "StockIssueRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "VehicleMovement" ADD CONSTRAINT "VehicleMovement_entryUserId_fkey" FOREIGN KEY ("entryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "VehicleMovement" ADD CONSTRAINT "VehicleMovement_exitUserId_fkey" FOREIGN KEY ("exitUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "VisitorPass" ADD CONSTRAINT "VisitorPass_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "VisitorPass" ADD CONSTRAINT "VisitorPass_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "VisitorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "VitalMonitoringRequirement" ADD CONSTRAINT "VitalMonitoringRequirement_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MedicalAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey

ALTER TABLE "VitalMonitoringRequirement" ADD CONSTRAINT "VitalMonitoringRequirement_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
