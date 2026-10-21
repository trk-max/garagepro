"use server";

import { revalidatePath } from "next/cache";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { formToObject, id } from "@/lib/validators";
import { audit } from "@/server/audit";
import { updateAlert } from "@/server/alerts";
import { createPlan, markPlanDone, setPlanActive } from "@/server/maintenance";
import { retryNotification, runReminders } from "@/server/reminders";
import { MAINTENANCE_KINDS } from "@/server/reminders";
import { z } from "zod";

const intOpt = (max: number) => z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().int().min(1).max(max).optional());
const kmOpt = z.preprocess((v) => (v === "" || v === undefined ? undefined : String(v).replace(/\s/g, "")), z.coerce.number().int().min(0).max(5_000_000).optional());
const dayOpt = z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());

const planSchema = z.object({
  kind: z.enum(MAINTENANCE_KINDS),
  label: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(80).optional()),
  intervalDays: intOpt(3650),
  intervalKm: intOpt(500_000),
  lastDoneAt: dayOpt,
  lastDoneKm: kmOpt,
});

export async function createPlanAction(vehicleId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageMaintenance");
    const v = planSchema.parse(formToObject(form));
    await createPlan(actor, id.parse(vehicleId), { ...v, lastDoneAt: v.lastDoneAt ? new Date(`${v.lastDoneAt}T12:00:00Z`) : null });
    revalidatePath(`/garage/vehicules/${vehicleId}/entretien`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function markPlanDoneAction(planId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageMaintenance");
    const v = z.object({ doneAt: dayOpt, km: kmOpt }).parse(formToObject(form));
    const vehicleId = await markPlanDone(actor, id.parse(planId), { doneAt: v.doneAt ? new Date(`${v.doneAt}T12:00:00Z`) : new Date(), km: v.km ?? null });
    revalidatePath(`/garage/vehicules/${vehicleId}/entretien`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setPlanActiveAction(planId: string, active: boolean): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageMaintenance");
    const vehicleId = await setPlanActive(actor, id.parse(planId), active);
    revalidatePath(`/garage/vehicules/${vehicleId}/entretien`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function runRemindersAction(): Promise<ActionResult<{ message: string }>> {
  try {
    await requirePermission("manageSettings");
    const r = await runReminders();
    revalidatePath("/garage/notifications");
    return { ok: true, data: { message: r.skipped ?? `${r.queued} nouveau(x), ${r.sent} envoyé(s), ${r.failed} échec(s)` } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function retryNotificationAction(notificationId: string): Promise<ActionResult> {
  try {
    await requirePermission("viewNotifications");
    if (!(await retryNotification(id.parse(notificationId)))) throw new AppError("invalid", {}, 409);
    revalidatePath("/garage/notifications");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

const alertSchema = z.object({
  key: z.string().max(120),
  op: z.enum(["assign", "handle", "reopen", "snooze"]),
  userId: z.preprocess((v) => (v === "" ? null : v), z.string().cuid().nullable().optional()),
  days: z.coerce.number().int().min(1).max(30).optional(),
});

export async function alertAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageRepairFollowUp");
    const v = alertSchema.parse(formToObject(form));
    await updateAlert(
      actor,
      v.key,
      v.op === "assign" ? { assignTo: v.userId ?? null } : v.op === "handle" ? { handled: true } : v.op === "reopen" ? { handled: false } : { snoozeDays: v.days ?? 1 },
    );
    revalidatePath("/garage/suivi");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

const reminderSettingsSchema = z.object({
  reminderLeadDays: z.coerce.number().int().min(0).max(60),
  alertStuckDays: z.coerce.number().int().min(1).max(90),
  alertDeliveryRiskHours: z.coerce.number().int().min(1).max(168),
  tplMaintenance: z.string().trim().max(500).optional(),
  tplAppointment: z.string().trim().max(500).optional(),
  tplDelivery: z.string().trim().max(500).optional(),
});

/** Paramètres → Rappels et alertes. An empty template = the default text. */
export async function updateReminderSettingsAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    const v = reminderSettingsSchema.parse(formToObject(form));
    const data = {
      reminderLeadDays: v.reminderLeadDays,
      alertStuckDays: v.alertStuckDays,
      alertDeliveryRiskHours: v.alertDeliveryRiskHours,
      tplMaintenance: v.tplMaintenance || null,
      tplAppointment: v.tplAppointment || null,
      tplDelivery: v.tplDelivery || null,
    };
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { id: "garage" }, select: { reminderLeadDays: true, alertStuckDays: true, alertDeliveryRiskHours: true, tplMaintenance: true, tplAppointment: true, tplDelivery: true } });
      await tx.setting.upsert({ where: { id: "garage" }, update: data, create: { id: "garage", ...data } });
      await audit(tx, actor, "settings.reminders", "Setting", "garage", { before, after: data });
    });
    revalidatePath("/garage", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
