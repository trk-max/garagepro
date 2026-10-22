"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isReworkCause } from "@/lib/lot5";
import { getBaseUrl } from "@/lib/base-url";
import { displayPlate, fmt } from "@/lib/format";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { bookableServiceSchema, bookingSettingsSchema, formToObject, id, optionalId, statusSchema } from "@/lib/validators";
import {
  assignAppointmentMechanic,
  checkInAppointment,
  setAppointmentStatus,
  upsertService,
} from "@/server/booking";
import { removeMedia, setMediaVisibility } from "@/server/media";
import { notifyVehicleReady } from "@/server/customer-notifications";
import { notifyCustomerDetailed } from "@/server/notify";
import { sendEmail } from "@/server/email";
import { audit } from "@/server/audit";
import { recordReminder } from "@/server/invoices";
import { getSettings } from "@/server/settings";
import { changeStatus, regenerateTrackingPin } from "@/server/work-orders";

type Result = ActionResult<{ redirectTo?: string; warning?: string }>;

const done = (redirectTo?: string): Result => {
  revalidatePath("/garage", "layout");
  return { ok: true, data: { redirectTo } };
};

// ── Status from the mobile workshop view (+ "ready" notification) ────────────

export async function workshopStatusAction(workOrderId: string, status: string, reason?: string | null, reworkCause?: string | null): Promise<Result> {
  try {
    const actor = await requirePermission("useWorkshop");
    const woId = id.parse(workOrderId);
    const parsed = statusSchema.parse(status);
    // V16: the move's own permission is checked by changeStatus (a mechanic cannot cancel nor deliver).
    await changeStatus(woId, parsed, actor, { reason: z.string().trim().max(500).nullish().parse(reason), reworkCause: isReworkCause(reworkCause) ? reworkCause : null });
    if (parsed === "READY") await notifyVehicleReady(woId, actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

/** V16 — same, from the reason dialog (back to the workshop after the quality check…). */
export async function workshopStatusFormAction(workOrderId: string, form: FormData): Promise<Result> {
  const raw = formToObject(form);
  return workshopStatusAction(workOrderId, raw.status ?? "", raw.reason || null, raw.reworkCause || null);
}

// ── Tracking code & media ────────────────────────────────────────────────────

export async function regeneratePinAction(workOrderId: string): Promise<Result> {
  try {
    await requirePermission("manageTracking");
    await regenerateTrackingPin(id.parse(workOrderId));
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

/** Sends the tracking link + code by SMS/e-mail when a channel is configured. */
export async function sendTrackingAction(workOrderId: string): Promise<Result> {
  try {
    await requirePermission("manageTracking");
    const [wo, settings, { t }, baseUrl] = await Promise.all([
      prisma.workOrder.findUnique({
        where: { id: id.parse(workOrderId) },
        select: { trackingPin: true, customer: { select: { phone: true, email: true } }, vehicle: { select: { plate: true } } },
      }),
      getSettings(),
      getI18n(),
      getBaseUrl(),
    ]);
    if (!wo?.trackingPin) throw new AppError("notFound", {}, 404);
    const text = fmt(t.booking.smsTracking, {
      garage: settings.garageName,
      plate: displayPlate(wo.vehicle.plate),
      url: `${baseUrl}/suivi?plate=${wo.vehicle.plate}`,
      pin: wo.trackingPin,
    });
    const { sent, errors } = await notifyCustomerDetailed(wo.customer, { subject: `${t.tracking.title} – ${settings.garageName}`, text, brand: settings.garageName });
    if (sent.length) return { ok: true, data: {} };
    // Show the real reason (wrong Gmail password, no e-mail on file…); the generic
    // "nothing configured" text only when nothing is configured at all.
    return { ok: false, error: errors.length ? `${errors.join(" · ")} — ${t.tracking.useWhatsapp}` : t.tracking.noChannel };
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleMediaAction(mediaId: string, visible: boolean): Promise<Result> {
  try {
    const actor = await requirePermission("uploadMedia");
    await setMediaVisibility(id.parse(mediaId), visible, actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteMediaAction(mediaId: string): Promise<Result> {
  try {
    const actor = await requirePermission("uploadMedia");
    await removeMedia(id.parse(mediaId), actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Appointments (staff) ─────────────────────────────────────────────────────

export async function checkInAppointmentAction(appointmentId: string): Promise<Result> {
  try {
    const actor = await requirePermission("manageAppointments");
    const wo = await checkInAppointment(id.parse(appointmentId), actor);
    return done(`/garage/work-orders/${wo.id}`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function appointmentStatusAction(appointmentId: string, status: "CANCELLED" | "NO_SHOW"): Promise<Result> {
  try {
    const actor = await requirePermission("manageAppointments");
    await setAppointmentStatus(id.parse(appointmentId), status === "NO_SHOW" ? "NO_SHOW" : "CANCELLED", actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function appointmentMechanicAction(appointmentId: string, mechanicId: string): Promise<Result> {
  try {
    const actor = await requirePermission("manageAppointments");
    await assignAppointmentMechanic(id.parse(appointmentId), optionalId.parse(mechanicId) ?? null, actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Booking settings (admin) ─────────────────────────────────────────────────

export async function updateBookingSettingsAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    const raw = formToObject(form);
    const data = bookingSettingsSchema.parse({
      ...raw,
      hours: Array.from({ length: 7 }, (_, d) => ({
        closed: raw[`closed_${d}`] === "on",
        open: raw[`open_${d}`] || "08:00",
        close: raw[`close_${d}`] || "17:00",
      })),
    });
    const openingHours = Object.fromEntries(data.hours.map((h, d) => [String(d), h.closed ? null : { open: h.open, close: h.close }]));
    const values = {
      bookingEnabled: data.bookingEnabled,
      bookingSlotMinutes: data.bookingSlotMinutes,
      bookingCapacity: data.bookingCapacity,
      bookingLeadMinutes: data.bookingLeadMinutes,
      bookingHorizonDays: data.bookingHorizonDays,
      openingHours,
    };
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({
        where: { id: "garage" },
        select: { bookingEnabled: true, bookingSlotMinutes: true, bookingCapacity: true, bookingLeadMinutes: true, bookingHorizonDays: true, openingHours: true },
      });
      await tx.setting.upsert({ where: { id: "garage" }, update: values, create: { id: "garage", openingHours } });
      await audit(tx, actor, "settings.booking", "Setting", "garage", { before, after: values });
    });
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

export async function upsertServiceAction(serviceId: string | null, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    const data = bookableServiceSchema.parse({ isActive: "false", ...formToObject(form) });
    await upsertService(serviceId ? id.parse(serviceId) : undefined, data, actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}

// ── E-mail (Resend) ──────────────────────────────────────────────────────────

export async function sendTestEmailAction(form: FormData): Promise<Result> {
  try {
    await requirePermission("manageSettings");
    const to = z.string().trim().email().parse(form.get("to"));
    const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);
    const result = await sendEmail({
      to,
      subject: t.emailSettings.testSubject,
      text: fmt(t.emailSettings.testBody, { garage: settings.garageName }),
      brand: settings.garageName,
    });
    return result.ok ? { ok: true, data: {} } : { ok: false, error: `Resend : ${result.error}` };
  } catch (error) {
    return toActionError(error);
  }
}

/** Payment reminder sent directly by e-mail (Resend) and logged in the invoice history. */
export async function sendReminderEmailAction(invoiceId: string, message: string): Promise<Result> {
  try {
    const actor = await requirePermission("sendReminder");
    const body = z.string().trim().min(1).max(1000).parse(message);
    const [invoice, settings, { t }] = await Promise.all([
      prisma.invoice.findUnique({ where: { id: id.parse(invoiceId) }, select: { number: true, customer: { select: { email: true } } } }),
      getSettings(),
      getI18n(),
    ]);
    if (!invoice) throw new AppError("notFound", {}, 404);
    if (!invoice.customer.email) throw new AppError("noEmail", {}, 422);

    const result = await sendEmail({
      to: invoice.customer.email,
      subject: fmt(t.emailSettings.reminderSubject, { number: invoice.number, garage: settings.garageName }),
      text: body,
      brand: settings.garageName,
    });
    if (!result.ok) return { ok: false, error: `Resend : ${result.error}` };
    await recordReminder(invoiceId, "EMAIL", body, actor);
    return done();
  } catch (error) {
    return toActionError(error);
  }
}
