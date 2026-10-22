import { currentDevice, deviceRefused } from "@/server/accueil-device";
import { publicScreenState, type PublicScreen } from "@/server/accueil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Several TVs asking every few seconds share one computation (1.5 s). */
let memo: { at: number; value: Promise<PublicScreen> } | null = null;

/**
 * GET /api/accueil/ecran — state of the waiting-room TV (device token of kind SCREEN only).
 * Only public fields: ticket number, short reason, counter, waiting times, optional masked plate.
 */
export async function GET() {
  const device = await currentDevice("SCREEN");
  if (!device) return deviceRefused();
  const now = Date.now();
  if (!memo || now - memo.at > 1500) {
    const value = publicScreenState(new Date(now));
    value.catch(() => (memo = null));
    memo = { at: now, value };
  }
  return Response.json(await memo.value, { headers: { "Cache-Control": "no-store" } });
}
