"use server";

import { revalidatePath } from "next/cache";
import { fmt, formatQty } from "@/lib/format";
import { toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import {
  addLineSchema,
  createWorkOrderSchema,
  customerSchema,
  formToObject,
  id,
  noteSchema,
  optionalId,
  statusSchema,
  checkInVehicleSchema,
  vehicleCompletionSchema,
  workOrderMetaSchema,
} from "@/lib/validators";
import { notifyVehicleReady } from "@/server/customer-notifications";
import { deliverQuoteNotice, recordStaffDecision, sendQuote } from "@/server/quotes";
import { LINE_PRIORITIES, PART_CONDITIONS, STAFF_CHANNELS } from "@/lib/quote";
import { createInvoice } from "@/server/invoices";
import { parseIntakeForm } from "@/lib/repair-order-forms";
import { getSettings } from "@/server/settings";
import { zonedToUtc } from "@/lib/booking";
import { headers } from "next/headers";
import { clientIp } from "@/server/portal-session";
import { z } from "zod";
import { REWORK_CAUSES, isReworkCause } from "@/lib/lot5";
import {
  type StatusChangeOptions,
  completeVehicleInfo,
  addLine,
  addNote,
  applyPackage,
  assignMechanic,
  changeStatus,
  createWorkOrder,
  removeLine,
  updateMeta,
} from "@/server/work-orders";

type Redirect = { redirectTo?: string; warning?: string };

const lineQuoteSchema = z.object({ priority: z.enum(LINE_PRIORITIES).optional(), partCondition: z.enum(PART_CONDITIONS).optional() });

const statusOptionsSchema = z.object({
  reason: z.string().trim().max(500).nullish(),
  override: z.boolean().optional(),
  // V16 Lot 3 — refused quote → « Prêt »: car put back together; signed safety waiver (refused SAFETY line).
  reassembled: z.boolean().optional(),
  safetyWaiver: z.boolean().optional(),
  // V16 Lot 5 — cause of a rework (quality check / ready car back to the workshop).
  reworkCause: z.enum(REWORK_CAUSES).nullish(),
});

/** "2026-10-07T17:30" typed in the garage → UTC instant. */
async function localToUtc(value: string | undefined): Promise<Date | undefined> {
  if (!value) return undefined;
  const [date, time] = value.split("T") as [string, string];
  return zonedToUtc(date, time, (await getSettings()).timezone);
}

/** Picks "c_name" → { name } for nested sub-forms. */
function prefixed(form: Record<string, string>, prefix: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(form)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length), v]),
  );
}

const refresh = (workOrderId?: string) => {
  revalidatePath("/garage", "layout");
  if (workOrderId) revalidatePath(`/garage/work-orders/${workOrderId}`);
};

export async function createWorkOrderAction(form: FormData): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    const raw = formToObject(form);
    const base = createWorkOrderSchema.parse(raw);
    const wo = await createWorkOrder(
      {
        ...base,
        promisedAt: await localToUtc(base.promisedAt),
        newCustomer: base.customerId ? undefined : customerSchema.parse(prefixed(raw, "c_")),
        // New car: every field is mandatory (VIN, year, fuel, colour…); its mileage is the check-in mileage.
        newVehicle: base.vehicleId ? undefined : { ...checkInVehicleSchema.parse(prefixed(raw, "v_")), mileage: base.mileageIn },
        // Known car: what was missing on file, typed in the form.
        completeVehicle: base.vehicleId ? vehicleCompletionSchema.parse(prefixed(raw, "f_")) : undefined,
        requireCompleteVehicle: true,
        // V10.6 — repair order details (fuel level, body, parts origin, estimate, deposit, CIN).
        intake: parseIntakeForm(form),
        // V16 Lot 3 — diagnostic fee announced at reception (box ticked by default when the fee is set).
        diagnosticFee: raw.diagnosticFee === "on",
        // V16 Lot 4 — mileage lower than the last reading, confirmed by the desk.
        confirmLowerMileage: raw.confirmLowerMileage === "on",
      },
      actor,
    );
    refresh();
    return { ok: true, data: { redirectTo: `/garage/work-orders/${wo.id}` } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Completes the vehicle file from the work order page (VIN, year, fuel, colour, mileage). */
export async function completeVehicleAction(workOrderId: string, form: FormData): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    const raw = formToObject(form);
    const fill = vehicleCompletionSchema.parse(prefixed(raw, "f_"));
    const mileageIn = raw.mileageIn === undefined || raw.mileageIn === "" ? undefined : createWorkOrderSchema.shape.mileageIn.parse(raw.mileageIn);
    await completeVehicleInfo(id.parse(workOrderId), fill, mileageIn, actor, raw.confirmLowerMileage === "on");
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Status change. The page only offers the moves the user may make; the server checks again the permission
 * of the move (server/workflow.ts transitionPermission), the reason, the quote and delivery rules.
 */
export async function changeStatusAction(workOrderId: string, status: string, opts: StatusChangeOptions = {}): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    const to = statusSchema.parse(status);
    const options = statusOptionsSchema.parse(opts);
    await changeStatus(id.parse(workOrderId), to, actor, options);
    if (to === "READY") await notifyVehicleReady(workOrderId, actor);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

/** V16 — status dialog (status + reason + "deliver despite the balance"). */
export async function changeStatusFormAction(workOrderId: string, form: FormData): Promise<ActionResult<Redirect>> {
  const raw = formToObject(form);
  return changeStatusAction(workOrderId, raw.status ?? "", {
    reason: raw.reason || null,
    override: raw.override === "on",
    reassembled: raw.reassembled === "on",
    safetyWaiver: raw.safetyWaiver === "on",
    reworkCause: isReworkCause(raw.reworkCause) ? raw.reworkCause : null,
  });
}

export async function assignAction(workOrderId: string, mechanicId: string): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    await assignMechanic(id.parse(workOrderId), optionalId.parse(mechanicId) ?? null, actor);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateMetaAction(workOrderId: string, form: FormData): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    const meta = workOrderMetaSchema.parse(formToObject(form));
    const r = await updateMeta(id.parse(workOrderId), { ...meta, promisedAt: await localToUtc(meta.promisedAt) }, actor);
    // V16 Lot 3: « nouvelle date de livraison » sent after the commit (never blocks; the reminders task retries).
    await deliverQuoteNotice(r.dedupeKey);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

async function stockWarning(warnings: { name: string; stockX100: number }[]): Promise<string | undefined> {
  if (!warnings.length) return undefined;
  const { t, lang } = await getI18n();
  return warnings.map((w) => fmt(t.workOrders.stockWarning, { name: w.name, stock: formatQty(w.stockX100, lang) })).join(" ");
}

export async function addLineAction(workOrderId: string, form: FormData): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    const raw = formToObject(form);
    const input = addLineSchema.parse(raw);
    // V16 Lot 2: priority and part condition shown to the customer on the quote (both optional).
    const extra = lineQuoteSchema.parse({ priority: raw.priority || undefined, partCondition: raw.partCondition || undefined });
    const warning = await addLine(
      id.parse(workOrderId),
      { type: input.type, partId: input.partId, description: input.description, quantityX100: input.quantity, unitPrice: input.unitPrice, ...extra, announcedFee: raw.announcedFee === "on", billRework: raw.billRework === "on" },
      actor,
    );
    refresh(workOrderId);
    return { ok: true, data: { warning: await stockWarning(warning ? [warning] : []) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeLineAction(workOrderId: string, lineId: string, form?: FormData): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    // V16: a line of the accepted quote is voided with a reason (dialog), not deleted.
    const reason = form ? statusOptionsSchema.shape.reason.parse(formToObject(form).reason || null) : null;
    await removeLine(id.parse(lineId), actor, reason);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function applyPackageAction(workOrderId: string, form: FormData): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    const warnings = await applyPackage(id.parse(workOrderId), id.parse(form.get("packageId")), actor);
    refresh(workOrderId);
    return { ok: true, data: { warning: await stockWarning(warnings) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addNoteAction(workOrderId: string, form: FormData): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    await addNote(id.parse(workOrderId), noteSchema.parse(formToObject(form)).body, actor);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

// ── V16 Lot 2 — versioned quote and recorded agreement ──────────────────────

/** « Renvoyer le devis »: a new version of the pending lines (permission manageQuotes). */
export async function sendQuoteAction(workOrderId: string): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("manageQuotes");
    await sendQuote(id.parse(workOrderId), actor);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

const staffDecisionSchema = z.object({
  quoteId: z.string().trim().max(64).optional().transform((v) => v || undefined),
  approverName: z.string().trim().min(2).max(120),
  approverContact: z.string().trim().max(120).optional().transform((v) => v || null),
  channel: z.enum(STAFF_CHANNELS),
  note: z.string().trim().max(1000).optional().transform((v) => v || null),
});

/**
 * Phone / in-person / SMS / e-mail / WhatsApp agreement typed by the team: permission recordQuoteApproval
 * (reception, workshop manager, admin — never a mechanic by default). Every quote line: accepted (« accept »
 * field) or refused.
 */
export async function recordQuoteDecisionAction(workOrderId: string, form: FormData): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("recordQuoteApproval");
    const input = staffDecisionSchema.parse(formToObject(form));
    const approvedLineIds = form.getAll("accept").map(String).filter((x) => /^[a-z0-9]{10,40}$/i.test(x)).slice(0, 200);
    // V16 Lot 4: optional signature drawn on the tablet (PNG data URL), kept with the proof (QuoteApproval.signatureKey).
    const signature = form.get("signature");
    await recordStaffDecision(
      id.parse(workOrderId),
      { ...input, approvedLineIds, signatureImage: typeof signature === "string" && signature ? signature : null, ip: await clientIp(), userAgent: (await headers()).get("user-agent") },
      actor,
    );
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createInvoiceAction(workOrderId: string): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("createInvoice");
    const invoice = await createInvoice(id.parse(workOrderId), actor);
    refresh(workOrderId);
    return { ok: true, data: { redirectTo: `/garage/invoices/${invoice.id}` } };
  } catch (error) {
    return toActionError(error);
  }
}
