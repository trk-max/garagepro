import { NextRequest, NextResponse } from "next/server";
import { LANGS, type Lang } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * GET /api/lang?l=ar&next=/garage/work-orders
 * Sets the language cookie on the server and sends the browser back to the
 * page it came from. A real navigation with a server cookie: the new language
 * is shown at once, whatever the browser caches or translators do.
 */
export function GET(request: NextRequest) {
  const l = request.nextUrl.searchParams.get("l") as Lang | null;
  const lang: Lang = l && LANGS.includes(l) ? l : "fr";
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  // Only same-site paths ("/x"), never "//evil.com" or "https://…" (open redirect).
  const target = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";

  const res = NextResponse.redirect(new URL(target, request.url), 303);
  res.cookies.set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
