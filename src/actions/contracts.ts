"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONTRACT_ALERT_LIMITS, TEMPLATE_ID } from "@/lib/contracts";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { day, id, optionalDay, optionalId, reasonSchema } from "@/lib/validators";
import { createContract, moveContract, renewContract, setContractAlertDays, setTemplateReview, updateContract } from "@/server/contracts";

/**
 * Contracts (V9.0). The page permission is checked here; the category access (employment =
 * administrator + HR) is checked AGAIN by each server function.
 * Form: template fields are posted as "f_<key>", optional clauses kept as "clause_<key>" = "on".
 */

const optionalMonths = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.number().int().min(1).max(120).optional());

function templateFields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("f_") && typeof v === "string") out[k.slice(2)] = v;
  return out;
}

/** Optional clauses NOT ticked (the form lists every optional clause with a "clause_present_<key>" marker). */
function excludedClauses(form: FormData): string[] {
  const out: string[] = [];
  for (const k of form.keys()) if (k.startsWith("clause_present_") && form.get(`clause_${k.slice(15)}`) !== "on") out.push(k.slice(15));
  return out;
}

const vehicleIds = (form: FormData) => z.array(id).max(200).parse(form.getAll("vehicleIds").filter((v) => v !== ""));

const datesSchema = z.object({ startDay: day, endDay: optionalDay, durationMonths: optionalMonths });

export async function createContractAction(form: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const actor = await requirePermission("viewContracts");
    const templateId = z.string().regex(TEMPLATE_ID).parse(form.get("templateId"));
    const d = datesSchema.parse({ startDay: form.get("startDay"), endDay: form.get("endDay") ?? "", durationMonths: form.get("durationMonths") ?? "" });
    const party = z
      .object({ workOrderId: optionalId, customerId: optionalId, userId: optionalId, supplierId: optionalId })
      .parse({ workOrderId: form.get("workOrderId") ?? "", customerId: form.get("customerId") ?? "", userId: form.get("userId") ?? "", supplierId: form.get("supplierId") ?? "" });
    const c = await createContract(actor, { templateId, ...party, vehicleIds: vehicleIds(form), ...d, fields: templateFields(form), excluded: excludedClauses(form) });
    revalidatePath("/garage/contrats");
    if (party.workOrderId) revalidatePath(`/garage/work-orders/${party.workOrderId}`);
    return { ok: true, data: { redirectTo: `/garage/contrats/${c.id}` } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateContractAction(contractId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewContracts");
    const d = datesSchema.parse({ startDay: form.get("startDay"), endDay: form.get("endDay") ?? "", durationMonths: form.get("durationMonths") ?? "" });
    const ids = form.has("vehiclesPosted") ? vehicleIds(form) : undefined;
    await updateContract(actor, id.parse(contractId), { ...d, fields: templateFields(form), excluded: excludedClauses(form), vehicleIds: ids });
    revalidatePath(`/garage/contrats/${contractId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function moveContractAction(contractId: string, to: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewContracts");
    await moveContract(actor, id.parse(contractId), to);
    revalidatePath(`/garage/contrats/${contractId}`);
    revalidatePath("/garage/contrats");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Termination: the reason is kept in the history. */
export async function terminateContractAction(contractId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewContracts");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("reasonRequired", {}, 422);
    await moveContract(actor, id.parse(contractId), "TERMINATED", r.data);
    revalidatePath(`/garage/contrats/${contractId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function renewContractAction(contractId: string, form: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const actor = await requirePermission("viewContracts");
    const d = datesSchema.parse({ startDay: form.get("startDay"), endDay: form.get("endDay") ?? "", durationMonths: form.get("durationMonths") ?? "" });
    const basis = z.string().max(500).parse(form.get("basis") ?? "");
    const c = await renewContract(actor, id.parse(contractId), { ...d, basis });
    revalidatePath(`/garage/contrats/${contractId}`);
    return { ok: true, data: { redirectTo: `/garage/contrats/${c.id}` } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Administrator: records (or cancels) a lawyer's review of ONE template version, with a note. */
export async function reviewTemplateAction(templateId: string, reviewed: boolean, note: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("reviewContractTemplates");
    const n = reasonSchema.safeParse(note);
    if (!n.success) throw new AppError("reasonRequired", {}, 422);
    await setTemplateReview(actor, z.string().regex(TEMPLATE_ID).parse(templateId), reviewed, n.data);
    revalidatePath("/garage/contrats/modeles");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function contractAlertDaysAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    const days = z.coerce.number().int().min(CONTRACT_ALERT_LIMITS.min).max(CONTRACT_ALERT_LIMITS.max).parse(form.get("contractAlertDays"));
    await setContractAlertDays(actor, days);
    revalidatePath("/garage", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
