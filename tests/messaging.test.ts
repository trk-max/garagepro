import { describe, expect, it } from "vitest";
import { conversationScope, hashToken, isTokenShape, newBuyerToken } from "@/server/messaging";

describe("buyer private links", () => {
  it("tokens are 32 url-safe characters, all different, stored as a SHA-256", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newBuyerToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(isTokenShape(t), t).toBe(true);
    const one = [...tokens][0]!;
    expect(hashToken(one)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(one)).not.toContain(one);
  });
  it("anything that does not look like a token is refused before any query", () => {
    for (const bad of ["", "short", "x".repeat(33), "../../../../etc/passwd/aaaaaaaaa", "a b".padEnd(32, "c"), "é".repeat(32)]) expect(isTokenShape(bad), bad).toBe(false);
  });
});

describe("who sees which conversation", () => {
  it("admin and showroom manager: everything; seller: own listings only; others: nothing", () => {
    expect(conversationScope({ id: "a", role: "ADMIN" })).toEqual({});
    expect(conversationScope({ id: "m", role: "SHOWROOM_MANAGER" })).toEqual({});
    expect(conversationScope({ id: "s1", role: "SELLER" })).toEqual({ OR: [{ listing: { sellerId: "s1" } }, { listingId: null, assignedToId: "s1" }] });
    for (const role of ["MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER"] as const) expect(conversationScope({ id: "x", role }), role).toEqual({ id: "__none__" });
  });
});
