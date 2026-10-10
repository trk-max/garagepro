import { getPortalWorkOrderId } from "@/server/portal-session";
import { versionResponse, workOrderVersion } from "@/server/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/live — short poll for the customer's own vehicle only. */
export async function GET() {
  const workOrderId = await getPortalWorkOrderId();
  if (!workOrderId) return new Response("Unauthorized", { status: 401 });
  return versionResponse(`wo:${workOrderId}`, () => workOrderVersion(workOrderId));
}
