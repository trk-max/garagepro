-- V8.4 (Prompt 4/5) — garanties (réparations et pièces), réclamations et remboursements ;
-- dépenses et échéances ; solde de trésorerie saisi ; réglages de garantie et d'alerte de trésorerie.
-- ADDITIVE only: 6 new tables and 4 new Setting columns (with defaults). Nothing existing is changed.
-- Safe to run twice. Values documented in prisma/schema.prisma are stored as TEXT (no new enum type).

ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "warrantyMonths" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "warrantyKm" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "cashAlertThreshold" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "cashAlertScenario" TEXT NOT NULL DEFAULT 'PRUDENT';

CREATE TABLE IF NOT EXISTS "Warranty" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "workOrderId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "supplierId" TEXT,
    "partId" TEXT,
    "workOrderLineId" TEXT,
    "label" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "startKm" INTEGER,
    "endKm" INTEGER,
    "terms" TEXT,
    "autoWorkOrderId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Warranty_autoWorkOrderId_key" ON "Warranty"("autoWorkOrderId");
CREATE INDEX IF NOT EXISTS "Warranty_vehicleId_idx" ON "Warranty"("vehicleId");
CREATE INDEX IF NOT EXISTS "Warranty_workOrderId_idx" ON "Warranty"("workOrderId");
CREATE INDEX IF NOT EXISTS "Warranty_endsAt_idx" ON "Warranty"("endsAt");
DO $$ BEGIN
  ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "warrantyId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "submittedAt" TIMESTAMP(3),
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "costParts" INTEGER NOT NULL DEFAULT 0,
    "costLabor" INTEGER NOT NULL DEFAULT 0,
    "amountClaimed" INTEGER NOT NULL DEFAULT 0,
    "amountAccepted" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyClaim_number_key" ON "WarrantyClaim"("number");
CREATE INDEX IF NOT EXISTS "WarrantyClaim_warrantyId_idx" ON "WarrantyClaim"("warrantyId");
CREATE INDEX IF NOT EXISTS "WarrantyClaim_status_idx" ON "WarrantyClaim"("status");
DO $$ BEGIN
  ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "Warranty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "WarrantyRefund" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    CONSTRAINT "WarrantyRefund_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WarrantyRefund_claimId_idx" ON "WarrantyRefund"("claimId");
CREATE INDEX IF NOT EXISTS "WarrantyRefund_receivedAt_idx" ON "WarrantyRefund"("receivedAt");
DO $$ BEGIN
  ALTER TABLE "WarrantyRefund" ADD CONSTRAINT "WarrantyRefund_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "WarrantyClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RecurringExpense" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL,
    "firstDueDate" DATE NOT NULL,
    "endDate" DATE,
    "supplierId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ExpenseOccurrence" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidAmount" INTEGER,
    "method" "PaymentMethod",
    "reference" TEXT,
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseOccurrence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseOccurrence_expenseId_dueDate_key" ON "ExpenseOccurrence"("expenseId", "dueDate");
CREATE INDEX IF NOT EXISTS "ExpenseOccurrence_dueDate_idx" ON "ExpenseOccurrence"("dueDate");
DO $$ BEGIN
  ALTER TABLE "ExpenseOccurrence" ADD CONSTRAINT "ExpenseOccurrence_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "RecurringExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CashBalance" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "asOf" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashBalance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CashBalance_asOf_createdAt_idx" ON "CashBalance"("asOf" DESC, "createdAt" DESC);

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
