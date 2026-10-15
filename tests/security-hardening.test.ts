import { describe, expect, it } from "vitest";
import { demoSeedRefusal } from "../prisma/seed-guard";
import { phoneMatchNeedle } from "@/lib/booking";
import { resolveBaseUrl } from "@/lib/base-url";
import { bookingSchema } from "@/lib/validators";
import { customerVisibleEvents } from "@/server/portal";

describe("base URL for customer links (APP_URL only, never Host headers)", () => {
  it("uses APP_URL, without trailing slash", () => {
    expect(resolveBaseUrl({ APP_URL: "https://garage.example/", NODE_ENV: "production" })).toBe("https://garage.example");
    expect(resolveBaseUrl({ APP_URL: " http://192.168.1.20:3000 ", NODE_ENV: "production" })).toBe("http://192.168.1.20:3000");
  });
  it("refuses to guess in production when APP_URL is missing", () => {
    expect(() => resolveBaseUrl({ NODE_ENV: "production" })).toThrow(expect.objectContaining({ code: "appUrlMissing" }));
    expect(() => resolveBaseUrl({ APP_URL: "", NODE_ENV: "production" })).toThrow(expect.objectContaining({ code: "appUrlMissing" }));
  });
  it("refuses an APP_URL that is not http(s)", () => {
    expect(() => resolveBaseUrl({ APP_URL: "javascript:alert(1)" })).toThrow(expect.objectContaining({ code: "appUrlMissing" }));
    expect(() => resolveBaseUrl({ APP_URL: "not a url" })).toThrow(expect.objectContaining({ code: "appUrlMissing" }));
  });
  it("development falls back to localhost, not to request headers", () => {
    expect(resolveBaseUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(resolveBaseUrl({ NODE_ENV: "development", PORT: "4000" })).toBe("http://localhost:4000");
  });
});

describe("booking phone: at least 8 digits", () => {
  const base = { serviceId: "c1234567890abcdefghijklm", date: "2026-10-20", time: "09:00", firstName: "A", lastName: "B", plate: "120TU3450" };
  it("rejects phones without enough digits", () => {
    for (const phone of ["--------", "(((((())))", "+ - . ( ) ", "12 34 56 7", "+216 ......"]) {
      expect(bookingSchema.safeParse({ ...base, phone }).success, phone).toBe(false);
    }
  });
  it("accepts real numbers", () => {
    for (const phone of ["20111222", "+216 20 111 222", "(+216) 20-111-222"]) {
      expect(bookingSchema.safeParse({ ...base, phone }).success, phone).toBe(true);
    }
  });
  it("never builds an empty or short needle to match a customer", () => {
    expect(phoneMatchNeedle("--------")).toBeNull();
    expect(phoneMatchNeedle("1234567")).toBeNull();
    expect(phoneMatchNeedle("+216 20 111 222")).toBe("20111222");
  });
});

describe("customer timeline hides photos that are hidden or deleted", () => {
  const events = [
    { id: "e1", type: "CREATED", data: null, body: null },
    { id: "e2", type: "MEDIA_ADDED", data: { mediaId: "visible" }, body: "Plaquettes usées" },
    { id: "e3", type: "MEDIA_ADDED", data: { mediaId: "hidden" }, body: "INTERNAL-CANARY-123" },
    { id: "e4", type: "MEDIA_ADDED", data: { mediaId: "deleted" }, body: "old" },
    { id: "e5", type: "MEDIA_ADDED", data: null, body: "no media id" },
    { id: "e6", type: "CUSTOMER_MESSAGE", data: null, body: "Merci" },
  ];
  it("keeps other events and only visible photos", () => {
    const shown = customerVisibleEvents(events, ["visible"]);
    expect(shown.map((e) => e.id)).toEqual(["e1", "e2", "e6"]);
    expect(JSON.stringify(shown)).not.toContain("INTERNAL-CANARY-123");
  });
});

describe("demo seed guard", () => {
  const supabase = "postgresql://postgres.abc:x@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
  it("refuses Supabase databases whatever NODE_ENV says", () => {
    expect(demoSeedRefusal({ DATABASE_URL: supabase })).toMatch(/Supabase/);
    expect(demoSeedRefusal({ DATABASE_URL: "postgresql://postgres:x@db.abcd.supabase.co:5432/postgres", NODE_ENV: "development" })).toMatch(/Supabase/);
  });
  it("still refuses production", () => {
    expect(demoSeedRefusal({ NODE_ENV: "production", DATABASE_URL: "postgresql://localhost/garage" })).toMatch(/production/);
  });
  it("allows a local database, or an explicit override", () => {
    expect(demoSeedRefusal({ DATABASE_URL: "postgresql://postgres:x@localhost:5432/garage" })).toBeNull();
    expect(demoSeedRefusal({ DATABASE_URL: supabase, ALLOW_DEMO_SEED: "true" })).toBeNull();
  });
  it("is not fooled by 'supabase.com' elsewhere in the URL", () => {
    expect(demoSeedRefusal({ DATABASE_URL: "postgresql://u:p@localhost:5432/supabase.com" })).toBeNull();
    expect(demoSeedRefusal({ DATABASE_URL: "postgresql://u:p@notsupabase.com.evil:5432/x" })).toBeNull();
  });
});
