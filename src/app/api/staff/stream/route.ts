import { NextRequest } from "next/server";
import { can } from "@/lib/permissions";
import { getStaff } from "@/lib/session";
import { appointmentsVersion, sseResponse, workOrderVersion, workshopVersion } from "@/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/staff/stream?topic=appointments | workshop | wo:<id>
 * Live refresh for the team: new online bookings, status changes made on a
 * mechanic's phone, customer quote approvals and messages.
 */
export async function GET(request: NextRequest) {
  const staff = await getStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });

  const topic = request.nextUrl.searchParams.get("topic") ?? "";
  if (topic === "appointments" && can(staff.role, "viewAppointments")) return sseResponse(request, appointmentsVersion);
  if (topic === "workshop" && can(staff.role, "useWorkshop")) return sseResponse(request, workshopVersion);
  if (topic.startsWith("wo:") && can(staff.role, "viewWorkOrders")) {
    const id = topic.slice(3);
    return sseResponse(request, () => workOrderVersion(id));
  }
  return new Response("Forbidden", { status: 403 });
}
