import "server-only";
import { computeTotals, lineTotalHt, normalizePlate } from "@/lib/format";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { markAttemptsOk, reserveAttempt } from "@/server/rate-limit";
import { clientIp, isTrackable, startPortalSession } from "@/server/portal-session";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { customerSteps } from "@/server/workflow";

/** Wrong codes allowed per plate (and per IP) before a 15-minute lock. */
const MAX_FAILS_PER_PLATE = 5;
const MAX_FAILS_PER_IP = 20;
const LOCK_MINUTES = 15;

export type LoginOutcome = "ok" | "invalid" | "locked";

/**
 * Plate + 4-digit PIN login. 10 000 possible codes, so attempts are capped per
 * plate and per IP: an attacker gets 5 guesses per 15 minutes on a plate.
 */
export async function portalLogin(rawPlate: string, pin: string): Promise<LoginOutcome> {
  const plate = normalizePlate(rawPlate);
  const ip = await clientIp();
  const plateKey = `track:${plate}`;
  const ipKey = `track-ip:${ip}`;

  // Atomic: the attempt is written (as a failure) BEFORE the PIN lookup, under a
  // lock, so concurrent guesses cannot all pass the check before any is recorded.
  const attempt = await reserveAttempt(
    [
      { key: plateKey, max: MAX_FAILS_PER_PLATE },
      { key: ipKey, max: MAX_FAILS_PER_IP },
    ],
    LOCK_MINUTES,
    true,
  );
  if (!attempt) return "locked";

  const wo = /^\d{4}$/.test(pin)
    ? await prisma.workOrder.findFirst({
        where: { trackingPin: pin, vehicle: { plate } },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, deliveredAt: true },
      })
    : null;

  const ok = !!wo && isTrackable(wo);
  if (!ok || !wo) return "invalid";

  await markAttemptsOk(attempt);
  await startPortalSession(wo.id, pin);
  return "ok";
}

/**
 * Timeline events the customer may see. MEDIA_ADDED events carry the photo's
 * caption, so they are kept only when that photo is still visible to the
 * customer: hidden (internal) or deleted photos leave no trace in the portal.
 */
export function customerVisibleEvents<E extends { type: string; data: unknown }>(events: E[], visibleMediaIds: Iterable<string>): E[] {
  const visible = new Set(visibleMediaIds);
  return events.filter((e) => {
    if (e.type !== "MEDIA_ADDED") return true;
    const mediaId = (e.data as { mediaId?: unknown } | null)?.mediaId;
    return typeof mediaId === "string" && visible.has(mediaId);
  });
}

/**
 * V16 — internal data never sent to the customer: the reason of a status change (cancel, refused quote,
 * back to the workshop, delivery override…) and the override details stay for the team only.
 */
const INTERNAL_EVENT_KEYS = ["reason", "override", "block", "balanceDue", "approval", "auto", "voided"];
export function customerEventData(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([k]) => !INTERNAL_EVENT_KEYS.includes(k)));
}

/** Everything the customer page shows — and nothing internal (no notes, no costs, no staff e-mails). */
export async function getTrackingView(workOrderId: string, lang = "fr") {
  const [wo, settings, skillView] = await Promise.all([
    prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        number: true,
        status: true,
        complaint: true,
        promisedAt: true,
        quoteApprovedAt: true,
        mileageIn: true,
        updatedAt: true,
        vehicle: { select: { plate: true, make: true, model: true, year: true, color: true } },
        customer: { select: { name: true } },
        mechanic: { select: { name: true } },
        // V16: voided lines are not part of the work any more.
        lines: { where: { voidedAt: null }, orderBy: { position: "asc" }, select: { type: true, description: true, quantityX100: true, unitPrice: true, taxRateBp: true } },
        media: {
          where: { visibleToCustomer: true },
          orderBy: { createdAt: "desc" },
          select: { id: true, kind: true, caption: true, createdAt: true },
        },
        events: {
          where: { type: { in: ["CREATED", "STATUS_CHANGED", "QUOTE_APPROVED", "CUSTOMER_MESSAGE", "MEDIA_ADDED"] } },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: { id: true, type: true, data: true, body: true, createdAt: true },
        },
        invoice: { select: { number: true, totalTtc: true, paidAmount: true } },
      },
    }),
    getSettings(),
    // V14: public skill labels only (setting), never a name nor a level; an apprentice's name is hidden.
    import("@/server/skills").then((m) => m.customerSkillView(workOrderId, lang)).catch(() => ({ labels: [] as string[], hideMechanic: true })),
  ]);
  if (!wo) return null;

  // A "photo added" event shows its caption: keep it only while that photo is visible to the customer.
  const events = customerVisibleEvents(wo.events, wo.media.map((m) => m.id)).map((e) => ({ ...e, data: customerEventData(e.data) }));

  const everWaitedForParts =
    wo.status === "WAITING_PARTS" ||
    wo.events.some((e) => e.type === "STATUS_CHANGED" && (e.data as { to?: string } | null)?.to === "WAITING_PARTS");

  const quotePending = wo.status === "QUOTE_SENT" && !wo.quoteApprovedAt && wo.lines.length > 0;
  const totals = computeTotals(wo.lines, settings.stampDuty);

  return {
    ...wo,
    events,
    // Mechanic's first name only, for privacy.
    mechanicName: skillView.hideMechanic ? null : (wo.mechanic?.name.split(/\s+/)[0] ?? null),
    skillLabels: skillView.labels,
    mechanicAssigned: !!wo.mechanic,
    // Never the full name (privacy): only the first name above, or nothing for an apprentice.
    mechanic: null,
    stepper: customerSteps(wo.status, everWaitedForParts),
    quote: quotePending
      ? { lines: wo.lines.map((l) => ({ ...l, totalHt: lineTotalHt(l) })), totals }
      : null,
    garage: { name: settings.garageName, phone: settings.phone, address: settings.address },
  };
}

export type TrackingView = NonNullable<Awaited<ReturnType<typeof getTrackingView>>>;

/**
 * Customer approves the quote from the portal → the repair starts.
 * V16: conditional write (a double click records ONE approval, audit n° 7) and journalised with the
 * customer's IP address and browser.
 */
export async function approveQuoteByCustomer(workOrderId: string, from: { ip?: string | null; userAgent?: string | null } = {}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, quoteApprovedAt: true, lines: { where: { voidedAt: null }, select: { quantityX100: true, unitPrice: true, taxRateBp: true } } } });
    if (!wo || wo.status !== "QUOTE_SENT" || wo.quoteApprovedAt) throw new AppError("quoteNotPending", {}, 409);
    const now = new Date();
    const { count } = await tx.workOrder.updateMany({ where: { id: workOrderId, status: "QUOTE_SENT", quoteApprovedAt: null }, data: { status: "IN_PROGRESS", quoteApprovedAt: now } });
    if (count === 0) throw new AppError("quoteNotPending", {}, 409);
    await tx.workOrderEvent.createMany({
      data: [
        { workOrderId, type: "QUOTE_APPROVED", createdAt: now },
        { workOrderId, type: "STATUS_CHANGED", data: { from: "QUOTE_SENT", to: "IN_PROGRESS", approval: true }, createdAt: new Date(now.getTime() + 1) },
      ],
    });
    const settings = await tx.setting.findUnique({ where: { id: "garage" }, select: { stampDuty: true } });
    await audit(tx, null, "workOrder.quoteApprovedByCustomer", "WorkOrder", workOrderId, {
      before: { status: "QUOTE_SENT" },
      after: { status: "IN_PROGRESS", channel: "PORTAL", totalTtc: computeTotals(wo.lines, settings?.stampDuty ?? 0).totalTtc, userAgent: from.userAgent?.slice(0, 300) ?? null },
      ip: from.ip ?? null,
    });
  });
}

/** Message from the portal; appears in the work order timeline for the team. */
export async function customerMessage(workOrderId: string, body: string, from: { ip?: string | null } = {}): Promise<void> {
  const key = `msg:${workOrderId}`;
  if (!(await reserveAttempt([{ key, max: 10 }], 60, false))) throw new AppError("tooMany", {}, 429);
  await prisma.$transaction(async (tx) => {
    const e = await tx.workOrderEvent.create({ data: { workOrderId, type: "CUSTOMER_MESSAGE", body }, select: { id: true } });
    await tx.workOrder.update({ where: { id: workOrderId }, data: { updatedAt: new Date() } });
    // V16: journalised like every customer action (who = the customer, through the portal).
    await audit(tx, null, "workOrder.customerMessage", "WorkOrderEvent", e.id, { after: { workOrderId, body }, ip: from.ip ?? null });
  });
}
