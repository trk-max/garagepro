import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Database-backed limiter (works across server instances, survives restarts).
 * `failuresOnly` counts only failed attempts — used for PIN login so a
 * customer who logs in correctly many times is never blocked.
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
  // Opportunistic clean-up, ~1 request in 50.
  if (Math.random() < 0.02) {
    await prisma.portalAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } } });
  }
}
