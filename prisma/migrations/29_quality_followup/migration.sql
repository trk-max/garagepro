-- V16 Lot 5 — qualité, suivi et pilotage.
-- ADDITIVE only: 3 new enum types (no value added to an existing type), 3 new tables (InspectionTemplate,
-- Inspection, InspectionResult), new nullable / defaulted columns and 3 settings. Nothing is renamed, dropped or
-- rewritten. Safe to run twice (IF NOT EXISTS / duplicate_object / ON CONFLICT everywhere).
-- No backfill of existing rows: every new column is nullable or has a neutral default; workflowLot5 is added with
-- DEFAULT false (existing orders get false WITHOUT an UPDATE, nothing logged for the hub), then defaults to true.
-- One row is inserted: the default inspection template, with a FIXED id and garagepro.sync = 'on' (the same row
-- is created by this migration on the garage PC and online; nothing is logged, so it never conflicts).

-- ── Types ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ComebackCategory" AS ENUM ('SAME_FAULT', 'WORKMANSHIP', 'PART_FAILURE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "LaborKind" AS ENUM ('DIAGNOSIS', 'WORK', 'REWORK', 'WARRANTY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "InspectionColor" AS ENUM ('GREEN', 'ORANGE', 'RED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Work order: comeback (retour atelier), Lot 5 rules (non-retroactive) ────
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "comebackOfWorkOrderId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "comebackCategory" "ComebackCategory";
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "comebackLinkedAt" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "comebackLinkedById" TEXT;
CREATE INDEX IF NOT EXISTS "WorkOrder_comebackOfWorkOrderId_idx" ON "WorkOrder"("comebackOfWorkOrderId");
DO $$ BEGIN
  ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_comebackOfWorkOrderId_fkey" FOREIGN KEY ("comebackOfWorkOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Lot 5 rules (road-test km, configured quality points, rework cause, satisfaction survey): false for every order
-- opened before this migration (no UPDATE), true afterwards.
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "workflowLot5" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkOrder" ALTER COLUMN "workflowLot5" SET DEFAULT true;

-- Rework labour of a comeback (0 DT by default). false for every existing line (no UPDATE).
ALTER TABLE "WorkOrderLine" ADD COLUMN IF NOT EXISTS "isRework" BOOLEAN NOT NULL DEFAULT false;

-- ── Quality check: road-test km, results of the configured points ───────────
ALTER TABLE "QualityCheck" ADD COLUMN IF NOT EXISTS "roadTestKm" INTEGER;
ALTER TABLE "QualityCheck" ADD COLUMN IF NOT EXISTS "extraPoints" JSONB NOT NULL DEFAULT '{}';

-- ── Labour entries: worked line and kind of time (optional) ─────────────────
ALTER TABLE "LaborEntry" ADD COLUMN IF NOT EXISTS "workOrderLineId" TEXT;
ALTER TABLE "LaborEntry" ADD COLUMN IF NOT EXISTS "kind" "LaborKind";
DO $$ BEGIN
  ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_workOrderLineId_fkey" FOREIGN KEY ("workOrderLineId") REFERENCES "WorkOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Customer feedback: follow-up of a low rating (internal alert) ───────────
ALTER TABLE "CustomerFeedback" ADD COLUMN IF NOT EXISTS "handledAt" TIMESTAMP(3);
ALTER TABLE "CustomerFeedback" ADD COLUMN IF NOT EXISTS "handledById" TEXT;
ALTER TABLE "CustomerFeedback" ADD COLUMN IF NOT EXISTS "handledNote" TEXT;

-- ── Settings (Paramètres › Parcours atelier) ─────────────────────────────────
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "qualityPoints" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "autoSatisfactionSurvey" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "autoRefusedLineReminders" BOOLEAN NOT NULL DEFAULT true;

-- ── Inspection (red / orange / green) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InspectionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InspectionTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Inspection" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Inspection_workOrderId_createdAt_idx" ON "Inspection"("workOrderId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InspectionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "InspectionResult" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "pointKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "color" "InspectionColor",
    "note" TEXT,
    "mediaId" TEXT,
    "lineId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InspectionResult_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InspectionResult_lineId_idx" ON "InspectionResult"("lineId");
CREATE UNIQUE INDEX IF NOT EXISTS "InspectionResult_inspectionId_pointKey_key" ON "InspectionResult"("inspectionId", "pointKey");
DO $$ BEGIN
  ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "WorkOrderMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "WorkOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Default template « Inspection standard » (fixed id, same row on both sides, not logged for the hub sync).
DO $$
DECLARE prev text := coalesce(current_setting('garagepro.sync', true), '');
BEGIN
  PERFORM set_config('garagepro.sync', 'on', true);
  INSERT INTO "InspectionTemplate" ("id", "name", "points", "isActive", "createdAt", "updatedAt")
  VALUES ('inspection-standard', 'Inspection standard', '[
    {"key":"tires-front","label":"Pneus avant (usure, pression)"},
    {"key":"tires-rear","label":"Pneus arrière (usure, pression)"},
    {"key":"brakes-front","label":"Freins avant (plaquettes, disques)"},
    {"key":"brakes-rear","label":"Freins arrière"},
    {"key":"brake-fluid","label":"Liquide de frein"},
    {"key":"engine-oil","label":"Huile moteur (niveau, fuite)"},
    {"key":"coolant","label":"Liquide de refroidissement"},
    {"key":"battery","label":"Batterie"},
    {"key":"lights","label":"Éclairage et signalisation"},
    {"key":"wipers","label":"Essuie-glaces et lave-glace"},
    {"key":"suspension","label":"Amortisseurs et suspension"},
    {"key":"steering","label":"Direction et rotules"},
    {"key":"belts","label":"Courroies"},
    {"key":"exhaust","label":"Échappement"},
    {"key":"leaks","label":"Fuites sous le véhicule"}
  ]'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO NOTHING;
  PERFORM set_config('garagepro.sync', prev, true);
END $$;

-- Garage hub: log the changes of the new tables too (only where the hub's change log exists).
-- Same block as 24_accueil: puts "_sync_log_trg" on InspectionTemplate, Inspection and InspectionResult.
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
