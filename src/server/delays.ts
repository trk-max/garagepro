import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PromiseReason, WorkOrderStatus } from "@prisma/client";
import { getBaseUrl } from "@/lib/base-url";
import { OPEN_NEED_STATUSES, type PartsWaitDecision, notifyAllowed } from "@/lib/delays";
import { displayPlate, fmt, formatDate, formatDateTime } from "@/lib/format";
import { AppError } from "@/lib/http";
import { fr } from "@/lib/i18n/fr";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit, type AuditActor } from "@/server/audit";
import { toE164 } from "@/server/notify";
import { reserveFree } from "@/server/parts";
import { queueItems, realSender, type Item, type Sender } from "@/server/reminders";
import { ACTIVE_STATUSES } from "@/server/workflow";

/**
 * V16 Lot 3 — delays and waiting for parts.
 *
 * - Every change of a promised date (order) or of a missing part's expected date is an APPEND-ONLY
 *   PromiseRevision (database trigger, the hub sync passes): old date, new date, reason, customer told or not.
 * - The customer is told through the existing messages queue (Notification: status, error, retries, history),
 *   unless they refused automatic messages (reminderOptOut). Without a phone / e-mail / configured channel the
 *   queue records « skipped + reason »: never a fake send.
 * - Auto « attente pièces » (setting autoWaitingParts): an ACCEPTED line tied to an open missing part.
 */

type Tx = Prisma.TransactionClient;

export type RevisionInput = {
  workOrderId: string;
  /** null = the order's promised date; else the missing part whose expected date changed. */
  partNeedId?: string | null;
  /** Part name shown in the message and the timeline. */
  partLabel?: string | null;
  oldDate: Date | null;
  newDate: Date | null;
  reason: PromiseReason;
  note?: string | null;
};

/**
 * Records a date change (in the caller's transaction): PromiseRevision, customer message queued, timeline
 * event, journal. Returns the message key to deliver after the commit (null when nothing was queued).
 */
export async function recordRevisionTx(tx: Tx, actor: AuditActor, input: RevisionInput, sender: Sender = realSender) {
  const wo = await tx.workOrder.findUnique({
    where: { id: input.workOrderId },
    select: { trackingPin: true, customer: { select: { id: true, phone: true, email: true, reminderOptOut: true } }, vehicle: { select: { id: true, plate: true } } },
  });
  if (!wo) throw new AppError("notFound", {}, 404);
  const settings = await tx.setting.findUnique({ where: { id: "garage" }, select: { garageName: true, timezone: true } });
  const tz = settings?.timezone ?? undefined;
  const part = !!input.partNeedId;
  // Nothing to announce when the date is only cleared; never to a customer who refused automatic messages.
  const tell = !!input.newDate && notifyAllowed(wo.customer);
  const channels = sender.channels();
  const reachable = (channels.includes("SMS") && !!(wo.customer.phone && toE164(wo.customer.phone))) || (channels.includes("EMAIL") && !!wo.customer.email);
  const dedupeKey = tell ? `${part ? "part-date" : "promise"}:${randomUUID()}` : null;
  const note = input.note?.trim().slice(0, 500) || null;

  const rev = await tx.promiseRevision.create({
    data: {
      workOrderId: input.workOrderId,
      partNeedId: input.partNeedId ?? null,
      oldDate: input.oldDate,
      newDate: input.newDate,
      reason: input.reason,
      note,
      notified: tell && reachable,
      dedupeKey,
      createdById: actor?.id ?? null,
    },
    select: { id: true },
  });

  if (tell && dedupeKey) {
    const base = await getBaseUrl().catch(() => null);
    const t = fr.v16.lot3;
    const vars = {
      garage: settings?.garageName ?? "",
      plate: displayPlate(wo.vehicle.plate),
      url: base ? `${base}/suivi?plate=${wo.vehicle.plate}` : "",
      pin: wo.trackingPin ?? "",
    };
    const body = part
      ? fmt(t.promise.smsPart, { ...vars, part: input.partLabel ?? "", date: formatDate(input.newDate!, "fr", tz) })
      : fmt(t.promise.smsPromise, { ...vars, date: formatDateTime(input.newDate!, "fr", tz), reason: t.customerReasons[input.reason] });
    const item: Item = {
      kind: part ? "PART_DATE" : "PROMISE",
      dedupeKey,
      phone: wo.customer.phone,
      email: wo.customer.email,
      customerId: wo.customer.id,
      vehicleId: wo.vehicle.id,
      workOrderId: input.workOrderId,
      subject: `${settings?.garageName ?? ""} : ${part ? "pièce attendue" : "nouvelle date de livraison"}`,
      body,
    };
    await queueItems([item], sender, tx);
  }

  await tx.workOrderEvent.create({
    data: {
      workOrderId: input.workOrderId,
      actorId: actor?.id ?? null,
      type: "NOTE",
      data: {
        promiseRevised: true,
        revisionId: rev.id,
        ...(part ? { partNeedId: input.partNeedId!, part: input.partLabel ?? "" } : {}),
        old: input.oldDate?.toISOString() ?? null,
        new: input.newDate?.toISOString() ?? null,
        promiseReason: input.reason,
        notified: tell && reachable,
      },
    },
  });
  await audit(tx, actor, part ? "partNeed.dateRevision" : "workOrder.promiseRevision", "PromiseRevision", rev.id, {
    before: { date: input.oldDate },
    after: { workOrderId: input.workOrderId, partNeedId: input.partNeedId ?? null, date: input.newDate, reason: input.reason, note, notified: tell && reachable, optOut: wo.customer.reminderOptOut },
  });
  return { id: rev.id, dedupeKey };
}

// ── Waiting for parts ────────────────────────────────────────────────────────

/** An ACCEPTED (not voided) line of the order is tied to a missing part still expected. */
export async function acceptedLineWaitsForPart(tx: Tx, workOrderId: string): Promise<boolean> {
  const needs = await tx.workOrderPartNeed.findMany({
    where: { workOrderId, status: { in: [...OPEN_NEED_STATUSES] }, workOrderLineId: { not: null } },
    select: { workOrderLineId: true },
  });
  if (needs.length === 0) return false;
  const ids = needs.map((n) => n.workOrderLineId!);
  return (await tx.workOrderLine.count({ where: { id: { in: ids }, workOrderId, voidedAt: null, approvalStatus: "APPROVED" } })) > 0;
}

export async function autoWaitingPartsOn(tx: Tx): Promise<boolean> {
  const s = await tx.setting.findUnique({ where: { id: "garage" }, select: { autoWaitingParts: true } });
  return s?.autoWaitingParts ?? true;
}

/**
 * V16 orders, setting on: an order IN_PROGRESS whose accepted line waits for a part moves to WAITING_PARTS
 * (conditional write, timeline event marked automatic, journal). Called when a missing part is reported or
 * tied to an accepted line. Never after a manual move (the team may work on the other lines meanwhile).
 */
export async function autoWaitingPartsTx(tx: Tx, actor: AuditActor, workOrderId: string): Promise<WorkOrderStatus | null> {
  const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, workflowV16: true } });
  if (!wo?.workflowV16 || wo.status !== "IN_PROGRESS") return null;
  if (!(await autoWaitingPartsOn(tx)) || !(await acceptedLineWaitsForPart(tx, workOrderId))) return null;
  const { count } = await tx.workOrder.updateMany({ where: { id: workOrderId, status: "IN_PROGRESS" }, data: { status: "WAITING_PARTS" } });
  if (!count) return null;
  const extra = { autoParts: true };
  await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor?.id ?? null, type: "STATUS_CHANGED", data: { from: "IN_PROGRESS", to: "WAITING_PARTS", ...extra } } });
  await audit(tx, actor, "workOrder.status", "WorkOrder", workOrderId, { before: { status: "IN_PROGRESS" }, after: { status: "WAITING_PARTS", ...extra } });
  return "WAITING_PARTS";
}

/**
 * While waiting for parts: the car stays at the garage, or is handed back and the customer will return; and
 * whether the wait is the garage's doing (Lot 4: no storage fee then). Append-only (timeline event + journal).
 */
export async function recordPartsWaitDecision(actor: StaffUser, workOrderId: string, decision: PartsWaitDecision, garageCaused: boolean) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.status === "DELIVERED" || wo.status === "CLOSED" || wo.status === "CANCELLED") throw new AppError("final", {}, 409);
    const data = { partsWait: decision, garageCaused, status: wo.status };
    const e = await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data }, select: { id: true } });
    await audit(tx, actor, "workOrder.partsWaitDecision", "WorkOrderEvent", e.id, { after: { workOrderId, ...data } });
  });
}

/** Latest « keep / hand back » decision of an order (null if none). */
export async function lastPartsWaitDecision(workOrderId: string) {
  const notes = await prisma.workOrderEvent.findMany({ where: { workOrderId, type: "NOTE" }, orderBy: { createdAt: "desc" }, select: { data: true, createdAt: true }, take: 200 });
  for (const e of notes) {
    const d = (e.data ?? {}) as { partsWait?: PartsWaitDecision; garageCaused?: boolean };
    if (d.partsWait) return { decision: d.partsWait, garageCaused: d.garageCaused !== false, at: e.createdAt };
  }
  return null;
}

// ── Goods receipt → missing parts of the orders (audit n° 13, A-12) ─────────────

/**
 * A part entered the stock (goods receipt): the open missing parts of active orders for that part — those
 * tied to this purchase order first, then the oldest — become RECEIVED, the quantity is put aside for the order
 * (or completes the reservation of the quote line), and the order says « pièce reçue ». Only needs the received
 * quantity fully covers. In the receipt's transaction.
 */
export async function receivePartNeedsTx(
  tx: Tx,
  actor: StaffUser,
  input: { partId: string; quantityX100: number; purchaseOrderId?: string | null; receiptNumber: string },
) {
  const needs = await tx.workOrderPartNeed.findMany({
    where: {
      partId: input.partId,
      status: { in: [...OPEN_NEED_STATUSES] },
      workOrder: { status: { in: ACTIVE_STATUSES } },
      OR: [{ purchaseOrderId: null }, ...(input.purchaseOrderId ? [{ purchaseOrderId: input.purchaseOrderId }] : [])],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, workOrderId: true, description: true, quantityX100: true, purchaseOrderId: true, workOrderLineId: true },
  });
  const ordered = [...needs.filter((n) => n.purchaseOrderId && n.purchaseOrderId === input.purchaseOrderId), ...needs.filter((n) => !n.purchaseOrderId)];
  let left = input.quantityX100;
  const received: string[] = [];
  for (const n of ordered) {
    if (left < n.quantityX100) break;
    const now = new Date();
    const { count } = await tx.workOrderPartNeed.updateMany({
      where: { id: n.id, status: { in: [...OPEN_NEED_STATUSES] } },
      data: { status: "RECEIVED", receivedAt: now, ...(n.purchaseOrderId || !input.purchaseOrderId ? {} : { purchaseOrderId: input.purchaseOrderId }) },
    });
    if (!count) continue;
    left -= n.quantityX100;
    received.push(n.id);
    // Put the part aside for this order: the quote line's own reservation is completed (V16 part still waiting
    // for the stock exit); a part already taken out (older line) needs nothing; no line → a reservation for the order.
    const line = n.workOrderLineId
      ? await tx.workOrderLine.findFirst({ where: { id: n.workOrderLineId, workOrderId: n.workOrderId }, select: { id: true, stockDeferred: true, voidedAt: true, approvalStatus: true, quantityX100: true, partId: true } })
      : null;
    if (line && line.partId === input.partId) {
      if (line.stockDeferred && !line.voidedAt && line.approvalStatus !== "REFUSED") {
        const held = await tx.stockReservation.aggregate({ where: { workOrderLineId: line.id, status: "ACTIVE" }, _sum: { quantityX100: true } });
        await reserveFree(tx, actor, { workOrderId: n.workOrderId, partId: input.partId, lineId: line.id, quantityX100: line.quantityX100 - (held._sum.quantityX100 ?? 0) });
      }
    } else {
      await reserveFree(tx, actor, { workOrderId: n.workOrderId, partId: input.partId, quantityX100: n.quantityX100 });
    }
    await tx.workOrderEvent.create({ data: { workOrderId: n.workOrderId, actorId: actor.id, type: "NOTE", data: { partReceived: true, part: n.description, receipt: input.receiptNumber } } });
    await tx.workOrder.update({ where: { id: n.workOrderId }, data: { updatedAt: now } });
    await audit(tx, actor, "partNeed.receive", "WorkOrderPartNeed", n.id, { before: { status: "OPEN" }, after: { status: "RECEIVED", workOrderId: n.workOrderId, receipt: input.receiptNumber, purchaseOrderId: input.purchaseOrderId ?? null } });
  }
  return received;
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** Date changes of an order (promise and parts), newest first, with the real state of the customer message. */
export async function revisionHistory(workOrderId: string) {
  const revs = await prisma.promiseRevision.findMany({ where: { workOrderId }, orderBy: { createdAt: "desc" }, take: 50 });
  const keys = revs.map((r) => r.dedupeKey).filter((k): k is string => !!k);
  const userIds = [...new Set(revs.map((r) => r.createdById).filter((x): x is string => !!x))];
  const needIds = [...new Set(revs.map((r) => r.partNeedId).filter((x): x is string => !!x))];
  const [notes, users, needs] = await Promise.all([
    keys.length ? prisma.notification.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true, status: true, channel: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    needIds.length ? prisma.workOrderPartNeed.findMany({ where: { id: { in: needIds } }, select: { id: true, description: true } }) : [],
  ]);
  return revs.map((r) => ({
    ...r,
    by: users.find((u) => u.id === r.createdById)?.name ?? null,
    part: needs.find((n) => n.id === r.partNeedId)?.description ?? null,
    messages: notes.filter((n) => n.dedupeKey === r.dedupeKey).map((n) => ({ status: n.status, channel: n.channel })),
  }));
}

export type RevisionHistory = Awaited<ReturnType<typeof revisionHistory>>;
