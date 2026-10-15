import { NextResponse } from "next/server";
import { z } from "zod";
import { fmt } from "@/lib/format";
import { toErrorResponse } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { MediaError, startDirectUpload } from "@/server/media";
import { directUploadAvailable } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ size: z.number().int().positive(), contentType: z.string().max(100) });

/**
 * POST /api/work-orders/:id/media/upload-url  { size, contentType }
 * → { direct: true, storageKey, uploadUrl }  the browser PUTs the file to uploadUrl
 * → { direct: false }                        no Supabase: use the normal upload
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    await requirePermission("uploadMedia");
    const { id } = await params;
    if (!directUploadAvailable()) return NextResponse.json({ direct: false });
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "badType" }, { status: 422 });
    const result = await startDirectUpload(id, parsed.data);
    return NextResponse.json({ direct: true, ...result });
  } catch (error) {
    if (error instanceof MediaError) {
      const { t } = await getI18n();
      const message = error.reason === "tooLarge" ? fmt(t.tracking.tooLarge, { max: error.maxMb }) : t.tracking.badType;
      return NextResponse.json({ error: error.reason, message }, { status: 422 });
    }
    return toErrorResponse(error);
  }
}
