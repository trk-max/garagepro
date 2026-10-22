import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fmt } from "@/lib/format";
import { AppError, toErrorResponse } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { addCertificate, MAX_CERT_BYTES } from "@/server/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().min(1).max(80).regex(/^[\w-]+$/);
const opt = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * POST /api/skills/certificates (multipart: userId, type, issuer, issuedOn, expiresOn, skillId, note, file?)
 * V14 — certificate / habilitation of an employee; the file (PDF / JPEG / PNG recognised by its first bytes,
 * 10 MB max.) goes to the private storage, never a public URL.
 */
export async function POST(request: Request) {
  try {
    const actor = await requirePermission("manageSkills");
    if (Number(request.headers.get("content-length") ?? 0) > MAX_CERT_BYTES + 64 * 1024) throw new AppError("contractScanType", { max: MAX_CERT_BYTES / 1024 / 1024 }, 413);
    const form = await request.formData();
    const userId = id.parse(form.get("userId"));
    const file = form.get("file");
    const bytes = file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : null;
    const r = await addCertificate(
      actor,
      userId,
      { type: String(form.get("type") ?? ""), issuer: opt(form.get("issuer")), issuedOn: opt(form.get("issuedOn")), expiresOn: opt(form.get("expiresOn")), skillId: opt(form.get("skillId")), note: opt(form.get("note")) },
      bytes,
    );
    revalidatePath(`/garage/competences/${userId}`);
    revalidatePath("/garage/competences");
    return NextResponse.json(r, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      const { t } = await getI18n();
      return NextResponse.json({ error: error.code, message: fmt(t.errors[error.code], error.vars) }, { status: error.status });
    }
    return toErrorResponse(error);
  }
}
