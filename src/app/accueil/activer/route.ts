import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, deviceKindFor } from "@/server/accueil";

export const dynamic = "force-dynamic";

/**
 * GET /accueil/activer?t=<device token> — opened ONCE on the kiosk tablet or the waiting-room TV
 * (link shown to the administrator when the token is created). Stores the token in a long-lived
 * http-only cookie of that browser, then opens the kiosk or the screen. The token never stays in the
 * address bar. A wrong / revoked token → the page says "device not authorised".
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const kind = await deviceKindFor(token);
  const target = new URL(kind === "SCREEN" ? "/accueil/ecran" : "/accueil/borne", request.url);
  const res = NextResponse.redirect(target, 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  if (kind) {
    res.cookies.set(DEVICE_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 365 * 5,
    });
  }
  return res;
}
