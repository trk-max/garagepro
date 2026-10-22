-- V10.6 — kit juridique : prise en charge / ordre de réparation, facture complétée.
-- ADDS nullable columns or columns with a default. Nothing existing is changed. Safe to run twice.

-- Client : n° de CIN (ou passeport) d'un particulier.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "nationalId" TEXT;

-- Ordre de réparation : état du véhicule à l'arrivée, accord sur les pièces, estimation et acompte.
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "fuelLevel" INTEGER;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "bodyDamageNotes" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "bodyChecklist" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "partsOrigin" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "estimateTtc" INTEGER;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "depositAmount" INTEGER;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "depositMethod" TEXT;

-- Paramètres : clauses de l'ordre de réparation (null = textes par défaut), montants, revue juridique.
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "repairClauses" JSONB;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "storageFeePerDay" INTEGER NOT NULL DEFAULT 20000;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "storageGraceHours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "abandonmentDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "repairClausesReviewedAt" TIMESTAMP(3);
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "repairClausesReviewedById" TEXT;
-- Facture : conditions de paiement et pénalités de retard (imprimées seulement si saisies).
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "invoicePaymentTerms" TEXT;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "invoicePenaltyText" TEXT;

-- Garage hub: log the changes of any table not logged yet (only where the hub's change log exists).
-- No new table here; kept so a database restored without triggers is completed the same way.
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
