import "server-only";
import type { ComebackCategory } from "@prisma/client";
import { AppError } from "@/lib/http";
import { COMEBACK_CATEGORIES, comebackCandidate, reworkCount } from "@/lib/lot5";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { cleanReason, isFinal } from "@/server/workflow";

/**
 * V16 Lot 5 — retour atelier (comeback). A new order of a vehicle delivered less than 30 days ago is proposed as a
 * comeback of that previous order; the team links it (category) or says it is not one. Linking makes the labour
 * added afterwards rework, not billed by default (server/work-orders.ts insertLine, lib/lot5 reworkLine).
 * Link / unlink / dismissal are journalised and recorded as events (append-only).
 */

const number = (n: number) => `OR-${String(n).padStart(4, "0")}`;

/** What the order page shows: the current link, or the suggestion (unless dismissed), and the rework counter. */
export async function comebackView(workOrderId: string) {
  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      createdAt: true,
      vehicleId: true,
      status: true,
      workflowLot5: true,
      comebackCategory: true,
      comebackLinkedAt: true,
      comebackOf: { select: { id: true, number: true, deliveredAt: true } },
      events: { where: { type: { in: ["STATUS_CHANGED", "NOTE"] } }, select: { type: true, data: true } },
    },
  });
  if (!wo) return null;
  const rework = reworkCount(wo.events);
  if (wo.comebackOf) return { linked: { ...wo.comebackOf, label: number(wo.comebackOf.number), category: wo.comebackCategory, linkedAt: wo.comebackLinkedAt }, suggestion: null, rework };
  if (!wo.workflowLot5 || isFinal(wo.status)) return { linked: null, suggestion: null, rework };
  const previous = await prisma.workOrder.findMany({
    where: { vehicleId: wo.vehicleId, id: { not: wo.id }, deliveredAt: { not: null }, status: { not: "CANCELLED" } },
    orderBy: { deliveredAt: "desc" },
    take: 5,
    select: { id: true, number: true, deliveredAt: true, complaint: true, lines: { where: { voidedAt: null, approvalStatus: "APPROVED" }, select: { description: true }, take: 4 } },
  });
  const cand = comebackCandidate(wo, previous);
  const dismissed = cand && wo.events.some((e) => e.type === "NOTE" && (e.data as { comebackDismissed?: string } | null)?.comebackDismissed === cand.id);
  return { linked: null, suggestion: cand && !dismissed ? { ...cand, label: number(cand.number) } : null, rework };
}

/** Links the order to a previous delivered order of the same vehicle (permission manageComebacks). */
export async function linkComeback(actor: StaffUser, workOrderId: string, previousId: string, category: ComebackCategory) {
  if (!can(actor, "manageComebacks")) throw new AppError("forbidden", {}, 403);
  if (!COMEBACK_CATEGORIES.includes(category)) throw new AppError("invalid", {}, 422);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true, vehicleId: true, createdAt: true, status: true, comebackOfWorkOrderId: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (isFinal(wo.status)) throw new AppError("final", {}, 409);
    const prev = await tx.workOrder.findUnique({ where: { id: previousId }, select: { id: true, vehicleId: true, deliveredAt: true, number: true } });
    if (!prev || prev.id === wo.id || prev.vehicleId !== wo.vehicleId || !prev.deliveredAt || prev.deliveredAt > wo.createdAt) throw new AppError("comebackInvalid", {}, 422);
    const now = new Date();
    const { count } = await tx.workOrder.updateMany({
      where: { id: workOrderId, comebackOfWorkOrderId: null },
      data: { comebackOfWorkOrderId: prev.id, comebackCategory: category, comebackLinkedAt: now, comebackLinkedById: actor.id },
    });
    if (count === 0) throw new AppError("comebackInvalid", {}, 409);
    const e = await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { comeback: { of: prev.id, number: prev.number, category } } }, select: { id: true } });
    await audit(tx, actor, "workOrder.comebackLink", "WorkOrder", workOrderId, { before: { comebackOfWorkOrderId: null }, after: { comebackOfWorkOrderId: prev.id, previous: number(prev.number), category, eventId: e.id } });
  });
}

/** « Ce n'est pas un retour » : the suggestion is not shown again for that previous order (event, append-only). */
export async function dismissComeback(actor: StaffUser, workOrderId: string, previousId: string) {
  if (!can(actor, "manageComebacks")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    const e = await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { comebackDismissed: previousId } }, select: { id: true } });
    await audit(tx, actor, "workOrder.comebackDismiss", "WorkOrder", workOrderId, { after: { previousId, eventId: e.id } });
  });
}

/** Removes a wrong link (reason mandatory). Lines already added keep their price (journalised). */
export async function unlinkComeback(actor: StaffUser, workOrderId: string, reason: string) {
  if (!can(actor, "manageComebacks")) throw new AppError("forbidden", {}, 403);
  const why = cleanReason(reason);
  if (!why) throw new AppError("reasonRequired", {}, 422);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, comebackOfWorkOrderId: true, comebackCategory: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (isFinal(wo.status)) throw new AppError("final", {}, 409);
    if (!wo.comebackOfWorkOrderId) return;
    await tx.workOrder.update({ where: { id: workOrderId }, data: { comebackOfWorkOrderId: null, comebackCategory: null, comebackLinkedAt: null, comebackLinkedById: null } });
    await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { comebackUnlinked: wo.comebackOfWorkOrderId, reason: why } } });
    await audit(tx, actor, "workOrder.comebackUnlink", "WorkOrder", workOrderId, { before: { comebackOfWorkOrderId: wo.comebackOfWorkOrderId, category: wo.comebackCategory }, after: { comebackOfWorkOrderId: null, reason: why } });
  });
}
