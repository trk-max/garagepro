import { beforeEach, describe, expect, it, vi } from "vitest";
import { attemptsDb, portalAttempt, resetAttempts, tick } from "./helpers/fake-attempts";

/** /api/assistant caps (30 per visitor per hour, 800 per site per day) hold under parallel requests. */
const state = vi.hoisted(() => ({ providerCalls: 0, ip: "203.0.113.7", rotate: false, n: 0 }));

vi.mock("@/lib/prisma", async () => {
  const h = await import("./helpers/fake-attempts");
  return { prisma: { portalAttempt: h.portalAttempt, $transaction: (fn: (tx: unknown) => Promise<unknown>) => h.fakeTransaction(fn) } };
});
vi.mock("@/server/assistant", async (orig) => {
  const real = await orig<typeof import("@/server/assistant")>();
  return {
    ...real,
    aiConfigured: () => true,
    askAssistant: async () => {
      state.providerCalls++;
      await tick();
      return { reply: "ok", booking: null };
    },
  };
});
vi.mock("@/server/portal-session", () => ({ clientIp: async () => (state.rotate ? `198.51.100.${state.n++}` : state.ip) }));
vi.mock("@/lib/i18n/server", async () => {
  const { fr } = await import("@/lib/i18n/fr");
  return { getI18n: async () => ({ t: fr, lang: "fr" }) };
});
vi.mock("@/server/settings", () => ({ getSettings: async () => ({ garageName: "G", phone: null, bookingEnabled: true }) }));
vi.mock("@/server/booking", () => ({ listBookableServices: async () => [] }));

const { POST } = await import("@/app/api/assistant/route");
const ask = () => POST(new Request("http://localhost/api/assistant", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "Bonjour" }] }) }));

beforeEach(() => {
  resetAttempts();
  state.providerCalls = 0;
  state.ip = "203.0.113.7";
  state.rotate = false;
  state.n = 0;
});

describe("AI assistant limits under concurrency", () => {
  it("50 parallel requests from one visitor: at most 30 reach the AI provider", async () => {
    const res = await Promise.all(Array.from({ length: 50 }, ask));
    expect(state.providerCalls).toBe(30);
    expect(res.filter((r) => r.status === 429)).toHaveLength(20);
  });

  it("site cap: with 799 of 800 used, a burst lets exactly one through and gives the visitors' slots back", async () => {
    await portalAttempt.createMany({ data: Array.from({ length: 799 }, () => ({ key: "ai:site", ok: true })) });
    state.rotate = true; // 20 different visitors
    const res = await Promise.all(Array.from({ length: 20 }, ask));
    expect(state.providerCalls).toBe(1);
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    // Refused requests do not keep a per-visitor slot.
    expect(attemptsDb.rows.filter((r) => r.key.startsWith("ai:ip:"))).toHaveLength(1);
  });
});

