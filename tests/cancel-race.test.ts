import { describe, expect, it, vi } from "vitest";

/**
 * Two simultaneous "Cancel" on the same work order: parts go back to stock once.
 * The fake database behaves like PostgreSQL READ COMMITTED: both transactions
 * read the old status, and an UPDATE … WHERE status = old matches only once.
 */
const db = vi.hoisted(() => ({ status: "IN_PROGRESS", stock: 1000, movements: 0 }));
const tick = () => new Promise((r) => setTimeout(r, 1));

vi.mock("@/lib/prisma", () => {
  const tx = {
    workOrder: {
      findUnique: async () => {
        const snapshot = { status: db.status, invoice: null, lines: [{ partId: "p1", quantityX100: 200 }] };
        await tick();
        return snapshot;
      },
      update: async ({ data }: { data: { status: string } }) => {
        await tick();
        db.status = data.status; // unconditional (the old, racy write)
        return {};
      },
      updateMany: async ({ where, data }: { where: { id: string; status?: string }; data: { status: string } }) => {
        await tick();
        if (where.status !== undefined && where.status !== db.status) return { count: 0 };
        db.status = data.status;
        return { count: 1 };
      },
    },
    part: {
      update: async ({ data }: { data: { stockX100: { increment: number } } }) => {
        db.stock += data.stockX100.increment;
        return { stockX100: db.stock };
      },
    },
    stockMovement: { create: async () => void db.movements++ },
    workOrderEvent: { create: async () => ({}) },
    auditLog: { create: async () => ({}) }, // journal (V7)
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("@/server/settings", () => ({ getSettings: async () => ({}) }));

const { changeStatus } = await import("@/server/work-orders");
const actor = { id: "u1", name: "Karim", email: "k@g.tn", role: "MECHANIC" as const };

describe("concurrent cancellation", () => {
  it("returns the parts to stock only once", async () => {
    const results = await Promise.allSettled([changeStatus("wo1", "CANCELLED", actor), changeStatus("wo1", "CANCELLED", actor)]);
    expect(db.status).toBe("CANCELLED");
    expect(db.stock).toBe(1200); // not 1400
    expect(db.movements).toBe(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "transition" });
  });
});
