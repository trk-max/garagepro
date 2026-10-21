/**
 * Garage hub — daily start:  npm run hub
 * Starts the app for the garage Wi-Fi (same as "npm run serve") AND the
 * synchronisation with the online database, in one window.
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loop } from "./run-sync.mjs";
import { scheduleBackups } from "./backup-schedule.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.env.GARAGE_HUB_LOCAL !== "1") {
  console.error('\n  GARAGE_HUB_LOCAL="1" manque dans le .env : lancez d\'abord npm run hub:init (voir README, « Mode hors ligne »).\n');
  process.exit(1);
}

// Already running (second double-click, or started at login)? Then just open it: a second
// hub would fail on the busy port, and the first one must keep running and syncing.
const port = process.env.PORT || "3000";
const portBusy = await new Promise((resolve) => {
  const probe = net.createServer().once("error", (e) => resolve(e.code === "EADDRINUSE")).once("listening", () => probe.close(() => resolve(false)));
  probe.listen(Number(port), "0.0.0.0");
});
if (portBusy) {
  const url = `http://localhost:${port}`;
  const ours = await fetch(`${url}/api/hub/status`, { signal: AbortSignal.timeout(5000) }).then((r) => r.status === 200 || r.status === 401, () => false);
  if (ours) {
    console.log(`\n  GaragePro tourne déjà sur ce PC (une autre fenêtre du hub est ouverte) : ouverture de ${url}\n`);
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    process.exit(0);
  }
  console.error(`\n  !! Le port ${port} est déjà utilisé par un autre programme. Fermez-le, ou choisissez un autre port (PORT=3001 dans le .env).\n`);
  process.exit(1);
}

// New version of the app: bring the garage database up to date first (adds tables, never deletes).
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const migrate = spawnSync(npx, ["prisma", "migrate", "deploy"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, DIRECT_URL: process.env.DATABASE_URL } });
if (migrate.status !== 0) console.error("\n  ⚠ Mise à jour de la base locale impossible (voir le message ci-dessus). L'application démarre quand même.\n");

const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a.address}:${port}`);
console.log(`\n  GaragePro — hub du garage`);
if (addresses.length) console.log(`  Téléphones et tablettes sur le Wi-Fi du garage : ${addresses.join("  ou  ")}`);

const server = spawn(process.execPath, [path.join(ROOT, "scripts/serve.mjs")], { stdio: "inherit", env: process.env });
server.on("exit", (code) => process.exit(code ?? 0));
void loop();

// Customer reminders: with a hub, the garage PC is the one that sends them (the
// online copy skips), every hour, through the app's protected cron route.
const cronSecret = process.env.CRON_SECRET;
if (cronSecret && cronSecret.length >= 16) {
  const runReminders = async () => {
    try {
      const res = await fetch(`http://localhost:${port}/api/cron/reminders`, { headers: { Authorization: `Bearer ${cronSecret}` } });
      const r = await res.json().catch(() => ({}));
      if (res.ok && (r.queued || r.sent || r.failed)) console.log(`  Rappels clients : ${r.queued} nouveau(x), ${r.sent} envoyé(s), ${r.failed} échec(s)`);
      else if (!res.ok) console.error(`  ⚠ Rappels clients : erreur ${res.status}`);
    } catch {
      /* app still starting, or offline: next hour */
    }
  };
  setTimeout(runReminders, 60_000);
  setInterval(runReminders, 60 * 60_000);
} else {
  console.log("  Rappels clients automatiques : désactivés (ajoutez CRON_SECRET, 16 caractères min., dans le .env).");
}

// Daily encrypted, restore-tested backup of the garage database (scripts/hub/backup-schedule.mjs).
scheduleBackups();
