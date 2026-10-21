"use server";

import { revalidatePath } from "next/cache";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { claimAmountsSchema, claimMoveSchema, claimOpenSchema, formToObject, id, reasonSchema, refundSchema, warrantySchema, warrantySettingsSchema } from "@/lib/validators";
import { audit } from "@/server/audit";
import { addRefund, createWarranty, moveClaim, openClaim, setClaimAmounts, voidRefund, voidWarranty, warrantyIdOfClaim } from "@/server/warranties";

/** Warranties (V8.4). Each server function checks the permission again (amounts: viewWarrantyMoney). */

function refresh(paths: (string | null | undefined)[]) {
  for (const p of paths) if (p) revalidatePath(p);
  revalidatePath("/garage/garanties");
}

export async function createWarrantyAction(workOrderId: string, form: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const actor = await requirePermission("manageWarranties");
    const v = warrantySchema.parse(formToObject(form));
    const w = await createWarranty(actor, id.parse(workOrderId), v);
    refresh([`/garage/work-orders/${workOrderId}`]);
    return { ok: true, data: { redirectTo: `/garage/garanties/${w.id}` } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function voidWarrantyAction(warrantyId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewWarrantyMoney");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("reasonRequired", {}, 422);
    await voidWarranty(actor, id.parse(warrantyId), r.data);
    refresh([`/garage/garanties/${warrantyId}`]);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function openClaimAction(warrantyId: string, form: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const actor = await requirePermission("manageWarranties");
    const v = claimOpenSchema.parse(formToObject(form));
    const c = await openClaim(actor, id.parse(warrantyId), v.description);
    refresh([`/garage/garanties/${warrantyId}`]);
    return { ok: true, data: { redirectTo: `/garage/garanties/reclamations/${c.id}` } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function claimAmountsAction(claimId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewWarrantyMoney");
    const v = claimAmountsSchema.parse(formToObject(form));
    await setClaimAmounts(actor, id.parse(claimId), v);
    refresh([`/garage/garanties/reclamations/${claimId}`]);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function moveClaimAction(claimId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewWarrantyMoney");
    const v = claimMoveSchema.parse(formToObject(form));
    await moveClaim(actor, id.parse(claimId), v.to, { decision: v.decision ?? null, amountAccepted: v.amountAccepted ?? null });
    refresh([`/garage/garanties/reclamations/${claimId}`, `/garage/garanties/${await warrantyIdOfClaim(claimId)}`, "/garage/tresorerie"]);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addRefundAction(claimId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewWarrantyMoney");
    const v = refundSchema.parse(formToObject(form));
    await addRefund(actor, id.parse(claimId), { amount: v.amount, receivedDay: v.receivedDay, method: v.method, reference: v.reference ?? null });
    refresh([`/garage/garanties/reclamations/${claimId}`, "/garage/tresorerie"]);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function voidRefundAction(refundId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("viewWarrantyMoney");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("reasonRequired", {}, 422);
    const claimId = await voidRefund(actor, id.parse(refundId), r.data);
    refresh([`/garage/garanties/reclamations/${claimId}`, "/garage/tresorerie"]);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Paramètres → Garantie automatique des réparations (0 = off). */
export async function updateWarrantySettingsAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    const data = warrantySettingsSchema.parse(formToObject(form));
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { id: "garage" }, select: { warrantyMonths: true, warrantyKm: true } });
      await tx.setting.upsert({ where: { id: "garage" }, update: data, create: { id: "garage", ...data } });
      await audit(tx, actor, "settings.warranty", "Setting", "garage", { before, after: data });
    });
    revalidatePath("/garage/settings");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
