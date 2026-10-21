-- V7.4 (Prompt 2/5, étape B) — réservations de pièces, retours fournisseur, corrections liées.
-- ADDS enum values, columns (optional or with a default), one table and constraints.
-- Nothing existing is dropped, renamed or modified. Safe to run twice.

ALTER TYPE "StockMovementReason" ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';
ALTER TYPE "StockMovementReason" ADD VALUE IF NOT EXISTS 'CORRECTION';

ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "reservedX100" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "supplierId" TEXT,
ADD COLUMN IF NOT EXISTS "correctsId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_correctsId_key" ON "StockMovement"("correctsId");

DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "StockReservation" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "quantityX100" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedNote" TEXT,
    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StockReservation_partId_status_idx" ON "StockReservation"("partId", "status");
CREATE INDEX IF NOT EXISTS "StockReservation_workOrderId_status_idx" ON "StockReservation"("workOrderId", "status");

DO $$ BEGIN
  ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Safety net in the database itself: a reservation is always a positive quantity,
-- and the reserved counter can never go below zero.
DO $$ BEGIN
  ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_quantity_positive" CHECK ("quantityX100" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Part" ADD CONSTRAINT "Part_reserved_not_negative" CHECK ("reservedX100" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Garage hub: log the changes of the new table too (only where the hub's change log exists).
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
