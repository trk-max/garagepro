import { z } from "zod";
import { toErrorResponse } from "@/lib/http";
import { currentDevice, deviceRefused } from "@/server/accueil-device";
import { printTicket } from "@/server/accueil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/accueil/borne/print — prints on the network ESC/POS printer if one is set (else nothing). */
export async function POST(request: Request) {
  const device = await currentDevice("KIOSK");
  if (!device) return deviceRefused();
  try {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{24}$/) }).parse(await request.json());
    return Response.json(await printTicket(device, token), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
