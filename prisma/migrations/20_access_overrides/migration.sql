-- V10.3 — accès sur mesure par employé + tableau de bord personnalisé.
-- ADDS one table and one nullable column. Nothing existing is changed. Safe to run twice.

-- Tableau de bord : disposition choisie par chaque utilisateur ([{ id, visible }] dans l'ordre).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dashboardLayout" JSONB;

-- Exceptions à la matrice des rôles (DENY > GRANT > rôle).
CREATE TABLE IF NOT EXISTS "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserPermission_userId_permission_key" ON "UserPermission"("userId", "permission");
DO $$ BEGIN
  ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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
