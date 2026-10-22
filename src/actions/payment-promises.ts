"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { id, optionalMoney } from "@/lib/validators";
import { recordPaymentPromise } from "@/server/payment-promises";

/**
 * Paiements partiels — « date du prochain paiement » from the invoice page and the order page. Permission
 * recordPayment (checked here and again by the server function); the checks (date, amount ≤ balance) are on the server.
 */
type Result = ActionResult<{ redirectTo?: string }>;

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function recordPaymentPromiseAction(invoiceId: string, workOrderId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("recordPayment");
    const amount = optionalMoney.parse(str(form, "amount")) ?? null;
    await recordPaymentPromise(id.parse(invoiceId), { day: str(form, "day").trim(), amount, note: str(form, "note") || null }, actor);
    revalidatePath("/garage", "layout");
    revalidatePath(`/garage/invoices/${invoiceId}`);
    revalidatePath(`/garage/work-orders/${workOrderId}`);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}
