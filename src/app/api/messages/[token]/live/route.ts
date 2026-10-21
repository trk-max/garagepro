import { versionResponse } from "@/server/live";
import { conversationIdForToken, conversationVersion } from "@/server/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** GET /api/messages/:token/live — short poll for the buyer's own conversation only (private link). */
export async function GET(_request: Request, { params }: Ctx) {
  const id = await conversationIdForToken((await params).token);
  if (!id) return new Response("Gone", { status: 410, headers: { "Cache-Control": "no-store" } });
  return versionResponse(`conv:${id}`, () => conversationVersion(id));
}
