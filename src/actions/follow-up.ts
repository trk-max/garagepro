"use server";

import { revalidatePath } from "next/cache";
import { zonedToUtc } from "@/lib/booking";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { requirePermission, requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PARTS_WAIT_DECISIONS } from "@/lib/delays";
import { z } from "zod";
import { recordPartsWaitDecision } from "@/server/delays";
import { deliverQuoteNotice } from "@/server/quotes";
import { formToObject, id, insuranceSchema, laborManualSchema, partNeedSchema, partNeedUpdateSchema, qualityCheckSchema, reasonSchema } from "@/lib/validators";
import { addPartNeed, updateInsurance, updatePartNeed } from "@/server/follow-up";
import { addLaborEntry, laborSummary, startLabor, stopLabor, voidLaborEntry } from "@/server/labor";
import { approveQualityCheck, saveQualityCheck } from "@/server/quality";
import { getSettings } from "@/server/settings";
import { addLine } from "@/server/work-orders";

const refresh = (workOrderId: string) => {
  revalidatePath(`/garage/work-orders/${workOrderId}`);
  revalidatePath("/garage/atelier");
  revalidatePath("/garage/suivi");
};
const day = async (v: string | undefined) => (v ? zonedToUtc(v, "12:00", (await getSettings()).timezone) : undefined);

export async function startLaborAction(workOrderId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("logOwnLabor");
    await startLabor(actor, id.parse(workOrderId));
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function stopLaborAction(entryId: string, workOrderId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("logOwnLabor");
    await stopLabor(actor, id.parse(entryId));
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addLaborEntryAction(workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageLabor");
    const v = laborManualSchema.parse(formToObject(form));
    const tz = (await getSettings()).timezone;
    const at = (s: string) => zonedToUtc(s.slice(0, 10), s.slice(11, 16), tz);
    await addLaborEntry(actor, { workOrderId: id.parse(workOrderId), userId: v.userId, startedAt: at(v.from), endedAt: at(v.to), note: v.note });
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function voidLaborEntryAction(entryId: string, workOrderId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageLabor");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("reasonRequired", {}, 422);
    await voidLaborEntry(actor, id.parse(entryId), r.data);
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Adds the SUGGESTED labour line (the user clicks; never automatic). With several
 * mechanics, the user chooses the basis: duration of the job (elapsed) or the
 * sum of everyone's hours (person-hours).
 */
export async function addSuggestedLaborLineAction(workOrderId: string, mode: "ELAPSED" | "PERSON" = "ELAPSED"): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    const woId = id.parse(workOrderId);
    const [summary, settings] = await Promise.all([laborSummary(woId), getSettings()]);
    const basis = mode === "PERSON" ? summary.suggestedPersonX100 : summary.suggestedElapsedX100;
    const missing = basis - summary.billedX100;
    if (missing <= 0) throw new AppError("invalid", {}, 409);
    await addLine(woId, { type: "LABOR", description: "Main d'œuvre", quantityX100: missing, unitPrice: settings.laborRate }, actor);
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveQualityCheckAction(workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("fillQualityCheck");
    const v = qualityCheckSchema.parse(formToObject(form));
    await saveQualityCheck(actor, id.parse(workOrderId), { ...v, roadTest: v.roadTest ?? null });
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function approveQualityCheckAction(workOrderId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("approveQualityCheck");
    await approveQualityCheck(actor, id.parse(workOrderId));
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateInsuranceAction(workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageRepairFollowUp");
    const v = insuranceSchema.parse(formToObject(form));
    await updateInsurance(actor, id.parse(workOrderId), { ...v, insuranceRequestedAt: await day(v.insuranceRequestedAt) });
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addPartNeedAction(workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("reportMissingPart");
    const v = partNeedSchema.parse(formToObject(form));
    const r = await addPartNeed(actor, id.parse(workOrderId), {
      partId: v.partId,
      description: v.description,
      quantityX100: v.quantity,
      supplierId: v.supplierId,
      expectedAt: await day(v.expectedAt),
      note: v.note,
      workOrderLineId: v.workOrderLineId,
      dateReason: v.dateReason,
    });
    // V16 Lot 3: « pièce attendue le … » sent after the commit (never blocks; the reminders task retries).
    await deliverQuoteNotice(r.dedupeKey);
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePartNeedAction(needId: string, workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    // V16 Lot 3 (audit n° 14): follow-up managers, or whoever manages the missing parts (storekeeper).
    const actor = await requireStaff();
    if (!can(actor, "manageRepairFollowUp") && !can(actor, "managePartNeeds")) throw new AppError("forbidden", {}, 403);
    const v = partNeedUpdateSchema.parse(formToObject(form));
    const r = await updatePartNeed(actor, id.parse(needId), { status: v.status, expectedAt: (await day(v.expectedAt)) ?? null, supplierId: v.supplierId ?? null, dateReason: v.dateReason, dateNote: v.dateNote });
    await deliverQuoteNotice(r.dedupeKey);
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** V16 Lot 3 — while waiting for parts: the car stays, or is handed back and the customer will return. */
export async function partsWaitDecisionAction(workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageRepairFollowUp");
    const decision = z.enum(PARTS_WAIT_DECISIONS).parse(form.get("decision"));
    await recordPartsWaitDecision(actor, id.parse(workOrderId), decision, form.get("garageCaused") === "on");
    refresh(workOrderId);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
