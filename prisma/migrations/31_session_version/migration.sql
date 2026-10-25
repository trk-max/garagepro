-- Déconnexion partout — version de session par membre de l'équipe.
-- ADDITIVE only: 1 new column on "User" (INTEGER NOT NULL DEFAULT 0). Nothing is renamed, dropped or rewritten,
-- no enum type is created or changed, no existing row is updated (ADD COLUMN … DEFAULT fires no row trigger, so
-- nothing is logged for the garage hub). Safe to run twice (IF NOT EXISTS).
-- The staff sign-in cookie (JWT) carries the version it was issued with; « Déconnexion » adds 1 to the user's
-- version, so every cookie of that account (other tabs, other browsers, the phone) is refused from then on.
-- Other users are not concerned. The column travels with the "User" row (hub ↔ online synchronisation).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Garage hub: log the changes of new tables too (only where the hub's change log exists). No new table here;
-- kept so every migration leaves all tables logged, like 24_accueil.
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
