import os from "node:os";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { toErrorResponse } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { isHubLocal } from "@/server/hub";
import { kioskDisplay } from "@/server/timeclock";

export const dynamic = "force-dynamic";

/** Address the phones should open: the kiosk's own address, or the garage PC's Wi-Fi address instead of "localhost". */
function phoneBase(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const [name, port] = host.split(":");
  if (isHubLocal() && (name === "localhost" || name === "127.0.0.1")) {
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .find((a) => a && a.family === "IPv4" && !a.internal && !a.address.startsWith("192.168.56."));
    if (lan) return `http://${lan.address}${port ? `:${port}` : ""}`;
  }
  return `${url.protocol}//${host}`;
}

/** Current kiosk code (garage screen). Staff with the kiosk permission only. */
export async function GET(request: Request) {
  try {
    await requirePermission("showClockKiosk");
    const k = kioskDisplay();
    const link = `${phoneBase(request)}/garage/pointage?code=${k.code}`;
    const qr = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return NextResponse.json({ code: k.code, secondsLeft: k.secondsLeft, qr }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
