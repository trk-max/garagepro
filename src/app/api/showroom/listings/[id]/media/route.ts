import { NextResponse } from "next/server";
import { fmt } from "@/lib/format";
import { toErrorResponse } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { id } from "@/lib/validators";
import { ListingFileError, MAX_DOCUMENT_BYTES, addListingMedia } from "@/server/showroom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/showroom/listings/:id/media (multipart: file, caption) — photo or PDF of a listing.
 * Ownership (seller = own listings only) is checked by addListingMedia.
 */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const actor = await requirePermission("createListing");
    const listingId = id.parse((await params).id);
    const { t } = await getI18n();
    const tooBig = () => NextResponse.json({ error: "listingFileType", message: fmt(t.errors.listingFileType, { max: MAX_DOCUMENT_BYTES / 1024 / 1024 }) }, { status: 413 });
    // Reject oversized uploads before reading the body into memory (+1 MB for form fields).
    if (Number(request.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES + 1024 * 1024) return tooBig();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return tooBig();
    const caption = String(form.get("caption") ?? "").trim().slice(0, 200) || undefined;
    try {
      const media = await addListingMedia(actor, listingId, { bytes: Buffer.from(await file.arrayBuffer()), caption });
      return NextResponse.json({ id: media.id }, { status: 201 });
    } catch (error) {
      if (error instanceof ListingFileError) {
        const message = error.reason === "limit" ? fmt(t.errors.listingMediaLimit, { max: error.max }) : fmt(t.errors.listingFileType, { max: error.max });
        return NextResponse.json({ error: error.reason, message }, { status: 422 });
      }
      throw error;
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
