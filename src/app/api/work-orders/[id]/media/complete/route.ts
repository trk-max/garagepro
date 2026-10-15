import { NextResponse } from "next/server";
import { z } from "zod";
import { fmt } from "@/lib/format";
import { toErrorResponse } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { MediaError, finishDirectUpload } from "@/server/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({
  storageKey: z.string().max(200),
  caption: z.string().max(200).optional(),
  visible: z.boolean().default(true),
});

/** POST /api/work-orders/:id/media/complete — after a direct upload: verify the file, then record it. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const actor = await requirePermission("uploadMedia");
    const { id } = await params;
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "badType" }, { status: 422 });
    const media = await finishDirectUpload(
      id,
      { storageKey: parsed.data.storageKey, caption: parsed.data.caption?.trim() || undefined, visibleToCustomer: parsed.data.visible },
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
