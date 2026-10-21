-- V7.6 (Prompt 2/5, étape D) — rappels clients, historique des envois, suivi des alertes.
-- ADDS columns (optional or with a default) and three tables. Nothing existing is changed. Safe to run twice.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "reminderOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "reminderLeadDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN IF NOT EXISTS "alertStuckDays" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "alertDeliveryRiskHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN IF NOT EXISTS "tplMaintenance" TEXT,
ADD COLUMN IF NOT EXISTS "tplAppointment" TEXT,
ADD COLUMN IF NOT EXISTS "tplDelivery" TEXT;

CREATE TABLE IF NOT EXISTS "VehicleMaintenance" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "intervalDays" INTEGER,
    "intervalKm" INTEGER,
    "lastDoneAt" TIMESTAMP(3),
    "lastDoneKm" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VehicleMaintenance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VehicleMaintenance_vehicleId_idx" ON "VehicleMaintenance"("vehicleId");
DO $$ BEGIN
  ALTER TABLE "VehicleMaintenance" ADD CONSTRAINT "VehicleMaintenance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "customerId" TEXT,
    "vehicleId" TEXT,
    "workOrderId" TEXT,
    "appointmentId" TEXT,
    "maintenanceId" TEXT,
    "to" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedupeKey_channel_key" ON "Notification"("dedupeKey", "channel");
CREATE INDEX IF NOT EXISTS "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE TABLE IF NOT EXISTS "AlertState" (
    "key" TEXT NOT NULL,
    "assignedToId" TEXT,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "snoozedUntil" TIMESTAMP(3),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlertState_pkey" PRIMARY KEY ("key")
);

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
