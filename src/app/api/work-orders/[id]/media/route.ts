import { NextResponse } from "next/server";
import { fmt } from "@/lib/format";
import { toErrorResponse } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { MediaError, addMedia } from "@/server/media";
import { MAX_VIDEO_BYTES } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** V16 Lot 4 — stage chosen in the uploader (reception, work, delivery); anything else = from the order's status. */
const parseStage = (v: unknown) => (v === "INTAKE" || v === "WORK" || v === "DELIVERY" ? v : null);

/** POST /api/work-orders/:id/media (multipart: file, caption, visible) — used from the mechanic's phone. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const actor = await requirePermission("uploadMedia");
    const { id } = await params;
    // Reject oversized uploads before reading the body into memory (+1 MB for form fields).
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_VIDEO_BYTES + 1024 * 1024) {
      const { t } = await getI18n();
      return NextResponse.json({ error: "tooLarge", message: fmt(t.tracking.tooLarge, { max: MAX_VIDEO_BYTES / 1024 / 1024 }) }, { status: 413 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "badType" }, { status: 422 });

    const caption = String(form.get("caption") ?? "").trim().slice(0, 200) || undefined;
    const media = await addMedia(
      id,
      { bytes: Buffer.from(await file.arrayBuffer()), caption, visibleToCustomer: form.get("visible") !== "false", stage: parseStage(form.get("stage")) },
      actor,
    );
    return NextResponse.json({ id: media.id }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaError) {
      const { t } = await getI18n();
      const message = error.reason === "tooLarge" ? fmt(t.tracking.tooLarge, { max: error.maxMb }) : t.tracking.badType;
      return NextResponse.json({ error: error.reason, message }, { status: 422 });
    }
    return toErrorResponse(error);
  }
}
