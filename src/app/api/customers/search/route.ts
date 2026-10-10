import { NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { searchCustomerOptions } from "@/server/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.string().trim().max(60);

/** GET /api/customers/search?q=… — team only; used by the check-in form picker. */
export async function GET(request: Request) {
  try {
    await requirePermission("viewWorkOrders");
    const q = querySchema.parse(new URL(request.url).searchParams.get("q") ?? "");
    return NextResponse.json(await searchCustomerOptions(q), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
