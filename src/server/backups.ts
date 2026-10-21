import "server-only";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Backup status for the app (Administration → Sauvegardes). Backups run on the
 * garage PC (scripts/backup); the app only READS their status file and
 * manifests. Online (Vercel) there is no backup folder: the page says so.
 */
export type BackupStatus = { lastRun?: string; ok?: boolean; error?: string | null; lastSuccess?: string; lastFile?: string; verification?: string; rows?: number; tables?: number; copies?: string[]; keep?: number };
export type BackupManifest = { file: string; createdAt: string; sizeEncrypted: number; tables: number; rows: number; verification: string; copies: string[] };

export const STALE_HOURS = 36;

export function backupDir(): string {
  return process.env.BACKUP_DIR || path.join(os.homedir(), "GaragePro", "backups");
}

export async function readBackupState(now = new Date()) {
  const dir = backupDir();
  const status: BackupStatus | null = await readFile(path.join(dir, "status.json"), "utf8")
    .then((t) => JSON.parse(t) as BackupStatus)
    .catch(() => null);
  const names = await readdir(dir).catch(() => [] as string[]);
  const manifests: BackupManifest[] = [];
  for (const n of names.filter((x) => /^garagepro-\d{8}-\d{6}\.gpbk\.json$/.test(x)).sort().reverse().slice(0, 30)) {
    const m = await readFile(path.join(dir, n), "utf8").then((t) => JSON.parse(t) as BackupManifest).catch(() => null);
    if (m) manifests.push(m);
  }
  const lastSuccess = status?.lastSuccess ? new Date(status.lastSuccess) : null;
  const stale = !lastSuccess || now.getTime() - lastSuccess.getTime() > STALE_HOURS * 3_600_000;
  const problem = status ? status.ok === false || stale || status.verification !== "restore" : false;
  return { dir, status, manifests, stale, problem, configured: !!status };
}

/** Menu badge: 1 when the last backup failed, is too old, or was not restore-tested. */
export async function backupProblem(): Promise<number> {
  try {
    return (await readBackupState()).problem ? 1 : 0;
  } catch {
    return 0;
  }
}
