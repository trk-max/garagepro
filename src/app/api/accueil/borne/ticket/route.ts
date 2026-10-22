import { z } from "zod";
import { toErrorResponse } from "@/lib/http";
import { currentDevice, deviceRefused } from "@/server/accueil-device";
import { createTicket, kioskTicketView } from "@/server/accueil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  reasonId: z.string().min(1).max(64),
  plate: z.string().trim().max(20).optional().nullable(),
  qr: z.string().trim().max(300).optional().nullable(),
  lang: z.enum(["fr", "ar", "en"]).default("fr"),
});

/** POST /api/accueil/borne/ticket — the kiosk takes a ticket (device token of kind KIOSK only). */
export async function POST(request: Request) {
  const device = await currentDevice("KIOSK");
  if (!device) return deviceRefused();
  try {
    const input = body.parse(await request.json());
    const { ticket, appointment } = await createTicket({ ...input, source: "KIOSK", device });
    const view = await kioskTicketView(ticket.id);
    return Response.json({ ...view, appointment: !!appointment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
