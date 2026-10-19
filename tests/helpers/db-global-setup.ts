import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

export const TEST_DB = "gp_test_db";

/** Recreates the throw-away test database from prisma/migrations (exactly what production runs). */
export default async function setup({ provide }: { provide: (key: "dbUrl", value: string) => void }) {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL manquant : serveur PostgreSQL de TEST (jamais la vraie base).");
  const url = new URL(base);
  if (/supabase\.(co|com)$/i.test(url.hostname)) throw new Error("TEST_DATABASE_URL pointe vers Supabase : utilisez un PostgreSQL de test local.");
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  url.pathname = `/${TEST_DB}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const dir = path.resolve(import.meta.dirname, "../../prisma/migrations");
  for (const m of readdirSync(dir).filter((d) => /^\d+_/.test(d)).sort((a, b) => parseInt(a) - parseInt(b))) {
    await db.query(readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  await db.end();
  provide("dbUrl", url.toString());
}

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}
