"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEVICE_KINDS, REASON_KINDS, validKioskPhone } from "@/lib/accueil";
import { fmt, woNumber } from "@/lib/format";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { formToObject } from "@/lib/validators";
import {
  callNext,
  callTicket,
  checkInFromTicket,
  connectCounter,
  createDevice,
  createTicket,
  moveTicket,
  recallTicket,
  renameDevice,
  revokeDevice,
  saveCounter,
  saveQueueSettings,
  saveReason,
  setTicketPriority,
  transferTicket,
} from "@/server/accueil";

/** cuid ids and the fixed ids of the starting catalogue (qr_…, qc_…). */
const id = z.string().min(1).max(64).regex(/^[\w-]+$/);
const int = (min: number, max: number) => z.preprocess((v) => String(v ?? "").replace(/\s/g, ""), z.coerce.number().int().min(min).max(max));
const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(max).nullable());
const checkbox = (v: unknown) => v === "on" || v === "true" || v === "1";

type Msg = ActionResult<{ message?: string; redirectTo?: string } | null>;

const refresh = () => {
  revalidatePath("/garage/accueil");
  revalidatePath("/garage");
};

// ── Desk ──────────────────────────────────────────────────────────────────────

export async function deskNextAction(counterId: string): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    const t = await callNext(actor, id.parse(counterId));
    const { t: d } = await getI18n();
    refresh();
    return { ok: true, data: { message: t ? fmt(d.v15.desk.called, { ticket: `${t.prefix}-${t.number}` }) : d.v15.desk.nobody } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deskCallAction(ticketId: string, counterId: string): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    const t = await callTicket(actor, id.parse(ticketId), id.parse(counterId));
    const { t: d } = await getI18n();
    refresh();
    return { ok: true, data: { message: fmt(d.v15.desk.called, { ticket: `${t.prefix}-${t.number}` }) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deskRecallAction(ticketId: string, counterId: string | null): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    const r = await recallTicket(actor, id.parse(ticketId), counterId ? id.parse(counterId) : null);
    const { t: d } = await getI18n();
    refresh();
    return { ok: true, data: { message: r === "ABSENT" ? d.v15.status.ABSENT : d.v15.status.CALLED } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deskMoveAction(ticketId: string, move: "serve" | "finish" | "absent"): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    await moveTicket(actor, id.parse(ticketId), z.enum(["serve", "finish", "absent"]).parse(move));
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deskCancelAction(ticketId: string, form: FormData): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason) throw new AppError("queueReason", {}, 422);
    await moveTicket(actor, id.parse(ticketId), "cancel", { reason: reason.slice(0, 300) });
    refresh();
    const { t } = await getI18n();
    return { ok: true, data: { message: t.v15.status.CANCELLED } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deskTransferAction(ticketId: string, form: FormData): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    await transferTicket(actor, id.parse(ticketId), id.parse(form.get("counterId")));
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deskPriorityAction(ticketId: string, priority: 0 | 1): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    await setTicketPriority(actor, id.parse(ticketId), priority === 1 ? 1 : 0);
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deskConnectAction(counterId: string | null): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    const c = await connectCounter(actor, counterId ? id.parse(counterId) : null);
    const { t } = await getI18n();
    refresh();
    return { ok: true, data: { message: c ? fmt(t.v15.done.counterConnected, { counter: c.name }) : t.v15.done.counterLeft } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deskConnectFormAction(form: FormData): Promise<Msg> {
  return deskConnectAction(String(form.get("counterId") ?? "") || null);
}

/** Ticket typed at the desk (customer who did not use the kiosk). */
export async function deskManualTicketAction(form: FormData): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    const raw = formToObject(form);
    const consent = checkbox(raw.consent);
    const phone = raw.phone?.trim() ? validKioskPhone(raw.phone) : null;
    if (raw.phone?.trim() && !phone) throw new AppError("queuePhone", {}, 422);
    if (phone && !consent) throw new AppError("queueConsent", {}, 422);
    const r = await createTicket({ reasonId: id.parse(raw.reasonId), plate: raw.plate?.trim() || null, source: "DESK", actor, phone, consent, lang: raw.lang === "ar" ? "ar" : "fr" });
    const { t } = await getI18n();
    refresh();
    return { ok: true, data: { message: fmt(t.v15.desk.created, { ticket: r.label }) } };
  } catch (error) {
    return toActionError(error);
  }
}

/** « Accueillir le RDV » from the ticket: creates the order (existing check-in) and opens it. */
export async function deskCheckInAction(ticketId: string): Promise<Msg> {
  try {
    const actor = await requirePermission("useReception");
    const wo = await checkInFromTicket(actor, id.parse(ticketId));
    const { t } = await getI18n();
    refresh();
    return { ok: true, data: { message: fmt(t.v15.desk.orderCreated, { number: woNumber(wo.number) }), redirectTo: `/garage/work-orders/${wo.id}` } };
  } catch (error) {
    return toActionError(error);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  waitWindow: int(1, 500),
  waitMinTickets: int(1, 100),
  apptWindowMin: int(0, 240),
  maxCalls: int(1, 10),
  callTimeoutSec: int(10, 3600),
  aheadThreshold: int(0, 20),
  waitAlertMin: int(1, 600),
  screenLangMode: z.enum(["ALTERNATE", "SIDE"]),
  screenTheme: z.enum(["DARK", "LIGHT"]),
  printerHost: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().regex(/^[A-Za-z0-9.-]{1,253}$/).nullable()),
  printerPort: int(1, 65535),
});

export async function saveQueueSettingsAction(form: FormData): Promise<Msg> {
  try {
    const actor = await requirePermission("configureReception");
    const raw = formToObject(form);
    const data = settingsSchema.parse(raw);
    await saveQueueSettings(actor, { ...data, fastFirst: checkbox(raw.fastFirst), screenMaskedPlate: checkbox(raw.screenMaskedPlate) });
    revalidatePath("/garage/accueil/reglages");
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

const reasonSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,20}$/),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{1,2}$/),
  nameFr: text(60),
  nameAr: optText(60),
  nameEn: optText(60),
  kind: z.enum(REASON_KINDS),
  position: int(0, 999),
});

export async function saveReasonAction(reasonId: string | null, form: FormData): Promise<Msg> {
  try {
    const actor = await requirePermission("configureReception");
    const raw = formToObject(form);
    const data = reasonSchema.parse(raw);
    await saveReason(actor, reasonId ? id.parse(reasonId) : null, { ...data, fast: checkbox(raw.fast), isActive: reasonId ? checkbox(raw.isActive) : true });
    revalidatePath("/garage/accueil/reglages");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

const counterSchema = z.object({ name: text(40), nameAr: optText(40), position: int(0, 999) });

export async function saveCounterAction(counterId: string | null, form: FormData): Promise<Msg> {
  try {
    const actor = await requirePermission("configureReception");
    const raw = formToObject(form);
    const data = counterSchema.parse(raw);
    await saveCounter(actor, counterId ? id.parse(counterId) : null, { ...data, isActive: counterId ? checkbox(raw.isActive) : true });
    revalidatePath("/garage/accueil/reglages");
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

// ── Devices (Paramètres) ──────────────────────────────────────────────────────

/** Returns the token ONCE: the page builds the activation link and its QR code, then forgets it. */
export async function createDeviceAction(form: FormData): Promise<ActionResult<{ token: string; name: string }>> {
  try {
    const actor = await requirePermission("manageReceptionDevices");
    const input = z.object({ name: text(60), kind: z.enum(DEVICE_KINDS) }).parse(formToObject(form));
    const { device, token } = await createDevice(actor, input);
    revalidatePath("/garage/settings");
    return { ok: true, data: { token, name: device.name } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeDeviceAction(deviceId: string): Promise<Msg> {
  try {
    const actor = await requirePermission("manageReceptionDevices");
    await revokeDevice(actor, id.parse(deviceId));
    revalidatePath("/garage/settings");
    const { t } = await getI18n();
    return { ok: true, data: { message: t.v15.done.deviceRevoked } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function renameDeviceAction(deviceId: string, form: FormData): Promise<Msg> {
  try {
    const actor = await requirePermission("manageReceptionDevices");
    await renameDevice(actor, id.parse(deviceId), text(60).parse(form.get("name")));
    revalidatePath("/garage/settings");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
