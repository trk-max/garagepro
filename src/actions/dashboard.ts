"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionResult } from "@/lib/http";
import { requirePermission, requireStaff } from "@/lib/session";
import { formToObject, id, money } from "@/lib/validators";
import { saveDashboardLayout } from "@/server/dashboard-layout";
import { setMonthlyTarget } from "@/server/dashboard-v10";
import { toggleFavoriteCustomer } from "@/server/dashboard-v10-customers";

/** V10 dashboard: favourite customers (viewCustomers) and the monthly target (administrator). Both audited. */

export async function toggleFavoriteCustomerAction(customerId: string): Promise<ActionResult<{ isFavorite: boolean }>> {
  try {
    const actor = await requirePermission("viewCustomers");
    const result = await toggleFavoriteCustomer(actor, id.parse(customerId));
    revalidatePath("/garage", "layout");
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

const targetSchema = z.object({ monthlyRevenueTarget: money });

/** Paramètres → monthly target in DT ("0" = no target). */
export async function updateMonthlyTargetAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    const v = targetSchema.parse(formToObject(form));
    await setMonthlyTarget(actor, v.monthlyRevenueTarget);
    revalidatePath("/garage", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * V10.3 — saves the signed-in user's OWN dashboard layout ([{ id, visible }] in order; null = reset).
 * Any signed-in team member; never another user's layout (the id comes from the session).
 */
export async function saveDashboardLayoutAction(layout: unknown): Promise<ActionResult> {
  try {
    const me = await requireStaff();
    await saveDashboardLayout(me.id, layout);
    revalidatePath("/garage");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
