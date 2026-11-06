import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { safeErrorType, sanitizeSystemErrorMessage, systemErrorFingerprint } from "@/server/system-error-utils";

const RETENTION_DAYS = 30;
const PRUNE_INTERVAL_MS = 6 * 60 * 60_000;
let lastPrunedAt = 0;

export type SystemErrorInput = {
  source: string;
  place: string;
  error?: unknown;
  message?: string;
  userId?: string | null;
  requestId?: string | null;
};

function bounded(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) || "unknown";
}

export async function recordSystemError(input: SystemErrorInput): Promise<boolean> {
  const source = bounded(input.source, 40);
  const place = bounded(input.place, 120);
  const message = bounded(sanitizeSystemErrorMessage(input.message ?? `Internal failure (${safeErrorType(input.error)})`), 300);
  const fingerprint = systemErrorFingerprint(source, place, message);
  const now = new Date();

  try {
    await prisma.systemError.upsert({
      where: { fingerprint },
      create: {
        id: fingerprint,
        fingerprint,
        source,
        place,
        message,
        userId: input.userId ?? null,
        requestId: input.requestId ?? randomUUID(),
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        count: { increment: 1 },
        lastSeenAt: now,
        updatedAt: now,
        userId: input.userId ?? null,
        requestId: input.requestId ?? randomUUID(),
      },
    });
  } catch {
    console.error("[monitoring] could not persist a system error");
    return false;
  }
  try {
    await pruneSystemErrors(now);
  } catch {
    console.error("[monitoring] could not prune expired system errors");
  }
  return true;
}

export async function pruneSystemErrors(now = new Date()): Promise<void> {
  await prisma.systemError.deleteMany({
    where: { lastSeenAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } },
  });
  lastPrunedAt = now.getTime();
}

export async function getSystemHealthBadge(now = new Date()): Promise<number> {
  try {
    if (now.getTime() - lastPrunedAt > PRUNE_INTERVAL_MS) await pruneSystemErrors(now);
    const recentErrors = await prisma.systemError.count({
      where: { lastSeenAt: { gte: new Date(now.getTime() - 86_400_000) } },
    });
    const hubEnabled = process.env.GARAGE_HUB === "1" || process.env.GARAGE_HUB_LOCAL === "1";
    if (!hubEnabled) return recentErrors;
    const state = await prisma.syncState.findUnique({ where: { key: process.env.GARAGE_HUB_LOCAL === "1" ? "status" : "hub-status" } });
    const value = state?.value;
    const lastSyncAt = typeof value === "object" && value !== null && !Array.isArray(value) && typeof value.lastSyncAt === "string"
      ? Date.parse(value.lastSyncAt)
      : Number.NaN;
    const stale = !Number.isFinite(lastSyncAt) || now.getTime() - lastSyncAt > 5 * 60_000;
    return recentErrors + (stale ? 1 : 0);
  } catch {
    console.error("[monitoring] could not read system health badge");
    return 0;
  }
}
