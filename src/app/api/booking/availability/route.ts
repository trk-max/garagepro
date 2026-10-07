import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/http";
import { id } from "@/lib/validators";
import { serviceAvailability } from "@/server/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/booking/availability?serviceId=… → { timeZone, days: [{ date, slots: ["08:00", …] }] } (public). */
export async function GET(request: NextRequest) {
  try {
    const serviceId = id.parse(request.nextUrl.searchParams.get("serviceId"));
    return NextResponse.json(await serviceAvailability(serviceId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
