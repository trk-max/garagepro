import { describe, expect, it } from "vitest";
import { MAX_OCCURRENCES, dueDates } from "@/lib/expense-schedule";

describe("due dates of fixed costs", () => {
  it("one-off: a single date, only if within the horizon", () => {
    expect(dueDates({ frequency: "ONCE", firstDueDate: "2026-11-05", endDate: null }, "2026-12-31")).toEqual(["2026-11-05"]);
    expect(dueDates({ frequency: "ONCE", firstDueDate: "2027-02-01", endDate: null }, "2026-12-31")).toEqual([]);
  });
  it("monthly on the 31st: last day of short months, back to the 31st (computed from the first date)", () => {
    expect(dueDates({ frequency: "MONTHLY", firstDueDate: "2026-01-31", endDate: null }, "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });
  it("quarterly and yearly", () => {
    expect(dueDates({ frequency: "QUARTERLY", firstDueDate: "2026-01-15", endDate: null }, "2026-12-31")).toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
    expect(dueDates({ frequency: "YEARLY", firstDueDate: "2024-02-29", endDate: null }, "2027-03-01")).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28"]);
  });
  it("stops at the end date (inclusive) or the horizon, whichever first", () => {
    expect(dueDates({ frequency: "MONTHLY", firstDueDate: "2026-01-10", endDate: "2026-03-10" }, "2026-12-31")).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
    expect(dueDates({ frequency: "MONTHLY", firstDueDate: "2026-01-10", endDate: "2026-12-10" }, "2026-02-09")).toEqual(["2026-01-10"]);
  });
  it("unknown frequency or end before start: nothing (never invented)", () => {
    expect(dueDates({ frequency: "WEEKLY", firstDueDate: "2026-01-10", endDate: null }, "2026-12-31")).toEqual([]);
    expect(dueDates({ frequency: "MONTHLY", firstDueDate: "2026-05-10", endDate: "2026-04-10" }, "2026-12-31")).toEqual([]);
  });
  it("is capped for absurd ranges", () => {
    expect(dueDates({ frequency: "MONTHLY", firstDueDate: "2000-01-01", endDate: null }, "2100-01-01")).toHaveLength(MAX_OCCURRENCES);
  });
});
