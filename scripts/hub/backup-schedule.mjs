/**
 * Garage hub: automatic backup of the garage database, every day at BACKUP_HOUR
 * (default 23 h), and at start-up when the last success is older than 26 h.
 * Encrypted, copied, and RESTORE-TESTED in a throw-away database
 * (scripts/backup, docs/SAUVEGARDES.md). Disabled until the key exists.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { backupConfig } from "../backup/config.mjs";
import { backupNow } from "../backup/run.mjs";

export function scheduleBackups() {
  let cfg;
  try {
    cfg = backupConfig();
  } catch (e) {
    console.log(`  Sauvegardes automatiques : désactivées (${e instanceof Error ? e.message : e}).`);
    return;
  }
  if (!existsSync(cfg.keyFile)) {
    console.log("  Sauvegardes automatiques : désactivées (créez la clé une fois : npm run backup:key).");
    return;
  }
  const doBackup = async () => {
    const r = await backupNow();
    if (r.ok) console.log(`  ✔ Sauvegarde ${r.manifest.file} (${r.manifest.verification === "restore" ? "restauration testée" : "intégrité seulement"})`);
    else console.error(`  ✖ SAUVEGARDE ÉCHOUÉE : ${r.error}`);
  };
  let lastSuccess = 0;
  try {
    lastSuccess = new Date(JSON.parse(readFileSync(path.join(cfg.dir, "status.json"), "utf8")).lastSuccess ?? 0).getTime();
  } catch {
    lastSuccess = 0;
  }
  if (Date.now() - lastSuccess > 26 * 3_600_000) setTimeout(doBackup, 2 * 60_000);
  let lastDay = "";
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === cfg.hour && now.toDateString() !== lastDay) {
      lastDay = now.toDateString();
      void doBackup();
    }
  }, 5 * 60_000);
  console.log(`  Sauvegardes automatiques : chaque jour à ${cfg.hour} h → ${cfg.dir}${cfg.copyDir ? ` + ${cfg.copyDir}` : " (pas de 2e emplacement : BACKUP_COPY_DIR)"}`);
}
