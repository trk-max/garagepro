import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import { addMonthsToDay, autoWarrantyTerms, canMoveClaim, claimBalance, warrantyValidity } from "@/lib/warranty";

const w = (over: Partial<Parameters<typeof warrantyValidity>[0]> = {}) => ({ startDay: "2026-01-10", endDay: "2026-07-09", endKm: null, voided: false, ...over });

describe("warranty validity (date and/or km, whichever first)", () => {
  it("valid up to and including the last day", () => {
    expect(warrantyValidity(w(), "2026-07-09", null)).toMatchObject({ status: "ACTIVE", daysLeft: 1 });
    expect(warrantyValidity(w(), "2026-07-10", null)).toMatchObject({ status: "EXPIRED", endedBy: "date" });
  });
  it("the mileage limit ends it before the date", () => {
    const x = w({ endKm: 90_000 });
    expect(warrantyValidity(x, "2026-03-01", 89_999)).toMatchObject({ status: "ACTIVE", kmLeft: 1 });
    expect(warrantyValidity(x, "2026-03-01", 90_000)).toMatchObject({ status: "EXPIRED", endedBy: "km" });
  });
  it("the date ends it before the mileage", () => {
    expect(warrantyValidity(w({ endKm: 200_000 }), "2026-08-01", 100_000)).toMatchObject({ status: "EXPIRED", endedBy: "date" });
  });
  it("km limit with unknown current mileage: only the date is checked (flagged)", () => {
    expect(warrantyValidity(w({ endKm: 90_000 }), "2026-03-01", null)).toMatchObject({ status: "ACTIVE", kmUnchecked: true, kmLeft: null });
  });
  it("km-only warranty with unknown mileage, or no limit at all: UNKNOWN, never assumed valid", () => {
    expect(warrantyValidity(w({ endDay: null, endKm: 90_000 }), "2026-03-01", null).status).toBe("UNKNOWN");
    expect(warrantyValidity(w({ endDay: null, endKm: null }), "2026-03-01", 10).status).toBe("UNKNOWN");
  });
  it("cancelled beats everything", () => {
    expect(warrantyValidity(w({ voided: true }), "2026-03-01", null).status).toBe("VOID");
  });
  it("days left counted from the start when it has not started yet", () => {
    expect(warrantyValidity(w({ startDay: "2026-07-01" }), "2026-06-01", null).daysLeft).toBe(9);
  });
});

describe("dates and automatic warranty terms", () => {
  it("adds months without overflowing into the next month", () => {
    expect(addMonthsToDay("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDay("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsToDay("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsToDay("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("0 months and 0 km = no automatic warranty", () => {
    expect(autoWarrantyTerms({ warrantyMonths: 0, warrantyKm: 0 }, "2026-10-21", 50_000)).toBeNull();
  });
  it("6 months / 10 000 km from delivery", () => {
    expect(autoWarrantyTerms({ warrantyMonths: 6, warrantyKm: 10_000 }, "2026-10-21", 50_000)).toEqual({ startDay: "2026-10-21", endDay: "2027-04-20", startKm: 50_000, endKm: 60_000, kmMissing: false });
  });
  it("km setting without a starting mileage: no km limit, flagged (never invented)", () => {
    expect(autoWarrantyTerms({ warrantyMonths: 0, warrantyKm: 10_000 }, "2026-10-21", null)).toEqual({ startDay: "2026-10-21", endDay: null, startKm: null, endKm: null, kmMissing: true });
  });
});

describe("claims", () => {
  it("follows OPEN → SUBMITTED → decision → CLOSED", () => {
    expect(canMoveClaim("OPEN", "SUBMITTED")).toBe(true);
    expect(canMoveClaim("OPEN", "ACCEPTED")).toBe(false);
    expect(canMoveClaim("SUBMITTED", "PARTIAL")).toBe(true);
    expect(canMoveClaim("REJECTED", "ACCEPTED")).toBe(false);
    expect(canMoveClaim("CLOSED", "OPEN")).toBe(false);
    expect(canMoveClaim("BOGUS", "OPEN")).toBe(false);
  });
  it("expected refund = accepted − received (voided refunds ignored), only while accepted", () => {
    const refunds = [
      { amount: 30_000, voided: false },
      { amount: 50_000, voided: true },
    ];
    expect(claimBalance({ status: "PARTIAL", amountAccepted: 100_000 }, refunds)).toEqual({ accepted: 100_000, received: 30_000, expected: 70_000 });
    expect(claimBalance({ status: "CLOSED", amountAccepted: 100_000 }, refunds).expected).toBe(0);
    expect(claimBalance({ status: "REJECTED", amountAccepted: 100_000 }, []).accepted).toBe(0);
    expect(claimBalance({ status: "SUBMITTED", amountAccepted: null }, []).expected).toBe(0);
  });
});

describe("warranty permissions", () => {
  it("the floor opens claims; only admin and manager see money and the forecast", () => {
    for (const r of ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"] as const) expect(can(r, "manageWarranties"), r).toBe(true);
    expect(can("STOREKEEPER", "manageWarranties")).toBe(false);
    for (const p of ["viewWarrantyMoney", "viewCashForecast", "manageExpenses"] as const) {
      expect(can("ADMIN", p), p).toBe(true);
      expect(can("MANAGER", p), p).toBe(true);
      for (const r of ["RECEPTION", "MECHANIC", "STOREKEEPER"] as const) expect(can(r, p), `${r} ${p}`).toBe(false);
    }
  });
});
