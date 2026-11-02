import "server-only";
import type { Prisma, QualityCategory } from "@prisma/client";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { extraPointsComplete, parseExtraResults, parseQualityPoints, roadTestKmMissing, type ExtraResults } from "@/lib/lot5";
import { activeQualityLines, legacyQualityComplete, parseQualityLineChecks, qualityMode, qualityPointsForLines, roadTestRequired, targetedQualityComplete, type QualityLine, type QualityLineChecks } from "@/lib/quality";

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
  lineChecks?: Record<string, boolean>;
};

export const QC_KEYS = ["fluidsOk", "warningsOk", "toolsRemoved", "workVerified", "billingVerified"] as const;

/** Every mandatory point answered. */
export function qcComplete(qc: QualityItems | null): boolean {
  return !!qc && legacyQualityComplete(qc);
}

export async function getQualityCheck(workOrderId: string) {
  return prisma.qualityCheck.findUnique({ where: { workOrderId } });
}

export async function qualityChecklistData(workOrderId: string) {
  const [workOrder, qc, settings] = await Promise.all([
    prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { workflowLineQuality: true } }),
    getQualityCheck(workOrderId),
    prisma.setting.findUnique({ where: { id: "garage" }, select: { qualityPoints: true } }),
  ]);
  if (!workOrder) throw new AppError("notFound", {}, 404);
  const [lines, configuredPoints] = await Promise.all([
    workOrder.workflowLineQuality
      ? prisma.workOrderLine.findMany({
          where: { workOrderId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true, description: true, type: true, qualityCategory: true, voidedAt: true, approvalStatus: true },
        })
      : Promise.resolve([] as QualityLine[]),
    Promise.resolve(parseQualityPoints(settings?.qualityPoints)),
  ]);
  const targeted = qualityMode(workOrder.workflowLineQuality) === "TARGETED";
  const points = targeted ? qualityPointsForLines(configuredPoints, lines) : configuredPoints;
  return {
    targeted,
    lines,
    points,
    roadTestRequired: workOrder.workflowLineQuality && roadTestRequired(lines),
    qc,
    lineChecks: parseQualityLineChecks(qc?.lineChecks),
    approved: !!qc?.approvedAt && (await prisma.$transaction((tx) => orderQualityComplete(tx, workOrderId, qc))),
  };
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

async function orderQualityComplete(tx: Prisma.TransactionClient, workOrderId: string, qc: {
  roadTest: string | null;
  roadTestKm: number | null;
  extraPoints: unknown;
  lineChecks: unknown;
  toolsRemoved: boolean;
  fluidsOk: boolean;
  warningsOk: boolean;
  workVerified: boolean;
  billingVerified: boolean;
}) {
  const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { workflowLineQuality: true } });
  if (!wo || qualityMode(wo.workflowLineQuality) === "LEGACY") {
    return legacyQualityComplete(qc) && (await lot5Complete(tx, workOrderId, qc, true));
  }
  const lines = await tx.workOrderLine.findMany({
    where: { workOrderId },
    select: { id: true, description: true, type: true, qualityCategory: true, voidedAt: true, approvalStatus: true },
  });
  const savedExtra = parseExtraResults(qc.extraPoints);
  const requiredExtra = Object.fromEntries(qualityPointsForLines(await qualityPoints(tx), lines).map((point) => [point.key, savedExtra[point.key] ?? { label: point.label, ok: false }]));
  return targetedQualityComplete({
    lines,
    lineChecks: parseQualityLineChecks(qc.lineChecks),
    toolsRemoved: qc.toolsRemoved,
    roadTestRequired: roadTestRequired(lines),
    roadTest: qc.roadTest,
    roadTestKm: qc.roadTestKm,
    extraPoints: requiredExtra,
  });
}

/** Saves the checklist. Any change after the final validation cancels that validation. */
export async function saveQualityCheck(actor: StaffUser, workOrderId: string, items: QualityItems) {
  if (!can(actor, "fillQualityCheck")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, supervisorId: true, workflowLot5: true, workflowLineQuality: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.status === "DELIVERED" || wo.status === "CLOSED" || wo.status === "CANCELLED") throw new AppError("laborClosedOrder", {}, 409);
    const old = await tx.qualityCheck.findUnique({ where: { workOrderId } });
    const oldLineChecks = parseQualityLineChecks(old?.lineChecks);
    const lines: QualityLine[] = wo.workflowLineQuality
      ? await tx.workOrderLine.findMany({
          where: { workOrderId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true, description: true, type: true, qualityCategory: true, voidedAt: true, approvalStatus: true },
        })
      : [];
    const settings = await tx.setting.findUnique({ where: { id: "garage" }, select: { qualityPoints: true, skillSupervisorVerifies: true } });
    const configuredPoints = parseQualityPoints(settings?.qualityPoints);
    const points = wo.workflowLineQuality ? qualityPointsForLines(configuredPoints, lines) : configuredPoints;
    if (wo.workflowLineQuality && settings?.skillSupervisorVerifies && wo.supervisorId && actor.id !== wo.supervisorId) {
      const newlyChecked = activeQualityLines(lines).some((line) => {
        const oldCheck = oldLineChecks[line.id];
        const unchanged = oldCheck?.label === line.description && oldCheck.type === line.type && oldCheck.category === line.qualityCategory;
        return items.lineChecks?.[line.id] === true && !(unchanged && oldCheck.ok);
      });
      if (newlyChecked) throw new AppError("skillSupervisorVerifies", {}, 403);
    } else if (!wo.workflowLineQuality && wo.supervisorId && items.workVerified && !old?.workVerified && actor.id !== wo.supervisorId) {
      if (settings?.skillSupervisorVerifies) throw new AppError("skillSupervisorVerifies", {}, 403);
    }
    const requiresTest = wo.workflowLineQuality && roadTestRequired(lines);
    const roadTest = wo.workflowLineQuality && !requiresTest ? "NOT_NEEDED" : items.roadTest;
    if (roadTestKmMissing({ workflowLot5: wo.workflowLineQuality ? requiresTest : wo.workflowLot5, roadTest, roadTestKm: items.roadTestKm })) throw new AppError("roadTestKmRequired", {}, 422);
    const extraPoints: ExtraResults = Object.fromEntries(points.map((p) => [p.key, { label: p.label, ok: items.extra?.[p.key] === true, ...(p.categories?.length ? { categories: p.categories } : {}) }]));
    const lineChecks: QualityLineChecks = Object.fromEntries(
      activeQualityLines(lines).map((line) => {
        const ok = items.lineChecks?.[line.id] === true;
        const oldCheck = oldLineChecks[line.id];
        const unchanged = oldCheck?.label === line.description && oldCheck.type === line.type && oldCheck.category === line.qualityCategory;
        return [
          line.id,
          {
            label: line.description,
            type: line.type,
            category: line.qualityCategory as QualityCategory,
            ok,
            at: ok ? (unchanged && oldCheck.ok ? oldCheck.at : new Date().toISOString()) : null,
            by: ok ? (unchanged && oldCheck.ok ? oldCheck.by : actor.id) : null,
          },
        ];
      }),
    );
    const oldExtra = parseExtraResults(old?.extraPoints);
    const changed =
      !old ||
      old.roadTest !== roadTest ||
      (wo.workflowLineQuality
        ? old.toolsRemoved !== items.toolsRemoved ||
          JSON.stringify(Object.fromEntries(Object.entries(oldLineChecks).map(([id, c]) => [id, { label: c.label, type: c.type, category: c.category, ok: c.ok }]))) !==
            JSON.stringify(Object.fromEntries(Object.entries(lineChecks).map(([id, c]) => [id, { label: c.label, type: c.type, category: c.category, ok: c.ok }])))
        : QC_KEYS.some((k) => old[k] !== items[k])) ||
      (old.roadTestKm ?? null) !== (items.roadTestKm ?? null) ||
      points.some((p) => oldExtra[p.key]?.label !== extraPoints[p.key]!.label || (oldExtra[p.key]?.ok ?? false) !== extraPoints[p.key]!.ok || JSON.stringify(oldExtra[p.key]?.categories ?? []) !== JSON.stringify(extraPoints[p.key]!.categories ?? []));
    const data = {
      roadTestKm: items.roadTestKm ?? null,
      extraPoints: extraPoints as unknown as Prisma.InputJsonValue,
      lineChecks: lineChecks as unknown as Prisma.InputJsonValue,
      roadTest,
      fluidsOk: wo.workflowLineQuality ? false : items.fluidsOk,
      warningsOk: wo.workflowLineQuality ? false : items.warningsOk,
      toolsRemoved: items.toolsRemoved,
      workVerified: wo.workflowLineQuality ? false : items.workVerified,
      billingVerified: wo.workflowLineQuality ? false : items.billingVerified,
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

const pickQc = (q: { roadTest: string | null; fluidsOk: boolean; warningsOk: boolean; toolsRemoved: boolean; workVerified: boolean; billingVerified: boolean; approvedAt?: Date | null }) => ({
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
    if (!qc || !(await orderQualityComplete(tx, workOrderId, qc))) throw new AppError("qcIncomplete", {}, 409);
    await tx.qualityCheck.update({ where: { workOrderId }, data: { approvedById: actor.id, approvedAt: new Date() } });
    await audit(tx, actor, "quality.approve", "QualityCheck", workOrderId, { after: { approved: true } });
  });
}

/** Used by the status change to READY (same transaction). */
export async function assertQualityApproved(tx: Prisma.TransactionClient, workOrderId: string) {
  const qc = await tx.qualityCheck.findUnique({ where: { workOrderId } });
  if (!qc || !qc.approvedAt || !(await orderQualityComplete(tx, workOrderId, qc))) throw new AppError("qcNotApproved", {}, 409);
}

/** Work goes back to the workshop: the previous validation no longer holds. */
export async function resetQualityApproval(tx: Prisma.TransactionClient, workOrderId: string) {
  await tx.qualityCheck.updateMany({ where: { workOrderId, approvedAt: { not: null } }, data: { approvedAt: null, approvedById: null } });
}
