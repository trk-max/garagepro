-- V15 — file d'attente de l'accueil (borne d'entrée, écran de salle, poste d'accueil).
-- ADDITIVE only: 5 new tables, nothing existing is changed or deleted. Safe to run twice.
-- Does not depend on any table of another branch. Statuses are stored as TEXT (no enum).
-- Starting catalogue (5 visit reasons, 1 counter, the settings row) inserted with fixed ids and
-- ON CONFLICT DO NOTHING: a replay never overwrites what the garage changed.

-- Réglages de la file (une ligne).
CREATE TABLE IF NOT EXISTS "QueueSetting" (
    "id" TEXT NOT NULL DEFAULT 'garage',
    "waitWindow" INTEGER NOT NULL DEFAULT 20,
    "waitMinTickets" INTEGER NOT NULL DEFAULT 3,
    "apptWindowMin" INTEGER NOT NULL DEFAULT 15,
    "fastFirst" BOOLEAN NOT NULL DEFAULT false,
    "maxCalls" INTEGER NOT NULL DEFAULT 3,
    "callTimeoutSec" INTEGER NOT NULL DEFAULT 60,
    "aheadThreshold" INTEGER NOT NULL DEFAULT 2,
    "screenLangMode" TEXT NOT NULL DEFAULT 'ALTERNATE',
    "screenTheme" TEXT NOT NULL DEFAULT 'DARK',
    "screenMaskedPlate" BOOLEAN NOT NULL DEFAULT false,
    "waitAlertMin" INTEGER NOT NULL DEFAULT 20,
    "printerHost" TEXT,
    "printerPort" INTEGER NOT NULL DEFAULT 9100,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QueueSetting_pkey" PRIMARY KEY ("id")
);

-- Motifs de visite (catalogue fr/ar/en, préfixe du numéro).
CREATE TABLE IF NOT EXISTS "QueueReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "fast" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QueueReason_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "QueueReason_code_key" ON "QueueReason"("code");

-- Guichets.
CREATE TABLE IF NOT EXISTS "QueueCounter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "userSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QueueCounter_pkey" PRIMARY KEY ("id")
);

-- Tickets (jamais supprimés). Numéro unique par jour du garage et par préfixe.
CREATE TABLE IF NOT EXISTS "QueueTicket" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "reasonId" TEXT NOT NULL,
    "reasonKind" TEXT NOT NULL,
    "plate" TEXT,
    "vehicleId" TEXT,
    "customerId" TEXT,
    "appointmentId" TEXT,
    "apptAt" TIMESTAMP(3),
    "workOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "counterId" TEXT,
    "userId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'KIOSK',
    "deviceId" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'fr',
    "phone" TEXT,
    "notifyConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "aheadNotified" BOOLEAN NOT NULL DEFAULT false,
    "trackToken" TEXT NOT NULL,
    "cancelReason" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "servingAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "absentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QueueTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "QueueTicket_trackToken_key" ON "QueueTicket"("trackToken");
CREATE UNIQUE INDEX IF NOT EXISTS "QueueTicket_day_prefix_number_key" ON "QueueTicket"("day", "prefix", "number");
CREATE INDEX IF NOT EXISTS "QueueTicket_day_status_idx" ON "QueueTicket"("day", "status");
CREATE INDEX IF NOT EXISTS "QueueTicket_status_takenAt_idx" ON "QueueTicket"("status", "takenAt");
CREATE INDEX IF NOT EXISTS "QueueTicket_reasonId_calledAt_idx" ON "QueueTicket"("reasonId", "calledAt");

-- Appareils sans compte (borne, écran) : seule l'empreinte du jeton est gardée.
CREATE TABLE IF NOT EXISTS "QueueDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QueueDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "QueueDevice_tokenHash_key" ON "QueueDevice"("tokenHash");

-- Départ : réglages par défaut, 5 motifs, 1 guichet (modifiables dans Accueil › Réglages).
INSERT INTO "QueueSetting" ("id", "updatedAt") VALUES ('garage', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "QueueReason" ("id", "code", "prefix", "nameFr", "nameAr", "nameEn", "kind", "fast", "position", "updatedAt") VALUES
  ('qr_dropoff', 'DROP_OFF', 'A', 'Dépôt du véhicule', 'إيداع السيارة', 'Vehicle drop-off', 'DROP_OFF', false, 1, CURRENT_TIMESTAMP),
  ('qr_pickup', 'PICKUP', 'B', 'Récupération du véhicule', 'استلام السيارة', 'Vehicle pick-up', 'PICKUP', true, 2, CURRENT_TIMESTAMP),
  ('qr_quote', 'QUOTE', 'C', 'Devis / question', 'تقدير / استفسار', 'Quote / question', 'QUOTE', false, 3, CURRENT_TIMESTAMP),
  ('qr_payment', 'PAYMENT', 'D', 'Paiement', 'الدفع', 'Payment', 'PAYMENT', true, 4, CURRENT_TIMESTAMP),
  ('qr_other', 'OTHER', 'E', 'Autre', 'أخرى', 'Other', 'OTHER', false, 5, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
INSERT INTO "QueueCounter" ("id", "name", "nameAr", "position", "updatedAt") VALUES ('qc_1', 'Guichet 1', 'الشباك 1', 1, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;

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
