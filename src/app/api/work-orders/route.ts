import { NextResponse, type NextRequest } from "next/server";
import type { WorkOrderStatus } from "@prisma/client";
import { toErrorResponse } from "@/lib/http";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { listWorkOrders, type WorkOrderFilter } from "@/server/work-orders";
import { STATUS_ORDER } from "@/server/workflow";

export const dynamic = "force-dynamic";

/** GET /api/work-orders?status=active|all|READY…&q=123TU — for integrations and mobile clients. */
export async function GET(request: NextRequest) {
  try {
    // Same rule as the work-orders page: only roles that may view work orders.
    const staff = await requirePermission("viewWorkOrders");
    const status = request.nextUrl.searchParams.get("status") ?? "active";
    const filter: WorkOrderFilter =
      status === "all" || status === "active" ? status : (STATUS_ORDER as string[]).includes(status) ? (status as WorkOrderStatus) : "active";
    const orders = await listWorkOrders(filter, request.nextUrl.searchParams.get("q") ?? undefined);
    // The tracking PIN opens the customer portal: only roles that manage tracking get it.
    const showPin = can(staff.role, "manageTracking");
    const items = orders.map(({ trackingPin, ...o }) => (showPin ? { ...o, trackingPin } : o));
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
