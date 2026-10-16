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
  const res = NextResponse.redirect(safeNext(request), 303);
  res.cookies.set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/**
 * Where to send the browser back to: a same-site path only (no open redirect).
 * The value is resolved with the URL parser FIRST and accepted only if it stays
 * on our origin: the parser drops tab/LF/CR and reads a backslash as "/", so checking
 * the raw string alone let "/%09/evil.example" through. Control characters and
 * backslashes are refused outright, and so is a resolved path starting with "//".
 */
function safeNext(request: NextRequest): URL {
  const home = new URL("/", request.url);
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  if (!next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return home;
  let resolved: URL;
  try {
    resolved = new URL(next, request.url);
  } catch {
    return home;
  }
  // "/.//evil.example" resolves to pathname "//evil.example" on OUR origin; re-parsing
  // that pathname would make it scheme-relative (another site). Refuse it, and
  // return the validated URL object itself, never a re-parsed string.
  if (resolved.origin !== home.origin || resolved.pathname.startsWith("//")) return home;
  return resolved;
}
