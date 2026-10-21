"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { id } from "@/lib/validators";
import { saveReading, type ReadingInput } from "@/server/obd";

/** Stores a diagnostic read in the browser (validated again on the server). */
export async function saveObdReadingAction(
  vehicleId: string,
  payload: { result: ReadingInput; workOrderId?: string | null; applyOdometer?: boolean; note?: string | null },
): Promise<ActionResult<{ odometerStatus: string }>> {
  try {
    const actor = await requirePermission("obdDiagnose");
    const r = await saveReading(actor, id.parse(vehicleId), {
      result: payload.result,
      workOrderId: payload.workOrderId ? id.parse(payload.workOrderId) : null,
      applyOdometer: payload.applyOdometer === true,
      note: payload.note ?? null,
    });
    revalidatePath(`/garage/vehicules/${vehicleId}/obd`);
    return { ok: true, data: { odometerStatus: r.odometerStatus } };
  } catch (error) {
    return toActionError(error);
  }
}
