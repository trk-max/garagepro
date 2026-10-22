-- V16 Lot 2 — devis versionné et accord tracé ligne par ligne.
-- ADDITIVE only: 7 new enum types, 2 new tables (Quote, QuoteApproval), 5 line columns, 1 reservation column.
-- Nothing is renamed, dropped or rewritten. Safe to run twice (IF NOT EXISTS everywhere, first-run-only backfill).
-- No value is added to an EXISTING enum type (no ALTER TYPE … ADD VALUE): the new types are created here,
-- which PostgreSQL allows to use in the same transaction.

DO $$ BEGIN
  CREATE TYPE "QuoteKind" AS ENUM ('INITIAL', 'SUPPLEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "QuoteStatus" AS ENUM ('SENT', 'APPROVED', 'PARTIAL', 'REFUSED', 'EXPIRED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'PARTIAL', 'REFUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ApprovalChannel" AS ENUM ('PORTAL', 'PHONE', 'IN_PERSON', 'SMS', 'EMAIL', 'WHATSAPP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "LineApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REFUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "LinePriority" AS ENUM ('SAFETY', 'RECOMMENDED', 'WATCH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PartCondition" AS ENUM ('NEW', 'USED', 'EXCHANGE', 'REUSED', 'CUSTOMER_SUPPLIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One version of a quote sent to the customer (frozen copy + SHA-256 fingerprint).
CREATE TABLE IF NOT EXISTS "Quote" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "QuoteKind" NOT NULL DEFAULT 'INITIAL',
    "status" "QuoteStatus" NOT NULL DEFAULT 'SENT',
    "validUntil" TIMESTAMP(3),
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,
    "sentChannel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_number_key" ON "Quote"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_workOrderId_version_key" ON "Quote"("workOrderId", "version");
CREATE INDEX IF NOT EXISTS "Quote_status_sentAt_idx" ON "Quote"("status", "sentAt");
DO $$ BEGIN
  ALTER TABLE "Quote" ADD CONSTRAINT "Quote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The customer's decision on a quote: APPEND-ONLY proof (who, when, how, which lines, which amount, which fingerprint).
CREATE TABLE IF NOT EXISTS "QuoteApproval" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "approvedLineIds" JSONB NOT NULL DEFAULT '[]',
    "refusedLineIds" JSONB NOT NULL DEFAULT '[]',
    "amountApprovedTtc" INTEGER NOT NULL,
    "approverName" TEXT NOT NULL,
    "approverContact" TEXT,
    "channel" "ApprovalChannel" NOT NULL,
    "recordedById" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "signatureKey" TEXT,
    "note" TEXT,
    "quoteHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuoteApproval_quoteId_createdAt_idx" ON "QuoteApproval"("quoteId", "createdAt");
CREATE INDEX IF NOT EXISTS "QuoteApproval_workOrderId_createdAt_idx" ON "QuoteApproval"("workOrderId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "QuoteApproval" ADD CONSTRAINT "QuoteApproval_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Append-only, like AuditLog (_audit_log_readonly): UPDATE and DELETE are refused, except for the hub
-- synchronisation, which writes with garagepro.sync = 'on'.
CREATE OR REPLACE FUNCTION "_quote_approval_readonly"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'QuoteApproval is append-only';
END $$;
DROP TRIGGER IF EXISTS "QuoteApproval_readonly" ON "QuoteApproval";
CREATE TRIGGER "QuoteApproval_readonly" BEFORE UPDATE OR DELETE ON "QuoteApproval"
  FOR EACH ROW EXECUTE FUNCTION "_quote_approval_readonly"();

-- Work order lines: approval per line, priority, part condition, quote, deferred stock exit.
-- approvalStatus is added with DEFAULT 'APPROVED': every EXISTING line becomes APPROVED without any UPDATE
-- (nothing logged for the hub sync, totals and behaviour unchanged); the default then becomes PENDING for the
-- lines created from now on. Backfill, FIRST RUN ONLY (inside the same IF): the lines of orders currently
-- waiting for an answer to their quote (QUOTE_SENT, no quoteApprovedAt) go back to PENDING, written with
-- garagepro.sync = 'on' so the hub change log does not record it (the same backfill runs on the garage PC and
-- online). A replay never touches the lines again (an approval recorded since then is never undone).
DO $$
DECLARE prev text := coalesce(current_setting('garagepro.sync', true), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'WorkOrderLine' AND column_name = 'approvalStatus') THEN
    ALTER TABLE "WorkOrderLine" ADD COLUMN "approvalStatus" "LineApprovalStatus" NOT NULL DEFAULT 'APPROVED';
    PERFORM set_config('garagepro.sync', 'on', true);
    UPDATE "WorkOrderLine" l SET "approvalStatus" = 'PENDING'
    FROM "WorkOrder" w
    WHERE l."workOrderId" = w."id" AND w."status" = 'QUOTE_SENT' AND w."quoteApprovedAt" IS NULL AND l."voidedAt" IS NULL;
    PERFORM set_config('garagepro.sync', prev, true);
  END IF;
END $$;
ALTER TABLE "WorkOrderLine" ALTER COLUMN "approvalStatus" SET DEFAULT 'PENDING';
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "priority" "LinePriority";
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "partCondition" "PartCondition";
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "quoteId" TEXT;
-- false = the part already left the stock when the line was added (every line before Lot 2: unchanged).
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "stockDeferred" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "WorkOrderLine_quoteId_idx" ON "WorkOrderLine"("quoteId");
DO $$ BEGIN
  ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A part put aside for a quote line (until the customer's decision).
ALTER TABLE "StockReservation" ADD COLUMN IF NOT EXISTS "workOrderLineId" TEXT;
CREATE INDEX IF NOT EXISTS "StockReservation_workOrderLineId_idx" ON "StockReservation"("workOrderLineId");

-- Garage hub: log the changes of the new tables too (only where the hub's change log exists).
-- Same block as 24_accueil: puts "_sync_log_trg" on Quote and QuoteApproval.
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
