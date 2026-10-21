import { describe, expect, it } from "vitest";
import { lastMonths, monthKey, monthlyMoney } from "@/lib/dashboard-series";

describe("dashboard — money per month", () => {
  it("uses the garage's time zone (00:30 in Tunis on 1 Nov is November)", () => {
    expect(monthKey(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
    expect(monthKey(new Date("2026-10-31T22:30:00Z"))).toBe("2026-10");
  });

  it("lists the last months across a year change, oldest first", () => {
    expect(lastMonths(new Date("2026-02-10T12:00:00Z"), 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("counts each invoice and payment once, in its own month, ignoring older ones", () => {
    const months = ["2026-09", "2026-10"];
    const points = monthlyMoney(
      months,
      [
        { issuedAt: new Date("2026-09-05T10:00:00Z"), totalTtc: 100_000 },
        { issuedAt: new Date("2026-10-01T10:00:00Z"), totalTtc: 50_000 },
        { issuedAt: new Date("2026-07-01T10:00:00Z"), totalTtc: 999_000 },
      ],
      [
        { paidAt: new Date("2026-09-20T10:00:00Z"), amount: 40_000 },
        { paidAt: new Date("2026-10-02T10:00:00Z"), amount: 60_000 },
        { paidAt: new Date("2026-10-03T10:00:00Z"), amount: 50_000 },
      ],
    );
    expect(points).toEqual([
      { month: "2026-09", invoiced: 100_000, collected: 40_000 },
      { month: "2026-10", invoiced: 50_000, collected: 110_000 },
    ]);
  });

  it("empty months stay at zero", () => {
    expect(monthlyMoney(["2026-10"], [], [])).toEqual([{ month: "2026-10", invoiced: 0, collected: 0 }]);
  });
});

describe("dashboard — garage day", () => {
  it("00:30 in Tunis is already the new day, even on a UTC server", async () => {
    const { startOfGarageDay } = await import("@/lib/dashboard-series");
    // 2026-10-21 23:30 UTC = 2026-10-22 00:30 in Tunis (UTC+1) → day starts 2026-10-21 23:00 UTC.
    expect(startOfGarageDay(new Date("2026-10-21T23:30:00Z")).toISOString()).toBe("2026-10-21T23:00:00.000Z");
    expect(startOfGarageDay(new Date("2026-10-21T12:00:00Z")).toISOString()).toBe("2026-10-20T23:00:00.000Z");
  });
});

describe("dashboard — last 7 days", () => {
  it("days in Tunis time, oldest first, across a month change", async () => {
    const { lastDays } = await import("@/lib/dashboard-series");
    expect(lastDays(new Date("2026-11-02T23:30:00Z"), 4)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  });
  it("sums per day once, ignores items outside the days and missing dates", async () => {
    const { perDay } = await import("@/lib/dashboard-series");
    const days = ["2026-10-20", "2026-10-21"];
    const items = [
      { at: new Date("2026-10-20T10:00:00Z"), v: 5 },
      { at: new Date("2026-10-20T22:59:00Z"), v: 1 },
      { at: new Date("2026-10-20T23:30:00Z"), v: 2 },
      { at: new Date("2026-10-01T10:00:00Z"), v: 99 },
      { at: null, v: 7 },
    ];
    expect(perDay(days, items, (i) => i.at, (i) => i.v)).toEqual([6, 2]);
    expect(perDay(days, items, (i) => i.at)).toEqual([2, 1]);
  });
  it("change in %, null without a base", async () => {
    const { changePercent } = await import("@/lib/dashboard-series");
    expect(changePercent(112, 100)).toBe(12);
    expect(changePercent(90, 120)).toBe(-25);
    expect(changePercent(5, 0)).toBeNull();
  });
});
