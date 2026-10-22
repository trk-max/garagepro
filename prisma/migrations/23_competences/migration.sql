-- V14 — carte des compétences de l'équipe.
-- ADDITIVE only: 6 new tables, nullable / defaulted columns on "WorkOrder" and "Setting".
-- Nothing existing is changed or deleted. Safe to run twice. Levels and statuses are TEXT (no enum).
-- No catalogue row is inserted here: the garage creates its catalogue (Réglages des compétences).
-- A level is ALWAYS set by a person (responsable / administrateur): nothing here computes or changes one.

-- Paramètres : rappel avant l'expiration des certificats (jours), le superviseur valide « travaux vérifiés »,
-- libellés publics sur le suivi client (désactivé par défaut).
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "skillCertReminderDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "skillSupervisorVerifies" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "skillPublicLabels" BOOLEAN NOT NULL DEFAULT false;

-- Ordre : superviseur, compétences requises saisies à la main (null = déduites des forfaits / lignes),
-- avertissements de la dernière affectation (et leur traitement), dérogation « habilitation » (motif).
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "supervisorId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "skillIds" JSONB;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "skillWarnings" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "skillWarningsAt" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "skillWarningsAckAt" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "skillWarningsAckById" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "skillOverrideReason" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "skillOverrideById" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "skillOverrideAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "WorkOrder_supervisorId_idx" ON "WorkOrder"("supervisorId");
DO $$ BEGIN
  ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Catalogue des compétences (id déterministe "sk_<code>").
CREATE TABLE IF NOT EXISTS "Skill" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "description" TEXT,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "packageIds" JSONB NOT NULL DEFAULT '[]',
    "supervisionRequired" BOOLEAN NOT NULL DEFAULT false,
    "habilitationRequired" BOOLEAN NOT NULL DEFAULT false,
    "publicLabelFr" TEXT,
    "publicLabelAr" TEXT,
    "publicLabelEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Skill_code_key" ON "Skill"("code");

-- Niveau actuel employé × compétence (id déterministe "es_<hash>", une ligne par paire).
CREATE TABLE IF NOT EXISTS "EmployeeSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeSkill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeSkill_userId_skillId_key" ON "EmployeeSkill"("userId", "skillId");
CREATE INDEX IF NOT EXISTS "EmployeeSkill_skillId_level_idx" ON "EmployeeSkill"("skillId", "level");
DO $$ BEGIN
  ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Historique des niveaux : qui, quand, ancien → nouveau, motif. Jamais modifié ni effacé.
CREATE TABLE IF NOT EXISTS "SkillLevelHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "fromLevel" TEXT,
    "toLevel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillLevelHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SkillLevelHistory_userId_createdAt_idx" ON "SkillLevelHistory"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SkillLevelHistory_skillId_idx" ON "SkillLevelHistory"("skillId");
DO $$ BEGIN
  ALTER TABLE "SkillLevelHistory" ADD CONSTRAINT "SkillLevelHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SkillLevelHistory" ADD CONSTRAINT "SkillLevelHistory_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Lines can be added, never changed or deleted (except by the garage hub copying the same line).
CREATE OR REPLACE FUNCTION "_skill_history_readonly"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'SkillLevelHistory is append-only';
END $$;
DROP TRIGGER IF EXISTS "SkillLevelHistory_readonly" ON "SkillLevelHistory";
CREATE TRIGGER "SkillLevelHistory_readonly" BEFORE UPDATE OR DELETE ON "SkillLevelHistory"
  FOR EACH ROW EXECUTE FUNCTION "_skill_history_readonly"();

-- Certificats / habilitations (fichier PDF / photo dans le stockage privé). Jamais effacés : annulés avec motif.
CREATE TABLE IF NOT EXISTS "SkillCertificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT,
    "type" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE,
    "fileKey" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    CONSTRAINT "SkillCertificate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SkillCertificate_userId_idx" ON "SkillCertificate"("userId");
CREATE INDEX IF NOT EXISTS "SkillCertificate_expiresOn_idx" ON "SkillCertificate"("expiresOn");
DO $$ BEGIN
  ALTER TABLE "SkillCertificate" ADD CONSTRAINT "SkillCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SkillCertificate" ADD CONSTRAINT "SkillCertificate_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Objectifs de progression (SUIVI seulement : atteint → « à réévaluer », jamais de changement de niveau).
CREATE TABLE IF NOT EXISTS "SkillGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "since" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reachedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SkillGoal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SkillGoal_userId_status_idx" ON "SkillGoal"("userId", "status");
DO $$ BEGIN
  ALTER TABLE "SkillGoal" ADD CONSTRAINT "SkillGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SkillGoal" ADD CONSTRAINT "SkillGoal_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Demandes de réévaluation (de l'employé, ou objectif atteint : id "sr_goal_<objectif>").
CREATE TABLE IF NOT EXISTS "SkillReviewRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT,
    "goalId" TEXT,
    "source" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "handledNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SkillReviewRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SkillReviewRequest_status_idx" ON "SkillReviewRequest"("status");
CREATE INDEX IF NOT EXISTS "SkillReviewRequest_userId_idx" ON "SkillReviewRequest"("userId");
DO $$ BEGIN
  ALTER TABLE "SkillReviewRequest" ADD CONSTRAINT "SkillReviewRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SkillReviewRequest" ADD CONSTRAINT "SkillReviewRequest_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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
