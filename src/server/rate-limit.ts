import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Database-backed limiter (works across server instances, survives restarts).
 * `failuresOnly` counts only failed attempts — used for PIN login so a
 * customer who logs in correctly many times is never blocked.
 *
 * Note: isLimited + recordAttempt are two separate steps; for anything an
 * attacker can fire in parallel, use reserveAttempt() below (atomic).
 */
export async function isLimited(key: string, max: number, windowMinutes: number, failuresOnly = true): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const count = await prisma.portalAttempt.count({
    where: { key, createdAt: { gte: since }, ...(failuresOnly ? { ok: false } : {}) },
  });
  return count >= max;
}

export async function recordAttempt(key: string, ok: boolean): Promise<void> {
  await prisma.portalAttempt.create({ data: { key, ok } });
  await maybeCleanUp();
}

/** Opportunistic clean-up of rows older than a day, ~1 request in 50. */
async function maybeCleanUp(): Promise<void> {
  if (Math.random() < 0.02) {
    await prisma.portalAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } } });
  }
}

export type Limit = { key: string; max: number };

/**
 * Atomic check-and-record. In ONE transaction, holding a PostgreSQL advisory
 * lock per key: count the window, and only if every key is under its limit,
 * write the attempt row(s) BEFORE the caller does the real work. Parallel
 * requests queue on the lock and each one sees the rows of the previous ones,
 * so 50 requests sent at once can never all slip under a limit of 5.
 *
 * With `failuresOnly` the row is written as a failure (pessimistic) and the
 * caller flips it with markAttemptsOk() once the attempt really succeeded.
 * Returns the ids of the rows written, or null when a limit is reached.
 */
export async function reserveAttempt(limits: Limit[], windowMinutes: number, failuresOnly: boolean): Promise<string[] | null> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const keys = [...new Set(limits.map((l) => l.key))].sort(); // fixed order: no deadlock between keys
  const ids = await prisma.$transaction(async (tx) => {
    for (const key of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}::text)::bigint)`;
    for (const { key, max } of limits) {
      const count = await tx.portalAttempt.count({
        where: { key, createdAt: { gte: since }, ...(failuresOnly ? { ok: false } : {}) },
      });
      if (count >= max) return null;
    }
    const written: string[] = [];
    for (const key of keys) {
      const row = await tx.portalAttempt.create({ data: { key, ok: !failuresOnly }, select: { id: true } });
      written.push(row.id);
    }
    return written;
  });
  if (ids) await maybeCleanUp();
  return ids;
}

/** The reserved attempt succeeded: it no longer counts as a failure. */
export async function markAttemptsOk(ids: string[]): Promise<void> {
  if (ids.length) await prisma.portalAttempt.updateMany({ where: { id: { in: ids } }, data: { ok: true } });
}

/** The work behind a reservation did not happen (e.g. slot taken): give the attempt back. */
export async function releaseAttempts(ids: string[]): Promise<void> {
  if (ids.length) await prisma.portalAttempt.deleteMany({ where: { id: { in: ids } } });
}
