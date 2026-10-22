"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/http";
import { parseIntakeForm, parseRepairTermsForm } from "@/lib/repair-order-forms";
import { requirePermission, requireStaff } from "@/lib/session";
import { id, optionalMoney } from "@/lib/validators";
import { saveRepairTerms, saveWorkflowSettings, setRepairTermsReview, updateIntake } from "@/server/repair-order";

/** Work order page → « Prise en charge » card (fuel, body, parts origin, estimate, deposit, CIN). */
export async function updateIntakeAction(workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    await updateIntake(id.parse(workOrderId), parseIntakeForm(form), actor);
    revalidatePath(`/garage/work-orders/${workOrderId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Paramètres → Conditions de l'ordre de réparation (permission checked again in the server function). */
export async function saveRepairTermsAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    await saveRepairTerms(actor, parseRepairTermsForm(form));
    revalidatePath("/garage/settings");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** V16 — Paramètres › Parcours atelier (two switches; permission checked again in the server function). */
export async function saveWorkflowSettingsAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    await saveWorkflowSettings(actor, {
      allowWorkWithoutQuote: form.get("allowWorkWithoutQuote") === "on",
      requirePaidBeforeDelivery: form.get("requirePaidBeforeDelivery") === "on",
      // V16 Lot 3
      diagnosticFee: optionalMoney.parse(form.get("diagnosticFee") ?? "") || null,
      requireSafetyWaiver: form.get("requireSafetyWaiver") === "on",
      autoWaitingParts: form.get("autoWaitingParts") === "on",
      // V16 Lot 4
      requireSignedHandover: form.get("requireSignedHandover") === "on",
      autoStorageFee: form.get("autoStorageFee") === "on",
      autoInvoiceReminders: form.get("autoInvoiceReminders") === "on",
    });
    revalidatePath("/garage/settings");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Administrator only: "validated by a lawyer" / back to "to be validated". */
export async function setRepairTermsReviewAction(reviewed: boolean): Promise<ActionResult> {
  try {
    const actor = await requireStaff();
    await setRepairTermsReview(actor, reviewed);
    revalidatePath("/garage/settings");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
