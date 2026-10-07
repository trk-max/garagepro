import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In-memory stand-in for Prisma, just enough for the stock and rate-limit code.
 * `updateMany` applies its WHERE condition atomically, like PostgreSQL does.
 */
const db = vi.hoisted(() => ({
  parts: new Map<string, { stockX100: number }>(),
  movements: [] as { partId: string; deltaX100: number }[],
  attempts: [] as { key: string; ok: boolean; createdAt: Date }[],
}));

vi.mock("@/lib/prisma", () => {
  const part = {
    updateMany: async ({ where, data }: { where: { id: string; stockX100?: { gte: number } }; data: { stockX100: { increment: number } } }) => {
      const p = db.parts.get(where.id);
      if (!p || (where.stockX100 && p.stockX100 < where.stockX100.gte)) return { count: 0 };
      p.stockX100 += data.stockX100.increment;
      return { count: 1 };
    },
    findUnique: async ({ where }: { where: { id: string } }) => db.parts.get(where.id) ?? null,
  };
  const stockMovement = { create: async ({ data }: { data: { partId: string; deltaX100: number } }) => db.movements.push(data) };
  const portalAttempt = {
    count: async ({ where }: { where: { key: string; createdAt: { gte: Date }; ok?: boolean } }) =>
      db.attempts.filter((a) => a.key === where.key && a.createdAt >= where.createdAt.gte && (where.ok === undefined || a.ok === where.ok)).length,
    create: async ({ data }: { data: { key: string; ok: boolean } }) => db.attempts.push({ ...data, createdAt: new Date() }),
    deleteMany: async () => ({ count: 0 }),
  };
  const tx = { part, stockMovement };
  return { prisma: { part, stockMovement, portalAttempt, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

const { moveStock } = await import("@/server/parts");
const { isLimited, recordAttempt } = await import("@/server/rate-limit");
const actor = { id: "u1", name: "Stock", email: "stock@garage.tn", role: "STOREKEEPER" as const };
const exit = (qty: number) => moveStock("p1", { delta: -qty * 100, reason: "ADJUSTMENT" }, actor);
const stock = () => db.parts.get("p1")!.stockX100 / 100;

beforeEach(() => {
  db.parts.clear();
  db.movements.length = 0;
  db.attempts.length = 0;
});

describe("manual stock movement", () => {
  it("10 − 3 = 7", async () => {
    db.parts.set("p1", { stockX100: 1_000 });
    await exit(3);
    expect(stock()).toBe(7);
    expect(db.movements).toHaveLength(1);
  });
  it("2 − 2 = 0", async () => {
    db.parts.set("p1", { stockX100: 200 });
    await exit(2);
    expect(stock()).toBe(0);
  });
  it("2 − 5 is refused, stock and history unchanged", async () => {
    db.parts.set("p1", { stockX100: 200 });
    await expect(exit(5)).rejects.toMatchObject({ code: "insufficientStock", status: 409 });
    expect(stock()).toBe(2);
    expect(db.movements).toHaveLength(0);
  });
  it("0 − 1 is refused", async () => {
    db.parts.set("p1", { stockX100: 0 });
    await expect(exit(1)).rejects.toMatchObject({ code: "insufficientStock" });
  });
  it("decimal quantities (1,5 L of oil)", async () => {
    db.parts.set("p1", { stockX100: 500 });
    await exit(1.5);
    expect(stock()).toBe(3.5);
  });
  it("an entry can always be added", async () => {
    db.parts.set("p1", { stockX100: 0 });
    await moveStock("p1", { delta: 400, reason: "PURCHASE" }, actor);
    expect(stock()).toBe(4);
  });
  it("zero movement is refused", async () => {
    db.parts.set("p1", { stockX100: 100 });
    await expect(moveStock("p1", { delta: 0, reason: "ADJUSTMENT" }, actor)).rejects.toMatchObject({ code: "invalid" });
  });
  it("unknown part = not found", async () => {
    await expect(exit(1)).rejects.toMatchObject({ code: "notFound", status: 404 });
  });
  it("two simultaneous exits of the last unit: only one succeeds", async () => {
    db.parts.set("p1", { stockX100: 100 });
    const results = await Promise.allSettled([exit(1), exit(1)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(stock()).toBe(0);
  });
});

describe("login / PIN rate limiter", () => {
  it("blocks after the maximum number of failures", async () => {
    for (let i = 0; i < 4; i++) await recordAttempt("login:email:a@b.tn", false);
    expect(await isLimited("login:email:a@b.tn", 5, 15)).toBe(false);
    await recordAttempt("login:email:a@b.tn", false);
    expect(await isLimited("login:email:a@b.tn", 5, 15)).toBe(true);
  });
  it("successful logins never count as failures", async () => {
    for (let i = 0; i < 10; i++) await recordAttempt("login:email:ok@b.tn", true);
    expect(await isLimited("login:email:ok@b.tn", 5, 15)).toBe(false);
  });
  it("one blocked e-mail does not block another", async () => {
    for (let i = 0; i < 5; i++) await recordAttempt("login:email:bad@b.tn", false);
    expect(await isLimited("login:email:other@b.tn", 5, 15)).toBe(false);
  });
});
