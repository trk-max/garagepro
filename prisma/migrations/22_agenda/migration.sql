-- V12 — agenda des prochaines réparations (maintenance préventive).
-- ADDITIVE only: 3 new tables, 1 nullable column on "Notification", settings columns with a default.
-- Nothing existing is changed or deleted. Safe to run twice. Statuses are stored as TEXT (no enum).
-- No catalogue row is inserted here: the garage creates its catalogue (intervals typed by the garage).

-- Paramètres de l'agenda (envoi automatique DÉSACTIVÉ par défaut).
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "agendaMinCases" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "agendaGoodCases" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "agendaLeadDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "agendaAutoSend" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "agendaAutoMinConfidence" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "tplAgendaFr" TEXT;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "tplAgendaAr" TEXT;

-- Historique des messages : prévision à l'origine d'un message de l'agenda.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "forecastId" TEXT;

-- Catalogue des éléments d'entretien.
CREATE TABLE IF NOT EXISTS "MaintenanceItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "partIds" JSONB NOT NULL DEFAULT '[]',
    "packageIds" JSONB NOT NULL DEFAULT '[]',
    "intervalKm" INTEGER,
    "intervalMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaintenanceItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceItem_code_key" ON "MaintenanceItem"("code");

-- Remplacements passés (détectés dans les ordres livrés ou déclarés), corrections à côté des données d'origine.
CREATE TABLE IF NOT EXISTS "MaintenanceEvent" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "source" TEXT NOT NULL,
    "matchedText" TEXT,
    "doneAt" TIMESTAMP(3) NOT NULL,
    "km" INTEGER,
    "amountTtc" INTEGER,
    "correctedDoneAt" TIMESTAMP(3),
    "correctedKm" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "correctedById" TEXT,
    "correctedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaintenanceEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceEvent_dedupeKey_key" ON "MaintenanceEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "MaintenanceEvent_vehicleId_itemId_idx" ON "MaintenanceEvent"("vehicleId", "itemId");
CREATE INDEX IF NOT EXISTS "MaintenanceEvent_itemId_idx" ON "MaintenanceEvent"("itemId");
CREATE INDEX IF NOT EXISTS "MaintenanceEvent_workOrderId_idx" ON "MaintenanceEvent"("workOrderId");
DO $$ BEGIN
  ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MaintenanceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Prévisions versionnées (jamais réécrites : une nouvelle version remplace la courante).
CREATE TABLE IF NOT EXISTS "MaintenanceForecast" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "previousId" TEXT,
    "method" TEXT NOT NULL,
    "cases" INTEGER NOT NULL DEFAULT 0,
    "confidence" TEXT,
    "missing" JSONB NOT NULL DEFAULT '[]',
    "lastEventId" TEXT,
    "lastDoneAt" TIMESTAMP(3),
    "lastDoneKm" INTEGER,
    "kmPerMonth" INTEGER,
    "dueKm" INTEGER,
    "dueKmLow" INTEGER,
    "dueKmHigh" INTEGER,
    "dueByKmDate" TIMESTAMP(3),
    "dueByTimeDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "dueDateLow" TIMESTAMP(3),
    "dueDateHigh" TIMESTAMP(3),
    "explain" JSONB NOT NULL DEFAULT '{}',
    "priceTtc" INTEGER,
    "priceSource" TEXT,
    "warrantyUntil" TIMESTAMP(3),
    "warrantyLabel" TEXT,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "statusReason" TEXT,
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "appointmentId" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneWorkOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaintenanceForecast_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MaintenanceForecast_vehicleId_itemId_version_key" ON "MaintenanceForecast"("vehicleId", "itemId", "version");
CREATE INDEX IF NOT EXISTS "MaintenanceForecast_isCurrent_dueDate_idx" ON "MaintenanceForecast"("isCurrent", "dueDate");
CREATE INDEX IF NOT EXISTS "MaintenanceForecast_vehicleId_isCurrent_idx" ON "MaintenanceForecast"("vehicleId", "isCurrent");
CREATE INDEX IF NOT EXISTS "MaintenanceForecast_status_idx" ON "MaintenanceForecast"("status");
DO $$ BEGIN
  ALTER TABLE "MaintenanceForecast" ADD CONSTRAINT "MaintenanceForecast_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MaintenanceForecast" ADD CONSTRAINT "MaintenanceForecast_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MaintenanceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
