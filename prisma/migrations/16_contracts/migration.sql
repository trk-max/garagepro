-- V9.0 (Prompt 5/5) — rôles RH et comptable ; contrats (modèles versionnés, contrats, véhicules, historique).
-- ADDITIVE only: 2 new values of the "Role" type, 4 new tables, 1 new Setting column (with default).
-- Nothing existing is changed or removed. Safe to run twice. Statuses are TEXT (no new enum type).

-- New team roles (PostgreSQL 12+: allowed in a transaction; the new values are not used in this file).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';

-- Alert N days before the end date of a signed / active contract.
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "contractAlertDays" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS "ContractTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subtype" TEXT,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'TN',
    "legalRefs" JSONB NOT NULL DEFAULT '[]',
    "unverified" JSONB NOT NULL DEFAULT '[]',
    "verifiedAt" DATE NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'NEEDS_LEGAL_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "clauses" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContractTemplate_category_idx" ON "ContractTemplate"("category");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractTemplate_code_version_key" ON "ContractTemplate"("code", "version");

CREATE TABLE IF NOT EXISTS "Contract" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "subtype" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT,
    "workOrderId" TEXT,
    "userId" TEXT,
    "supplierId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "durationMonths" INTEGER,
    "indefinite" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL DEFAULT '{}',
    "flags" JSONB NOT NULL DEFAULT '[]',
    "previousContractId" TEXT,
    "renewalBasis" TEXT,
    "signedScanKey" TEXT,
    "signedScanType" TEXT,
    "signedScanSize" INTEGER,
    "signedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Contract_number_key" ON "Contract"("number");
CREATE INDEX IF NOT EXISTS "Contract_category_status_idx" ON "Contract"("category", "status");
CREATE INDEX IF NOT EXISTS "Contract_endDate_idx" ON "Contract"("endDate");
CREATE INDEX IF NOT EXISTS "Contract_customerId_idx" ON "Contract"("customerId");
CREATE INDEX IF NOT EXISTS "Contract_workOrderId_idx" ON "Contract"("workOrderId");
CREATE INDEX IF NOT EXISTS "Contract_userId_idx" ON "Contract"("userId");
CREATE INDEX IF NOT EXISTS "Contract_supplierId_idx" ON "Contract"("supplierId");
DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Contract" ADD CONSTRAINT "Contract_previousContractId_fkey" FOREIGN KEY ("previousContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContractVehicle" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    CONSTRAINT "ContractVehicle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContractVehicle_vehicleId_idx" ON "ContractVehicle"("vehicleId");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractVehicle_contractId_vehicleId_key" ON "ContractVehicle"("contractId", "vehicleId");
DO $$ BEGIN
  ALTER TABLE "ContractVehicle" ADD CONSTRAINT "ContractVehicle_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ContractVehicle" ADD CONSTRAINT "ContractVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContractEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContractEvent_contractId_createdAt_idx" ON "ContractEvent"("contractId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ContractEvent" ADD CONSTRAINT "ContractEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contract history lines can be added, never changed or deleted (except by the garage hub
-- copying the same line between the two databases), like the audit journal.
CREATE OR REPLACE FUNCTION "_contract_event_readonly"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'ContractEvent is append-only';
END $$;
DROP TRIGGER IF EXISTS "ContractEvent_readonly" ON "ContractEvent";
CREATE TRIGGER "ContractEvent_readonly" BEFORE UPDATE OR DELETE ON "ContractEvent"
  FOR EACH ROW EXECUTE FUNCTION "_contract_event_readonly"();

-- Garage hub: log the changes of the new tables too (only where the hub's change log exists).
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
