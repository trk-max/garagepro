"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cashAlertSettingsSchema, cashBalanceSchema, formToObject } from "@/lib/validators";
import { audit } from "@/server/audit";
import { recordCashBalance } from "@/server/cash";

/** Cash forecast (V8.4): typed balance (administrator + manager), alert settings (administrator). */

export async function recordCashBalanceAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewCashForecast");
    const v = cashBalanceSchema.parse(formToObject(form));
    await recordCashBalance(actor, { amount: v.amount, asOf: v.asOf, note: v.note ?? null });
    revalidatePath("/garage/tresorerie");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCashAlertSettingsAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    const data = cashAlertSettingsSchema.parse(formToObject(form));
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { id: "garage" }, select: { cashAlertThreshold: true, cashAlertScenario: true } });
      await tx.setting.upsert({ where: { id: "garage" }, update: data, create: { id: "garage", ...data } });
      await audit(tx, actor, "settings.cashAlert", "Setting", "garage", { before, after: data });
    });
    revalidatePath("/garage", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
