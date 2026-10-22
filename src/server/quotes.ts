import "server-only";
import type { ApprovalChannel, ApprovalDecision, Prisma, WorkOrderStatus } from "@prisma/client";
import { getBaseUrl } from "@/lib/base-url";
import { displayPlate, fmt, formatMoney } from "@/lib/format";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { fr } from "@/lib/i18n/fr";
import { prisma } from "@/lib/prisma";
import {
  AGREED_LINE,
  QUOTE_VALID_DAYS,
  approvedAmountTtc,
  buildQuoteSnapshot,
  decisionOf,
  isExpired,
  quoteNumber,
  snapshotHash,
  splitDecision,
  type QuoteSnapshot,
} from "@/lib/quote";
import type { StaffUser } from "@/lib/session";
import { audit, type AuditActor } from "@/server/audit";
import { assertCanNumberDocuments, isCloudWithHub } from "@/server/hub";
import { consumeReservations, releaseForLine, workOrderStockMove } from "@/server/parts";
import { resetQualityApproval } from "@/server/quality";
import { reserveAttempt } from "@/server/rate-limit";
import { deliverPending, queueItems, realSender, type Item, type Sender } from "@/server/reminders";

/**
 * V16 Lot 2 — versioned quote and traced agreement, line by line.
 *
 * - A quote (Quote) is a frozen copy of the PENDING lines, numbered « D2026-0001 » through Sequence (with a
 *   garage hub: on the garage PC only — sending a quote online is refused with a clear message, like invoices),
 *   fingerprinted with SHA-256 (lib/quote snapshotHash).
 * - The customer's decision (QuoteApproval) is APPEND-ONLY (database trigger, the hub sync passes): it is the
 *   proof of what was accepted, when, how and by whom. Line statuses and the quote status are derived from it
 *   and can be re-applied from it (reapplyApprovals) if a sync conflict lost them.
 * - Online with a hub, a portal decision writes only new rows + line / quote statuses: never the WorkOrder row
 *   (row-level « last write wins » would otherwise overwrite, or be overwritten by, the garage's own changes),
 *   and never the stock (Part row): both are applied at the garage on the next staff action.
 */

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;
/** Internal reason of the automatic move to QUOTE_REFUSED (never shown to the customer). */
export const CUSTOMER_REFUSED_REASON = "Devis refusé par le client";

// ── Sending (creating a version) ─────────────────────────────────────────────

export type SendQuoteOptions = {
  /** How the quote reaches the customer: PORTAL (default, + SMS / e-mail notice), PRINT, PHONE, IN_PERSON… */
  channel?: string;
  /** Queue the « devis à valider » message (default true; false when the decision is recorded at once). */
  notify?: boolean;
  /** Keep an open quote even past its validity (staff recording the customer's phone agreement). */
  allowExpired?: boolean;
};

/**
 * Creates the quote of the order's PENDING lines (or returns the open one when it already holds exactly those
 * lines). A previous quote still waiting (SENT) is SUPERSEDED. Kind SUPPLEMENT when lines were already accepted.
 * Must run inside the caller's transaction (status change, staff approval…).
 */
export async function sendQuoteTx(tx: Tx, actor: AuditActor, workOrderId: string, opts: SendQuoteOptions = {}) {
  // One sender at a time per order (two clicks cannot create two versions).
  await tx.$queryRaw`SELECT id FROM "WorkOrder" WHERE id = ${workOrderId} FOR UPDATE`;
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      number: true,
      trackingPin: true,
      customer: { select: { id: true, name: true, phone: true, email: true } },
      vehicle: { select: { id: true, plate: true, make: true, model: true } },
      lines: {
        where: { voidedAt: null },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, type: true, description: true, quantityX100: true, unitPrice: true, taxRateBp: true, priority: true, partCondition: true, approvalStatus: true, quoteId: true },
      },
    },
  });
  if (!wo) throw new AppError("notFound", {}, 404);
  const pending = wo.lines.filter((l) => l.approvalStatus === "PENDING");
  if (pending.length === 0) throw new AppError("noQuoteLines", {}, 422);

  const now = new Date();
  const open = await tx.quote.findFirst({ where: { workOrderId, status: "SENT" }, orderBy: { version: "desc" } });
  if (open && (opts.allowExpired || !isExpired(open, now))) {
    const quoted = (open.snapshot as unknown as QuoteSnapshot).lines.length;
    if (quoted === pending.length && pending.every((l) => l.quoteId === open.id)) return { quote: open, created: false, dedupeKey: null as string | null };
  }

  // Numbering: with a garage hub, only the garage PC numbers documents (no duplicate number while offline).
  if (isCloudWithHub()) throw new AppError("quoteHubOnly", {}, 409);
  assertCanNumberDocuments();
  if (open) await tx.quote.updateMany({ where: { workOrderId, status: "SENT" }, data: { status: "SUPERSEDED" } });
  const last = await tx.quote.aggregate({ where: { workOrderId }, _max: { version: true } });
  const version = (last._max.version ?? 0) + 1;
  const approved = wo.lines.filter((l) => l.approvalStatus === "APPROVED");
  const kind = approved.length ? "SUPPLEMENT" : "INITIAL";
  const year = now.getFullYear();
  const seq = await tx.sequence.upsert({ where: { key: `quote-${year}` }, create: { key: `quote-${year}`, value: 1 }, update: { value: { increment: 1 } } });
  const number = quoteNumber(year, seq.value);
  const settings = await tx.setting.findUnique({ where: { id: "garage" }, select: { stampDuty: true, garageName: true } });
  const validUntil = new Date(now.getTime() + QUOTE_VALID_DAYS * DAY);
  const snapshot = buildQuoteSnapshot({
    number,
    version,
    kind,
    workOrderNumber: wo.number,
    sentAt: now,
    validUntil,
    customer: { name: wo.customer.name, phone: wo.customer.phone },
    vehicle: { plate: wo.vehicle.plate, make: wo.vehicle.make, model: wo.vehicle.model },
    lines: pending,
    approvedLines: approved,
    stampDuty: settings?.stampDuty ?? 0,
  });
  const hash = snapshotHash(snapshot);
  const channel = opts.channel ?? "PORTAL";
  const quote = await tx.quote.create({
    data: { workOrderId, number, version, kind, validUntil, snapshot: snapshot as unknown as Prisma.InputJsonValue, snapshotHash: hash, sentAt: now, sentById: actor?.id ?? null, sentChannel: channel },
  });
  await tx.workOrderLine.updateMany({ where: { id: { in: pending.map((l) => l.id) } }, data: { quoteId: quote.id } });
  await tx.workOrderEvent.create({
    data: { workOrderId, actorId: actor?.id ?? null, type: "NOTE", data: { quoteSent: true, number, version, kind, totalTtc: snapshot.totals.totalTtc } },
  });
  await audit(tx, actor, "quote.send", "Quote", quote.id, {
    after: { workOrderId, workOrderNumber: wo.number, number, version, kind, channel, lines: pending.length, totalTtc: snapshot.totals.totalTtc, newTotalTtc: snapshot.newTotalTtc, sha256: hash, validUntil },
  });

  // « Devis à valider » / « Supplément à valider » through the reminders queue (status, error, retries, history).
  let dedupeKey: string | null = null;
  if (opts.notify !== false) {
    dedupeKey = `quote:${quote.id}`;
    const base = await getBaseUrl().catch(() => null);
    const text = fmt(kind === "SUPPLEMENT" ? fr.v16.quote.smsSupplement : fr.v16.quote.smsQuote, {
      garage: settings?.garageName ?? "",
      plate: displayPlate(wo.vehicle.plate),
      amount: formatMoney(snapshot.totals.totalTtc, "fr"),
      url: base ? `${base}/suivi?plate=${wo.vehicle.plate}` : "",
      pin: wo.trackingPin ?? "",
    });
    const item: Item = { kind: "QUOTE", dedupeKey, phone: wo.customer.phone, email: wo.customer.email, customerId: wo.customer.id, vehicleId: wo.vehicle.id, workOrderId, subject: text.split(" : ")[0] ?? text, body: text };
    await queueItems([item], realSender, tx);
  }
  return { quote, created: true, dedupeKey };
}

/** Sends what was queued for this quote, after the commit (4 s at most; the reminders task retries the rest). Never throws. */
export async function deliverQuoteNotice(dedupeKey: string | null | undefined, sender: Sender = realSender) {
  if (!dedupeKey || isCloudWithHub()) return;
  try {
    await Promise.race([deliverPending(new Date(), sender, 10, { dedupeKey }), new Promise((r) => setTimeout(r, 4000))]);
  } catch (error) {
    console.error("[quote] notice", error);
  }
}

/** « Renvoyer le devis » (manageQuotes): a new version of the pending lines while the order waits for the answer (status unchanged). */
export async function sendQuote(workOrderId: string, actor: StaffUser, opts: SendQuoteOptions = {}) {
  const r = await prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, workflowV16: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.status === "DELIVERED" || wo.status === "CLOSED" || wo.status === "CANCELLED") throw new AppError("final", {}, 409);
    if (!wo.workflowV16) throw new AppError("legacyQuote", {}, 409);
    // Only while the order waits for the answer (a supplement found during the work goes through « Devis envoyé »).
    if (wo.status !== "QUOTE_SENT" && wo.status !== "WAITING_CUSTOMER") throw new AppError("transition", { from: wo.status, to: "QUOTE_SENT" }, 409);
    await reapplyApprovals(tx, workOrderId);
    return sendQuoteTx(tx, actor, workOrderId, opts);
  });
  await deliverQuoteNotice(r.dedupeKey);
  return r.quote;
}

// ── Decision ─────────────────────────────────────────────────────────────────

export type DecisionInput = {
  workOrderId: string;
  /** The quote the customer saw (portal): refused if a newer version replaced it meanwhile. */
  quoteId?: string | null;
  approvedLineIds: string[];
  approverName: string;
  approverContact?: string | null;
  channel: ApprovalChannel;
  note?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** From the portal: an expired quote cannot be accepted any more. */
  portal?: boolean;
};

/**
 * Records the customer's decision on the open quote, in the caller's transaction: QuoteApproval (append-only),
 * line statuses, quote status, timeline event, journal. A double click records ONE decision (conditional update
 * of the quote SENT → decided, under a row lock).
 */
export async function recordDecisionTx(tx: Tx, actor: AuditActor, input: DecisionInput) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Quote" WHERE "workOrderId" = ${input.workOrderId} AND status = 'SENT' ORDER BY version DESC LIMIT 1 FOR UPDATE`;
  const quoteId = locked[0]?.id;
  if (!quoteId) throw new AppError("quoteNotPending", {}, 409);
  if (input.quoteId && input.quoteId !== quoteId) throw new AppError("quoteChanged", {}, 409);
  const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
  if (input.portal && isExpired(q)) throw new AppError("quoteExpired", {}, 409);
  const snap = q.snapshot as unknown as QuoteSnapshot;
  const ids = snap.lines.map((l) => l.id);
  const split = splitDecision(ids, input.approvedLineIds);
  if (!split) throw new AppError("invalid", {}, 422);
  // The lines must still be exactly what the customer saw (pending, not voided, on this quote).
  const lines = await tx.workOrderLine.findMany({ where: { id: { in: ids } }, select: { id: true, approvalStatus: true, voidedAt: true, quoteId: true } });
  if (lines.length !== ids.length || lines.some((l) => l.voidedAt || l.approvalStatus !== "PENDING" || l.quoteId !== q.id)) throw new AppError("quoteChanged", {}, 409);

  const decision: ApprovalDecision = decisionOf(ids.length, split.approved.length);
  const amount = approvedAmountTtc(snap, split.approved);
  const { count } = await tx.quote.updateMany({ where: { id: q.id, status: "SENT" }, data: { status: decision } });
  if (count === 0) throw new AppError("quoteNotPending", {}, 409);
  if (split.approved.length) await tx.workOrderLine.updateMany({ where: { id: { in: split.approved }, approvalStatus: "PENDING" }, data: { approvalStatus: "APPROVED" } });
  if (split.refused.length) await tx.workOrderLine.updateMany({ where: { id: { in: split.refused }, approvalStatus: "PENDING" }, data: { approvalStatus: "REFUSED" } });

  const name = input.approverName.trim().slice(0, 120);
  const approval = await tx.quoteApproval.create({
    data: {
      quoteId: q.id,
      workOrderId: input.workOrderId,
      decision,
      approvedLineIds: split.approved,
      refusedLineIds: split.refused,
      amountApprovedTtc: amount,
      approverName: name,
      approverContact: input.approverContact?.trim().slice(0, 120) || null,
      channel: input.channel,
      recordedById: actor?.id ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      note: input.note?.trim().slice(0, 1000) || null,
      quoteHash: q.snapshotHash,
    },
    select: { id: true, createdAt: true },
  });
  await tx.workOrderEvent.create({
    data: {
      workOrderId: input.workOrderId,
      actorId: actor?.id ?? null,
      type: "QUOTE_APPROVED",
      data: { quoteId: q.id, number: q.number, version: q.version, decision, amount, channel: input.channel, approved: split.approved.length, refused: split.refused.length },
      createdAt: approval.createdAt,
    },
  });
  await audit(tx, actor, "quote.decision", "QuoteApproval", approval.id, {
    before: { quote: q.number, status: "SENT" },
    after: {
      workOrderId: input.workOrderId,
      quote: q.number,
      version: q.version,
      decision,
      amountApprovedTtc: amount,
      channel: input.channel,
      approverName: name,
      approverContact: input.approverContact ?? null,
      approvedLineIds: split.approved,
      refusedLineIds: split.refused,
      quoteSha256: q.snapshotHash,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
    ip: input.ip ?? null,
  });
  return { approvalId: approval.id, decision, amount, quote: q, at: approval.createdAt };
}

/**
 * Consequences of a decision on the order: deferred parts taken out of stock (accepted lines) or released
 * (refused lines); and, when the order was waiting for the answer (QUOTE_SENT / WAITING_CUSTOMER), the move to
 * IN_PROGRESS (something accepted) or QUOTE_REFUSED (whole initial quote refused). Returns the new status.
 */
export async function applyDecisionEffects(tx: Tx, actor: AuditActor, workOrderId: string, opts: { stock: boolean; status: boolean }, at = new Date()): Promise<WorkOrderStatus | null> {
  if (opts.stock) await settleDeferredStock(tx, actor, workOrderId);
  if (!opts.status) return null;
  const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, quoteApprovedAt: true } });
  if (!wo) return null;
  const agreed = await tx.workOrderLine.count({ where: { workOrderId, ...AGREED_LINE } });
  if (wo.status !== "QUOTE_SENT" && wo.status !== "WAITING_CUSTOMER") {
    if (agreed > 0 && !wo.quoteApprovedAt) await tx.workOrder.updateMany({ where: { id: workOrderId, quoteApprovedAt: null }, data: { quoteApprovedAt: at } });
    return null;
  }
  const to: WorkOrderStatus = agreed > 0 ? "IN_PROGRESS" : "QUOTE_REFUSED";
  const { count } = await tx.workOrder.updateMany({
    where: { id: workOrderId, status: wo.status },
    data: to === "IN_PROGRESS" ? { status: to, quoteApprovedAt: at } : { status: to },
  });
  if (!count) return null;
  await resetQualityApproval(tx, workOrderId);
  const extra = to === "QUOTE_REFUSED" ? { approval: true, reason: CUSTOMER_REFUSED_REASON } : { approval: true };
  await tx.workOrderEvent.create({
    data: { workOrderId, actorId: actor?.id ?? null, type: "STATUS_CHANGED", data: { from: wo.status, to, ...extra }, createdAt: new Date(at.getTime() + 1) },
  });
  await audit(tx, actor, "workOrder.status", "WorkOrder", workOrderId, { before: { status: wo.status }, after: { status: to, ...extra } });
  return to;
}

/**
 * Parts of the order still waiting in reservation: accepted lines leave the stock now (their reservation is
 * consumed), refused lines give their reservation back. Each line once (conditional update). Called after a
 * decision, at every status change and before invoicing.
 */
export async function settleDeferredStock(tx: Tx, actor: AuditActor, workOrderId: string) {
  const lines = await tx.workOrderLine.findMany({
    where: { workOrderId, stockDeferred: true, partId: { not: null }, OR: [{ approvalStatus: "APPROVED", voidedAt: null }, { approvalStatus: "REFUSED" }] },
    select: { id: true, partId: true, quantityX100: true, approvalStatus: true },
  });
  for (const l of lines) {
    if (l.approvalStatus === "REFUSED") {
      await releaseForLine(tx, actor, l.id, "devis refusé");
      continue;
    }
    const { count } = await tx.workOrderLine.updateMany({ where: { id: l.id, stockDeferred: true }, data: { stockDeferred: false } });
    if (!count) continue;
    await consumeReservations(tx, actor, workOrderId, l.partId!, l.quantityX100, l.id);
    await workOrderStockMove(tx, actor, { partId: l.partId!, deltaX100: -l.quantityX100, reason: "WORK_ORDER", workOrderId });
  }
}

/**
 * Re-applies the recorded decisions (append-only proof) to the line and quote statuses, in case a hub sync
 * conflict (« last write wins » on a whole row) lost them. Only PENDING lines of the decided quote, and only
 * quotes still SENT: never undoes anything. Returns how many rows were fixed.
 */
export async function reapplyApprovals(tx: Tx, workOrderId: string): Promise<number> {
  const approvals = await tx.quoteApproval.findMany({
    where: { workOrderId },
    orderBy: { createdAt: "asc" },
    select: { quoteId: true, decision: true, approvedLineIds: true, refusedLineIds: true, quote: { select: { status: true } } },
  });
  let fixed = 0;
  for (const a of approvals) {
    if (a.quote.status === "SUPERSEDED") continue;
    if (a.quote.status === "SENT") fixed += (await tx.quote.updateMany({ where: { id: a.quoteId, status: "SENT" }, data: { status: a.decision } })).count;
    const ok = (await tx.workOrderLine.updateMany({ where: { id: { in: a.approvedLineIds as string[] }, quoteId: a.quoteId, approvalStatus: "PENDING" }, data: { approvalStatus: "APPROVED" } })).count;
    const no = (await tx.workOrderLine.updateMany({ where: { id: { in: a.refusedLineIds as string[] }, quoteId: a.quoteId, approvalStatus: "PENDING" }, data: { approvalStatus: "REFUSED" } })).count;
    fixed += ok + no;
  }
  return fixed;
}

/**
 * V16 rule « QUOTE_SENT / WAITING_INSURANCE → work »: the latest quote has a recorded decision and at least one
 * line is accepted. Based on QuoteApproval (append-only), so a decision synchronised from online counts even if
 * the order row itself was not updated.
 */
export async function approvalAllowsWork(tx: Tx, workOrderId: string): Promise<boolean> {
  const latest = await tx.quote.findFirst({ where: { workOrderId, status: { not: "SUPERSEDED" } }, orderBy: { version: "desc" }, select: { _count: { select: { approvals: true } } } });
  if (!latest || latest._count.approvals === 0) return false;
  return (await tx.workOrderLine.count({ where: { workOrderId, ...AGREED_LINE } })) > 0;
}

// ── Entry points ─────────────────────────────────────────────────────────────

/**
 * Phone / in-person / SMS / e-mail / WhatsApp agreement recorded by the team (permission recordQuoteApproval,
 * checked by the action: never a mechanic by default). Quotes the pending lines first when no open quote holds
 * them (order still in quote from before Lot 2, insurance, work without quote). Effects applied at once.
 */
export async function recordStaffDecision(workOrderId: string, input: Omit<DecisionInput, "workOrderId" | "portal" | "quoteId"> & { quoteId?: string | null }, actor: StaffUser) {
  if (input.channel === "PORTAL") throw new AppError("invalid", {}, 422);
  // Checked here too (not only by the action): whoever calls it, a mechanic never records an agreement by default.
  if (!can(actor, "recordQuoteApproval")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, workflowV16: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.status === "DELIVERED" || wo.status === "CLOSED" || wo.status === "CANCELLED") throw new AppError("final", {}, 409);
    if (!wo.workflowV16) throw new AppError("legacyQuote", {}, 409);
    await reapplyApprovals(tx, workOrderId);
    const sent = await sendQuoteTx(tx, actor, workOrderId, { channel: input.channel, notify: false, allowExpired: true });
    const r = await recordDecisionTx(tx, actor, { ...input, workOrderId, quoteId: input.quoteId ?? sent.quote.id, portal: false });
    const status = await applyDecisionEffects(tx, actor, workOrderId, { stock: true, status: true }, r.at);
    return { ...r, status };
  });
}

/** Portal: per order, at most this many decisions per hour (on top of the portal session). */
const MAX_DECISIONS_PER_HOUR = 10;

/**
 * The customer's decision on the portal (session checked by the action): accepted lines, the rest refused,
 * name typed, IP and browser kept. Online with a garage hub, only new rows and line / quote statuses are written
 * (see the file comment); the garage applies the rest.
 */
export async function recordPortalDecision(
  workOrderId: string,
  input: { quoteId: string; approvedLineIds: string[]; approverName: string; ip?: string | null; userAgent?: string | null },
) {
  if (!(await reserveAttempt([{ key: `quote:${workOrderId}`, max: MAX_DECISIONS_PER_HOUR }], 60, false))) throw new AppError("tooMany", {}, 429);
  const name = input.approverName.trim();
  if (name.length < 2) throw new AppError("approverNameRequired", {}, 422);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, workflowV16: true, customer: { select: { phone: true } } } });
    if (!wo || !wo.workflowV16 || (wo.status !== "QUOTE_SENT" && wo.status !== "WAITING_CUSTOMER")) throw new AppError("quoteNotPending", {}, 409);
    const r = await recordDecisionTx(tx, null, { ...input, workOrderId, approverName: name, approverContact: wo.customer.phone, channel: "PORTAL", portal: true });
    const garage = !isCloudWithHub();
    const status = await applyDecisionEffects(tx, null, workOrderId, { stock: garage, status: garage }, r.at);
    return { ...r, status };
  });
}

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * Order page: may the work start (V16 rule), and the open quote when it holds exactly the pending lines (the
 * staff dialog then records the decision on it; otherwise the pending lines are quoted first).
 */
export async function orderQuoteState(workOrderId: string) {
  const db = prisma as unknown as Tx;
  const [allowsWork, open, pending] = await Promise.all([
    approvalAllowsWork(db, workOrderId),
    prisma.quote.findFirst({ where: { workOrderId, status: "SENT" }, orderBy: { version: "desc" }, select: { id: true, snapshot: true } }),
    prisma.workOrderLine.findMany({ where: { workOrderId, voidedAt: null, approvalStatus: "PENDING" }, select: { quoteId: true } }),
  ]);
  const holdsAll = !!open && (open.snapshot as unknown as QuoteSnapshot).lines.length === pending.length && pending.every((l) => l.quoteId === open.id);
  return { allowsWork, openQuoteId: holdsAll ? open!.id : null };
}

/** Quote history of an order (versions, decisions: who, when, channel, amount, lines) for the order page. */
export async function quoteHistory(workOrderId: string) {
  const quotes = await prisma.quote.findMany({ where: { workOrderId }, orderBy: { version: "desc" }, include: { approvals: { orderBy: { createdAt: "asc" } } } });
  const userIds = [...new Set(quotes.flatMap((q) => [q.sentById, ...q.approvals.map((a) => a.recordedById)]).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? null) : null);
  const now = new Date();
  return quotes.map((q) => ({
    id: q.id,
    number: q.number,
    version: q.version,
    kind: q.kind,
    status: q.status,
    expired: isExpired(q, now),
    validUntil: q.validUntil,
    sentAt: q.sentAt,
    sentChannel: q.sentChannel,
    sentBy: nameOf(q.sentById),
    snapshot: q.snapshot as unknown as QuoteSnapshot,
    snapshotHash: q.snapshotHash,
    // Integrity: the stored copy still gives the stored fingerprint.
    hashOk: snapshotHash(q.snapshot) === q.snapshotHash,
    approvals: q.approvals.map((a) => ({
      id: a.id,
      decision: a.decision,
      channel: a.channel,
      approverName: a.approverName,
      approverContact: a.approverContact,
      recordedBy: nameOf(a.recordedById),
      amountApprovedTtc: a.amountApprovedTtc,
      approvedLineIds: a.approvedLineIds as string[],
      refusedLineIds: a.refusedLineIds as string[],
      ip: a.ip,
      note: a.note,
      quoteHash: a.quoteHash,
      createdAt: a.createdAt,
    })),
  }));
}

export type QuoteHistory = Awaited<ReturnType<typeof quoteHistory>>;
