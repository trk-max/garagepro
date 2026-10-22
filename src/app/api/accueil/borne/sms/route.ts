import { z } from "zod";
import { validKioskPhone } from "@/lib/accueil";
import { AppError, toErrorResponse } from "@/lib/http";
import { currentDevice, deviceRefused } from "@/server/accueil-device";
import { setTicketPhone } from "@/server/accueil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{24}$/), phone: z.string().max(30), consent: z.literal(true) });

/** POST /api/accueil/borne/sms — phone + explicit consent for the « c'est votre tour » message. */
export async function POST(request: Request) {
  const device = await currentDevice("KIOSK");
  if (!device) return deviceRefused();
  try {
    const raw = (await request.json()) as Record<string, unknown>;
    if (raw?.consent !== true) throw new AppError("queueConsent", {}, 422);
    const input = body.parse(raw);
    const phone = validKioskPhone(input.phone);
    if (!phone) throw new AppError("queuePhone", {}, 422);
    await setTicketPhone(device, input.token, phone, input.consent);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
