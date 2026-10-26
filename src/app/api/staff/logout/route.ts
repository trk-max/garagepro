import { signOut } from "@/lib/auth";
import { ipFromHeaders } from "@/lib/client-ip";
import { getStaff } from "@/lib/session";
import { endStaffSessions } from "@/server/staff-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/staff/logout — « Déconnexion » of the staff app.
 *
 * A plain form POST to a FIXED address, on purpose (not a Server Action): the action ids of Next.js change at
 * every build, so a page left open while the garage hub installed a new version sent an unknown id and the
 * button did nothing (reproduced: 404 « Server Action not found », no visible error). A real form submit also
 * does not depend on the account menu staying mounted, and its 303 answer is a full page load of /login.
 *
 * Ends EVERY session of this account (sessionVersion + 1: other tabs, other browsers, the phone), never another
 * user's; then clears this browser's cookie. Cross-site posts are refused (no forced logouts from other sites).
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response("Forbidden", { status: 403 });
  const staff = await getStaff();
  if (staff) await endStaffSessions(staff.id, { ip: ipFromHeaders(request.headers) });
  await signOut({ redirect: false });
  // Relative Location: stays on the address the user typed (localhost, the PC's LAN address, the online site).
  return new Response(null, { status: 303, headers: { Location: "/login", "Cache-Control": "no-store" } });
}
