import "server-only";
import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import type { Prisma, QueueSetting, QueueTicket } from "@prisma/client";
import {
  callOutcome,
  computeStats,
  escposTicket,
  estimateWait,
  maskPlate,
  numberFromCounter,
  OPEN_STATUSES,
  orderQueue,
  peopleAhead,
  priorityGroup,
  queueMessage,
  ticketLabel,
  type DeviceKind,
  type NumberSide,
  type PriorityGroup,
  type TicketStatus,
} from "@/lib/accueil";
import { getBaseUrl } from "@/lib/base-url";
import { dayKey, startOfGarageDay } from "@/lib/dashboard-series";
import { formatTime, normalizePlate } from "@/lib/format";
import { AppError, isUniqueViolation } from "@/lib/http";
import { can } from "@/lib/permissions";
import { stateAfter } from "@/lib/timeclock";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit, type AuditActor } from "@/server/audit";
import { isCloudWithHub, isHubLocal } from "@/server/hub";
import { deliverPending, queueItems, realSender, type Item, type Sender } from "@/server/reminders";
import { getSettings } from "@/server/settings";
import { QR_TOKEN } from "@/server/vehicle-qr";

/**
 * V15 — file d'attente de l'accueil.
 *
 * - Numbering: per garage day and per prefix, from the shared counter table "Sequence" (one atomic
 *   INSERT … ON CONFLICT … RETURNING: two kiosks at the same time never get the same number) plus a
 *   unique index (day, prefix, number). With a garage hub: odd numbers on the garage PC, even online.
 * - "Suivant" / "Appeler": a ticket is taken by a CONDITIONAL update (status still WAITING); if another
 *   counter took it a millisecond before, the update changes nothing and the next ticket is tried.
 *   Two counters can never call the same ticket.
 * - Every desk action is checked here on the server (permission useReception) and written to the
 *   audit journal in the same transaction.
 * - The public screen and the tracking page only ever receive: ticket number, short reason, counter,
 *   waiting time; at most a MASKED plate (option). Never a name, a phone or a full plate.
 * - Messages to the customer only with the consent given at the kiosk; queued in the existing
 *   Notification table (retried when the garage is offline; with a hub, only the hub sends).
 */

type Db = Prisma.TransactionClient | typeof prisma;

const forbid = (actor: StaffUser, perm: Parameters<typeof can>[1]) => {
  if (!can(actor, perm)) throw new AppError("forbidden", {}, 403);
};

// ── Settings, catalogue, counters ─────────────────────────────────────────────

export async function getQueueSettings(db: Db = prisma): Promise<QueueSetting> {
  const s = await db.queueSetting.findUnique({ where: { id: "garage" } });
  return s ?? db.queueSetting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
}

export async function listReasons(includeInactive = false) {
  return prisma.queueReason.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ position: "asc" }, { nameFr: "asc" }] });
}

export async function listCounters(includeInactive = false) {
  return prisma.queueCounter.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ position: "asc" }, { name: "asc" }] });
}

export type ReasonInput = { code: string; prefix: string; nameFr: string; nameAr: string | null; nameEn: string | null; kind: string; fast: boolean; isActive: boolean; position: number };

export async function saveReason(actor: StaffUser, id: string | null, data: ReasonInput) {
  forbid(actor, "configureReception");
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.queueReason.findUnique({ where: { id } }) : null;
    if (id && !before) throw new AppError("notFound", {}, 404);
    const row = id ? await tx.queueReason.update({ where: { id }, data }) : await tx.queueReason.create({ data });
    await audit(tx, actor, id ? "queue.reasonUpdate" : "queue.reasonCreate", "QueueReason", row.id, { before, after: row });
    return row;
  });
}

export type CounterInput = { name: string; nameAr: string | null; isActive: boolean; position: number };

export async function saveCounter(actor: StaffUser, id: string | null, data: CounterInput) {
  forbid(actor, "configureReception");
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.queueCounter.findUnique({ where: { id } }) : null;
    if (id && !before) throw new AppError("notFound", {}, 404);
    const row = id ? await tx.queueCounter.update({ where: { id }, data: { ...data, ...(data.isActive ? {} : { userId: null, userSince: null }) } }) : await tx.queueCounter.create({ data });
    await audit(tx, actor, id ? "queue.counterUpdate" : "queue.counterCreate", "QueueCounter", row.id, { before, after: row });
    return row;
  });
}

export type QueueSettingsInput = Omit<QueueSetting, "id" | "updatedAt">;

export async function saveQueueSettings(actor: StaffUser, data: QueueSettingsInput) {
  forbid(actor, "configureReception");
  return prisma.$transaction(async (tx) => {
    const before = await getQueueSettings(tx);
    const after = await tx.queueSetting.update({ where: { id: "garage" }, data });
    await audit(tx, actor, "queue.settings", "QueueSetting", "garage", { before, after });
    return after;
  });
}

/** The signed-in employee takes a counter (and leaves any other); null = leaves their counter. */
export async function connectCounter(actor: StaffUser, counterId: string | null, now = new Date()) {
  forbid(actor, "useReception");
  return prisma.$transaction(async (tx) => {
    await tx.queueCounter.updateMany({ where: { userId: actor.id, ...(counterId ? { id: { not: counterId } } : {}) }, data: { userId: null, userSince: null } });
    if (!counterId) return null;
    const c = await tx.queueCounter.findUnique({ where: { id: counterId } });
    if (!c || !c.isActive) throw new AppError("notFound", {}, 404);
    await tx.queueCounter.update({ where: { id: counterId }, data: { userId: actor.id, userSince: now } });
    await audit(tx, actor, "queue.counterConnect", "QueueCounter", counterId, { before: { userId: c.userId }, after: { userId: actor.id } });
    return c;
  });
}

export async function myCounter(userId: string) {
  return prisma.queueCounter.findFirst({ where: { userId, isActive: true } });
}

// ── Devices (kiosk tablet, waiting-room TV) ───────────────────────────────────

export const DEVICE_COOKIE = "gp_queue_device";
export const DEVICE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function listDevices() {
  return prisma.queueDevice.findMany({ orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }] });
}

/** Creates a device; the token is returned ONCE (only its hash is stored). */
export async function createDevice(actor: StaffUser, input: { name: string; kind: DeviceKind }) {
  forbid(actor, "manageReceptionDevices");
  const token = randomBytes(32).toString("base64url");
  const device = await prisma.$transaction(async (tx) => {
    const d = await tx.queueDevice.create({ data: { name: input.name, kind: input.kind, tokenHash: hashToken(token), createdById: actor.id } });
    await audit(tx, actor, "queue.deviceCreate", "QueueDevice", d.id, { after: { name: d.name, kind: d.kind } });
    return d;
  });
  return { device, token };
}

export async function renameDevice(actor: StaffUser, id: string, name: string) {
  forbid(actor, "manageReceptionDevices");
  return prisma.$transaction(async (tx) => {
    const d = await tx.queueDevice.findUnique({ where: { id } });
    if (!d) throw new AppError("notFound", {}, 404);
    await tx.queueDevice.update({ where: { id }, data: { name } });
    await audit(tx, actor, "queue.deviceRename", "QueueDevice", id, { before: { name: d.name }, after: { name } });
  });
}

/** Revoked at once: the next request of that tablet / TV is refused. */
export async function revokeDevice(actor: StaffUser, id: string, now = new Date()) {
  forbid(actor, "manageReceptionDevices");
  return prisma.$transaction(async (tx) => {
    const d = await tx.queueDevice.findUnique({ where: { id } });
    if (!d) throw new AppError("notFound", {}, 404);
    if (d.revokedAt) return;
    await tx.queueDevice.update({ where: { id }, data: { revokedAt: now, revokedById: actor.id } });
    await audit(tx, actor, "queue.deviceRevoke", "QueueDevice", id, { before: { name: d.name, kind: d.kind, active: true }, after: { active: false } });
  });
}

export type QueueDeviceRef = { id: string; name: string; kind: DeviceKind };

/** Device for a token, or null (unknown, revoked, or not the expected kind). */
export async function resolveDevice(token: string | null | undefined, kind: DeviceKind, now = new Date()): Promise<QueueDeviceRef | null> {
  if (!token || !DEVICE_TOKEN.test(token)) return null;
  const d = await prisma.queueDevice.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!d || d.revokedAt || d.kind !== kind) return null;
  // "Last seen" written at most every 5 minutes (the screen asks every few seconds).
  if (!d.lastSeenAt || now.getTime() - d.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.queueDevice.updateMany({ where: { id: d.id, revokedAt: null }, data: { lastSeenAt: now } }).catch(() => undefined);
  }
  return { id: d.id, name: d.name, kind: d.kind as DeviceKind };
}

/** Kind of a valid token (activation link: decides where to go). */
export async function deviceKindFor(token: string): Promise<DeviceKind | null> {
  if (!DEVICE_TOKEN.test(token)) return null;
  const d = await prisma.queueDevice.findUnique({ where: { tokenHash: hashToken(token) }, select: { kind: true, revokedAt: true } });
  return d && !d.revokedAt ? (d.kind as DeviceKind) : null;
}

// ── Numbering ─────────────────────────────────────────────────────────────────

export function numberSide(): NumberSide {
  if (isHubLocal()) return "odd";
  if (isCloudWithHub()) return "even";
  return "single";
}

/** Atomic per-day counter (row lock of INSERT … ON CONFLICT DO UPDATE). */
async function nextCounter(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`INSERT INTO "Sequence" ("key", "value") VALUES (${key}, 1) ON CONFLICT ("key") DO UPDATE SET "value" = "Sequence"."value" + 1 RETURNING "value"`;
  return Number(rows[0]!.value);
}

// ── Ticket creation (kiosk or desk) ───────────────────────────────────────────

const newTrackToken = () => randomBytes(18).toString("base64url");

/** Today's appointment of this plate / vehicle (still to check in), closest to now. */
async function todaysAppointment(now: Date, timeZone: string, match: { plate: string | null; vehicleId: string | null }) {
  if (!match.plate && !match.vehicleId) return null;
  const from = startOfGarageDay(now, timeZone);
  const to = new Date(from.getTime() + 86_400_000);
  const list = await prisma.appointment.findMany({
    where: { status: "CONFIRMED", startAt: { gte: from, lt: to }, OR: [...(match.plate ? [{ plate: match.plate }] : []), ...(match.vehicleId ? [{ vehicleId: match.vehicleId }] : [])] },
    select: { id: true, startAt: true, customerId: true, vehicleId: true },
  });
  list.sort((a, b) => Math.abs(a.startAt.getTime() - now.getTime()) - Math.abs(b.startAt.getTime() - now.getTime()));
  return list[0] ?? null;
}

export type NewTicketInput = {
  reasonId: string;
  plate?: string | null;
  /** Vehicle QR scanned at the kiosk: the token of /v/<token>, or the whole link. */
  qr?: string | null;
  lang?: string;
  source: "KIOSK" | "DESK";
  device?: QueueDeviceRef | null;
  actor?: StaffUser | null;
  phone?: string | null;
  consent?: boolean;
};

export async function createTicket(input: NewTicketInput, now = new Date()) {
  if (input.source === "DESK") {
    if (!input.actor) throw new AppError("forbidden", {}, 401);
    forbid(input.actor, "useReception");
  } else if (!input.device || input.device.kind !== "KIOSK") throw new AppError("forbidden", {}, 401);

  const [settings, reason] = await Promise.all([getSettings(), prisma.queueReason.findUnique({ where: { id: input.reasonId } })]);
  if (!reason || !reason.isActive) throw new AppError("notFound", {}, 404);

  // Vehicle: from the QR (token or /v/<token> link), else from the plate.
  let vehicle: { id: string; plate: string; customerId: string } | null = null;
  const qr = input.qr?.trim().split("/v/").pop()?.split(/[?#]/)[0] ?? "";
  if (qr && QR_TOKEN.test(qr)) vehicle = await prisma.vehicle.findUnique({ where: { qrToken: qr }, select: { id: true, plate: true, customerId: true } });
  const typed = input.plate ? normalizePlate(input.plate) : "";
  const plate = vehicle?.plate ?? (typed.length >= 2 ? typed.slice(0, 20) : null);
  if (!vehicle && plate) vehicle = await prisma.vehicle.findUnique({ where: { plate }, select: { id: true, plate: true, customerId: true } });
  const appt = await todaysAppointment(now, settings.timezone, { plate, vehicleId: vehicle?.id ?? null });

  const day = dayKey(now, settings.timezone);
  const side = numberSide();
  const lang = input.lang === "ar" || input.lang === "en" ? input.lang : "fr";
  const phone = input.consent && input.phone ? input.phone : null;

  // A number already used (e.g. the hub was switched on during the day: the odd/even counter starts again)
  // is refused by the unique index (day, prefix, number): the counter moves on and the ticket is retried.
  const create = () => prisma.$transaction(async (tx) => {
    const n = await nextCounter(tx, `queue:${day}:${reason.prefix}${side === "single" ? "" : `:${side}`}`);
    const number = numberFromCounter(n, side);
    const t = await tx.queueTicket.create({
      data: {
        day,
        prefix: reason.prefix,
        number,
        reasonId: reason.id,
        reasonKind: reason.kind,
        plate,
        vehicleId: vehicle?.id ?? appt?.vehicleId ?? null,
        customerId: vehicle?.customerId ?? appt?.customerId ?? null,
        appointmentId: appt?.id ?? null,
        apptAt: appt?.startAt ?? null,
        source: input.source,
        deviceId: input.device?.id ?? null,
        userId: input.actor?.id ?? null,
        lang,
        phone,
        notifyConsent: !!phone,
        consentAt: phone ? now : null,
        trackToken: newTrackToken(),
        takenAt: now,
      },
    });
    const who: AuditActor = input.actor ?? (input.device ? { id: `device:${input.device.id}`, name: input.device.name } : null);
    await audit(tx, who, "queue.ticketCreate", "QueueTicket", t.id, {
      after: { ticket: ticketLabel(t.prefix, t.number), reason: reason.code, source: t.source, withPlate: !!plate, appointment: !!appt, consent: !!phone },
    });
    return t;
  });
  let ticket: QueueTicket | null = null;
  for (let attempt = 0; !ticket; attempt++) {
    try {
      ticket = await create();
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 20) throw error;
    }
  }
  return { ticket, reason, appointment: appt ? { startAt: appt.startAt } : null, label: ticketLabel(ticket.prefix, ticket.number) };
}

/**
 * Phone for the « c'est votre tour » message, typed at the kiosk right after taking the ticket.
 * Refused without explicit consent; only by the kiosk that printed the ticket, within 15 minutes.
 */
export async function setTicketPhone(device: QueueDeviceRef, trackToken: string, phone: string, consent: boolean, now = new Date()) {
  if (device.kind !== "KIOSK") throw new AppError("forbidden", {}, 401);
  if (!consent) throw new AppError("queueConsent", {}, 422);
  return prisma.$transaction(async (tx) => {
    const t = await tx.queueTicket.findUnique({ where: { trackToken } });
    if (!t || t.deviceId !== device.id || now.getTime() - t.takenAt.getTime() > 15 * 60_000 || !OPEN_STATUSES.includes(t.status as TicketStatus)) throw new AppError("notFound", {}, 404);
    await tx.queueTicket.update({ where: { id: t.id }, data: { phone, notifyConsent: true, consentAt: now } });
    await audit(tx, { id: `device:${device.id}`, name: device.name }, "queue.consent", "QueueTicket", t.id, { after: { ticket: ticketLabel(t.prefix, t.number), consent: true } });
  });
}

// ── Reading the queue ─────────────────────────────────────────────────────────

type ReasonLite = { id: string; nameFr: string; nameAr: string | null; nameEn: string | null; fast: boolean; prefix: string; kind: string };

async function todayContext(now: Date) {
  const [settings, qs, reasons] = await Promise.all([getSettings(), getQueueSettings(), prisma.queueReason.findMany({ select: { id: true, nameFr: true, nameAr: true, nameEn: true, fast: true, prefix: true, kind: true, isActive: true, position: true } })]);
  return { tz: settings.timezone, day: dayKey(now, settings.timezone), qs, reasons: new Map(reasons.map((r) => [r.id, r])), garage: settings };
}

/** Waiting tickets of the day, in the order "Suivant" will call them. */
async function waitingOrdered(now: Date, ctx: Awaited<ReturnType<typeof todayContext>>) {
  const rows = await prisma.queueTicket.findMany({ where: { day: ctx.day, status: "WAITING" } });
  const rules = { apptWindowMin: ctx.qs.apptWindowMin, fastFirst: ctx.qs.fastFirst };
  return orderQueue(rows.map((t) => ({ ...t, reasonFast: ctx.reasons.get(t.reasonId)?.fast ?? false })), now, rules);
}

/**
 * Called tickets whose last call is unanswered: after `maxCalls` calls and the delay → ABSENT
 * (never deleted; the desk can call an absent again). Idempotent, safe to run from any reader.
 */
export async function sweepAbsents(now = new Date()) {
  const qs = await getQueueSettings();
  const cut = new Date(now.getTime() - qs.callTimeoutSec * 1000);
  const due = await prisma.queueTicket.findMany({ where: { status: "CALLED", callCount: { gte: qs.maxCalls }, calledAt: { lte: cut } }, select: { id: true, prefix: true, number: true, callCount: true, calledAt: true, status: true } });
  let n = 0;
  for (const t of due) {
    if (callOutcome(t, now, qs) !== "ABSENT") continue;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.queueTicket.updateMany({ where: { id: t.id, status: "CALLED", callCount: t.callCount }, data: { status: "ABSENT", absentAt: now } });
      if (count === 1) {
        n++;
        await audit(tx, null, "queue.absent", "QueueTicket", t.id, { before: { status: "CALLED", calls: t.callCount }, after: { status: "ABSENT", ticket: ticketLabel(t.prefix, t.number), auto: true } });
      }
    });
  }
  return n;
}

/** Real average wait per reason (last N called tickets of the reason, all days), null = not enough tickets. */
async function waitsByReason(ctx: Awaited<ReturnType<typeof todayContext>>) {
  const window = Math.max(1, ctx.qs.waitWindow);
  const out = new Map<string, number | null>();
  await Promise.all(
    [...ctx.reasons.values()].map(async (r) => {
      const samples = await prisma.queueTicket.findMany({ where: { reasonId: r.id, calledAt: { not: null } }, orderBy: { calledAt: "desc" }, take: window, select: { takenAt: true, calledAt: true } });
      out.set(r.id, estimateWait(samples, { window, min: ctx.qs.waitMinTickets }));
    }),
  );
  return out;
}

const counterNames = async () => new Map((await prisma.queueCounter.findMany({ select: { id: true, name: true, nameAr: true } })).map((c) => [c.id, c]));

export type PublicCall = { key: string; label: string; status: "CALLED" | "SERVING"; counter: { fr: string; ar: string }; reason: { fr: string; ar: string }; plate: string | null; calledAt: string };
export type PublicWaiting = { label: string; reason: { fr: string; ar: string }; group: PriorityGroup };
export type PublicScreen = {
  garage: string;
  now: string;
  calls: PublicCall[];
  waiting: PublicWaiting[];
  waitingCount: number;
  waits: { reasonId: string; name: { fr: string; ar: string }; minutes: number | null }[];
  langMode: "ALTERNATE" | "SIDE";
  theme: "DARK" | "LIGHT";
};

const names = (r: Pick<ReasonLite, "nameFr" | "nameAr"> | undefined) => ({ fr: r?.nameFr ?? "—", ar: r?.nameAr || r?.nameFr || "—" });

/**
 * What the waiting-room TV shows. Built from an explicit list of fields: ticket number, short
 * reason, counter, priority group, optional MASKED plate. No name, no phone, no full plate.
 */
export async function publicScreenState(now = new Date()): Promise<PublicScreen> {
  await sweepAbsents(now);
  const ctx = await todayContext(now);
  const [open, waiting, waits, counters] = await Promise.all([
    prisma.queueTicket.findMany({ where: { day: ctx.day, status: { in: ["CALLED", "SERVING"] } }, orderBy: { calledAt: "desc" }, take: 8 }),
    waitingOrdered(now, ctx),
    waitsByReason(ctx),
    counterNames(),
  ]);
  const rules = { apptWindowMin: ctx.qs.apptWindowMin, fastFirst: ctx.qs.fastFirst };
  return {
    garage: ctx.garage.garageName,
    now: now.toISOString(),
    calls: open.map((t) => {
      const c = t.counterId ? counters.get(t.counterId) : undefined;
      return {
        key: `${t.prefix}${t.number}:${t.callCount}:${t.calledAt?.getTime() ?? 0}:${t.counterId ?? ""}`,
        label: ticketLabel(t.prefix, t.number),
        status: t.status as "CALLED" | "SERVING",
        counter: { fr: c?.name ?? "—", ar: c?.nameAr || c?.name || "—" },
        reason: names(ctx.reasons.get(t.reasonId)),
        plate: ctx.qs.screenMaskedPlate ? maskPlate(t.plate) : null,
        calledAt: (t.calledAt ?? now).toISOString(),
      };
    }),
    waiting: waiting.slice(0, 12).map((t) => ({ label: ticketLabel(t.prefix, t.number), reason: names(ctx.reasons.get(t.reasonId)), group: priorityGroup(t, now, rules) })),
    waitingCount: waiting.length,
    waits: [...ctx.reasons.values()].filter((r) => r.isActive).sort((a, b) => a.position - b.position).map((r) => ({ reasonId: r.id, name: names(r), minutes: waits.get(r.id) ?? null })),
    langMode: ctx.qs.screenLangMode === "SIDE" ? "SIDE" : "ALTERNATE",
    theme: ctx.qs.screenTheme === "LIGHT" ? "LIGHT" : "DARK",
  };
}

/** Light public tracking page of ONE ticket (link in the SMS / on the kiosk): no personal data. */
export async function trackState(trackToken: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{24}$/.test(trackToken)) return null;
  const t = await prisma.queueTicket.findUnique({ where: { trackToken } });
  if (!t) return null;
  const ctx = await todayContext(now);
  const reason = ctx.reasons.get(t.reasonId);
  let ahead: number | null = null;
  if (t.status === "WAITING" && t.day === ctx.day) ahead = peopleAhead(await waitingOrdered(now, ctx), t.id);
  const counter = t.counterId ? await prisma.queueCounter.findUnique({ where: { id: t.counterId }, select: { name: true, nameAr: true } }) : null;
  const wait = t.status === "WAITING" ? (await waitsByReason(ctx)).get(t.reasonId) ?? null : null;
  return {
    label: ticketLabel(t.prefix, t.number),
    status: t.status as TicketStatus,
    reason: { fr: reason?.nameFr ?? "—", ar: reason?.nameAr || reason?.nameFr || "—", en: reason?.nameEn || reason?.nameFr || "—" },
    ahead,
    counter: counter ? { fr: counter.name, ar: counter.nameAr || counter.name } : null,
    waitMinutes: wait,
    takenAt: t.takenAt.toISOString(),
    garage: ctx.garage.garageName,
  };
}

/** Kiosk answer after taking a ticket: number, reason, estimated wait, people before, appointment time. */
export async function kioskTicketView(ticketId: string, now = new Date()) {
  const t = await prisma.queueTicket.findUniqueOrThrow({ where: { id: ticketId } });
  const ctx = await todayContext(now);
  const ordered = await waitingOrdered(now, ctx);
  const wait = (await waitsByReason(ctx)).get(t.reasonId) ?? null;
  return {
    label: ticketLabel(t.prefix, t.number),
    trackToken: t.trackToken,
    ahead: peopleAhead(ordered, t.id),
    waitMinutes: wait,
    appointmentTime: t.apptAt ? formatTime(t.apptAt, "fr", ctx.tz) : null,
  };
}

/** Version of the queue (desk / screen pollers): anything changed today. */
export async function queueVersion(now = new Date()): Promise<string> {
  const settings = await getSettings();
  const day = dayKey(now, settings.timezone);
  const [agg, qs, counters] = await Promise.all([
    prisma.queueTicket.aggregate({ where: { day }, _max: { updatedAt: true }, _count: { _all: true } }),
    getQueueSettings(),
    prisma.queueCounter.aggregate({ _max: { updatedAt: true } }),
  ]);
  return `${day}:${agg._count._all}:${agg._max.updatedAt?.getTime() ?? 0}:${qs.updatedAt.getTime()}:${counters._max.updatedAt?.getTime() ?? 0}`;
}

// ── Desk actions ──────────────────────────────────────────────────────────────

export type NotifyOptions = { sender?: Sender; now?: Date };

async function activeCounter(db: Db, counterId: string) {
  const c = await db.queueCounter.findUnique({ where: { id: counterId } });
  if (!c || !c.isActive) throw new AppError("notFound", {}, 404);
  return c;
}

async function ticketOr404(db: Db, id: string) {
  const t = await db.queueTicket.findUnique({ where: { id } });
  if (!t) throw new AppError("notFound", {}, 404);
  return t;
}

const labelOf = (t: Pick<QueueTicket, "prefix" | "number">) => ticketLabel(t.prefix, t.number);

/** A counter must first say what happened to the customer it called (present / absent) before the next one. */
async function assertCounterFree(db: Db, counterId: string) {
  const current = await db.queueTicket.findFirst({ where: { counterId, status: "CALLED" }, select: { prefix: true, number: true } });
  if (current) throw new AppError("queueCounterBusy", { ticket: labelOf(current) }, 409);
}

/** The customer being served at this counter is done when the counter calls the next one. */
async function closeServing(tx: Prisma.TransactionClient, actor: StaffUser, counterId: string, now: Date) {
  const serving = await tx.queueTicket.findMany({ where: { counterId, status: "SERVING" } });
  for (const s of serving) {
    const { count } = await tx.queueTicket.updateMany({ where: { id: s.id, status: "SERVING" }, data: { status: "DONE", doneAt: now } });
    if (count) await audit(tx, actor, "queue.finish", "QueueTicket", s.id, { before: { status: "SERVING" }, after: { status: "DONE", ticket: labelOf(s), auto: true } });
  }
}

/**
 * « Suivant » : calls the first waiting ticket in priority order to this counter. The ticket is
 * taken with a conditional update (still WAITING) — if another counter took it first, the next
 * candidate is tried. Returns null when nobody is waiting.
 */
export async function callNext(actor: StaffUser, counterId: string, opts: NotifyOptions = {}) {
  forbid(actor, "useReception");
  const now = opts.now ?? new Date();
  const counter = await activeCounter(prisma, counterId);
  await assertCounterFree(prisma, counterId);
  await sweepAbsents(now);
  const ctx = await todayContext(now);
  for (let round = 0; round < 3; round++) {
    const candidates = await waitingOrdered(now, ctx);
    if (candidates.length === 0) return null;
    for (const next of candidates) {
      const taken = await prisma.$transaction(async (tx) => {
        const { count } = await tx.queueTicket.updateMany({
          where: { id: next.id, status: "WAITING" },
          data: { status: "CALLED", counterId, userId: actor.id, calledAt: now, callCount: 1 },
        });
        if (count !== 1) return false;
        await closeServing(tx, actor, counterId, now);
        await audit(tx, actor, "queue.next", "QueueTicket", next.id, { before: { status: "WAITING" }, after: { status: "CALLED", ticket: labelOf(next), counter: counter.name } });
        return true;
      });
      if (taken) {
        await notifyAfterCall([next.id], opts);
        return ticketOr404(prisma, next.id);
      }
    }
  }
  throw new AppError("queueBusy", {}, 409);
}

/** « Appeler » a chosen waiting ticket (out of order, e.g. the person is in front of the desk). */
export async function callTicket(actor: StaffUser, ticketId: string, counterId: string, opts: NotifyOptions = {}) {
  forbid(actor, "useReception");
  const now = opts.now ?? new Date();
  const counter = await activeCounter(prisma, counterId);
  await assertCounterFree(prisma, counterId);
  await prisma.$transaction(async (tx) => {
    const t = await ticketOr404(tx, ticketId);
    const { count } = await tx.queueTicket.updateMany({ where: { id: ticketId, status: "WAITING" }, data: { status: "CALLED", counterId, userId: actor.id, calledAt: now, callCount: 1 } });
    if (count !== 1) throw new AppError("queueTaken", { ticket: labelOf(t) }, 409);
    await closeServing(tx, actor, counterId, now);
    await audit(tx, actor, "queue.call", "QueueTicket", ticketId, { before: { status: "WAITING" }, after: { status: "CALLED", ticket: labelOf(t), counter: counter.name } });
  });
  await notifyAfterCall([ticketId], opts);
  return ticketOr404(prisma, ticketId);
}

/**
 * « Rappeler » : a called ticket nobody answered (after the delay) — or an ABSENT one the desk
 * wants to call again (counts restart at 1). The `maxCalls`-th unanswered call leads to ABSENT.
 */
export async function recallTicket(actor: StaffUser, ticketId: string, counterId: string | null, opts: NotifyOptions = {}) {
  forbid(actor, "useReception");
  const now = opts.now ?? new Date();
  const qs = await getQueueSettings();
  const result = await prisma.$transaction(async (tx) => {
    const t = await ticketOr404(tx, ticketId);
    if (t.status === "ABSENT") {
      const target = counterId ?? t.counterId;
      if (!target) throw new AppError("invalid", {}, 422);
      await activeCounter(tx, target);
      const { count } = await tx.queueTicket.updateMany({ where: { id: ticketId, status: "ABSENT" }, data: { status: "CALLED", counterId: target, userId: actor.id, calledAt: now, callCount: 1, absentAt: null } });
      if (count !== 1) throw new AppError("queueTaken", { ticket: labelOf(t) }, 409);
      await audit(tx, actor, "queue.recallAbsent", "QueueTicket", ticketId, { before: { status: "ABSENT" }, after: { status: "CALLED", ticket: labelOf(t) } });
      return "CALLED" as const;
    }
    const outcome = callOutcome(t, now, qs);
    if (outcome === "WAIT") throw new AppError("queueTooSoon", { s: qs.callTimeoutSec }, 409);
    if (outcome === "ABSENT") {
      const { count } = await tx.queueTicket.updateMany({ where: { id: ticketId, status: "CALLED", callCount: t.callCount }, data: { status: "ABSENT", absentAt: now } });
      if (count === 1) await audit(tx, actor, "queue.absent", "QueueTicket", ticketId, { before: { status: "CALLED", calls: t.callCount }, after: { status: "ABSENT", ticket: labelOf(t) } });
      return "ABSENT" as const;
    }
    if (outcome !== "RECALL") throw new AppError("invalid", {}, 409);
    const { count } = await tx.queueTicket.updateMany({ where: { id: ticketId, status: "CALLED", callCount: t.callCount }, data: { callCount: t.callCount + 1, calledAt: now, userId: actor.id } });
    if (count !== 1) throw new AppError("queueTaken", { ticket: labelOf(t) }, 409);
    await audit(tx, actor, "queue.recall", "QueueTicket", ticketId, { before: { calls: t.callCount }, after: { calls: t.callCount + 1, ticket: labelOf(t) } });
    return "CALLED" as const;
  });
  if (result === "CALLED") await notifyAfterCall([ticketId], opts);
  return result;
}

type Move = { from: TicketStatus[]; to: TicketStatus; action: string; stamp: "servingAt" | "doneAt" | "absentAt" | "cancelledAt" };
const MOVES = {
  serve: { from: ["CALLED"], to: "SERVING", action: "queue.serve", stamp: "servingAt" },
  finish: { from: ["CALLED", "SERVING"], to: "DONE", action: "queue.finish", stamp: "doneAt" },
  absent: { from: ["CALLED"], to: "ABSENT", action: "queue.absent", stamp: "absentAt" },
  cancel: { from: ["WAITING", "CALLED", "ABSENT"], to: "CANCELLED", action: "queue.cancel", stamp: "cancelledAt" },
} satisfies Record<string, Move>;

/** « Client présent » (serve), « Terminer », « Absent », « Annuler » (reason required). */
export async function moveTicket(actor: StaffUser, ticketId: string, move: keyof typeof MOVES, opts: { now?: Date; reason?: string } = {}) {
  forbid(actor, "useReception");
  const now = opts.now ?? new Date();
  const m: Move = MOVES[move];
  if (move === "cancel" && !opts.reason?.trim()) throw new AppError("queueReason", {}, 422);
  return prisma.$transaction(async (tx) => {
    const t = await ticketOr404(tx, ticketId);
    const { count } = await tx.queueTicket.updateMany({
      where: { id: ticketId, status: { in: m.from } },
      data: { status: m.to, [m.stamp]: now, ...(move === "cancel" ? { cancelReason: opts.reason!.trim().slice(0, 300) } : {}) },
    });
    if (count !== 1) throw new AppError("queueTaken", { ticket: labelOf(t) }, 409);
    // Link the work order created at the desk for this vehicle (check-in opened from the ticket).
    if (move === "finish" && !t.workOrderId && t.vehicleId && t.calledAt) {
      const wo = await tx.workOrder.findFirst({ where: { vehicleId: t.vehicleId, createdAt: { gte: t.calledAt } }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (wo) await tx.queueTicket.update({ where: { id: ticketId }, data: { workOrderId: wo.id } });
    }
    await audit(tx, actor, m.action, "QueueTicket", ticketId, { before: { status: t.status }, after: { status: m.to, ticket: labelOf(t), ...(move === "cancel" ? { reason: opts.reason } : {}) } });
  });
}

/** « Transférer » to another counter: the ticket is called again there (shown on the screen). */
export async function transferTicket(actor: StaffUser, ticketId: string, counterId: string, opts: NotifyOptions = {}) {
  forbid(actor, "useReception");
  const now = opts.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    const t = await ticketOr404(tx, ticketId);
    const target = await activeCounter(tx, counterId);
    if (t.counterId === counterId) throw new AppError("invalid", {}, 422);
    const from = t.counterId ? await tx.queueCounter.findUnique({ where: { id: t.counterId }, select: { name: true } }) : null;
    const { count } = await tx.queueTicket.updateMany({
      where: { id: ticketId, status: { in: ["WAITING", "CALLED", "SERVING"] } },
      data: { status: "CALLED", counterId, calledAt: now, callCount: 1, servingAt: null },
    });
    if (count !== 1) throw new AppError("queueTaken", { ticket: labelOf(t) }, 409);
    await audit(tx, actor, "queue.transfer", "QueueTicket", ticketId, { before: { status: t.status, counter: from?.name ?? null }, after: { status: "CALLED", counter: target.name, ticket: labelOf(t) } });
  });
  await notifyAfterCall([ticketId], opts);
}

/** Puts a waiting ticket in front (1) or back in the normal order (0). */
export async function setTicketPriority(actor: StaffUser, ticketId: string, priority: 0 | 1) {
  forbid(actor, "useReception");
  return prisma.$transaction(async (tx) => {
    const t = await ticketOr404(tx, ticketId);
    const { count } = await tx.queueTicket.updateMany({ where: { id: ticketId, status: "WAITING" }, data: { priority } });
    if (count !== 1) throw new AppError("queueTaken", { ticket: labelOf(t) }, 409);
    await audit(tx, actor, "queue.priority", "QueueTicket", ticketId, { before: { priority: t.priority }, after: { priority, ticket: labelOf(t) } });
  });
}

/** Check-in of the appointment recognised at the kiosk: creates the order, links it to the ticket. */
export async function checkInFromTicket(actor: StaffUser, ticketId: string) {
  forbid(actor, "useReception");
  if (!can(actor, "manageAppointments")) throw new AppError("forbidden", {}, 403);
  const t = await ticketOr404(prisma, ticketId);
  if (!t.appointmentId) throw new AppError("invalid", {}, 422);
  const { checkInAppointment } = await import("@/server/booking");
  const wo = await checkInAppointment(t.appointmentId, actor);
  return prisma.$transaction(async (tx) => {
    const created = await tx.workOrder.findUniqueOrThrow({ where: { id: wo.id }, select: { id: true, number: true, vehicleId: true, customerId: true } });
    await tx.queueTicket.update({ where: { id: ticketId }, data: { workOrderId: wo.id, vehicleId: created.vehicleId, customerId: created.customerId } });
    await audit(tx, actor, "queue.checkIn", "QueueTicket", ticketId, { after: { ticket: labelOf(t), workOrderId: wo.id } });
    return created;
  });
}

// ── Messages to the customer (consent only) ───────────────────────────────────

async function trackLink(token: string): Promise<string | null> {
  try {
    return `${await getBaseUrl()}/accueil/t/${token}`;
  } catch {
    return null;
  }
}

/**
 * After a call: « c'est votre tour » to the called tickets, « encore N personnes » to the waiting ones
 * that just reached the threshold. Only tickets with notifyConsent and a phone. Queued in Notification
 * (deduplicated); sent now unless this is the online copy of a hub (the hub sends), retried on failure.
 */
export async function notifyAfterCall(calledIds: string[], opts: NotifyOptions = {}) {
  try {
    const now = opts.now ?? new Date();
    const sender = opts.sender ?? realSender;
    const ctx = await todayContext(now);
    const counters = await counterNames();
    const items: Item[] = [];
    const called = await prisma.queueTicket.findMany({ where: { id: { in: calledIds }, notifyConsent: true, phone: { not: null } } });
    for (const t of called) {
      const c = t.counterId ? counters.get(t.counterId) : undefined;
      const counter = t.lang === "ar" ? c?.nameAr || c?.name : c?.name;
      items.push({
        kind: "QUEUE",
        dedupeKey: `queue:${t.id}:call:${t.callCount}:${t.counterId ?? ""}`,
        phone: t.phone,
        email: null,
        customerId: t.customerId,
        vehicleId: t.vehicleId,
        subject: `${ctx.garage.garageName} : ${labelOf(t)}`,
        body: queueMessage(t.lang, "called", { garage: ctx.garage.garageName, ticket: labelOf(t), counter: counter ?? "" }),
      });
    }
    if (ctx.qs.aheadThreshold > 0) {
      const ordered = await waitingOrdered(now, ctx);
      for (const [i, t] of ordered.entries()) {
        if (i === 0 || i > ctx.qs.aheadThreshold || !t.notifyConsent || !t.phone || t.aheadNotified) continue;
        const { count } = await prisma.queueTicket.updateMany({ where: { id: t.id, aheadNotified: false }, data: { aheadNotified: true } });
        if (!count) continue;
        items.push({
          kind: "QUEUE",
          dedupeKey: `queue:${t.id}:ahead`,
          phone: t.phone,
          email: null,
          customerId: t.customerId,
          vehicleId: t.vehicleId,
          subject: `${ctx.garage.garageName} : ${labelOf(t)}`,
          body: queueMessage(t.lang, "ahead", { garage: ctx.garage.garageName, ticket: labelOf(t), n: i, url: await trackLink(t.trackToken) }),
        });
      }
    }
    if (items.length === 0) return { queued: 0 };
    const queued = await queueItems(items, sender);
    if (!isCloudWithHub()) {
      const send = deliverPending(now, sender, 50, { kind: "QUEUE", dedupeKey: { in: items.map((i) => i.dedupeKey) } });
      // Never keep the desk waiting on a slow SMS provider: what is not sent now is retried by the reminders task.
      await Promise.race([send, new Promise((r) => setTimeout(r, 4000))]);
    }
    return { queued };
  } catch (error) {
    console.error("[accueil] notification", error);
    return { queued: 0 };
  }
}

// ── Printer (optional, ESC/POS over the network) ──────────────────────────────

/** Prints the ticket on the network printer if one is set; otherwise does nothing (no error). */
export async function printTicket(device: QueueDeviceRef, trackToken: string, now = new Date()): Promise<{ printed: boolean; reason?: "noPrinter" | "error" }> {
  if (device.kind !== "KIOSK") throw new AppError("forbidden", {}, 401);
  const t = await prisma.queueTicket.findUnique({ where: { trackToken } });
  if (!t || t.deviceId !== device.id) throw new AppError("notFound", {}, 404);
  const ctx = await todayContext(now);
  if (!ctx.qs.printerHost) return { printed: false, reason: "noPrinter" };
  const wait = (await waitsByReason(ctx)).get(t.reasonId) ?? null;
  const bytes = escposTicket({
    garage: ctx.garage.garageName,
    label: labelOf(t),
    reason: ctx.reasons.get(t.reasonId)?.nameFr ?? "",
    time: formatTime(t.takenAt, "fr", ctx.tz),
    wait: wait === null ? null : `Attente estimee : ${wait} min`,
  });
  return sendToPrinter(ctx.qs.printerHost, ctx.qs.printerPort, bytes);
}

export function sendToPrinter(host: string, port: number, bytes: Uint8Array, timeoutMs = 3000): Promise<{ printed: boolean; reason?: "error" }> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok ? { printed: true } : { printed: false, reason: "error" });
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.on("error", () => done(false));
    socket.on("connect", () => socket.end(Buffer.from(bytes), () => done(true)));
  });
}

// ── Desk view, statistics, reports ────────────────────────────────────────────

export async function deskState(actor: StaffUser, now = new Date()) {
  forbid(actor, "useReception");
  await sweepAbsents(now);
  const ctx = await todayContext(now);
  const [today, waiting, waits, counters] = await Promise.all([
    prisma.queueTicket.findMany({ where: { day: ctx.day }, orderBy: { takenAt: "asc" } }),
    waitingOrdered(now, ctx),
    waitsByReason(ctx),
    prisma.queueCounter.findMany({ where: { isActive: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
  ]);
  // Who sits at each counter, and whether they are clocked in (time clock).
  const userIds = [...new Set(counters.map((c) => c.userId).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, clockEvents: { where: { voidedAt: null }, orderBy: { at: "desc" }, take: 1, select: { kind: true, at: true } } } })
    : [];
  const people = new Map(users.map((u) => [u.id, { name: u.name, clock: stateAfter(u.clockEvents[0] ?? null, now) }]));

  // Staff-only context of the tickets (plate, vehicle, customer, appointment).
  const ids = (k: "vehicleId" | "customerId" | "appointmentId" | "workOrderId") => [...new Set(today.map((t) => t[k]).filter((x): x is string => !!x))];
  const [vehicles, customers, appts, orders] = await Promise.all([
    prisma.vehicle.findMany({ where: { id: { in: ids("vehicleId") } }, select: { id: true, plate: true, make: true, model: true } }),
    prisma.customer.findMany({ where: { id: { in: ids("customerId") } }, select: { id: true, name: true } }),
    prisma.appointment.findMany({ where: { id: { in: ids("appointmentId") } }, select: { id: true, startAt: true, status: true, workOrderId: true, service: { select: { name: true } } } }),
    prisma.workOrder.findMany({ where: { id: { in: ids("workOrderId") } }, select: { id: true, number: true } }),
  ]);
  const vMap = new Map(vehicles.map((v) => [v.id, v]));
  const cMap = new Map(customers.map((c) => [c.id, c]));
  const aMap = new Map(appts.map((a) => [a.id, a]));
  const oMap = new Map(orders.map((o) => [o.id, o]));
  const rules = { apptWindowMin: ctx.qs.apptWindowMin, fastFirst: ctx.qs.fastFirst };
  const view = (t: QueueTicket) => ({
    ...t,
    label: labelOf(t),
    reason: ctx.reasons.get(t.reasonId) ?? null,
    vehicle: t.vehicleId ? vMap.get(t.vehicleId) ?? null : null,
    customer: t.customerId ? cMap.get(t.customerId) ?? null : null,
    appointment: t.appointmentId ? aMap.get(t.appointmentId) ?? null : null,
    workOrder: t.workOrderId ? oMap.get(t.workOrderId) ?? null : null,
    outcome: callOutcome(t, now, ctx.qs),
    group: t.status === "WAITING" ? priorityGroup({ ...t, reasonFast: ctx.reasons.get(t.reasonId)?.fast ?? false }, now, rules) : null,
  });
  const me = counters.find((c) => c.userId === actor.id) ?? null;
  return {
    now,
    tz: ctx.tz,
    settings: ctx.qs,
    reasons: [...ctx.reasons.values()].sort((a, b) => a.position - b.position),
    counters: counters.map((c) => ({ ...c, user: c.userId ? people.get(c.userId) ?? null : null })),
    myCounter: me,
    mine: me ? today.filter((t) => t.counterId === me.id && (t.status === "CALLED" || t.status === "SERVING")).map(view) : [],
    otherCalls: today.filter((t) => (t.status === "CALLED" || t.status === "SERVING") && (!me || t.counterId !== me.id)).map(view),
    waiting: waiting.map((t) => view(t)),
    absent: today.filter((t) => t.status === "ABSENT").map(view),
    finished: today.filter((t) => t.status === "DONE" || t.status === "CANCELLED").slice(-15).reverse().map(view),
    waits,
    stats: computeStats(today, ctx.tz),
    counterNames: new Map(counters.map((c) => [c.id, c.name])),
  };
}

/** Open invoices of the customer of a "payment" / "pick-up" ticket (cash desk). */
export async function openInvoicesFor(customerId: string) {
  return prisma.invoice.findMany({ where: { customerId, status: { in: ["ISSUED", "PARTIAL"] } }, orderBy: { issuedAt: "desc" }, take: 5, select: { id: true, number: true, totalTtc: true, paidAmount: true } });
}

/** Open work order of the vehicle (in the workshop), for the check-in link. */
export async function openOrderFor(vehicleId: string) {
  return prisma.workOrder.findFirst({ where: { vehicleId, status: { notIn: ["DELIVERED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true } });
}

export async function reportStats(from: string, to: string) {
  const settings = await getSettings();
  const rows = await prisma.queueTicket.findMany({ where: { day: { gte: from, lte: to } }, orderBy: { takenAt: "asc" } });
  return { rows, stats: computeStats(rows, settings.timezone), tz: settings.timezone };
}

/** « À traiter » : customers waiting longer than the threshold (today). */
export async function countLongWaits(now = new Date()) {
  const [settings, qs] = await Promise.all([getSettings(), getQueueSettings()]);
  return prisma.queueTicket.count({ where: { day: dayKey(now, settings.timezone), status: "WAITING", takenAt: { lt: new Date(now.getTime() - qs.waitAlertMin * 60_000) } } });
}

/** Dashboard block « Accueil ». */
export async function receptionSummary(now = new Date()) {
  const settings = await getSettings();
  const day = dayKey(now, settings.timezone);
  const [rows, longWaits] = await Promise.all([prisma.queueTicket.findMany({ where: { day }, select: { reasonId: true, status: true, takenAt: true, calledAt: true } }), countLongWaits(now)]);
  const stats = computeStats(rows, settings.timezone);
  const waiting = rows.filter((r) => r.status === "WAITING");
  const longest = waiting.length ? Math.round((now.getTime() - Math.min(...waiting.map((w) => w.takenAt.getTime()))) / 60_000) : null;
  return { total: rows.length, waiting: waiting.length, called: rows.filter((r) => r.status === "CALLED" || r.status === "SERVING").length, absent: stats.total.absent, avgWait: stats.total.avgWait, longest, longWaits };
}
