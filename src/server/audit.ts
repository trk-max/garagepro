import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;
export type AuditActor = { id: string; name: string } | null;

/** Keys never written to the journal, whatever the caller passes. */
const SECRET_KEY = /pass(word)?|hash|secret|token|pin|apikey|api_key|otp|code$/i;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 4) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEY.test(k) ? "[masqué]" : redact(v, depth + 1);
    return out;
  }
  if (typeof value === "string" && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

/**
 * Appends one line to the audit journal (who, when, what, before → after).
 * Call it INSIDE the transaction of the change, so both are saved or neither.
 */
export async function audit(
  db: Db,
  actor: AuditActor,
  action: string,
  entity: string,
  entityId: string | null,
  change: { before?: unknown; after?: unknown; ip?: string | null } = {},
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? "Système",
      action,
      entity,
      entityId,
      before: change.before === undefined ? undefined : (redact(change.before) as Prisma.InputJsonValue),
      after: change.after === undefined ? undefined : (redact(change.after) as Prisma.InputJsonValue),
      ip: change.ip ?? null,
    },
  });
}

export async function listAudit(filter: { entity?: string; entityId?: string; actorId?: string; before?: Date; take?: number }) {
  return prisma.auditLog.findMany({
    where: {
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.before ? { createdAt: { lt: filter.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.take ?? 100, 500),
  });
}
