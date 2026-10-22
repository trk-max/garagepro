-- V16 Lot 1 — parcours atelier traçable : statuts, motifs, trous d'audit.
-- ADDITIVE only: 3 enum values, 2 settings, 2 work order columns, 3 line columns. Nothing is renamed,
-- dropped or rewritten. Safe to run twice (IF NOT EXISTS everywhere, guarded backfill).
-- The 3 new statuses are NOT used anywhere in this file (PostgreSQL forbids using an enum value in the
-- transaction that adds it).

-- Statuses: devis refusé, attente client, clôturé (livré + facture soldée).
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'QUOTE_REFUSED';
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'WAITING_CUSTOMER';
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

-- Settings (Paramètres › Parcours atelier): work without quote off, paid before delivery on.
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "allowWorkWithoutQuote" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "requirePaidBeforeDelivery" BOOLEAN NOT NULL DEFAULT true;

-- First promised date (never changed afterwards).
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "promisedAtInitial" TIMESTAMP(3);

-- Non-retroactivity: the column is added with DEFAULT false, so every EXISTING order gets false without any
-- UPDATE (nothing logged for the hub sync, updatedAt untouched); then the default becomes true for the
-- orders created from now on. On a replay the ADD is skipped and the default is set to true again.
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "workflowV16" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrder" ALTER COLUMN "workflowV16" SET DEFAULT true;

-- Voided lines (a line that existed at the customer's last approval is voided with a reason, never deleted).
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "voidedById" TEXT;

-- Backfill promisedAtInitial = promisedAt, written with garagepro.sync = 'on' so the hub change log does not
-- record it (the same backfill runs on the garage PC and online: logging it could overwrite a newer change
-- made on the other side). Only rows still empty: a replay changes nothing. The previous value of the
-- setting is restored at the end of the block.
DO $$
DECLARE prev text := coalesce(current_setting('garagepro.sync', true), '');
BEGIN
  PERFORM set_config('garagepro.sync', 'on', true);
  UPDATE "WorkOrder" SET "promisedAtInitial" = "promisedAt" WHERE "promisedAtInitial" IS NULL AND "promisedAt" IS NOT NULL;
  PERFORM set_config('garagepro.sync', prev, true);
END $$;

-- Garage hub: log the changes of the new tables too (only where the hub's change log exists).
-- No new table in this migration: the block is kept identical to 24_accueil and changes nothing here.
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
