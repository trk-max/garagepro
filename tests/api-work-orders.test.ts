import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** GET /api/work-orders: role gate (viewWorkOrders) and tracking PIN only for manageTracking. */
const state = vi.hoisted(() => ({ role: "ADMIN" as string | null, listed: 0 }));

vi.mock("@/lib/auth", () => ({ auth: async () => (state.role ? { user: { id: "u1" } } : null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async () => (state.role ? { id: "u1", name: "Test", email: "t@g.tn", role: state.role, isActive: true } : null),
    },
  },
}));
vi.mock("@/server/work-orders", () => ({
  listWorkOrders: async () => {
    state.listed++;
    return [{ id: "wo1", number: 41, trackingPin: "1234", vehicle: { plate: "120TU3450" }, customer: { name: "Client", phone: "22 000 000" } }];
  },
}));

const { GET } = await import("@/app/api/work-orders/route");
const call = () => GET(new NextRequest("http://localhost:3000/api/work-orders?status=all"));

beforeEach(() => {
  state.listed = 0;
});

describe("GET /api/work-orders", () => {
  it("refuses signed-out visitors (401)", async () => {
    state.role = null;
    expect((await call()).status).toBe(401);
    expect(state.listed).toBe(0);
  });

  it("refuses STOREKEEPER, who has no viewWorkOrders (403), without loading anything", async () => {
    state.role = "STOREKEEPER";
    expect((await call()).status).toBe(403);
    expect(state.listed).toBe(0);
  });

  it("MECHANIC sees work orders but never the tracking PIN", async () => {
    state.role = "MECHANIC";
    const res = await call();
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty("trackingPin");
    expect(JSON.stringify(items)).not.toContain("1234");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["ADMIN", "RECEPTION"])("%s (manageTracking) still gets the PIN", async (role) => {
    state.role = role;
    const { items } = await (await call()).json();
    expect(items[0].trackingPin).toBe("1234");
  });
});
