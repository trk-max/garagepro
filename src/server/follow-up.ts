import "server-only";
import type { PartNeedStatus } from "@prisma/client";
import { alertCutoffs, type AlertSettings } from "@/lib/alerts";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { getSettings } from "@/server/settings";
import { ACTIVE_STATUSES } from "@/server/workflow";

// ── Insurance ────────────────────────────────────────────────────────────────

export type InsuranceInput = {
  insurerName?: string | null;
  insuranceClaimRef?: string | null;
  insuranceRequestedAt?: Date | null;
  insuranceDecision?: "APPROVED" | "REJECTED" | "PARTIAL" | null;
};

export async function updateInsurance(actor: StaffUser, workOrderId: string, input: InsuranceInput) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { insurerName: true, insuranceClaimRef: true, insuranceRequestedAt: true, insuranceDecision: true, insuranceDecidedAt: true },
    });
    if (!wo) throw new AppError("notFound", {}, 404);
    const decisionChanged = (input.insuranceDecision ?? null) !== wo.insuranceDecision;
    const data = {
      insurerName: input.insurerName || null,
      insuranceClaimRef: input.insuranceClaimRef || null,
      insuranceRequestedAt: input.insuranceRequestedAt ?? wo.insuranceRequestedAt ?? (input.insurerName ? new Date() : null),
      insuranceDecision: input.insuranceDecision ?? null,
      insuranceDecidedAt: decisionChanged ? (input.insuranceDecision ? new Date() : null) : wo.insuranceDecidedAt,
    };
    await tx.workOrder.update({ where: { id: workOrderId }, data });
    await audit(tx, actor, "workOrder.insurance", "WorkOrder", workOrderId, { before: wo, after: data });
  });
}

// ── Missing parts ────────────────────────────────────────────────────────────

export type PartNeedInput = {
  partId?: string | null;
  description: string;
  quantityX100: number;
  supplierId?: string | null;
  expectedAt?: Date | null;
  note?: string | null;
};

export async function addPartNeed(actor: StaffUser, workOrderId: string, input: PartNeedInput) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.status === "DELIVERED" || wo.status === "CLOSED" || wo.status === "CANCELLED") throw new AppError("laborClosedOrder", {}, 409);
    const need = await tx.workOrderPartNeed.create({
      data: { workOrderId, ...input, partId: input.partId || null, supplierId: input.supplierId || null, note: input.note || null, createdById: actor.id },
      select: { id: true },
    });
    await audit(tx, actor, "partNeed.add", "WorkOrderPartNeed", need.id, { after: { workOrderId, ...input } });
    return need;
  });
}

export async function updatePartNeed(
  actor: StaffUser,
  needId: string,
  input: { status: PartNeedStatus; expectedAt?: Date | null; supplierId?: string | null; purchaseOrderId?: string | null; note?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.workOrderPartNeed.findUnique({ where: { id: needId } });
    if (!old) throw new AppError("notFound", {}, 404);
    const now = new Date();
    const data = {
      status: input.status,
      expectedAt: input.expectedAt === undefined ? old.expectedAt : input.expectedAt,
      supplierId: input.supplierId === undefined ? old.supplierId : input.supplierId || null,
      purchaseOrderId: input.purchaseOrderId === undefined ? old.purchaseOrderId : input.purchaseOrderId || null,
      note: input.note === undefined ? old.note : input.note || null,
      orderedAt: input.status === "ORDERED" && !old.orderedAt ? now : old.orderedAt,
      receivedAt: input.status === "RECEIVED" ? (old.receivedAt ?? now) : null,
    };
    await tx.workOrderPartNeed.update({ where: { id: needId }, data });
    await audit(tx, actor, "partNeed.update", "WorkOrderPartNeed", needId, {
      before: { status: old.status, expectedAt: old.expectedAt, supplierId: old.supplierId },
      after: { status: data.status, expectedAt: data.expectedAt, supplierId: data.supplierId },
    });
  });
}

export async function listPartNeeds(workOrderId: string) {
  return prisma.workOrderPartNeed.findMany({
    where: { workOrderId },
    orderBy: { createdAt: "asc" },
    include: { part: { select: { sku: true, name: true } }, supplier: { select: { id: true, name: true, phone: true } }, purchaseOrder: { select: { id: true, number: true } } },
  });
}

// ── Delays ───────────────────────────────────────────────────────────────────

/** Menu counter: same rule as the "Livraisons promises dépassées" list. */
export async function countLateRepairs(now = new Date()) {
  const cut = alertCutoffs(await getSettings(), now);
  return prisma.workOrder.count({ where: { status: { in: ACTIVE_STATUSES.filter((s) => s !== "READY") }, promisedAt: { lt: cut.order } } });
}

/**
 * Repairs late or blocked: promised time passed, parts late, insurance waiting too long.
 * The tolerances come from Paramètres → Alertes (pass them to skip the settings read).
 */
export async function delays(now = new Date(), thresholds?: AlertSettings) {
  const cut = alertCutoffs(thresholds ?? (await getSettings()), now);
  const [lateOrders, lateParts, waitingParts, insurance] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: { in: ACTIVE_STATUSES.filter((s) => s !== "READY") }, promisedAt: { lt: cut.order } },
      orderBy: { promisedAt: "asc" },
      take: 100,
      select: { id: true, number: true, status: true, promisedAt: true, vehicle: { select: { plate: true, make: true, model: true } }, customer: { select: { name: true, phone: true } }, mechanic: { select: { name: true } } },
    }),
    prisma.workOrderPartNeed.findMany({
      where: { status: { in: ["NEEDED", "ORDERED"] }, expectedAt: { lt: cut.part }, workOrder: { status: { in: ACTIVE_STATUSES } } },
      orderBy: { expectedAt: "asc" },
      take: 100,
      include: { supplier: { select: { name: true, phone: true } }, workOrder: { select: { id: true, number: true, vehicle: { select: { plate: true } } } } },
    }),
    prisma.workOrderPartNeed.findMany({
      where: { status: { in: ["NEEDED", "ORDERED"] }, workOrder: { status: { in: ACTIVE_STATUSES } } },
      orderBy: [{ expectedAt: "asc" }],
      take: 200,
      include: { supplier: { select: { name: true, phone: true } }, workOrder: { select: { id: true, number: true, status: true, vehicle: { select: { plate: true } } } } },
    }),
    prisma.workOrder.findMany({
      where: { status: "WAITING_INSURANCE" },
      orderBy: { insuranceRequestedAt: "asc" },
      take: 100,
      select: { id: true, number: true, insurerName: true, insuranceClaimRef: true, insuranceRequestedAt: true, insuranceDecision: true, updatedAt: true, vehicle: { select: { plate: true } }, customer: { select: { name: true, phone: true } } },
    }),
  ]);
  // The counter stops as soon as the insurer's answer is recorded (accord, partiel or refus).
  const insuranceLate = insurance.filter((w) => !w.insuranceDecision && (w.insuranceRequestedAt ?? w.updatedAt) < cut.insurance);
  return { lateOrders, lateParts, waitingParts, insurance, insuranceLate, cutoffs: cut };
}
