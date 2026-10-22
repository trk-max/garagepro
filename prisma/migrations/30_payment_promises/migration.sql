-- Paiements partiels — date du prochain paiement promise par le client.
-- ADDITIVE only: 1 new table (PaymentPromise, append-only). Nothing is renamed, dropped or rewritten, no enum
-- type is created or changed, no existing row is touched (the "Invoice_frozen" trigger of migration 28 is not
-- concerned: the Invoice table gets no column). Safe to run twice (IF NOT EXISTS / duplicate_object everywhere).

-- A promise of the customer to pay (the rest of) an invoice on a given day: APPEND-ONLY. The latest row of an
-- invoice is the one that counts; the earlier ones stay as its history.
CREATE TABLE IF NOT EXISTS "PaymentPromise" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "promisedAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentPromise_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaymentPromise_invoiceId_createdAt_idx" ON "PaymentPromise"("invoiceId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentPromise_workOrderId_createdAt_idx" ON "PaymentPromise"("workOrderId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentPromise_promisedAt_idx" ON "PaymentPromise"("promisedAt");
DO $$ BEGIN
  ALTER TABLE "PaymentPromise" ADD CONSTRAINT "PaymentPromise_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PaymentPromise" ADD CONSTRAINT "PaymentPromise_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Append-only, like AuditLog / QuoteApproval / PromiseRevision: UPDATE and DELETE are refused, except for the hub
-- synchronisation, which writes with garagepro.sync = 'on'.
CREATE OR REPLACE FUNCTION "_payment_promise_readonly"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'PaymentPromise is append-only';
END $$;
DROP TRIGGER IF EXISTS "PaymentPromise_readonly" ON "PaymentPromise";
CREATE TRIGGER "PaymentPromise_readonly" BEFORE UPDATE OR DELETE ON "PaymentPromise"
  FOR EACH ROW EXECUTE FUNCTION "_payment_promise_readonly"();

-- Garage hub: same block as 24_accueil, puts "_sync_log_trg" on PaymentPromise (only where the hub's change log exists).
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
