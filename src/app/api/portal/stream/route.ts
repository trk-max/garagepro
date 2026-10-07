import { getPortalWorkOrderId } from "@/server/portal-session";
import { sseResponse, workOrderVersion } from "@/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/stream — live updates for the customer's own vehicle only. */
export async function GET(request: Request) {
  const workOrderId = await getPortalWorkOrderId();
  if (!workOrderId) return new Response("Unauthorized", { status: 401 });
  return sseResponse(request, () => workOrderVersion(workOrderId));
}
