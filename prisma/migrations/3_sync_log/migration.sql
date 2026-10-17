-- Garage hub (offline mode) — change log for the synchronisation between the
-- garage PC's local database and the online database (Supabase).
-- ADDS two tables, one function and one trigger per table. No data is changed.
-- Safe to run several times, on the local AND on the online database.

CREATE TABLE IF NOT EXISTS "_sync_log" (
    "id" BIGSERIAL NOT NULL,
    "tbl" TEXT NOT NULL,
    "row_id" TEXT NOT NULL,
    "op" CHAR(1) NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "_sync_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "_sync_log_tbl_row_id_idx" ON "_sync_log"("tbl", "row_id");

CREATE TABLE IF NOT EXISTS "_sync_state" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "_sync_state_pkey" PRIMARY KEY ("key")
);

-- One row per change (insert/update = 'U', delete = 'D'). Changes written BY the
-- synchronisation itself (SET LOCAL garagepro.sync = 'on') are not logged, so
-- they never bounce back to the other side.
CREATE OR REPLACE FUNCTION "_sync_log_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  pk text := TG_ARGV[0];
  rid text;
BEGIN
  IF coalesce(current_setting('garagepro.sync', true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  -- Nothing is logged until a garage hub is installed ("npm run hub:init"),
  -- so a database without a hub never fills up with useless lines.
  IF NOT EXISTS (SELECT 1 FROM "_sync_state" WHERE "key" = 'enabled') THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    rid := row_to_json(OLD) ->> pk;
  ELSE
    rid := row_to_json(NEW) ->> pk;
  END IF;
  INSERT INTO "_sync_log" ("tbl", "row_id", "op") VALUES (TG_TABLE_NAME, rid, CASE WHEN TG_OP = 'DELETE' THEN 'D' ELSE 'U' END);
  RETURN NULL;
END $$;

-- A trigger on every application table (single-column primary key), except the
-- sync tables themselves, Prisma's history and the per-server login counters.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.attname AS pk
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary AND i.indnatts = 1
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE c.relkind = 'r'
      AND c.relname NOT IN ('_sync_log', '_sync_state', '_prisma_migrations', 'PortalAttempt')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS "_sync_log_trg" ON %I', r.tbl);
    EXECUTE format('CREATE TRIGGER "_sync_log_trg" AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "_sync_log_change"(%L)', r.tbl, r.pk);
  END LOOP;
END $$;
