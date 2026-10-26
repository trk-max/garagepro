import { getStaff } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/staff/session — 204 while the staff session holds, 401 once it ended (signed out on this or another
 * device: see server/staff-session.ts). Polled by the shell at most once a minute, on a shown tab only.
 */
export async function GET() {
  const staff = await getStaff();
  return new Response(null, { status: staff ? 204 : 401, headers: { "Cache-Control": "no-store" } });
}
