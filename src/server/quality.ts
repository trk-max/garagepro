import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";

export type QualityItems = {
  roadTest: "DONE" | "NOT_NEEDED" | null;
  fluidsOk: boolean;
  warningsOk: boolean;
  toolsRemoved: boolean;
  workVerified: boolean;
  billingVerified: boolean;
  notes?: string | null;
};

export const QC_KEYS = ["fluidsOk", "warningsOk", "toolsRemoved", "workVerified", "billingVerified"] as const;

/** Every mandatory point answered. */
export function qcComplete(qc: QualityItems | null): boolean {
  return !!qc && qc.roadTest !== null && QC_KEYS.every((k) => qc[k] === true);
}

export async function getQualityCheck(workOrderId: string) {
  return prisma.qualityCheck.findUnique({ where: { workOrderId } });
}

/** Saves the checklist. Any change after the final validation cancels that validation. */
export async function saveQualityCheck(actor: StaffUser, workOrderId: string, items: QualityItems) {
  if (!can(actor, "fillQualityCheck")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, supervisorId: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.status === "DELIVERED" || wo.status === "CANCELLED") throw new AppError("laborClosedOrder", {}, 409);
    const old = await tx.qualityCheck.findUnique({ where: { workOrderId } });
    // V14: when the garage chose so, only the order's supervisor ticks « travaux vérifiés ».
    if (wo.supervisorId && items.workVerified && !old?.workVerified && actor.id !== wo.supervisorId) {
      const s = await tx.setting.findUnique({ where: { id: "garage" }, select: { skillSupervisorVerifies: true } });
      if (s?.skillSupervisorVerifies) throw new AppError("skillSupervisorVerifies", {}, 403);
    }
    const changed = !old || old.roadTest !== items.roadTest || QC_KEYS.some((k) => old[k] !== items[k]);
    const data = {
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
    await audit(tx, actor, "quality.save", "QualityCheck", workOrderId, { before: old ? pickQc(old) : null, after: pickQc({ ...data }) });
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
    if (!qcComplete(qc as QualityItems | null)) throw new AppError("qcIncomplete", {}, 409);
    await tx.qualityCheck.update({ where: { workOrderId }, data: { approvedById: actor.id, approvedAt: new Date() } });
    await audit(tx, actor, "quality.approve", "QualityCheck", workOrderId, { after: { approved: true } });
  });
}

/** Used by the status change to READY (same transaction). */
export async function assertQualityApproved(tx: Prisma.TransactionClient, workOrderId: string) {
  const qc = await tx.qualityCheck.findUnique({ where: { workOrderId } });
  if (!qc || !qc.approvedAt || !qcComplete(qc as QualityItems)) throw new AppError("qcNotApproved", {}, 409);
}

/** Work goes back to the workshop: the previous validation no longer holds. */
export async function resetQualityApproval(tx: Prisma.TransactionClient, workOrderId: string) {
  await tx.qualityCheck.updateMany({ where: { workOrderId, approvedAt: { not: null } }, data: { approvedAt: null, approvedById: null } });
}
