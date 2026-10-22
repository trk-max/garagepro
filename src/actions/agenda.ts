"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fmt } from "@/lib/format";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { formToObject } from "@/lib/validators";
import {
  addForecastToOrder,
  addManualEvent,
  correctEvent,
  createStarterCatalogue,
  ignoreForecasts,
  recomputeForecasts,
  saveAgendaSettings,
  saveItem,
  scanDeliveredOrders,
  sendForecasts,
  validateForecasts,
} from "@/server/agenda";
import { getSettings } from "@/server/settings";

/** Ids of this feature: cuid, deterministic "fc_…" / "me_…" / "mi_…" ids. */
const anyId = z.string().min(1).max(64).regex(/^[\w-]+$/);
const ids = z.array(anyId).min(1).max(500);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kmOpt = z.preprocess((v) => (v === "" || v === undefined || v === null ? null : String(v).replace(/\s/g, "")), z.coerce.number().int().min(0).max(5_000_000).nullable());
const intOpt = (max: number) => z.preprocess((v) => (v === "" || v === undefined || v === null ? null : String(v).replace(/\s/g, "")), z.coerce.number().int().min(1).max(max).nullable());
const list = (v: unknown) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const refresh = (...paths: string[]) => {
  revalidatePath("/garage/agenda");
  for (const p of paths) revalidatePath(p);
};

/** Bulk actions of the Agenda page: validate / ignore (reason) / restore (= validate again later). */
export async function agendaBulkAction(op: "validate" | "ignore", forecastIds: string[], reason?: string): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await requirePermission("manageAgenda");
    const list = ids.parse(forecastIds);
    const { t } = await getI18n();
    if (op === "validate") {
      const n = await validateForecasts(actor, list);
      refresh();
      return { ok: true, data: { message: fmt(t.v12.done.validated, { n }) } };
    }
    const n = await ignoreForecasts(actor, list, z.string().trim().min(1).max(300).parse(reason ?? ""));
    refresh();
    return { ok: true, data: { message: fmt(t.v12.done.ignored, { n }) } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Sends the validated forecasts (never the others: checked again on the server). */
export async function sendAgendaAction(forecastIds: string[], lang: "fr" | "ar"): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await requirePermission("manageAgenda");
    const outcomes = await sendForecasts(actor, ids.parse(forecastIds), { lang: z.enum(["fr", "ar"]).parse(lang) });
    const { t } = await getI18n();
    const sent = outcomes.filter((o) => o.result === "SENT").length;
    refresh("/garage/notifications");
    return { ok: true, data: { message: fmt(t.v12.messages.summary, { sent, other: outcomes.length - sent }) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function recomputeAgendaAction(): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await requirePermission("manageAgenda");
    await scanDeliveredOrders();
    const r = await recomputeForecasts(null, new Date(), actor);
    const { t } = await getI18n();
    refresh();
    return { ok: true, data: { message: fmt(t.v12.done.recomputed, r) } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Work order page: one click adds the item's package (or part) to the quote. */
export async function addForecastToOrderAction(workOrderId: string, forecastId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageAgenda");
    if (!can(actor, "viewWorkOrders")) throw new AppError("forbidden", {}, 403);
    await addForecastToOrder(actor, anyId.parse(workOrderId), anyId.parse(forecastId));
    revalidatePath(`/garage/work-orders/${workOrderId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

const eventSchema = z.object({ itemId: anyId, doneAt: day, km: kmOpt });

export async function addManualEventAction(vehicleId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageAgenda");
    const v = eventSchema.parse(formToObject(form));
    await addManualEvent(actor, anyId.parse(vehicleId), v.itemId, { doneAt: new Date(`${v.doneAt}T12:00:00Z`), km: v.km });
    refresh(`/garage/vehicules/${vehicleId}/entretien`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function correctEventAction(eventId: string, vehicleId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageAgenda");
    const v = z.object({ doneAt: day, km: kmOpt }).parse(formToObject(form));
    await correctEvent(actor, anyId.parse(eventId), { doneAt: new Date(`${v.doneAt}T12:00:00Z`), km: v.km });
    refresh(`/garage/vehicules/${vehicleId}/entretien`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelEventAction(eventId: string, vehicleId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageAgenda");
    await correctEvent(actor, anyId.parse(eventId), { cancelReason: z.string().trim().min(1).max(300).parse(reason) });
    refresh(`/garage/vehicules/${vehicleId}/entretien`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

// ── Settings (catalogue, thresholds) ──

export async function createStarterCatalogueAction(): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await requirePermission("configureAgenda");
    const n = await createStarterCatalogue(actor);
    await scanDeliveredOrders();
    await recomputeForecasts(null);
    const { t } = await getI18n();
    refresh("/garage/agenda/reglages");
    return { ok: true, data: { message: fmt(t.v12.settings.starterDone, { n }) } };
  } catch (error) {
    return toActionError(error);
  }
}

const itemSchema = z.object({
  nameFr: z.string().trim().min(1).max(80),
  nameAr: z.string().trim().max(80).optional(),
  nameEn: z.string().trim().max(80).optional(),
  keywords: z.preprocess(list, z.array(z.string().max(60)).max(20)),
  intervalKm: intOpt(1_000_000),
  intervalMonths: intOpt(240),
  isActive: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function saveItemAction(itemId: string | null, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("configureAgenda");
    const v = itemSchema.parse(formToObject(form));
    const partIds = z.array(anyId).max(20).parse(form.getAll("partIds").filter((x) => x !== ""));
    const packageIds = z.array(anyId).max(20).parse(form.getAll("packageIds").filter((x) => x !== ""));
    await saveItem(actor, itemId ? anyId.parse(itemId) : null, { ...v, partIds, packageIds });
    refresh("/garage/agenda/reglages");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

const settingsSchema = z.object({
  agendaMinCases: z.coerce.number().int().min(2).max(100),
  agendaGoodCases: z.coerce.number().int().min(2).max(500),
  agendaLeadDays: z.coerce.number().int().min(0).max(365),
  agendaAutoSend: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  agendaAutoMinConfidence: z.enum(["LOW", "MEDIUM", "GOOD"]),
  tplAgendaFr: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(500).nullable()),
  tplAgendaAr: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().max(500).nullable()),
});

export async function saveAgendaSettingsAction(form: FormData): Promise<ActionResult<{ message: string }>> {
  try {
    const actor = await requirePermission("configureAgenda");
    const v = settingsSchema.parse(formToObject(form));
    // "Envoi automatique" (messages without validation): only an administrator may switch it on.
    const current = await getSettings();
    if (v.agendaAutoSend && !current.agendaAutoSend && !can(actor, "manageSettings")) throw new AppError("forbidden", {}, 403);
    await saveAgendaSettings(actor, v);
    const { t } = await getI18n();
    refresh("/garage/agenda/reglages");
    return { ok: true, data: { message: t.v12.settings.saved } };
  } catch (error) {
    return toActionError(error);
  }
}
