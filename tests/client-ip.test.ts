import { describe, expect, it } from "vitest";
import { ipFromHeaders } from "@/lib/client-ip";

const h = (o: Record<string, string>) => new Headers(o);

describe("client IP for rate limits", () => {
  it("on Vercel: the platform header, never the client's X-Forwarded-For", () => {
    const env = { VERCEL: "1" };
    expect(ipFromHeaders(h({ "x-vercel-forwarded-for": "41.226.1.2", "x-forwarded-for": "6.6.6.6, 41.226.1.2" }), env)).toBe("41.226.1.2");
    expect(ipFromHeaders(h({ "x-real-ip": "41.226.1.2", "x-forwarded-for": "6.6.6.6" }), env)).toBe("41.226.1.2");
  });
  it("behind one proxy (default): the LAST hop, so a forged first value changes nothing", () => {
    expect(ipFromHeaders(h({ "x-forwarded-for": "1.1.1.1, 41.226.1.2" }), {})).toBe("41.226.1.2");
    expect(ipFromHeaders(h({ "x-forwarded-for": "9.9.9.9, 41.226.1.2" }), {})).toBe("41.226.1.2");
  });
  it("TRUSTED_PROXY_HOPS=2: the entry added by the outer proxy", () => {
    expect(ipFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 41.226.1.2, 10.0.0.5" }), { TRUSTED_PROXY_HOPS: "2" })).toBe("41.226.1.2");
  });
  it("TRUSTED_PROXY_HOPS=0 (no proxy): forwarding headers ignored, one shared bucket", () => {
    const env = { TRUSTED_PROXY_HOPS: "0" };
    expect(ipFromHeaders(h({ "x-forwarded-for": "1.1.1.1" }), env)).toBe("direct");
    expect(ipFromHeaders(h({ "x-forwarded-for": "2.2.2.2" }), env)).toBe("direct");
  });
  it("rotating a forged value does not give new buckets behind a proxy", () => {
    const keys = new Set(["a", "b", "c", "d", "e", "f"].map((fake) => ipFromHeaders(h({ "x-forwarded-for": `${fake}, 41.226.1.2` }), {})));
    expect(keys.size).toBe(1);
  });
  it("no header at all", () => {
    expect(ipFromHeaders(h({}), {})).toBe("unknown");
    expect(ipFromHeaders(undefined, {})).toBe("unknown");
  });
});
