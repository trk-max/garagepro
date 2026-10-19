/**
 * Garage hub — daily start:  npm run hub
 * Starts the app for the garage Wi-Fi (same as "npm run serve") AND the
 * synchronisation with the online database, in one window.
 */
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loop } from "./run-sync.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.env.GARAGE_HUB_LOCAL !== "1") {
  console.error('\n  GARAGE_HUB_LOCAL="1" manque dans le .env : lancez d\'abord npm run hub:init (voir README, « Mode hors ligne »).\n');
  process.exit(1);
}

// New version of the app: bring the garage database up to date first (adds tables, never deletes).
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const migrate = spawnSync(npx, ["prisma", "migrate", "deploy"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, DIRECT_URL: process.env.DATABASE_URL } });
if (migrate.status !== 0) console.error("\n  ⚠ Mise à jour de la base locale impossible (voir le message ci-dessus). L'application démarre quand même.\n");

const port = process.env.PORT || "3000";
const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a.address}:${port}`);
console.log(`\n  GaragePro — hub du garage`);
if (addresses.length) console.log(`  Téléphones et tablettes sur le Wi-Fi du garage : ${addresses.join("  ou  ")}`);

const server = spawn(process.execPath, [path.join(ROOT, "scripts/serve.mjs")], { stdio: "inherit", env: process.env });
server.on("exit", (code) => process.exit(code ?? 0));
void loop();
