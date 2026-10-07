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
  vehicleSchema,
  workOrderMetaSchema,
} from "@/lib/validators";
import { notifyVehicleReady } from "@/server/customer-notifications";
import { createInvoice } from "@/server/invoices";
import { getSettings } from "@/server/settings";
import { zonedToUtc } from "@/lib/booking";
import {
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
        newVehicle: base.vehicleId ? undefined : vehicleSchema.parse(prefixed(raw, "v_")),
      },
      actor,
    );
    refresh();
    return { ok: true, data: { redirectTo: `/garage/work-orders/${wo.id}` } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function changeStatusAction(workOrderId: string, status: string): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    const to = statusSchema.parse(status);
    await changeStatus(id.parse(workOrderId), to, actor);
    if (to === "READY") await notifyVehicleReady(workOrderId);
    refresh(workOrderId);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
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
    await requirePermission("viewWorkOrders");
    const meta = workOrderMetaSchema.parse(formToObject(form));
    await updateMeta(id.parse(workOrderId), { ...meta, promisedAt: await localToUtc(meta.promisedAt) });
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
    const input = addLineSchema.parse(formToObject(form));
    const warning = await addLine(
      id.parse(workOrderId),
      { type: input.type, partId: input.partId, description: input.description, quantityX100: input.quantity, unitPrice: input.unitPrice },
      actor,
    );
    refresh(workOrderId);
    return { ok: true, data: { warning: await stockWarning(warning ? [warning] : []) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeLineAction(workOrderId: string, lineId: string): Promise<ActionResult<Redirect>> {
  try {
    const actor = await requirePermission("viewWorkOrders");
    await removeLine(id.parse(lineId), actor);
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
