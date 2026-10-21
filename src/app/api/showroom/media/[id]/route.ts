import { getStaff } from "@/lib/session";
import { listingMediaForViewer } from "@/server/showroom";
import { readObject } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/showroom/media/:id — photo or PDF of a listing. The public gets only files marked
 * visible, of a listing currently on the site; the team (viewShowroom) gets every file.
 * Anything else answers 404 (the same as a file that does not exist).
 */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return new Response("Not found", { status: 404 });
  const media = await listingMediaForViewer(id, await getStaff());
  if (!media) return new Response("Not found", { status: 404 });
  return readObject(media.storageKey, media.contentType, request.headers.get("range"));
}
