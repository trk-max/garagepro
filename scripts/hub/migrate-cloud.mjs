/**
 * Brings the ONLINE database (Supabase, CLOUD_DATABASE_URL) up to date with the
 * new tables of this version, from the garage PC:
 *   npm run db:cloud
 * Runs prisma/migrations 1, 2, 3, 4… (each one only ADDS things and can be run
 * several times without harm). 0_init is never run (it would recreate the base).
 * Run it BEFORE pushing the new version to GitHub/Vercel.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectCloud } from "./connect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "prisma/migrations");

const cloud = await connectCloud({ timeoutMs: 15000 }).catch((error) => {
  console.error(`\n  Connexion à Supabase impossible : ${error.message}\n  (internet ? CLOUD_DATABASE_URL dans le .env ?)\n`);
  process.exit(1);
});
try {
  for (const m of readdirSync(DIR).filter((d) => /^\d+_/.test(d) && !d.startsWith("0_")).sort((a, b) => parseInt(a) - parseInt(b))) {
    process.stdout.write(`  ${m} … `);
    await cloud.query("BEGIN");
    try {
      await cloud.query(readFileSync(path.join(DIR, m, "migration.sql"), "utf8"));
      await cloud.query("COMMIT");
      console.log("OK");
    } catch (error) {
      await cloud.query("ROLLBACK").catch(() => {});
      console.log("ÉCHEC");
      throw error;
    }
  }
  console.log("\n  Base en ligne à jour. Vous pouvez maintenant envoyer la nouvelle version (git push).\n");
} catch (error) {
  console.error(`\n  Arrêt : ${error.message}\n  Rien n'a été supprimé. Recopiez-moi ce message.\n`);
  process.exitCode = 1;
} finally {
  await cloud.end();
}
