"use server";

import { revalidatePath } from "next/cache";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { audit } from "@/server/audit";

const MAX_BYTES = 300_000;
/** Accepted images, recognised by their first bytes (not by the name or the browser's type). */
const SIGNATURES: { type: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/webp", test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

/** Paramètres → logo printed on invoices, quotes, orders and certificates (stored in the settings row). */
export async function saveLogoAction(form: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) throw new AppError("logoInvalid", {}, 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = SIGNATURES.find((s) => s.test(bytes));
    if (!kind) throw new AppError("logoInvalid", {}, 422);
    const dataUrl = `data:${kind.type};base64,${Buffer.from(bytes).toString("base64")}`;
    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({ where: { id: "garage" }, update: { logoDataUrl: dataUrl }, create: { id: "garage", logoDataUrl: dataUrl } });
      await audit(tx, actor, "settings.logo", "Setting", "garage", { after: { type: kind.type, bytes: bytes.length } });
    });
    revalidatePath("/garage/settings");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Back to the GaragePro mark. */
export async function removeLogoAction(): Promise<ActionResult> {
  try {
    const actor = await requirePermission("manageSettings");
    await prisma.$transaction(async (tx) => {
      await tx.setting.updateMany({ where: { id: "garage" }, data: { logoDataUrl: null } });
      await audit(tx, actor, "settings.logo", "Setting", "garage", { after: { removed: true } });
    });
    revalidatePath("/garage/settings");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
