/**
 * One backup now:  npm run backup
 * Writes <BACKUP_DIR>/status.json (read by the app: Administration → Sauvegardes),
 * exits with code 1 on failure (so Windows Task Scheduler / the hub can see it).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { backupConfig } from "./config.mjs";
import { runBackup } from "./lib.mjs";

export async function backupNow(env = process.env) {
  const cfg = backupConfig(env);
  await mkdir(cfg.dir, { recursive: true });
  const statusFile = path.join(cfg.dir, "status.json");
  const previous = await readFile(statusFile, "utf8").then(JSON.parse).catch(() => ({}));
  const startedAt = new Date().toISOString();
  try {
    const m = await runBackup(cfg);
    const status = { ...previous, lastRun: startedAt, ok: true, error: null, lastSuccess: m.createdAt, lastFile: m.file, verification: m.verification, rows: m.rows, tables: m.tables, copies: m.copies, keep: cfg.keep };
    await writeFile(statusFile, JSON.stringify(status, null, 2));
    return { ok: true, manifest: m, cfg };
  } catch (e) {
    const status = { ...previous, lastRun: startedAt, ok: false, error: e instanceof Error ? e.message : String(e) };
    await writeFile(statusFile, JSON.stringify(status, null, 2)).catch(() => {});
    return { ok: false, error: status.error, cfg };
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("run.mjs")) {
  const r = await backupNow();
  if (r.ok) {
    const m = r.manifest;
    console.log(`\n  ✔ Sauvegarde ${m.file} — ${m.tables} tables, ${m.rows} lignes`);
    console.log(`    Vérification : ${m.verification === "restore" ? "RESTAURATION TESTÉE (toutes les lignes retrouvées)" : "intégrité seulement (pas de serveur de test : BACKUP_RESTORE_TEST_URL)"}`);
    console.log(`    Dossier : ${r.cfg.dir}${m.copies.length ? `   Copie : ${m.copies.join(", ")}` : "   (pas de copie : BACKUP_COPY_DIR)"}\n`);
  } else {
    console.error(`\n  ✖ Sauvegarde ÉCHOUÉE : ${r.error}\n`);
    process.exit(1);
  }
}
