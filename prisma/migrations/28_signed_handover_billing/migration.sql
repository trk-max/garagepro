-- V16 Lot 4 — réception signée, restitution, facture et paiements.
-- ADDITIVE only: 2 new enum types, 1 value added to an existing enum (never used in this file), 3 new tables
-- (Signature, VehicleHandover, CreditNote — append-only), new nullable / defaulted columns, 3 settings, and
-- triggers that freeze issued invoices and make payments append-only. Nothing is renamed, dropped or rewritten.
-- Safe to run twice (IF NOT EXISTS / duplicate_object everywhere, CREATE OR REPLACE for the functions).
-- No data backfill: every new column is nullable or has a neutral default; workflowLot4 is added with
-- DEFAULT false (existing orders get false WITHOUT an UPDATE, nothing logged for the hub), then defaults to true.

-- ── Types ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "SignatureKind" AS ENUM ('INTAKE', 'QUOTE', 'DELIVERY', 'SAFETY_WAIVER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "MediaStage" AS ENUM ('INTAKE', 'WORK', 'DELIVERY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- An invoice cancelled by a credit note (status only; the invoice itself is never changed nor deleted).
-- Used by the application only (never in this file).
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CREDITED';

-- ── Work order: intake details, deposit date, Lot 4 rules (non-retroactive) ──
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "warningLights" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "itemsLeft" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "keyCount" INTEGER;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "authorizationCeiling" INTEGER;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "diagnosticFeeAccepted" BOOLEAN;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "depositReceivedAt" TIMESTAMP(3);
-- Lot 4 rules (signed handover before delivery, deposit as a real payment, storage fee, graduated reminders,
-- warranty at the invoice): false for every order opened before this migration (no UPDATE), true afterwards.
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "workflowLot4" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrder" ALTER COLUMN "workflowLot4" SET DEFAULT true;

-- Photos / videos: when they were taken (reception, work, delivery). null for existing media (no backfill).
ALTER TABLE "WorkOrderMedia" ADD COLUMN IF NOT EXISTS "stage" "MediaStage";

-- Storage fee line (gardiennage) added at invoicing. false for every existing line (no UPDATE).
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "isStorageFee" BOOLEAN NOT NULL DEFAULT false;

-- ── Invoice / payments / reminders ───────────────────────────────────────────
-- SHA-256 of the frozen copy (null on invoices issued before Lot 4).
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "snapshotHash" TEXT;
-- Anti double click (key sent by the payment form), deposit taken at reception, reversal (append-only).
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "requestKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "isDeposit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "reason" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_requestKey_key" ON "Payment"("requestKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_reversalOfId_key" ON "Payment"("reversalOfId");
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Graduated reminder level (7, 15, 30 days after the due date); null = reminder sent by hand.
ALTER TABLE "InvoiceReminder" ADD COLUMN IF NOT EXISTS "level" INTEGER;

-- ── Settings (Paramètres › Parcours atelier) ─────────────────────────────────
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "requireSignedHandover" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "autoStorageFee" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "autoInvoiceReminders" BOOLEAN NOT NULL DEFAULT true;

-- ── Signature (append-only proof) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Signature" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "kind" "SignatureKind" NOT NULL,
    "signerName" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "documentKey" TEXT,
    "documentHash" TEXT NOT NULL,
    "refId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "recordedById" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Signature_imageKey_key" ON "Signature"("imageKey");
CREATE INDEX IF NOT EXISTS "Signature_workOrderId_kind_signedAt_idx" ON "Signature"("workOrderId", "kind", "signedAt");
DO $$ BEGIN
  ALTER TABLE "Signature" ADD CONSTRAINT "Signature_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Vehicle handover (bon de restitution, append-only) ───────────────────────
CREATE TABLE IF NOT EXISTS "VehicleHandover" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "mileageOut" INTEGER NOT NULL,
    "fuelLevelOut" INTEGER,
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "signatureId" TEXT,
    "handedOverById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleHandover_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VehicleHandover_workOrderId_createdAt_idx" ON "VehicleHandover"("workOrderId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "VehicleHandover" ADD CONSTRAINT "VehicleHandover_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Credit note (avoir, append-only): cancels an issued invoice without touching it ──
CREATE TABLE IF NOT EXISTS "CreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "creditOfInvoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "reason" TEXT NOT NULL,
    "totalHt" INTEGER NOT NULL,
    "totalTax" INTEGER NOT NULL,
    "stampDuty" INTEGER NOT NULL,
    "totalTtc" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "createdById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_number_key" ON "CreditNote"("number");
-- Full credit only: one credit note per invoice.
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_creditOfInvoiceId_key" ON "CreditNote"("creditOfInvoiceId");
CREATE INDEX IF NOT EXISTS "CreditNote_issuedAt_idx" ON "CreditNote"("issuedAt" DESC);
CREATE INDEX IF NOT EXISTS "CreditNote_customerId_idx" ON "CreditNote"("customerId");
DO $$ BEGIN
  ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_creditOfInvoiceId_fkey" FOREIGN KEY ("creditOfInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Append-only proofs: UPDATE / DELETE refused, except the hub synchronisation (garagepro.sync = 'on') ──
CREATE OR REPLACE FUNCTION "_v16_lot4_readonly"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS "Signature_readonly" ON "Signature";
CREATE TRIGGER "Signature_readonly" BEFORE UPDATE OR DELETE ON "Signature" FOR EACH ROW EXECUTE FUNCTION "_v16_lot4_readonly"();
DROP TRIGGER IF EXISTS "VehicleHandover_readonly" ON "VehicleHandover";
CREATE TRIGGER "VehicleHandover_readonly" BEFORE UPDATE OR DELETE ON "VehicleHandover" FOR EACH ROW EXECUTE FUNCTION "_v16_lot4_readonly"();
DROP TRIGGER IF EXISTS "CreditNote_readonly" ON "CreditNote";
CREATE TRIGGER "CreditNote_readonly" BEFORE UPDATE OR DELETE ON "CreditNote" FOR EACH ROW EXECUTE FUNCTION "_v16_lot4_readonly"();

-- Payments: a payment is never changed nor deleted (a cancellation is a new negative row, reversalOfId).
-- Only exception besides the sync: the author link cleared when an employee account is deleted
-- (Payment.actorId ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION "_payment_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."actorId" IS NULL
     AND (to_jsonb(NEW) - 'actorId') = (to_jsonb(OLD) - 'actorId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Payment is append-only (cancel a payment with a reversal)';
END $$;
DROP TRIGGER IF EXISTS "Payment_append_only" ON "Payment";
CREATE TRIGGER "Payment_append_only" BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION "_payment_append_only"();

-- Issued invoices are frozen: only "paidAmount" and "status" may change (payments, credit note); never deleted.
-- The hub synchronisation passes (it copies whole rows with garagepro.sync = 'on').
CREATE OR REPLACE FUNCTION "_invoice_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'An issued invoice cannot be deleted (issue a credit note)';
  END IF;
  IF (to_jsonb(NEW) - 'paidAmount' - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'paidAmount' - 'status') THEN
    RAISE EXCEPTION 'An issued invoice cannot be modified (only paidAmount and status change)';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Invoice_frozen" ON "Invoice";
CREATE TRIGGER "Invoice_frozen" BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION "_invoice_frozen"();

-- Garage hub: log the changes of the new tables too (only where the hub's change log exists).
-- Same block as 24_accueil: puts "_sync_log_trg" on Signature, VehicleHandover and CreditNote.
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
