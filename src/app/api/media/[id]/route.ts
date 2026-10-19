import { prisma } from "@/lib/prisma";
import { getStaff } from "@/lib/session";
import { getCompanyViewer } from "@/server/company-session";
import { getPortalWorkOrderId } from "@/server/portal-session";
import { readObject } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/media/:id — photos/videos are private: the team sees all of them,
 * a customer only the ones marked visible on their own vehicle (tracker or company portal).
 */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const media = await prisma.workOrderMedia.findUnique({
    where: { id },
    select: { workOrderId: true, storageKey: true, contentType: true, visibleToCustomer: true },
  });
  if (!media) return new Response("Not found", { status: 404 });

  const staff = await getStaff();
  if (!staff) {
    if (!media.visibleToCustomer) return new Response("Not found", { status: 404 });
    const portalWo = await getPortalWorkOrderId();
    if (portalWo !== media.workOrderId) {
      // Company portal: only photos of THIS company's vehicles.
      const company = await getCompanyViewer();
      const owner = company ? await prisma.workOrder.findFirst({ where: { id: media.workOrderId, customerId: company.customerId }, select: { id: true } }) : null;
      if (!owner) return new Response("Not found", { status: 404 });
    }
  }

  return readObject(media.storageKey, media.contentType, request.headers.get("range"));
}
