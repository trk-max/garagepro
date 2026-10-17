/**
 * Garage hub — first installation (run ONCE on the garage PC):
 *   npm run hub:init
 * 1. creates the tables in the LOCAL database (prisma migrate deploy);
 * 2. adds the change log to the ONLINE database (Supabase) — adds tables and
 *    triggers only, never changes or deletes online data;
 * 3. copies all the online data to the garage PC;
 * 4. gives odd numbers to the garage and even numbers online (no duplicates
 *    while disconnected).
 * The local database must be empty (use --force to copy over an existing one).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectCloud, connectLocal } from "./connect.mjs";
import { copyAll, setState, splitSequences } from "./sync-engine.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SQL = readFileSync(path.join(ROOT, "prisma/migrations/3_sync_log/migration.sql"), "utf8");
const force = process.argv.includes("--force");

function step(n, text) {
  console.log(`\n  [${n}/5] ${text}`);
}

/** Steps 2–5 on two connected `pg` clients (the local tables must already exist). */
export async function installHub(local, cloud, { force = false, log = () => {} } = {}) {
  const { rows } = await local.query(`SELECT count(*)::int AS n FROM "User"`);
  if (rows[0].n > 0 && !force) {
    throw new Error("La base locale contient déjà des données : le hub est sans doute déjà installé. Lancez simplement : npm run hub   (ou --force pour tout recopier depuis la base en ligne).");
  }

  log(3, "Ajout du journal des modifications en ligne (aucune donnée modifiée)…");
  await cloud.query(SQL);
  // Log online changes from now on: those made during the copy are sent again at the first round.
  await setState(cloud, "enabled", { since: new Date().toISOString() });

  log(4, "Copie des données en ligne vers le PC du garage…");
  const copied = await copyAll(cloud, local);
  const total = Object.values(copied).reduce((a, b) => a + b, 0);
  console.log(`        ${total} lignes copiées (${Object.keys(copied).length} tables).`);

  log(5, "Numérotation : impairs au garage, pairs en ligne…");
  await splitSequences(local, "odd");
  await splitSequences(cloud, "even");
  await local.query(`DELETE FROM "_sync_log"`);
  await setState(local, "enabled", { since: new Date().toISOString() });
  await setState(local, "status", { online: true, lastSyncAt: new Date().toISOString(), errors: 0, lastError: null });
  return copied;
}

async function main() {
  if (process.env.GARAGE_HUB_LOCAL !== "1") throw new Error('Ajoutez GARAGE_HUB_LOCAL="1" dans le .env du PC du garage.');
  if (process.env.SUPABASE_STORAGE_BUCKET) {
    throw new Error("Sur le PC du garage, laissez SUPABASE_STORAGE_BUCKET vide et mettez le nom du bucket dans CLOUD_STORAGE_BUCKET (les photos sont gardées sur le PC puis envoyées en ligne).");
  }

  step(1, "Création des tables dans la base locale…");
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const migrate = spawnSync(npx, ["prisma", "migrate", "deploy"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, DIRECT_URL: process.env.DATABASE_URL } });
  if (migrate.status !== 0) throw new Error("prisma migrate deploy a échoué sur la base locale (PostgreSQL est-il démarré ? DATABASE_URL est-il correct ?).");

  const local = await connectLocal();
  step(2, "Connexion à la base en ligne (Supabase)…");
  const cloud = await connectCloud({ timeoutMs: 15000 });
  try {
    await installHub(local, cloud, { force, log: step });

    console.log(`
  Hub installé.
  Étape suivante (chaque jour) : npm run hub
  Sur Vercel, ajoutez la variable GARAGE_HUB = 1 puis redéployez : les factures,
  bons de commande et bons de réception seront alors numérotés uniquement au garage.
`);
  } finally {
    await cloud.end().catch(() => {});
    await local.end().catch(() => {});
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/hub/init.mjs")) {
  main().catch((error) => {
    console.error(`\n  Installation interrompue : ${error.message}\n`);
    process.exit(1);
  });
}
