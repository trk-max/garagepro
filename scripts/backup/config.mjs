/** Backup settings, from .env (all optional except a database URL). */
import os from "node:os";
import path from "node:path";
import { defaultKeyFile } from "./lib.mjs";

export function backupConfig(env = process.env) {
  const sourceUrl = env.BACKUP_SOURCE_URL || env.DATABASE_URL;
  if (!sourceUrl) throw new Error("Aucune base à sauvegarder : DATABASE_URL (ou BACKUP_SOURCE_URL) manque dans le .env.");
  // Restore check on a local PostgreSQL by default (the garage PC): same server, database "postgres".
  let restoreAdminUrl = env.BACKUP_RESTORE_TEST_URL || null;
  if (!restoreAdminUrl) {
    const u = new URL(sourceUrl);
    if (["localhost", "127.0.0.1", "::1"].includes(u.hostname)) {
      u.pathname = "/postgres";
      u.search = "";
      restoreAdminUrl = u.toString();
    }
  }
  return {
    sourceUrl,
    dir: env.BACKUP_DIR || path.join(os.homedir(), "GaragePro", "backups"),
    copyDir: env.BACKUP_COPY_DIR || undefined,
    keyFile: env.BACKUP_KEY_FILE || defaultKeyFile(),
    keep: Math.max(1, Number(env.BACKUP_KEEP) || 14),
    hour: Math.min(23, Math.max(0, Number(env.BACKUP_HOUR ?? 23) || 0)),
    restoreAdminUrl,
  };
}
