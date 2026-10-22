import "server-only";
import { audit, type AuditActor } from "@/server/audit";
import type { AppointmentStatus, Setting } from "@prisma/client";
import { availability, freeSlots, parseOpeningHours, phoneMatchNeedle, utcToZoned, zonedToUtc, addDays, type BookingRules } from "@/lib/booking";
import { fmt, formatMoney, normalizePlate, type Lang } from "@/lib/format";
import { createReference } from "@/lib/id";
import { AppError, isUniqueViolation } from "@/lib/http";
import type { Dictionary } from "@/lib/i18n/fr";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { notifyCustomer, type Channel } from "@/server/notify";
import { safeEqual, sign } from "@/server/portal-session";
import { getSettings } from "@/server/settings";
import { createWorkOrder } from "@/server/work-orders";

/** Appointments that occupy a workshop place. */
const OCCUPYING: AppointmentStatus[] = ["CONFIRMED", "CHECKED_IN"];
/** Postgres advisory-lock key serialising bookings (prevents double-booking under concurrency). */
const BOOKING_LOCK_KEY = 74_210_001;
/** Customers can cancel online until this long before the appointment. */
const CANCEL_UNTIL_MS = 2 * 60 * 60 * 1000;

export function rulesFrom(settings: Setting): BookingRules {
  return {
    timeZone: settings.timezone,
    openingHours: parseOpeningHours(settings.openingHours),
    slotMinutes: Math.max(5, settings.bookingSlotMinutes),
    capacity: Math.max(1, settings.bookingCapacity),
    leadMinutes: Math.max(0, settings.bookingLeadMinutes),
    horizonDays: Math.min(120, Math.max(1, settings.bookingHorizonDays)),
  };
}

export async function listBookableServices(includeInactive = false) {
  return prisma.bookableService.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}

async function busyBetween(from: Date, to: Date) {
  return prisma.appointment.findMany({
    where: { status: { in: OCCUPYING }, startAt: { lt: to }, endAt: { gt: from } },
    select: { startAt: true, endAt: true },
  });
}

/** Bookable days + free start times for one service (only days that have at least one slot). */
export async function serviceAvailability(serviceId: string) {
  const [settings, service] = await Promise.all([getSettings(), prisma.bookableService.findFirst({ where: { id: serviceId, isActive: true } })]);
  if (!settings.bookingEnabled) throw new AppError("bookingClosed", {}, 403);
  if (!service) throw new AppError("notFound", {}, 404);
  const rules = rulesFrom(settings);
  const now = new Date();
  const busy = await busyBetween(now, new Date(now.getTime() + (rules.horizonDays + 2) * 86_400_000));
  return { timeZone: rules.timeZone, days: availability(service.durationMin, rules, busy, now) };
}

export type BookingInput = {
  serviceId: string;
  date: string; // YYYY-MM-DD, garage time
  time: string; // HH:MM, garage time
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  plate: string;
  make?: string;
  model?: string;
  notes?: string;
};

export const manageToken = (reference: string) => sign(`appointment:${reference}`).slice(0, 22);
export const isValidManageToken = (reference: string, token: string) => safeEqual(token, manageToken(reference));

/**
 * Creates the appointment. A transaction-scoped advisory lock serialises
 * concurrent bookings, and capacity is re-checked inside it, so two customers
 * clicking the last slot at the same second cannot both get it.
 */
export async function createAppointment(input: BookingInput) {
  const settings = await getSettings();
  if (!settings.bookingEnabled) throw new AppError("bookingClosed", {}, 403);
  const rules = rulesFrom(settings);
  const service = await prisma.bookableService.findFirst({ where: { id: input.serviceId, isActive: true } });
  if (!service) throw new AppError("notFound", {}, 404);

  const startAt = zonedToUtc(input.date, input.time, rules.timeZone);
  const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
  const plate = normalizePlate(input.plate);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const appt = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_KEY}::bigint)`;

        const dayStart = zonedToUtc(input.date, "00:00", rules.timeZone);
        const busy = await tx.appointment.findMany({
          where: { status: { in: OCCUPYING }, startAt: { lt: new Date(dayStart.getTime() + 2 * 86_400_000) }, endAt: { gt: new Date(dayStart.getTime() - 86_400_000) } },
          select: { startAt: true, endAt: true },
        });
        const now = new Date();
        const lastDay = addDays(utcToZoned(now, rules.timeZone).date, rules.horizonDays);
        if (input.date > lastDay || !freeSlots(input.date, service.durationMin, rules, busy, now).includes(input.time)) {
          throw new AppError("slotTaken", {}, 409);
        }

        // Link to an existing customer file when the plate (or phone) is already known.
        const vehicle = await tx.vehicle.findUnique({ where: { plate }, select: { id: true, customerId: true } });
        // Phone match only on a full 8-digit needle: never "contains ''", which would match anyone.
        const needle = phoneMatchNeedle(input.phone);
        const customerId =
          vehicle?.customerId ??
          (needle ? (await tx.customer.findFirst({ where: { phone: { contains: needle } }, select: { id: true } }))?.id : undefined);

        return tx.appointment.create({
          data: {
            reference: createReference("RDV"),
            serviceId: service.id,
            startAt,
            endAt,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            email: input.email,
            plate,
            make: input.make,
            model: input.model,
            notes: input.notes,
            customerId,
            vehicleId: vehicle?.id,
          },
          include: { service: true },
        });
      });
      // V12: a booking naming items of the agenda (reason pre-filled from the QR / tracking page) → forecasts "booked".
      const { linkAppointment } = await import("@/server/agenda");
      await linkAppointment(appt).catch((e) => console.error("[agenda] booking link", e));
      return appt;
    } catch (error) {
      if (isUniqueViolation(error)) continue; // reference collision, try another one
      throw error;
    }
  }
  throw new AppError("generic");
}

export async function sendBookingConfirmation(
  appointmentId: string,
  ctx: { t: Dictionary; lang: Lang; baseUrl: string },
): Promise<Channel[]> {
  const [appt, settings] = await Promise.all([
    prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: { service: true } }),
    getSettings(),
  ]);
  const local = utcToZoned(appt.startAt, settings.timezone);
  const url = `${ctx.baseUrl}/rdv/confirmation/${appt.reference}?t=${manageToken(appt.reference)}`;
  const serviceName = ctx.lang === "ar" && appt.service.nameAr ? appt.service.nameAr : appt.service.name;
  const text = fmt(ctx.t.booking.smsConfirm, {
    garage: settings.garageName,
    date: local.date.split("-").reverse().join("/"),
    time: local.time,
    service: serviceName,
    ref: appt.reference,
    url,
  });
  const sent = await notifyCustomer(
    { phone: appt.phone, email: appt.email },
    { subject: fmt(ctx.t.booking.emailSubject, { garage: settings.garageName }), text, brand: settings.garageName, attachment: { filename: `${appt.reference}.ics`, content: buildIcs(appt, settings, serviceName) } },
  );
  if (sent.length) await prisma.appointment.update({ where: { id: appointmentId }, data: { confirmationSentVia: sent.join(",") } });
  return sent;
}

export async function getAppointmentByReference(reference: string) {
  return prisma.appointment.findUnique({ where: { reference }, include: { service: true } });
}

export async function cancelByCustomer(reference: string, token: string) {
  if (!isValidManageToken(reference, token)) throw new AppError("notFound", {}, 404);
  const appt = await prisma.appointment.findUnique({ where: { reference }, select: { id: true, status: true, startAt: true } });
  if (!appt || appt.status !== "CONFIRMED") throw new AppError("notFound", {}, 404);
  if (appt.startAt.getTime() - Date.now() < CANCEL_UNTIL_MS) throw new AppError("forbidden", {}, 409);
  await prisma.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
}

export const canCancelOnline = (a: { status: AppointmentStatus; startAt: Date }) =>
  a.status === "CONFIRMED" && a.startAt.getTime() - Date.now() >= CANCEL_UNTIL_MS;

/** iCalendar file so the customer can add the appointment to their phone agenda. */
export function buildIcs(
  appt: { reference: string; startAt: Date; endAt: Date; plate: string },
  settings: Pick<Setting, "garageName" | "address" | "phone">,
  serviceName: string,
): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // RFC 5545 text: escape , ; \ and every line break (CRLF, CR or LF) — a raw CR would start a new property.
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\r\n|\r|\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GaragePro//Booking//FR",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${appt.reference}@garagepro`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(appt.startAt)}`,
    `DTEND:${stamp(appt.endAt)}`,
    `SUMMARY:${esc(`${serviceName} – ${settings.garageName}`)}`,
    `DESCRIPTION:${esc(`Réf. ${appt.reference} – ${appt.plate}${settings.phone ? ` – Tél. ${settings.phone}` : ""}`)}`,
    ...(settings.address ? [`LOCATION:${esc(settings.address)}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Rendez-vous garage",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// ── Staff side ───────────────────────────────────────────────────────────────

export async function appointmentsForDay(date: string) {
  const settings = await getSettings();
  const from = zonedToUtc(date, "00:00", settings.timezone);
  const to = zonedToUtc(addDays(date, 1), "00:00", settings.timezone);
  const items = await prisma.appointment.findMany({
    where: { startAt: { gte: from, lt: to } },
    include: {
      service: { select: { name: true, nameAr: true, durationMin: true } },
      mechanic: { select: { id: true, name: true } },
      workOrder: { select: { id: true, number: true, status: true } },
    },
    orderBy: { startAt: "asc" },
  });
  return { items, timeZone: settings.timezone, capacity: settings.bookingCapacity };
}

export async function countUpcomingToday(): Promise<number> {
  const settings = await getSettings();
  const today = utcToZoned(new Date(), settings.timezone).date;
  return prisma.appointment.count({
    where: {
      status: "CONFIRMED",
      startAt: { gte: new Date(), lt: zonedToUtc(addDays(today, 1), "00:00", settings.timezone) },
    },
  });
}

/** V10: audited when an actor is given (staff actions always pass it). */
export async function assignAppointmentMechanic(id: string, mechanicId: string | null, actor: AuditActor = null) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.appointment.findUnique({ where: { id }, select: { mechanicId: true } });
    if (!before) throw new AppError("notFound", {}, 404);
    await tx.appointment.update({ where: { id }, data: { mechanicId } });
    if (actor) await audit(tx, actor, "appointment.mechanic", "Appointment", id, { before, after: { mechanicId } });
  });
}

/** Staff cancels (declines) or marks a no-show; only a CONFIRMED appointment. Audited when an actor is given. */
export async function setAppointmentStatus(id: string, status: "CANCELLED" | "NO_SHOW", actor: AuditActor = null) {
  await prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({ where: { id }, select: { status: true } });
    if (!appt || appt.status !== "CONFIRMED") throw new AppError("invalid", {}, 409);
    // Guarded update: a concurrent check-in / cancel in between makes this one fail instead of overwriting it.
    const done = await tx.appointment.updateMany({ where: { id, status: "CONFIRMED" }, data: { status, ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}) } });
    if (done.count !== 1) throw new AppError("invalid", {}, 409);
    if (actor) await audit(tx, actor, "appointment.status", "Appointment", id, { before: { status: appt.status }, after: { status } });
  });
}

/**
 * Vehicle arrives: creates (or reuses) the customer and vehicle files and opens
 * a work order pre-filled from the booking, with a fresh tracking PIN.
 */
export async function checkInAppointment(id: string, actor: StaffUser) {
  const appt = await prisma.appointment.findUnique({ where: { id }, include: { service: true } });
  if (!appt || appt.status !== "CONFIRMED") throw new AppError("invalid", {}, 409);

  const vehicle = await prisma.vehicle.findUnique({ where: { plate: appt.plate }, select: { id: true, customerId: true } });
  const customerId = vehicle?.customerId ?? appt.customerId ?? undefined;
  const fullName = `${appt.firstName} ${appt.lastName}`.trim();

  const wo = await createWorkOrder(
    {
      customerId,
      vehicleId: vehicle?.id,
      newCustomer: customerId ? undefined : { name: fullName, phone: appt.phone, email: appt.email },
      newVehicle: vehicle ? undefined : { plate: appt.plate, make: appt.make || "—", model: appt.model || "—" },
      complaint: appt.notes ? `${appt.service.name} — ${appt.notes}` : appt.service.name,
      priority: "NORMAL",
      promisedAt: appt.endAt,
      mechanicId: appt.mechanicId ?? undefined,
    },
    actor,
  );

  const created = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id }, select: { customerId: true, vehicleId: true } });
  await prisma.appointment.update({
    where: { id },
    data: { status: "CHECKED_IN", workOrderId: wo.id, customerId: created.customerId, vehicleId: created.vehicleId },
  });
  return wo;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function upsertService(
  id: string | undefined,
  data: { name: string; nameAr?: string; description?: string; descriptionAr?: string; durationMin: number; priceFrom?: number; isActive: boolean; position: number },
  actor: AuditActor,
) {
  const values = {
    ...data,
    nameAr: data.nameAr ?? null,
    description: data.description ?? null,
    descriptionAr: data.descriptionAr ?? null,
    priceFrom: data.priceFrom ?? null,
  };
  await prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.bookableService.findUnique({ where: { id } });
      if (!before) throw new AppError("notFound", {}, 404);
      await tx.bookableService.update({ where: { id }, data: values });
      await audit(tx, actor, "bookableService.update", "BookableService", id, { before, after: values });
    } else {
      const created = await tx.bookableService.create({ data: values, select: { id: true } });
      await audit(tx, actor, "bookableService.create", "BookableService", created.id, { after: values });
    }
  });
}

export function priceLabel(priceFrom: number | null, t: Dictionary, lang: Lang) {
  return priceFrom == null ? t.booking.onQuote : fmt(t.booking.priceFrom, { price: formatMoney(priceFrom, lang) });
}
