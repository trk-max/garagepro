import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { MAX_SCAN_BYTES } from "@/lib/contracts";
import { fmt } from "@/lib/format";
import { AppError, toErrorResponse } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { readSignedScan, uploadSignedScan } from "@/server/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/contracts/:id/scan — the hand-signed scan, streamed after the access check (never public). */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const actor = await requirePermission("viewContracts");
    const { id } = await params;
    return await readSignedScan(actor, id);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/contracts/:id/scan (multipart: file) — PDF / JPEG / PNG recognised by its first bytes, 10 MB max. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const actor = await requirePermission("viewContracts");
    const { id } = await params;
    // Refuse oversized uploads before reading the body (+64 KB for the multipart envelope).
    if (Number(request.headers.get("content-length") ?? 0) > MAX_SCAN_BYTES + 64 * 1024) throw new AppError("contractScanType", { max: MAX_SCAN_BYTES / 1024 / 1024 }, 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_SCAN_BYTES) throw new AppError("contractScanType", { max: MAX_SCAN_BYTES / 1024 / 1024 }, 422);
    const r = await uploadSignedScan(actor, id, Buffer.from(await file.arrayBuffer()));
    revalidatePath(`/garage/contrats/${id}`);
    return NextResponse.json(r, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      const { t } = await getI18n();
      return NextResponse.json({ error: error.code, message: fmt(t.errors[error.code], error.vars) }, { status: error.status });
    }
    return toErrorResponse(error);
  }
}
