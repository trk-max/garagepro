-- V7.3 (Prompt 2/5, étape A) — bénéfice réel par réparation.
-- ADDS columns (optional or with a default) and one table. Nothing existing is
-- dropped, renamed or modified. Every statement is guarded: safe to run twice.

ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "unitCost" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hourlyCost" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "payer" TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "laborCostPerHour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "overheadMode" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "overheadValue" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "WorkOrderExpense" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "supplierId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    CONSTRAINT "WorkOrderExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkOrderExpense_workOrderId_idx" ON "WorkOrderExpense"("workOrderId");

DO $$ BEGIN
  ALTER TABLE "WorkOrderExpense" ADD CONSTRAINT "WorkOrderExpense_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderExpense" ADD CONSTRAINT "WorkOrderExpense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing parts lines: the cost at the time of use is unknown. It is NOT filled in
-- here (that would present today's price as the real past cost); the profit
-- calculation uses the current purchase price and marks those repairs "estimated".

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
