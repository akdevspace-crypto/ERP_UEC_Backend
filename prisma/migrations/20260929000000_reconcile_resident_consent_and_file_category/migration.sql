-- Reconciles the manually initialized resident-consent schema without deleting
-- data. Every DDL statement is idempotent so the migration also supports the
-- existing database where these objects were created before migration history.

ALTER TABLE "FileStorage" ADD COLUMN IF NOT EXISTS "category" TEXT;

CREATE TABLE IF NOT EXISTS "ResidentConsent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionId" TEXT,
    "consentType" TEXT NOT NULL DEFAULT 'ADMISSION',
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SIGNED',
    "signedByName" TEXT NOT NULL,
    "signerRelation" TEXT NOT NULL DEFAULT 'SELF',
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureUrl" TEXT,
    "notes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT,
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResidentConsent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ResidentConsent" ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT;
ALTER TABLE "ResidentConsent" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "ResidentConsent" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ResidentConsent" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ResidentConsent_patientId_idx" ON "ResidentConsent"("patientId");
CREATE INDEX IF NOT EXISTS "ResidentConsent_admissionId_idx" ON "ResidentConsent"("admissionId");
CREATE INDEX IF NOT EXISTS "ResidentConsent_tenantId_idx" ON "ResidentConsent"("tenantId");
CREATE INDEX IF NOT EXISTS "ResidentConsent_unitId_idx" ON "ResidentConsent"("unitId");
CREATE UNIQUE INDEX IF NOT EXISTS "ResidentConsent_patientId_consentType_version_key" ON "ResidentConsent"("patientId", "consentType", "version");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResidentConsent_patientId_fkey') THEN
        ALTER TABLE "ResidentConsent" ADD CONSTRAINT "ResidentConsent_patientId_fkey"
            FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ResidentConsent_admissionId_fkey') THEN
        ALTER TABLE "ResidentConsent" ADD CONSTRAINT "ResidentConsent_admissionId_fkey"
            FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
