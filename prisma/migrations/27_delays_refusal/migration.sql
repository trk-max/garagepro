-- V16 Lot 3 — refus de devis, attente client, retards, attente pièces.
-- ADDITIVE only: 1 new enum type, 1 new table (PromiseRevision, append-only), 3 settings, 1 line column,
-- 1 part-need column. Nothing is renamed, dropped or rewritten. Safe to run twice (IF NOT EXISTS everywhere).
-- No value is added to an EXISTING enum type (no ALTER TYPE … ADD VALUE): the new type is created here,
-- which PostgreSQL allows to use in the same transaction.
-- No backfill: every new column is nullable or has a neutral default (existing rows keep their behaviour).

DO $$ BEGIN
  CREATE TYPE "PromiseReason" AS ENUM ('PARTS', 'EXTRA_WORK', 'CUSTOMER_DECISION', 'INSURANCE', 'WORKSHOP_LOAD', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A change of the promised date of an order (partNeedId null) or of the expected date of a missing part:
-- APPEND-ONLY proof (old date, new date, reason, customer told or not).
CREATE TABLE IF NOT EXISTS "PromiseRevision" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "partNeedId" TEXT,
    "oldDate" TIMESTAMP(3),
    "newDate" TIMESTAMP(3),
    "reason" "PromiseReason" NOT NULL,
    "note" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromiseRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PromiseRevision_workOrderId_createdAt_idx" ON "PromiseRevision"("workOrderId", "createdAt");
CREATE INDEX IF NOT EXISTS "PromiseRevision_partNeedId_idx" ON "PromiseRevision"("partNeedId");
DO $$ BEGIN
  ALTER TABLE "PromiseRevision" ADD CONSTRAINT "PromiseRevision_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Append-only, like AuditLog / QuoteApproval: UPDATE and DELETE are refused, except for the hub
-- synchronisation, which writes with garagepro.sync = 'on'.
CREATE OR REPLACE FUNCTION "_promise_revision_readonly"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'PromiseRevision is append-only';
END $$;
DROP TRIGGER IF EXISTS "PromiseRevision_readonly" ON "PromiseRevision";
CREATE TRIGGER "PromiseRevision_readonly" BEFORE UPDATE OR DELETE ON "PromiseRevision"
  FOR EACH ROW EXECUTE FUNCTION "_promise_revision_readonly"();

-- Settings (Paramètres › Parcours atelier): diagnostic fee proposed at reception (millimes HT, empty = none),
-- signed safety waiver before « Prêt » when a SAFETY line is refused (on), automatic « attente pièces » (on).
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "diagnosticFee" INTEGER;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "requireSafetyWaiver" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "autoWaitingParts" BOOLEAN NOT NULL DEFAULT true;

-- Fee announced to the customer at reception (diagnostic, announced dismantling): billable even if the quote
-- is refused. false for every existing line (no UPDATE).
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "isAnnouncedFee" BOOLEAN NOT NULL DEFAULT false;

-- A missing part tied to the order line that needs it.
ALTER TABLE "WorkOrderPartNeed" ADD COLUMN IF NOT EXISTS "workOrderLineId" TEXT;
CREATE INDEX IF NOT EXISTS "WorkOrderPartNeed_workOrderLineId_idx" ON "WorkOrderPartNeed"("workOrderLineId");

-- Garage hub: log the changes of the new tables too (only where the hub's change log exists).
-- Same block as 24_accueil: puts "_sync_log_trg" on PromiseRevision.
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
