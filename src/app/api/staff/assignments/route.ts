import { displayPlate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getStaff } from "@/lib/session";
import { newAssignmentIds } from "@/server/assignment-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/staff/assignments — the cars newly assigned to the signed-in mechanic and not opened yet.
 * Short poll of <AssignmentAlert> (every staff page): a new one rings / vibrates and shows a toast.
 */
export async function GET() {
  const staff = await getStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });
  if (!can(staff, "useWorkshop")) return Response.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  const ids = await newAssignmentIds(staff.id);
  const rows = ids.length
    ? await prisma.workOrder.findMany({ where: { id: { in: ids } }, select: { id: true, vehicle: { select: { plate: true, make: true, model: true } } } })
    : [];
  const items = ids.flatMap((id) => {
    const w = rows.find((r) => r.id === id);
    return w ? [{ id, plate: displayPlate(w.vehicle.plate), vehicle: `${w.vehicle.make} ${w.vehicle.model}`.trim() }] : [];
  });
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
