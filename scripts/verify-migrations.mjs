/**
 * Migration check (never touches a real database):
 *   node scripts/verify-migrations.mjs <admin URL of a TEST PostgreSQL server> [dbName]
 * 1. builds a throw-away database from prisma/migrations (0 → last);
 * 2. replays the last migration (must not fail: migrations are idempotent);
 * 3. compares the structure with prisma/schema.prisma (prisma migrate diff) —
 *    "empty migration" = identical.
 * The throw-away database is dropped at the end.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const [adminUrl, name = `gp_migcheck_${Date.now()}`] = process.argv.slice(2);
if (!adminUrl) {
  console.error("Usage: node scripts/verify-migrations.mjs <postgresql://user:pass@localhost:5432/postgres>");
  process.exit(2);
}
if (/supabase\.(co|com)/i.test(adminUrl)) {
  console.error("Refusé : utilisez un PostgreSQL de TEST local, jamais Supabase.");
  process.exit(2);
}
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${name}`);
const url = new URL(adminUrl);
url.pathname = `/${name}`;
let failed = false;
try {
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const dir = "prisma/migrations";
  const list = readdirSync(dir).filter((d) => /^\d+_/.test(d)).sort((a, b) => parseInt(a) - parseInt(b));
  for (const m of list) await db.query(readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  await db.query(readFileSync(path.join(dir, list.at(-1), "migration.sql"), "utf8"));
  console.log(`✔ ${list.length} migrations appliquées, la dernière (${list.at(-1)}) rejouée sans erreur`);
  await db.end();

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(npx, ["prisma", "migrate", "diff", "--from-url", url.toString(), "--to-schema-datamodel", "prisma/schema.prisma", "--script"], { encoding: "utf8", shell: process.platform === "win32" });
  // Known, harmless difference since migration 3: "_sync_log"."id" is a BIGSERIAL (same auto-numbering,
  // written differently from what Prisma generates). Reported, not counted as an error.
  const KNOWN = /-- AlterTable\s*CREATE SEQUENCE _sync_log_id_seq;\s*ALTER TABLE "_sync_log" ALTER COLUMN "id" SET DEFAULT nextval\('_sync_log_id_seq'\);\s*ALTER SEQUENCE _sync_log_id_seq OWNED BY "_sync_log"\."id";/;
  let script = (r.stdout || "").trim();
  if (KNOWN.test(script)) {
    console.log("  (différence connue et sans effet depuis la migration 3 : _sync_log.id en BIGSERIAL)");
    script = script.replace(KNOWN, "").trim() || "-- This is an empty migration.";
  }
  if (r.status !== 0) {
    failed = true;
    console.error("✖ prisma migrate diff a échoué :", (r.stderr || "").split("\n").slice(-5).join("\n"));
  } else if (/^-- This is an empty migration\.?$/m.test(script) && !/^(ALTER|CREATE|DROP)/m.test(script)) {
    console.log("✔ Structure identique : base construite par les migrations = schéma Prisma");
  } else {
    failed = true;
    console.error("✖ Différences entre les migrations et le schéma :\n" + script);
  }
} finally {
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
  await admin.end();
}
process.exit(failed ? 1 : 0);
