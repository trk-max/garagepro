"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { id } from "@/lib/validators";
import { issueVehicleQr, revokeVehicleQr } from "@/server/vehicle-qr";

export async function issueVehicleQrAction(vehicleId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageVehicleQr");
    await issueVehicleQr(actor, id.parse(vehicleId));
    revalidatePath(`/garage/vehicules/${vehicleId}/qr`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeVehicleQrAction(vehicleId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageVehicleQr");
    await revokeVehicleQr(actor, id.parse(vehicleId));
    revalidatePath(`/garage/vehicules/${vehicleId}/qr`);
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
