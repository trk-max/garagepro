/**
 * Garage hub — daily start:  npm run hub
 * Starts the app for the garage Wi-Fi (same as "npm run serve") AND the
 * synchronisation with the online database, in one window.
 */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loop } from "./run-sync.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.env.GARAGE_HUB_LOCAL !== "1") {
  console.error('\n  GARAGE_HUB_LOCAL="1" manque dans le .env : lancez d\'abord npm run hub:init (voir README, « Mode hors ligne »).\n');
  process.exit(1);
}

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
