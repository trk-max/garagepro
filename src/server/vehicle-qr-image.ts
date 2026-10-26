import "server-only";
import QRCode from "qrcode";
import { getBaseUrl } from "@/lib/base-url";
import { QR_TOKEN } from "@/server/vehicle-qr";

/**
 * The vehicle's existing secure QR (/v/<token>, V7) as an SVG, made at DISPLAY time from the vehicle's current
 * token — never stored on a document (the frozen invoice copy is not touched). A revoked or renewed token simply
 * shows the new one; no token or no site address = null (nothing printed).
 * What the scan opens is decided on the server by /v/<token> (staff: the vehicle's file; customer: the public
 * carnet card without amounts; revoked: nothing).
 */
export async function vehicleQrImage(token: string | null | undefined): Promise<{ link: string; svg: string } | null> {
  if (!token || !QR_TOKEN.test(token)) return null;
  const base = await getBaseUrl().catch(() => null);
  if (!base) return null;
  const link = `${base}/v/${token}`;
  const svg = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { link, svg };
}
