"use server";

import { redirect } from "next/navigation";
import { getBaseUrl } from "@/lib/base-url";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { bookingSchema, claimSchema, customerMessageSchema, feedbackSchema, formToObject, portalLoginSchema } from "@/lib/validators";
import { createClaim, createFeedback } from "@/server/claims";
import { fmt } from "@/lib/format";
import { cancelByCustomer, createAppointment, manageToken, sendBookingConfirmation } from "@/server/booking";
import { approveQuoteByCustomer, customerMessage, portalLogin } from "@/server/portal";
import { clientIp, endPortalSession, getPortalWorkOrderId } from "@/server/portal-session";
import { releaseAttempts, reserveAttempt } from "@/server/rate-limit";

type Result = ActionResult<{ redirectTo?: string; warning?: string; message?: string }>;

// ── Live repair tracker ──────────────────────────────────────────────────────

export async function portalLoginAction(form: FormData): Promise<Result> {
  const { t } = await getI18n();
  const parsed = portalLoginSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: t.portal.loginError };

  const outcome = await portalLogin(parsed.data.plate, parsed.data.pin);
  if (outcome === "locked") return { ok: false, error: t.portal.locked };
  if (outcome === "invalid") return { ok: false, error: t.portal.loginError };
  return { ok: true, data: { redirectTo: "/suivi/vehicule" } };
}

export async function portalLogoutAction(): Promise<void> {
  await endPortalSession();
  redirect("/");
}

async function requirePortal(): Promise<string> {
  const workOrderId = await getPortalWorkOrderId();
  if (!workOrderId) throw new AppError("notTrackable", {}, 401);
  return workOrderId;
}

export async function approveQuoteAction(): Promise<Result> {
  try {
    await approveQuoteByCustomer(await requirePortal());
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function customerMessageAction(form: FormData): Promise<Result> {
  try {
    const workOrderId = await requirePortal();
    await customerMessage(workOrderId, customerMessageSchema.parse(formToObject(form)).body);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

// ── Online booking ───────────────────────────────────────────────────────────

/** Max bookings per IP per hour (stops spam without a captcha). */
const MAX_BOOKINGS_PER_HOUR = 5;

export async function createBookingAction(form: FormData): Promise<Result> {
  try {
    const input = bookingSchema.parse(formToObject(form));
    // Links in the confirmation come from APP_URL only: checked before anything is booked.
    const baseUrl = await getBaseUrl();
    const ipKey = `book-ip:${await clientIp()}`;
    // Atomic: the booking is counted BEFORE it is created, so parallel requests cannot exceed the limit.
    const attempt = await reserveAttempt([{ key: ipKey, max: MAX_BOOKINGS_PER_HOUR }], 60, false);
    if (!attempt) throw new AppError("tooMany", {}, 429);

    let appointment: Awaited<ReturnType<typeof createAppointment>>;
    try {
      appointment = await createAppointment(input);
    } catch (error) {
      await releaseAttempts(attempt); // nothing was booked (slot taken…): does not count
      throw error;
    }

    const { t, lang } = await getI18n();
    const sent = await sendBookingConfirmation(appointment.id, { t, lang, baseUrl });
    const query = new URLSearchParams({ t: manageToken(appointment.reference), new: "1" });
    if (sent.length) query.set("sent", sent.join(","));
    return { ok: true, data: { redirectTo: `/rdv/confirmation/${appointment.reference}?${query}` } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelBookingAction(reference: string, token: string): Promise<Result> {
  try {
    await cancelByCustomer(reference, token);
    return { ok: true, data: {} };
  } catch (error) {
    if (error instanceof AppError && error.code === "forbidden") {
      const { t } = await getI18n();
      return { ok: false, error: t.booking.cancelTooLate };
    }
    return toActionError(error);
  }
}

// ── Complaints & reviews (customer site) ─────────────────────────────────────

/** Sent from the repair tracker ("fromTracker"): tied to the signed-in work order. */
async function trackerWorkOrder(form: FormData): Promise<string | null> {
  return form.get("fromTracker") === "1" ? getPortalWorkOrderId() : null;
}

export async function submitClaimAction(form: FormData): Promise<Result> {
  try {
    const { website, ...input } = claimSchema.parse(formToObject(form));
    void website; // honeypot, already checked empty by the schema
    const claim = await createClaim(input, { ip: await clientIp(), workOrderId: await trackerWorkOrder(form) });
    const { t } = await getI18n();
    return { ok: true, data: { message: fmt(t.claims.sent, { number: `REC-${String(claim.number).padStart(4, "0")}` }) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function submitFeedbackAction(form: FormData): Promise<Result> {
  try {
    const { website, ...input } = feedbackSchema.parse(formToObject(form));
    void website; // honeypot, already checked empty by the schema
    await createFeedback(input, { ip: await clientIp(), workOrderId: await trackerWorkOrder(form) });
    const { t } = await getI18n();
    return { ok: true, data: { message: t.feedback.thanks, redirectTo: form.get("fromTracker") === "1" ? "/suivi/vehicule" : undefined } };
  } catch (error) {
    return toActionError(error);
  }
}
