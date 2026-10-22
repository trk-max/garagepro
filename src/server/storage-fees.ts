import "server-only";
import type { Prisma, WorkOrderStatus } from "@prisma/client";
import { cleanReason } from "@/server/workflow";
import { fmt } from "@/lib/format";
import { fr } from "@/lib/i18n/fr";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { computeStorageFee, type PartsWaitDecision, type StorageFee } from "@/lib/storage-fee";
import { audit, type AuditActor } from "@/server/audit";

/**
 * V16 Lot 4 — storage fee (gardiennage) of an order, read from what Lots 1–3 store: status moves (events), the
 * « véhicule prêt » messages actually SENT (Notification) or a « client prévenu » note, and the parts-wait
 * decisions (keep / hand back, garage-caused). Rule: src/lib/storage-fee.ts. Added as a line at invoicing.
 */

type Db = Pick<Prisma.TransactionClient, "workOrder" | "workOrderEvent" | "notification" | "setting" | "workOrderLine">;

export type OrderStorageFee = StorageFee & { feePerDay: number; graceHours: number; auto: boolean; waived: { reason: string; at: Date } | null; applies: boolean };

export async function orderStorageFee(db: Db, workOrderId: string, end = new Date()): Promise<OrderStorageFee | null> {
  const [wo, s, events, sent] = await Promise.all([
    db.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, readyAt: true, workflowLot4: true, createdAt: true } }),
    db.setting.findUnique({ where: { id: "garage" }, select: { storageFeePerDay: true, storageGraceHours: true, autoStorageFee: true } }),
    db.workOrderEvent.findMany({ where: { workOrderId, type: { in: ["STATUS_CHANGED", "NOTE"] } }, orderBy: { createdAt: "asc" }, select: { type: true, data: true, createdAt: true } }),
    db.notification.findMany({ where: { workOrderId, kind: "READY", status: "SENT" }, select: { sentAt: true, createdAt: true } }),
  ]);
  if (!wo || !s) return null;
  const moves: { at: Date; to: WorkOrderStatus }[] = [{ at: wo.createdAt, to: "RECEIVED" }];
  const notices: Date[] = sent.map((n) => n.sentAt ?? n.createdAt);
  const partsDecisions: PartsWaitDecision[] = [];
  let waived: { reason: string; at: Date } | null = null;
  for (const e of events) {
    const d = (e.data ?? {}) as { to?: WorkOrderStatus; readyNotified?: boolean; partsWait?: PartsWaitDecision["decision"]; garageCaused?: boolean; storageWaived?: boolean; reason?: string };
    if (e.type === "STATUS_CHANGED" && d.to) moves.push({ at: e.createdAt, to: d.to });
    if (e.type !== "NOTE") continue;
    if (d.readyNotified) notices.push(e.createdAt);
    if (d.partsWait) partsDecisions.push({ at: e.createdAt, decision: d.partsWait, garageCaused: d.garageCaused !== false });
    // A waiver covers the current « ready » period only (a new READY after a return to the workshop starts over).
    if (d.storageWaived && (!wo.readyAt || e.createdAt >= wo.readyAt)) waived = { reason: d.reason ?? "", at: e.createdAt };
  }
  const fee = computeStorageFee({ moves, notices, partsDecisions, graceHours: s.storageGraceHours, feePerDay: s.storageFeePerDay, end });
  return { ...fee, feePerDay: s.storageFeePerDay, graceHours: s.storageGraceHours, auto: s.autoStorageFee, waived, applies: wo.workflowLot4 };
}

/**
 * At invoicing (createInvoice, same transaction): adds the « Frais de gardiennage » line (accepted: contractual,
 * clauses of the signed intake) when the fee is due, the setting is on, the order follows the Lot 4 rules, is READY,
 * has no storage line yet and the fee was not waived. Journalised.
 */
export async function addStorageFeeLineTx(tx: Prisma.TransactionClient, actor: AuditActor, workOrderId: string, now = new Date()) {
  const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, workflowLot4: true } });
  if (!wo?.workflowLot4 || wo.status !== "READY") return null;
  const fee = await orderStorageFee(tx, workOrderId, now);
  if (!fee || !fee.auto || fee.waived || fee.days <= 0 || fee.amount <= 0) return null;
  if (await tx.workOrderLine.count({ where: { workOrderId, isStorageFee: true, voidedAt: null } })) return null;
  const s = await tx.setting.findUnique({ where: { id: "garage" }, select: { defaultTaxBp: true } });
  const description = fmt(fr.v16.lot4.storage.line, { days: fee.days });
  const line = await tx.workOrderLine.create({
    data: { workOrderId, type: "LABOR", description, quantityX100: fee.days * 100, unitPrice: fee.feePerDay, taxRateBp: s?.defaultTaxBp ?? 1900, approvalStatus: "APPROVED", isStorageFee: true, position: 9999 },
    select: { id: true },
  });
  await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor?.id ?? null, type: "LINE_ADDED", data: { description, storageFee: true, days: fee.days } } });
  await audit(tx, actor, "workOrder.storageFee", "WorkOrderLine", line.id, {
    after: { workOrderId, days: fee.days, feePerDay: fee.feePerDay, amountHt: fee.amount, start: fee.start, graceHours: fee.graceHours },
  });
  return { lineId: line.id, days: fee.days, amount: fee.amount };
}

/** « Ne pas facturer le gardiennage » (permission waiveStorageFee, reason): event + journal, current ready period. */
export async function waiveStorageFee(workOrderId: string, reason: string, actor: StaffUser) {
  if (!can(actor, "waiveStorageFee")) throw new AppError("forbidden", {}, 403);
  const r = cleanReason(reason);
  if (!r) throw new AppError("reasonRequired", {}, 422);
  await prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, invoice: { select: { id: true } } } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.invoice || wo.status !== "READY") throw new AppError("locked", {}, 409);
    const fee = await orderStorageFee(tx, workOrderId);
    const e = await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { storageWaived: true, reason: r, days: fee?.days ?? 0, amount: fee?.amount ?? 0 } }, select: { id: true } });
    await audit(tx, actor, "workOrder.storageWaived", "WorkOrderEvent", e.id, { after: { workOrderId, reason: r, days: fee?.days ?? 0, amountHt: fee?.amount ?? 0 } });
  });
}

/**
 * « Client prévenu » by phone / in person while the car is ready (no SMS / e-mail configured, or the customer came
 * by): dates the notice the storage fee starts from. Permission deliverWorkOrder (the desk). Event + journal.
 */
export async function recordReadyNotice(workOrderId: string, actor: StaffUser) {
  if (!can(actor, "deliverWorkOrder")) throw new AppError("forbidden", {}, 403);
  await prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.status !== "READY") throw new AppError("transition", { from: wo.status, to: "READY" }, 409);
    const e = await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { readyNotified: true, channel: "MANUAL" } }, select: { id: true } });
    await audit(tx, actor, "workOrder.readyNotified", "WorkOrderEvent", e.id, { after: { workOrderId, channel: "MANUAL" } });
  });
}
