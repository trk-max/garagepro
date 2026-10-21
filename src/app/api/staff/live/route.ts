import { NextRequest } from "next/server";
import { can } from "@/lib/permissions";
import { getStaff } from "@/lib/session";
import { appointmentsVersion, customersVersion, dashboardVersion, stockVersion, versionResponse, workOrderVersion, workshopVersion } from "@/server/live";
import { canSeeConversation, conversationVersion, inboxVersion } from "@/server/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/staff/live?topic=appointments | workshop | stock | customers | dashboard | wo:<id> | inbox | conv:<id>
 * Short poll used by <LiveRefresh>: new online bookings, status changes made
 * on a mechanic's phone, customer quote approvals and messages.
 */
export async function GET(request: NextRequest) {
  const staff = await getStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });

  const topic = request.nextUrl.searchParams.get("topic") ?? "";
  if (topic === "appointments" && can(staff, "viewAppointments")) return versionResponse(topic, appointmentsVersion);
  if (topic === "workshop" && can(staff, "useWorkshop")) return versionResponse(topic, workshopVersion);
  if (topic === "dashboard") return versionResponse(topic, dashboardVersion);
  if (topic === "stock" && can(staff, "viewStock")) return versionResponse(topic, stockVersion);
  if (topic === "customers" && can(staff, "viewCustomers")) return versionResponse(topic, customersVersion);
  if (topic.startsWith("wo:") && can(staff, "viewWorkOrders")) {
    const id = topic.slice(3);
    return versionResponse(topic, () => workOrderVersion(id));
  }
  // Showroom messaging (V9): the inbox version is per person (a seller's inbox is not the manager's);
  // a conversation is watched only by someone allowed to see it — checked before anything is read.
  if (topic === "inbox" && can(staff, "useShowroomMessages")) return versionResponse(`inbox:${staff.id}`, () => inboxVersion(staff));
  if (topic.startsWith("conv:") && can(staff, "useShowroomMessages")) {
    const id = topic.slice(5);
    if (!/^[a-z0-9]{20,40}$/.test(id) || !(await canSeeConversation(staff, id))) return new Response("Forbidden", { status: 403 });
    return versionResponse(topic, () => conversationVersion(id));
  }
  return new Response("Forbidden", { status: 403 });
}
