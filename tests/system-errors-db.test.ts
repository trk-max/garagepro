import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    systemError: {
      count: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    syncState: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getSystemHealthBadge, pruneSystemErrors, recordSystemError } from "@/server/system-errors";

describe("system error persistence", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GARAGE_HUB", "");
    vi.stubEnv("GARAGE_HUB_LOCAL", "");
    prismaMock.systemError.upsert.mockResolvedValue({});
    prismaMock.systemError.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.systemError.count.mockResolvedValue(0);
  });

  it("uses a stable fingerprint to deduplicate and stores a safe summary", async () => {
    const recorded = await recordSystemError({
      source: "api",
      place: "work-orders",
      error: new Error("password=do-not-store"),
    });

    expect(recorded).toBe(true);
    const [call] = prismaMock.systemError.upsert.mock.calls[0]!;
    expect(call.create.id).toBe(call.create.fingerprint);
    expect(call.create.message).toBe("Internal failure (Error)");
    expect(call.update.count).toEqual({ increment: 1 });
    expect(prismaMock.systemError.deleteMany).toHaveBeenCalledOnce();
  });

  it("prunes entries older than 30 days", async () => {
    const now = new Date("2026-03-01T12:00:00.000Z");
    await pruneSystemErrors(now);
    expect(prismaMock.systemError.deleteMany).toHaveBeenCalledWith({
      where: { lastSeenAt: { lt: new Date("2026-01-30T12:00:00.000Z") } },
    });
  });

  it("shows a recent-error count in the navigation badge", async () => {
    prismaMock.systemError.count.mockResolvedValue(3);
    expect(await getSystemHealthBadge(new Date("2026-03-01T12:00:00.000Z"))).toBe(3);
  });
});
