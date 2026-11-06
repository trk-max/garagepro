import { NextRequest, NextResponse } from "next/server";

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function storageOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return null;
  const parsed = new URL(configuredUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use http or https");
  }
  return parsed.origin;
}

function contentSecurityPolicy(scriptNonce: string) {
  const storage = storageOrigin();
  const storageSource = storage ? ` ${storage}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${scriptNonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${storageSource}`,
    "font-src 'self' data:",
    `connect-src 'self'${storageSource}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function cameraIsUsed(pathname: string) {
  return (
    pathname === "/accueil/borne" ||
    pathname === "/garage/atelier" ||
    /^\/garage\/(?:app\/ordre|work-orders)\/[^/]+$/.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const signedDocument = /^\/api\/signatures\/[^/]+\/document$/.test(pathname);
  const requestHeaders = new Headers(request.headers);
  let csp: string | null = null;

  if (!signedDocument) {
    csp = contentSecurityPolicy(nonce());
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (csp) response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", cameraIsUsed(pathname) ? "camera=(self)" : "camera=()");

  if (request.nextUrl.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
