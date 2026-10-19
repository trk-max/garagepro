-- V7.0 (Prompt 1) — équipe, pointage, congés, attestations, temps passé par
-- mécanicien, assurance, pièces manquantes, contrôle qualité, portail entreprise,
-- journal d'audit.
-- ADDS tables, columns (all optional or with a default), enum values and
-- triggers. Nothing existing is dropped, renamed or modified.
-- Every statement is guarded, so running it twice is safe.
-- Generated from prisma/schema.prisma by Prisma's schema engine, then guarded.

DO $$ BEGIN
  CREATE TYPE "ClockKind" AS ENUM ('IN', 'OUT', 'BREAK_START', 'BREAK_END');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ClockMethod" AS ENUM ('KIOSK_CODE', 'NETWORK', 'KIOSK_CODE_NETWORK', 'CORRECTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveType" AS ENUM ('PAID_LEAVE', 'SICK', 'UNPAID', 'AUTHORIZATION', 'ABSENCE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PartNeedStatus" AS ENUM ('NEEDED', 'ORDERED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CompanyRole" AS ENUM ('FLEET_ADMIN', 'MANAGER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';

ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'WAITING_INSURANCE';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hireDate" DATE,
ADD COLUMN IF NOT EXISTS "jobTitle" TEXT,
ADD COLUMN IF NOT EXISTS "nationalId" TEXT;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isCompany" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "insuranceClaimRef" TEXT,
ADD COLUMN IF NOT EXISTS "insuranceDecidedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "insuranceDecision" TEXT,
ADD COLUMN IF NOT EXISTS "insuranceRequestedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "insurerName" TEXT;

ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "city" TEXT,
ADD COLUMN IF NOT EXISTS "clockMode" TEXT NOT NULL DEFAULT 'CODE',
ADD COLUMN IF NOT EXISTS "clockNetworks" TEXT,
ADD COLUMN IF NOT EXISTS "laborBillingMode" TEXT NOT NULL DEFAULT 'ELAPSED',
ADD COLUMN IF NOT EXISTS "legalName" TEXT,
ADD COLUMN IF NOT EXISTS "legalRepName" TEXT,
ADD COLUMN IF NOT EXISTS "legalRepTitle" TEXT;

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClockEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ClockKind" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "method" "ClockMethod" NOT NULL,
    "ip" TEXT,
    "codeWindow" INTEGER,
    "reason" TEXT,
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClockEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LeaveRequest" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkCertificate" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuedById" TEXT,
    "purpose" TEXT,
    "snapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LaborEntry" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaborEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkOrderPartNeed" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "quantityX100" INTEGER NOT NULL DEFAULT 100,
    "status" "PartNeedStatus" NOT NULL DEFAULT 'NEEDED',
    "supplierId" TEXT,
    "purchaseOrderId" TEXT,
    "orderedAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderPartNeed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QualityCheck" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "roadTest" TEXT,
    "fluidsOk" BOOLEAN NOT NULL DEFAULT false,
    "warningsOk" BOOLEAN NOT NULL DEFAULT false,
    "toolsRemoved" BOOLEAN NOT NULL DEFAULT false,
    "workVerified" BOOLEAN NOT NULL DEFAULT false,
    "billingVerified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyUser" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "CompanyRole" NOT NULL DEFAULT 'VIEWER',
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyUser_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

CREATE INDEX IF NOT EXISTS "ClockEvent_userId_at_idx" ON "ClockEvent"("userId", "at");

CREATE INDEX IF NOT EXISTS "ClockEvent_at_idx" ON "ClockEvent"("at");

CREATE UNIQUE INDEX IF NOT EXISTS "ClockEvent_userId_codeWindow_key" ON "ClockEvent"("userId", "codeWindow");

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveRequest_number_key" ON "LeaveRequest"("number");

CREATE INDEX IF NOT EXISTS "LeaveRequest_userId_startAt_idx" ON "LeaveRequest"("userId", "startAt");

CREATE INDEX IF NOT EXISTS "LeaveRequest_status_startAt_idx" ON "LeaveRequest"("status", "startAt");

CREATE INDEX IF NOT EXISTS "LeaveRequest_startAt_endAt_idx" ON "LeaveRequest"("startAt", "endAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkCertificate_number_key" ON "WorkCertificate"("number");

CREATE INDEX IF NOT EXISTS "WorkCertificate_userId_issuedAt_idx" ON "WorkCertificate"("userId", "issuedAt");

CREATE INDEX IF NOT EXISTS "LaborEntry_workOrderId_startedAt_idx" ON "LaborEntry"("workOrderId", "startedAt");

CREATE INDEX IF NOT EXISTS "LaborEntry_userId_startedAt_idx" ON "LaborEntry"("userId", "startedAt");

CREATE INDEX IF NOT EXISTS "WorkOrderPartNeed_workOrderId_idx" ON "WorkOrderPartNeed"("workOrderId");

CREATE INDEX IF NOT EXISTS "WorkOrderPartNeed_status_expectedAt_idx" ON "WorkOrderPartNeed"("status", "expectedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "QualityCheck_workOrderId_key" ON "QualityCheck"("workOrderId");

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyUser_email_key" ON "CompanyUser"("email");

CREATE INDEX IF NOT EXISTS "CompanyUser_customerId_idx" ON "CompanyUser"("customerId");

DO $$ BEGIN
  ALTER TABLE "ClockEvent" ADD CONSTRAINT "ClockEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkCertificate" ADD CONSTRAINT "WorkCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderPartNeed" ADD CONSTRAINT "WorkOrderPartNeed_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderPartNeed" ADD CONSTRAINT "WorkOrderPartNeed_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderPartNeed" ADD CONSTRAINT "WorkOrderPartNeed_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderPartNeed" ADD CONSTRAINT "WorkOrderPartNeed_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Extra rules Prisma cannot express ───────────────────────────────────────

-- One running chronometer per mechanic at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "LaborEntry_one_running_per_user"
  ON "LaborEntry"("userId") WHERE "endedAt" IS NULL AND "voidedAt" IS NULL;

-- Audit lines can be added, never changed or deleted (except by the garage hub
-- copying the same line between the two databases).
CREATE OR REPLACE FUNCTION "_audit_log_readonly"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only';
END $$;
DROP TRIGGER IF EXISTS "AuditLog_readonly" ON "AuditLog";
CREATE TRIGGER "AuditLog_readonly" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "_audit_log_readonly"();

-- Garage hub: log the changes of the new tables too (only where the hub's
-- change log exists, i.e. after "npm run hub:init" or migration 3).
DO $$
DECLARE r record;
BEGIN
  IF to_regprocedure('"_sync_log_change"()') IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT c.relname AS tbl, a.attname AS pk
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary AND i.indnatts = 1
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE c.relkind = 'r'
      AND c.relname NOT IN ('_sync_log', '_sync_state', '_prisma_migrations', 'PortalAttempt')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = '_sync_log_trg')
  LOOP
    EXECUTE format('CREATE TRIGGER "_sync_log_trg" AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "_sync_log_change"(%L)', r.tbl, r.pk);
  END LOOP;
END $$;
