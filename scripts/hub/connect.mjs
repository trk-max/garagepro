/**
 * Database connections for the garage hub scripts.
 * - LOCAL  = DATABASE_URL        (PostgreSQL on the garage PC)
 * - CLOUD  = CLOUD_DATABASE_URL  (Supabase, port 5432 "session" URL)
 * SSL for the cloud: encrypted like Prisma does with sslmode=require; set
 * CLOUD_DATABASE_CA_FILE (Supabase "SSL certificate" download) to also verify
 * the server certificate.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

function withoutSslParams(url) {
  const u = new URL(url);
  for (const p of ["sslmode", "sslcert", "sslkey", "sslrootcert", "pgbouncer", "connection_limit"]) u.searchParams.delete(p);
  return u.toString();
}

export function isCloudUrl(url) {
  try {
    return /(^|\.)supabase\.(co|com)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function connectLocal() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant (base PostgreSQL du PC du garage).");
  if (isCloudUrl(url)) throw new Error("DATABASE_URL pointe vers Supabase : sur le PC du garage, il doit pointer vers la base LOCALE (localhost).");
  const client = new pg.Client({ connectionString: withoutSslParams(url), connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
}

export async function connectCloud({ timeoutMs = 8000 } = {}) {
  const url = process.env.CLOUD_DATABASE_URL;
  if (!url) throw new Error("CLOUD_DATABASE_URL manquant (adresse Supabase, port 5432).");
  const caFile = process.env.CLOUD_DATABASE_CA_FILE;
  // sslmode=disable only for a local test server (Supabase always uses SSL).
  const noSsl = new URL(url).searchParams.get("sslmode") === "disable" && !isCloudUrl(url);
  const ssl = noSsl ? false : caFile ? { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false };
  const client = new pg.Client({ connectionString: withoutSslParams(url), ssl, connectionTimeoutMillis: timeoutMs, query_timeout: 60_000 });
  await client.connect();
  return client;
}
