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
