import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { extraPointsComplete, parseExtraResults, parseQualityPoints, roadTestKmMissing, type ExtraResults } from "@/lib/lot5";

export type QualityItems = {
  roadTest: "DONE" | "NOT_NEEDED" | null;
  fluidsOk: boolean;
  warningsOk: boolean;
  toolsRemoved: boolean;
  workVerified: boolean;
  billingVerified: boolean;
  notes?: string | null;
  /** V16 Lot 5 — km driven during the road test (mandatory when done, orders of Lot 5 on). */
  roadTestKm?: number | null;
  /** V16 Lot 5 — points set in Paramètres (key → ticked). */
  extra?: Record<string, boolean>;
};

export const QC_KEYS = ["fluidsOk", "warningsOk", "toolsRemoved", "workVerified", "billingVerified"] as const;

/** Every mandatory point answered. */
export function qcComplete(qc: QualityItems | null): boolean {
  return !!qc && qc.roadTest !== null && QC_KEYS.every((k) => qc[k] === true);
}

export async function getQualityCheck(workOrderId: string) {
  return prisma.qualityCheck.findUnique({ where: { workOrderId } });
}

/** V16 Lot 5 — the points added in the settings (on top of the 6 fixed points). */
export async function qualityPoints(db: Pick<Prisma.TransactionClient, "setting"> = prisma) {
  const s = await db.setting.findUnique({ where: { id: "garage" }, select: { qualityPoints: true } });
  return parseQualityPoints(s?.qualityPoints);
}

/**
 * V16 Lot 5 — complete for an order of Lot 5: the 6 points, the road-test distance when the test was done, and
 * every point set in the settings ticked. Older orders: the 6 points only (non-retroactive).
 * `recorded`: check the points recorded in the check (the move to « Prêt » after the approval — a point added to the
 * settings later does not undo an approval); otherwise the points set now (the approval itself).
 */
async function lot5Complete(tx: Prisma.TransactionClient, workOrderId: string, qc: { roadTest: string | null; roadTestKm: number | null; extraPoints: unknown }, recorded = false) {
  const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { workflowLot5: true } });
  if (!wo?.workflowLot5) return true;
  if (roadTestKmMissing({ workflowLot5: true, roadTest: qc.roadTest, roadTestKm: qc.roadTestKm })) return false;
  const results = parseExtraResults(qc.extraPoints);
  if (recorded) return Object.values(results).every((r) => r.ok);
  return extraPointsComplete(await qualityPoints(tx), results);
}

/** Saves the checklist. Any change after the final validation cancels that validation. */
export async function saveQualityCheck(actor: StaffUser, workOrderId: string, items: QualityItems) {
  if (!can(actor, "fillQualityCheck")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, supervisorId: true, workflowLot5: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.status === "DELIVERED" || wo.status === "CLOSED" || wo.status === "CANCELLED") throw new AppError("laborClosedOrder", {}, 409);
    const old = await tx.qualityCheck.findUnique({ where: { workOrderId } });
    // V14: when the garage chose so, only the order's supervisor ticks « travaux vérifiés ».
    if (wo.supervisorId && items.workVerified && !old?.workVerified && actor.id !== wo.supervisorId) {
      const s = await tx.setting.findUnique({ where: { id: "garage" }, select: { skillSupervisorVerifies: true } });
      if (s?.skillSupervisorVerifies) throw new AppError("skillSupervisorVerifies", {}, 403);
    }
    // V16 Lot 5 (new orders): road-test distance mandatory when the test was done; the points set in the settings
    // are recorded with their label (a point removed later does not change a check already made).
    if (roadTestKmMissing({ workflowLot5: wo.workflowLot5, roadTest: items.roadTest, roadTestKm: items.roadTestKm })) throw new AppError("roadTestKmRequired", {}, 422);
    const points = await qualityPoints(tx);
    const extraPoints: ExtraResults = Object.fromEntries(points.map((p) => [p.key, { label: p.label, ok: items.extra?.[p.key] === true }]));
    const oldExtra = parseExtraResults(old?.extraPoints);
    const changed =
      !old ||
      old.roadTest !== items.roadTest ||
      QC_KEYS.some((k) => old[k] !== items[k]) ||
      (old.roadTestKm ?? null) !== (items.roadTestKm ?? null) ||
      points.some((p) => (oldExtra[p.key]?.ok ?? false) !== extraPoints[p.key]!.ok);
    const data = {
      roadTestKm: items.roadTestKm ?? null,
      extraPoints: extraPoints as unknown as Prisma.InputJsonValue,
      roadTest: items.roadTest,
      fluidsOk: items.fluidsOk,
      warningsOk: items.warningsOk,
      toolsRemoved: items.toolsRemoved,
      workVerified: items.workVerified,
      billingVerified: items.billingVerified,
      notes: items.notes ?? null,
      checkedById: actor.id,
      checkedAt: new Date(),
      ...(changed ? { approvedById: null, approvedAt: null } : {}),
    } satisfies Prisma.QualityCheckUncheckedUpdateInput;
    await tx.qualityCheck.upsert({ where: { workOrderId }, update: data, create: { workOrderId, ...data } });
    await audit(tx, actor, "quality.save", "QualityCheck", workOrderId, {
      before: old ? { ...pickQc(old), roadTestKm: old.roadTestKm, extraPoints: oldExtra } : null,
      after: { ...pickQc({ ...data }), roadTestKm: data.roadTestKm, extraPoints },
    });
  });
}

const pickQc = (q: Omit<QualityItems, "roadTest"> & { roadTest: string | null; approvedAt?: Date | null }) => ({
  roadTest: q.roadTest,
  fluidsOk: q.fluidsOk,
  warningsOk: q.warningsOk,
  toolsRemoved: q.toolsRemoved,
  workVerified: q.workVerified,
  billingVerified: q.billingVerified,
  approvedAt: q.approvedAt ?? null,
});

/** Final validation by a manager: only when every point is checked. */
export async function approveQualityCheck(actor: StaffUser, workOrderId: string) {
  if (!can(actor, "approveQualityCheck")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const qc = await tx.qualityCheck.findUnique({ where: { workOrderId } });
    if (!qcComplete(qc as QualityItems | null) || !(await lot5Complete(tx, workOrderId, qc!))) throw new AppError("qcIncomplete", {}, 409);
    await tx.qualityCheck.update({ where: { workOrderId }, data: { approvedById: actor.id, approvedAt: new Date() } });
    await audit(tx, actor, "quality.approve", "QualityCheck", workOrderId, { after: { approved: true } });
  });
}

/** Used by the status change to READY (same transaction). */
export async function assertQualityApproved(tx: Prisma.TransactionClient, workOrderId: string) {
  const qc = await tx.qualityCheck.findUnique({ where: { workOrderId } });
  if (!qc || !qc.approvedAt || !qcComplete(qc as QualityItems) || !(await lot5Complete(tx, workOrderId, qc, true))) throw new AppError("qcNotApproved", {}, 409);
}

/** Work goes back to the workshop: the previous validation no longer holds. */
export async function resetQualityApproval(tx: Prisma.TransactionClient, workOrderId: string) {
  await tx.qualityCheck.updateMany({ where: { workOrderId, approvedAt: { not: null } }, data: { approvedAt: null, approvedById: null } });
}
