import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCanNumberDocuments, isCloudWithHub, isHubLocal } from "@/server/hub";
// @ts-expect-error plain JS script without types
import { syncMedia } from "../scripts/hub/media-sync.mjs";
// @ts-expect-error plain JS script without types
import { isCloudUrl } from "../scripts/hub/connect.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("who may number invoices / purchase orders", () => {
  // The garage PC's own .env may set these: each test states them explicitly.
  beforeEach(() => {
    vi.stubEnv("GARAGE_HUB", "");
    vi.stubEnv("GARAGE_HUB_LOCAL", "");
  });
  it("no hub: everywhere (as before)", () => {
    expect(() => assertCanNumberDocuments()).not.toThrow();
  });
  it("online site of a garage with a hub: refused", () => {
    vi.stubEnv("GARAGE_HUB", "1");
    expect(isCloudWithHub()).toBe(true);
    expect(() => assertCanNumberDocuments()).toThrow();
  });
  it("garage PC (hub): allowed", () => {
    vi.stubEnv("GARAGE_HUB", "1");
    vi.stubEnv("GARAGE_HUB_LOCAL", "1");
    expect(isHubLocal()).toBe(true);
    expect(() => assertCanNumberDocuments()).not.toThrow();
  });
});

it("recognises a Supabase address (the garage PC must use a local one)", () => {
  expect(isCloudUrl("postgresql://u:p@aws-1-eu-central-1.pooler.supabase.com:5432/postgres")).toBe(true);
  expect(isCloudUrl("postgresql://postgres:p@localhost:5432/garagepro")).toBe(false);
});

describe("photos sync", () => {
  /** Minimal stand-in for the local database (state + media list). */
  function fakeDb(keys: string[]) {
    const state = new Map<string, unknown>();
    return {
      state,
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes('FROM "WorkOrderMedia"')) return { rows: keys.map((key) => ({ key, type: "image/jpeg" })) };
        if (sql.startsWith("SELECT value")) return { rows: state.has(params[0] as string) ? [{ value: state.get(params[0] as string) }] : [] };
        if (sql.includes('INSERT INTO "_sync_state"')) return state.set(params[0] as string, JSON.parse(params[1] as string)), { rows: [] };
        throw new Error(sql);
      },
    };
  }
  const config = { url: "https://x.supabase.co", key: "k", bucket: "media" };

  it("uploads local files once, downloads files added online, ignores unknown keys", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "gp-media-"));
    mkdirSync(path.join(root, "wo"), { recursive: true });
    writeFileSync(path.join(root, "wo/a.jpg"), "AAA");
    const db = fakeDb(["wo/a.jpg", "wo/b.jpg", "wo/missing.jpg"]);
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response("{}", { status: 200 });
      if (url.includes("/object/authenticated/") && url.endsWith("wo/b.jpg")) return new Response("BBB", { status: 200 });
      return new Response("nope", { status: 404 });
    });
    const r1 = await syncMedia(db, { root, config, fetchImpl });
    expect([r1.uploaded, r1.downloaded]).toEqual([1, 1]);
    expect(readFileSync(path.join(root, "wo/b.jpg"), "utf8")).toBe("BBB");
    const calls = fetchImpl.mock.calls.length;
    const r2 = await syncMedia(db, { root, config, fetchImpl });
    expect([r2.uploaded, r2.downloaded]).toEqual([0, 0]);
    expect(fetchImpl.mock.calls.length - calls).toBe(1); // only the still-missing one is asked again
  });

  it("refuses storage keys that escape the folder", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "gp-media-"));
    const r = await syncMedia(fakeDb(["../../etc/passwd"]), { root, config, fetchImpl: vi.fn() });
    expect(r.errors[0]).toMatch(/Invalid storage key/);
  });

  it("does nothing without the online bucket settings", async () => {
    expect((await syncMedia(fakeDb([]), { config: null })).skipped).toBe(true);
  });
});
