"use server";

import { revalidatePath } from "next/cache";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { expenseSchema, formToObject, hourlyCostSchema, id, profitSettingsSchema } from "@/lib/validators";
import { audit } from "@/server/audit";
import { addExpense, voidExpense } from "@/server/profit";
import { z } from "zod";

const reasonSchema = z.string().trim().min(3).max(300);

export async function addExpenseAction(workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageExpenses");
    const v = expenseSchema.parse(formToObject(form));
    await addExpense(actor, id.parse(workOrderId), v);
    revalidatePath(`/garage/work-orders/${workOrderId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function voidExpenseAction(expenseId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageExpenses");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("reasonRequired", {}, 422);
    const workOrderId = await voidExpense(actor, id.parse(expenseId), r.data);
    revalidatePath(`/garage/work-orders/${workOrderId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Paramètres → Rentabilité: labour cost per hour and overhead method. */
export async function updateProfitSettingsAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    const v = profitSettingsSchema.parse(formToObject(form));
    const data = {
      laborCostPerHour: v.laborCostPerHour,
      overheadMode: v.overheadMode,
      // % → basis points; DT per hour → millimes.
      overheadValue: v.overheadMode === "PERCENT_REVENUE" ? Math.round(Math.min(v.overheadValue, 100) * 100) : v.overheadMode === "PER_LABOR_HOUR" ? Math.round(v.overheadValue * 1000) : 0,
    };
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { id: "garage" }, select: { laborCostPerHour: true, overheadMode: true, overheadValue: true } });
      await tx.setting.upsert({ where: { id: "garage" }, update: data, create: { id: "garage", ...data } });
      await audit(tx, actor, "settings.profit", "Setting", "garage", { before, after: data });
    });
    revalidatePath("/garage", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** One employee's cost per hour (sensitive: administrator only). Empty = the garage's rate. */
export async function setHourlyCostAction(userId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    const uid = id.parse(userId);
    const v = hourlyCostSchema.parse(formToObject(form));
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: uid }, select: { hourlyCost: true } });
      if (!before) throw new AppError("notFound", {}, 404);
      await tx.user.update({ where: { id: uid }, data: { hourlyCost: v.hourlyCost ?? null } });
      await audit(tx, actor, "employee.hourlyCost", "User", uid, { before, after: { hourlyCost: v.hourlyCost ?? null } });
    });
    revalidatePath(`/garage/equipe/${uid}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
