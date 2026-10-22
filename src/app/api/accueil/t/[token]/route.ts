import { trackState } from "@/server/accueil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/accueil/t/<token> — public tracking of one ticket: number, status, people before, counter. No personal data. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await trackState(token);
  if (!state) return Response.json({ error: "notFound" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
