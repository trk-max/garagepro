import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { middleware } from "@/middleware";
import nextConfig from "../next.config";

vi.mock("@/lib/session", () => ({
  getStaff: vi.fn(async () => ({ id: "staff" })),
}));
vi.mock("@/lib/permissions", () => ({
  can: vi.fn(() => true),
}));
vi.mock("@/server/signatures", () => ({
  readSignatureFile: vi.fn(async () => new Response("signed document", { headers: { "Content-Type": "text/html" } })),
}));

import { GET as getSignature } from "@/app/api/signatures/[id]/[which]/route";

const responseFor = (path: string, protocol: "http" | "https" = "https") =>
  middleware(new NextRequest(`${protocol}://garagepro.test${path}`));

describe("browser security headers", () => {
  it("sets a fresh nonce CSP and baseline headers", () => {
    const first = responseFor("/");
    const second = responseFor("/");
    const csp = first.headers.get("Content-Security-Policy") ?? "";

    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/]+=*' 'strict-dynamic'/);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(first.headers.get("Content-Security-Policy")).not.toBe(second.headers.get("Content-Security-Policy"));
    expect(first.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(first.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(first.headers.get("Permissions-Policy")).toBe("camera=()");
  });

  it("allows camera only on pages that use camera capture", () => {
    for (const path of ["/accueil/borne", "/garage/atelier", "/garage/app/ordre/work-order-1", "/garage/work-orders/work-order-1"]) {
      expect(responseFor(path).headers.get("Permissions-Policy"), path).toBe("camera=(self)");
    }
    expect(responseFor("/garage/app").headers.get("Permissions-Policy")).toBe("camera=()");
  });

  it("allows only the configured Supabase origin for browser storage requests and images", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://garage-example.supabase.co";
    try {
      const csp = responseFor("/").headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("img-src 'self' data: blob: https://garage-example.supabase.co");
      expect(csp).toContain("connect-src 'self' https://garage-example.supabase.co");
      expect(csp).not.toContain("https://*.supabase.co");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });

  it("adds HSTS only to HTTPS requests", () => {
    expect(responseFor("/", "https").headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(responseFor("/", "http").headers.has("Strict-Transport-Security")).toBe(false);
  });

  it("leaves the signed document CSP to the signature route", async () => {
    const middlewareResponse = responseFor("/api/signatures/work-order-1/document");
    expect(middlewareResponse.headers.has("Content-Security-Policy")).toBe(false);

    const response = await getSignature(new Request("https://garagepro.test/api/signatures/work-order-1/document"), {
      params: Promise.resolve({ id: "work-order-1", which: "document" }),
    });
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  });

  it("keeps the service worker cache and scope headers", async () => {
    const rules = await nextConfig.headers?.();
    const workerHeaders = rules?.find((rule) => rule.source === "/sw.js")?.headers;
    expect(workerHeaders).toContainEqual({ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" });
    expect(workerHeaders).toContainEqual({ key: "Service-Worker-Allowed", value: "/" });
  });
});
