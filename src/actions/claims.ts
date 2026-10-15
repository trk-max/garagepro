"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { claimUpdateSchema, formToObject, id } from "@/lib/validators";
import { updateClaim } from "@/server/claims";

/** Staff answers / closes a customer complaint. */
export async function updateClaimAction(claimId: string, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageClaims");
    await updateClaim(id.parse(claimId), claimUpdateSchema.parse(formToObject(form)), actor);
    revalidatePath("/garage/reclamations");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
