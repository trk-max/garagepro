import { AlertTriangle, CheckCircle2, CircleX } from "lucide-react";
import { Card, CardTitle, PageHeader } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";
import { pruneSystemErrors } from "@/server/system-errors";
import { STALE_HOURS, readBackupState, type BackupStatus } from "@/server/backups";
import { isHubLocal } from "@/server/hub";

const HUB_STALE_MS = 5 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRemoteBackupStatus(value: unknown): BackupStatus | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") return null;
  return {
    ok: value.ok,
    lastRun: typeof value.lastRun === "string" ? value.lastRun : undefined,
    lastSuccess: typeof value.lastSuccess === "string" ? value.lastSuccess : undefined,
    lastFile: typeof value.lastFile === "string" ? value.lastFile : undefined,
    verification: typeof value.verification === "string" ? value.verification : undefined,
    rows: typeof value.rows === "number" ? value.rows : undefined,
    tables: typeof value.tables === "number" ? value.tables : undefined,
    copies: Array.isArray(value.copies) && value.copies.every((item) => typeof item === "string") ? value.copies : undefined,
    keep: typeof value.keep === "number" ? value.keep : undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  await requirePageAccess("viewSystemHealth");
  const now = new Date();
  await pruneSystemErrors(now);
  const [{ t, lang }, backup, hubRow, remoteBackupRow, errors] = await Promise.all([
    getI18n(),
    readBackupState(now),
    (process.env.GARAGE_HUB === "1" || isHubLocal())
      ? prisma.syncState.findUnique({ where: { key: isHubLocal() ? "status" : "hub-status" } })
      : Promise.resolve(null),
    !isHubLocal() && process.env.GARAGE_HUB === "1"
      ? prisma.syncState.findUnique({ where: { key: "backup-status" } })
      : Promise.resolve(null),
    prisma.systemError.findMany({
      where: { lastSeenAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
    }),
  ]);
  const h = t.systemHealth;
  const hubConfigured = process.env.GARAGE_HUB === "1" || isHubLocal();
  const value = hubRow?.value;
  const hub = isRecord(value) ? value : null;
  const lastSyncAt = hub && typeof hub.lastSyncAt === "string" ? hub.lastSyncAt : null;
  const lastSyncTime = lastSyncAt ? Date.parse(lastSyncAt) : Number.NaN;
  const hubStale = !Number.isFinite(lastSyncTime) || now.getTime() - lastSyncTime > HUB_STALE_MS;
  const hubOnline = hub?.online === true;
  const remoteBackupValue = remoteBackupRow?.value;
  const remoteBackup = readRemoteBackupStatus(remoteBackupValue);
  const backupStatus = backup.status ?? remoteBackup;
  const backupConfigured = backup.configured || !!remoteBackup;
  const lastBackupSuccess = backupStatus?.lastSuccess ? Date.parse(backupStatus.lastSuccess) : Number.NaN;
  const backupStale = backup.status ? backup.stale
    : !Number.isFinite(lastBackupSuccess) || now.getTime() - lastBackupSuccess > STALE_HOURS * 3_600_000;
  const backupProblem = backup.status
    ? backup.problem
    : !backupConfigured || backupStatus?.ok === false || backupStale || backupStatus?.verification !== "restore";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <PageHeader title={h.title} />
      <p className="text-sm text-muted-foreground">{h.subtitle}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>{h.hub}</CardTitle>
          {!hubConfigured ? (
            <p className="mt-3 text-sm text-muted-foreground">{h.hubNotConfigured}</p>
          ) : !hubRow || !hub ? (
            <p className="mt-3 text-sm text-muted-foreground">{h.hubNoReport}</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                {hubStale || !hubOnline ? <AlertTriangle className="size-4 text-amber-600" aria-hidden /> : <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />}
                <strong>{hubStale ? h.hubStale : hubOnline ? h.hubOnline : h.hubOffline}</strong>
              </li>
              <li>{h.lastSync} : {lastSyncAt ? formatDateTime(lastSyncAt, lang) : "—"}</li>
              <li>{h.pending} : {typeof hub.pending === "number" ? hub.pending : "—"}</li>
              <li>{h.syncErrors} : {typeof hub.errors === "number" ? hub.errors : "—"}</li>
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>{h.backup}</CardTitle>
          {!backupConfigured ? (
            <p className="mt-3 text-sm text-muted-foreground">{isHubLocal() ? h.backupNotConfigured : h.backupNotHere}</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                {backupProblem ? <CircleX className="size-4 text-red-600" aria-hidden /> : <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />}
                <strong>{backupStatus?.ok ? h.backupOk : h.backupFailed}</strong>
              </li>
              <li>{h.lastBackup} : {backupStatus?.lastRun ? formatDateTime(backupStatus.lastRun, lang) : "—"}</li>
              {backupStale && <li className="text-amber-700 dark:text-amber-400">{h.backupStale} ({STALE_HOURS} h)</li>}
              <li>{backupStatus?.verification === "restore" ? h.restoreTested : h.verificationMissing}</li>
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>{h.recentErrors}</CardTitle>
        {errors.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{h.noErrors}</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {errors.map((error) => (
              <li key={error.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="font-medium">{error.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span dir="ltr">{error.source} · {error.place}</span> · {h.count}: {error.count}
                  </p>
                </div>
                <time className="text-xs text-muted-foreground sm:text-end" dateTime={error.lastSeenAt.toISOString()}>
                  {formatDateTime(error.lastSeenAt, lang)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
