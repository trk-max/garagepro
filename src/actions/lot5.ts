"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/http";
import { COMEBACK_CATEGORIES, pointsFromLines } from "@/lib/lot5";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { formToObject, id } from "@/lib/validators";
import { audit } from "@/server/audit";
import { handleFeedback } from "@/server/claims";
import { dismissComeback, linkComeback, unlinkComeback } from "@/server/comebacks";
import { attachResultPhoto, completeInspection, convertResultToLine, saveResult, saveTemplate, startInspection } from "@/server/inspections";
import type { Prisma } from "@prisma/client";

/**
 * V16 Lot 5 — comeback, inspection, quality settings, low ratings. Each action checks its permission; the server
 * function checks it again (whoever calls it).
 */

type Result = ActionResult<{ redirectTo?: string }>;

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const refresh = (workOrderId?: string) => {
  revalidatePath("/garage", "layout");
  if (workOrderId) revalidatePath(`/garage/work-orders/${workOrderId}`);
};

const ok = (): Result => ({ ok: true, data: {} });
/** Template ids: cuid, or the fixed id of the default template inserted by migration 29 (« inspection-standard »). */
const templateId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// ── Comeback ─────────────────────────────────────────────────────────────────

export async function linkComebackAction(workOrderId: string, previousId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageComebacks");
    const category = z.enum(COMEBACK_CATEGORIES as [string, ...string[]]).parse(str(form, "category")) as (typeof COMEBACK_CATEGORIES)[number];
    await linkComeback(actor, id.parse(workOrderId), id.parse(previousId), category);
    refresh(workOrderId);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

export async function dismissComebackAction(workOrderId: string, previousId: string): Promise<Result> {
  try {
    const actor = await requirePermission("manageComebacks");
    await dismissComeback(actor, id.parse(workOrderId), id.parse(previousId));
    refresh(workOrderId);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

export async function unlinkComebackAction(workOrderId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageComebacks");
    await unlinkComeback(actor, id.parse(workOrderId), str(form, "reason"));
    refresh(workOrderId);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Inspection ───────────────────────────────────────────────────────────────

export async function startInspectionAction(workOrderId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("performInspection");
    await startInspection(actor, id.parse(workOrderId), templateId.parse(str(form, "templateId")));
    refresh(workOrderId);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

const colorSchema = z.enum(["GREEN", "ORANGE", "RED"]);

export async function saveResultAction(workOrderId: string, resultId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("performInspection");
    const raw = str(form, "color");
    await saveResult(actor, id.parse(resultId), { color: raw ? colorSchema.parse(raw) : null, note: str(form, "note").slice(0, 500) });
    refresh(workOrderId);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

export async function attachResultPhotoAction(workOrderId: string, resultId: string, mediaId: string): Promise<Result> {
  try {
    const actor = await requirePermission("performInspection");
    await attachResultPhoto(actor, id.parse(resultId), id.parse(mediaId));
    refresh(workOrderId);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

export async function completeInspectionAction(workOrderId: string, inspectionId: string): Promise<Result> {
  try {
    const actor = await requirePermission("performInspection");
    await completeInspection(actor, id.parse(inspectionId));
    refresh(workOrderId);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

const convertSchema = z.object({
  type: z.enum(["LABOR", "PART"]),
  description: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().positive().max(10_000),
  unitPrice: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(0).max(1_000_000).optional()),
  partId: z.preprocess((v) => (v === "" ? undefined : v), id.optional()),
});

export async function convertResultAction(workOrderId: string, resultId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageQuotes");
    const raw = formToObject(form);
    const v = convertSchema.parse({ ...raw, quantity: String(raw.quantity ?? "1").replace(",", "."), unitPrice: String(raw.unitPrice ?? "").replace(",", ".") });
    await convertResultToLine(actor, id.parse(resultId), {
      type: v.type,
      description: v.description,
      quantityX100: Math.round(v.quantity * 100),
      // Typed in DT, stored in millimes; empty = catalogue price / labour rate.
      unitPrice: v.unitPrice === undefined ? undefined : Math.round(v.unitPrice * 1000),
      partId: v.type === "PART" ? v.partId : undefined,
    });
    refresh(workOrderId);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveTemplateAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageInspections");
    await saveTemplate(actor, { id: str(form, "id") ? templateId.parse(str(form, "id")) : null, name: str(form, "name"), pointsText: str(form, "points"), isActive: form.get("isActive") === "on" });
    revalidatePath("/garage/settings");
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Quality points & follow-up settings (Paramètres › Parcours atelier) ──────

export async function saveLot5SettingsAction(form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageSettings");
    const points = pointsFromLines(str(form, "qualityPoints"));
    const data = {
      qualityPoints: points as unknown as Prisma.InputJsonValue,
      autoSatisfactionSurvey: form.get("autoSatisfactionSurvey") === "on",
      autoRefusedLineReminders: form.get("autoRefusedLineReminders") === "on",
    };
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { id: "garage" }, select: { qualityPoints: true, autoSatisfactionSurvey: true, autoRefusedLineReminders: true } });
      await tx.setting.upsert({ where: { id: "garage" }, update: data, create: { id: "garage", ...data } });
      await audit(tx, actor, "settings.lot5", "Setting", "garage", { before, after: { ...data, qualityPoints: points } });
    });
    revalidatePath("/garage/settings");
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

// ── Low ratings ──────────────────────────────────────────────────────────────

export async function handleFeedbackAction(feedbackId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("manageClaims");
    await handleFeedback(actor, id.parse(feedbackId), str(form, "note"));
    revalidatePath("/garage/reclamations");
    refresh();
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}
