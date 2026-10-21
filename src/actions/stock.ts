"use server";

import { revalidatePath } from "next/cache";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { formToObject, id, reservationSchema } from "@/lib/validators";
import { correctMovement, releaseReservation, reservePart } from "@/server/parts";
import { z } from "zod";

const reasonSchema = z.string().trim().min(3).max(300);

export async function reservePartAction(workOrderId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("reserveStock");
    const v = reservationSchema.parse(formToObject(form));
    await reservePart(actor, id.parse(workOrderId), v.partId, v.quantity);
    revalidatePath(`/garage/work-orders/${workOrderId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function releaseReservationAction(reservationId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("reserveStock");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("reasonRequired", {}, 422);
    const workOrderId = await releaseReservation(actor, id.parse(reservationId), r.data);
    revalidatePath(`/garage/work-orders/${workOrderId}`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function correctMovementAction(movementId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageStock");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) throw new AppError("reasonRequired", {}, 422);
    await correctMovement(actor, id.parse(movementId), r.data);
    revalidatePath("/garage/parts");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
