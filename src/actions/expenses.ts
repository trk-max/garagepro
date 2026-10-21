"use server";

import { revalidatePath } from "next/cache";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { formToObject, id, occurrencePaySchema, reasonSchema, recurringExpenseSchema, recurringExpenseUpdateSchema } from "@/lib/validators";
import { cancelOccurrencePayment, createExpense, payOccurrence, setExpenseActive, updateExpense } from "@/server/expenses";

/** Page « Dépenses et échéances » (V8.4): administrator + manager (checked again in the server functions). */

function refresh() {
  revalidatePath("/garage/depenses");
  revalidatePath("/garage/tresorerie");
}

export async function createExpenseAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageExpenses");
    await createExpense(actor, recurringExpenseSchema.parse(formToObject(form)));
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateExpenseAction(expenseId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageExpenses");
    await updateExpense(actor, id.parse(expenseId), recurringExpenseUpdateSchema.parse(formToObject(form)));
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setExpenseActiveAction(expenseId: string, active: boolean): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageExpenses");
    await setExpenseActive(actor, id.parse(expenseId), active === true);
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function payOccurrenceAction(occurrenceId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageExpenses");
    const v = occurrencePaySchema.parse(formToObject(form));
    await payOccurrence(actor, id.parse(occurrenceId), { paidDay: v.paidDay, paidAmount: v.paidAmount, method: v.method, reference: v.reference ?? null });
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelOccurrencePaymentAction(occurrenceId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageExpenses");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("reasonRequired", {}, 422);
    await cancelOccurrencePayment(actor, id.parse(occurrenceId), r.data);
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
