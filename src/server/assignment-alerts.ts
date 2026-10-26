import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/server/workflow";

type Tx = Prisma.TransactionClient;

/**
 * « Nouveau véhicule pour vous »: when an order is assigned to a mechanic, he gets an alert (bell + À traiter
 * + « Nouveau » badge at the top of his team space) until he opens the car. Stored in the existing AlertState
 * table (no migration): key "assigned:<workOrderId>:<userId>", assignedToId = the mechanic, handledAt = opened.
 * A reassignment removes the alert of the previous mechanic. Synchronised by the hub like the other alerts.
 */
export const ASSIGNED_PREFIX = "assigned:";
export const assignedKey = (workOrderId: string, userId: string) => `${ASSIGNED_PREFIX}${workOrderId}:${userId}`;

/** Called inside the assignment transaction (assisted assignment, new order, reassignment, unassignment). */
export async function recordAssignment(tx: Tx, workOrderId: string, before: string | null, after: string | null) {
  if (before && before !== after) await tx.alertState.deleteMany({ where: { key: assignedKey(workOrderId, before) } });
  if (after && after !== before) {
    const key = assignedKey(workOrderId, after);
    await tx.alertState.upsert({ where: { key }, update: { assignedToId: after, handledAt: null, handledById: null }, create: { key, assignedToId: after } });
  }
}

/** Active orders newly assigned to this person and not opened yet (newest first). */
export async function newAssignmentIds(userId: string): Promise<string[]> {
  const rows = await prisma.alertState.findMany({
    where: { key: { startsWith: ASSIGNED_PREFIX }, assignedToId: userId, handledAt: null },
    select: { key: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const ids = rows.map((r) => r.key.split(":")[1]!).filter(Boolean);
  if (ids.length === 0) return [];
  const active = await prisma.workOrder.findMany({ where: { id: { in: ids }, mechanicId: userId, status: { in: ACTIVE_STATUSES } }, select: { id: true } });
  const ok = new Set(active.map((a) => a.id));
  return ids.filter((id) => ok.has(id));
}

export const countNewAssignments = (userId: string) => newAssignmentIds(userId).then((ids) => ids.length);

/** The mechanic opened the car (team-app order screen or the order page): the alert is done. */
export async function markAssignmentSeen(workOrderId: string, userId: string) {
  await prisma.alertState.updateMany({ where: { key: assignedKey(workOrderId, userId), handledAt: null }, data: { handledAt: new Date(), handledById: userId } });
}
