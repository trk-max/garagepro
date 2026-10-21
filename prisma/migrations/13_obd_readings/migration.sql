-- V8.0 (Prompt 3/5) — relevés OBD-II (codes défauts, données moteur, kilométrage si fourni).
-- ADDS one table. Nothing existing is changed. Safe to run twice.

CREATE TABLE IF NOT EXISTS "VehicleReading" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "source" TEXT NOT NULL,
    "adapter" TEXT,
    "protocol" TEXT,
    "vin" TEXT,
    "odometerKm" INTEGER,
    "odometerStatus" TEXT NOT NULL,
    "dtcs" JSONB NOT NULL DEFAULT '[]',
    "live" JSONB NOT NULL DEFAULT '[]',
    "unsupported" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleReading_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VehicleReading_vehicleId_recordedAt_idx" ON "VehicleReading"("vehicleId", "recordedAt" DESC);
CREATE INDEX IF NOT EXISTS "VehicleReading_workOrderId_idx" ON "VehicleReading"("workOrderId");
DO $$ BEGIN
  ALTER TABLE "VehicleReading" ADD CONSTRAINT "VehicleReading_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VehicleReading" ADD CONSTRAINT "VehicleReading_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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
