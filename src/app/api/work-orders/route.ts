import { NextResponse, type NextRequest } from "next/server";
import type { WorkOrderStatus } from "@prisma/client";
import { toErrorResponse } from "@/lib/http";
import { requireStaff } from "@/lib/session";
import { listWorkOrders, type WorkOrderFilter } from "@/server/work-orders";
import { STATUS_ORDER } from "@/server/workflow";

export const dynamic = "force-dynamic";

/** GET /api/work-orders?status=active|all|READY…&q=123TU — for integrations and mobile clients. */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const status = request.nextUrl.searchParams.get("status") ?? "active";
    const filter: WorkOrderFilter =
      status === "all" || status === "active" ? status : (STATUS_ORDER as string[]).includes(status) ? (status as WorkOrderStatus) : "active";
    const orders = await listWorkOrders(filter, request.nextUrl.searchParams.get("q") ?? undefined);
    return NextResponse.json({ items: orders });
  } catch (error) {
    return toErrorResponse(error);
  }
}
