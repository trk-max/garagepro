import { describe, expect, it } from "vitest";
import {
  compared,
  monthToDateWindows,
  percentOfMinimum,
  presenceFrom,
  revenueByMonthFrom,
  stockValue,
  sumIn,
  targetProgress,
  todayWindows,
  weekWindows,
  yearWindow,
} from "@/lib/dashboard-v10";

const iso = (w: { from: Date; to: Date }) => ({ from: w.from.toISOString(), to: w.to.toISOString() });
const TZ = "Africa/Tunis"; // UTC+1, no summer time

describe("V10 — today vs same day last month", () => {
  it("cuts the garage day and compares the same elapsed time", () => {
    const w = todayWindows(new Date("2026-10-21T13:30:00Z"), TZ);
    expect(iso(w.current)).toEqual({ from: "2026-10-20T23:00:00.000Z", to: "2026-10-21T13:30:00.000Z" });
    expect(iso(w.previous)).toEqual({ from: "2026-09-20T23:00:00.000Z", to: "2026-09-21T13:30:00.000Z" });
  });

  it("00:30 in Tunis on 1 Nov is already 1 Nov (server in UTC)", () => {
    const w = todayWindows(new Date("2026-10-31T23:30:00Z"), TZ);
    expect(iso(w.current)).toEqual({ from: "2026-10-31T23:00:00.000Z", to: "2026-10-31T23:30:00.000Z" });
    expect(iso(w.previous)).toEqual({ from: "2026-09-30T23:00:00.000Z", to: "2026-09-30T23:30:00.000Z" });
  });

  it("31 March compares with the last day of February; January with December", () => {
    expect(todayWindows(new Date("2026-03-31T10:00:00Z"), TZ).previous.from.toISOString()).toBe("2026-02-27T23:00:00.000Z");
    expect(todayWindows(new Date("2026-01-15T10:00:00Z"), TZ).previous.from.toISOString()).toBe("2025-12-14T23:00:00.000Z");
  });
});

describe("V10 — month to date and garage week", () => {
  it("month to date vs last month up to the same day and time", () => {
    const w = monthToDateWindows(new Date("2026-10-21T13:30:00Z"), TZ);
    expect(iso(w.current)).toEqual({ from: "2026-09-30T23:00:00.000Z", to: "2026-10-21T13:30:00.000Z" });
    expect(iso(w.previous)).toEqual({ from: "2026-08-31T23:00:00.000Z", to: "2026-09-21T13:30:00.000Z" });
  });

  it("when last month is shorter, the whole of last month is used", () => {
    const w = monthToDateWindows(new Date("2026-03-31T10:00:00Z"), TZ);
    expect(iso(w.previous)).toEqual({ from: "2026-01-31T23:00:00.000Z", to: "2026-02-28T23:00:00.000Z" });
  });

  it("the week starts on Monday 00:00 garage time, also late on Sunday night", () => {
    expect(weekWindows(new Date("2026-10-21T13:30:00Z"), TZ).current.from.toISOString()).toBe("2026-10-18T23:00:00.000Z");
    expect(weekWindows(new Date("2026-10-25T22:30:00Z"), TZ).current.from.toISOString()).toBe("2026-10-18T23:00:00.000Z"); // Sunday 23:30
    const monday = weekWindows(new Date("2026-10-25T23:30:00Z"), TZ); // Monday 00:30
    expect(iso(monday.current)).toEqual({ from: "2026-10-25T23:00:00.000Z", to: "2026-10-25T23:30:00.000Z" });
    expect(iso(monday.previous)).toEqual({ from: "2026-10-18T23:00:00.000Z", to: "2026-10-18T23:30:00.000Z" });
  });

  it("year window and half-open sums", () => {
    const y = yearWindow(2026, TZ);
    expect(iso(y)).toEqual({ from: "2025-12-31T23:00:00.000Z", to: "2026-12-31T23:00:00.000Z" });
    const items = [{ at: y.from, v: 1 }, { at: y.to, v: 10 }];
    expect(sumIn(items, y, (i) => i.at, (i) => i.v)).toBe(1);
  });
});

describe("V10 — revenue by month (no double counting)", () => {
  it("a partly paid invoice: received in the months paid, the rest pending in its issue month", () => {
    const rows = revenueByMonthFrom(
      2026,
      [{ issuedAt: new Date("2026-01-10T10:00:00Z"), totalTtc: 100_000, paidAmount: 60_000 }],
      [
        { paidAt: new Date("2026-01-12T10:00:00Z"), amount: 40_000 },
        { paidAt: new Date("2026-02-03T10:00:00Z"), amount: 20_000 },
      ],
      TZ,
    );
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ month: "2026-01", paid: 40_000, pending: 40_000 });
    expect(rows[1]).toEqual({ month: "2026-02", paid: 20_000, pending: 0 });
    expect(rows.reduce((s, r) => s + r.paid + r.pending, 0)).toBe(100_000);
  });

  it("cuts the year in the garage's time zone; overpaid never gives negative pending", () => {
    const rows = revenueByMonthFrom(
      2026,
      [
        { issuedAt: new Date("2025-12-31T23:30:00Z"), totalTtc: 5_000, paidAmount: 0 }, // 1 Jan 00:30 Tunis
        { issuedAt: new Date("2026-03-01T10:00:00Z"), totalTtc: 5_000, paidAmount: 6_000 },
      ],
      [{ paidAt: new Date("2026-12-31T23:30:00Z"), amount: 7_000 }], // 1 Jan 2027 in Tunis
      TZ,
    );
    expect(rows[0]!.pending).toBe(5_000);
    expect(rows[2]!.pending).toBe(0);
    expect(rows[11]!.paid).toBe(0);
  });

  it("empty data → twelve zero months", () => {
    const rows = revenueByMonthFrom(2027, [], [], TZ);
    expect(rows.map((r) => r.month)).toEqual(Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, "0")}`));
    expect(rows.every((r) => r.paid === 0 && r.pending === 0)).toBe(true);
  });
});

describe("V10 — small figures", () => {
  it("delta is null when there is nothing to compare with", () => {
    expect(compared(0, 0)).toEqual({ current: 0, previous: 0, deltaPercent: null });
    expect(compared(150, 100).deltaPercent).toBe(50);
    expect(compared(50, 100).deltaPercent).toBe(-50);
  });

  it("target progress, stock value and % of minimum", () => {
    expect(targetProgress(0, 1234)).toEqual({ target: 0, achieved: 1234, percent: null });
    expect(targetProgress(2_000_000, 500_000).percent).toBe(25);
    expect(stockValue([{ stockX100: 150, costPrice: 2_000 }, { stockX100: -100, costPrice: 9_999 }])).toBe(3_000);
    expect(stockValue([])).toBe(0);
    expect(percentOfMinimum(250, 500)).toBe(50);
    expect(percentOfMinimum(500, 0)).toBeNull();
  });

  it("presence from the last clock event", () => {
    expect(presenceFrom("IN")).toBe("ACTIVE");
    expect(presenceFrom("BREAK_END")).toBe("ACTIVE");
    expect(presenceFrom("BREAK_START")).toBe("ON_BREAK");
    expect(presenceFrom("OUT")).toBe("OFF");
    expect(presenceFrom(undefined)).toBe("OFF");
  });
});
