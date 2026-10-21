import { describe, expect, it } from "vitest";
import { SCENARIOS, firstBreach, forecastCash, type ForecastInput } from "@/lib/cash-forecast";

const TODAY = "2026-10-21";
const base = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  today: TODAY,
  balance: { amount: 10_000_000, asOf: "2026-10-15" },
  movements: [],
  customerInvoices: [],
  paymentTermsDays: 15,
  refunds: [],
  supplierInvoices: [],
  expenses: [],
  ...over,
});
const inv = (id: string, totalTtc: number, paid: number, dueDay: string | null, issuedDay = "2026-10-01") => ({ id, label: id, totalTtc, paid, dueDay, issuedDay });

describe("cash forecast — start and real money", () => {
  it("no typed balance: flows are computed but no balance is invented", () => {
    const r = forecastCash(base({ balance: null, customerInvoices: [inv("F1", 500_000, 0, "2026-10-25")] }), "OPTIMISTIC", 30);
    expect(r.opening).toBeNull();
    expect(r.closing).toBeNull();
    expect(r.lowest).toBeNull();
    expect(r.weeks.every((w) => w.closing === null)).toBe(true);
    expect(r.totals.inCustomers).toBe(500_000);
    expect(r.warnings.noBalance).toBe(true);
    expect(firstBreach(r, 1_000_000_000)).toBeNull();
  });

  it("only money dated AFTER the balance day counts (the rest is already in the balance)", () => {
    const r = forecastCash(
      base({
        movements: [
          { day: "2026-10-14", amount: 999_000, kind: "CUSTOMER_PAYMENT" },
          { day: "2026-10-15", amount: 888_000, kind: "CUSTOMER_PAYMENT" }, // same day: inside the end-of-day balance
          { day: "2026-10-16", amount: 300_000, kind: "CUSTOMER_PAYMENT" },
          { day: "2026-10-18", amount: 50_000, kind: "WARRANTY_REFUND" },
          { day: "2026-10-19", amount: 120_000, kind: "SUPPLIER_PAYMENT" },
          { day: "2026-10-21", amount: 80_000, kind: "EXPENSE_PAID" },
        ],
      }),
      "NORMAL",
      30,
    );
    expect(r.real).toEqual({ inAfterBalance: 350_000, outAfterBalance: 200_000 });
    expect(r.opening).toBe(10_000_000 + 350_000 - 200_000);
    expect(r.totals.inReal).toBe(0);
  });

  it("a real movement typed with a future date lands in its week, not in today's balance", () => {
    const r = forecastCash(base({ movements: [{ day: "2026-10-30", amount: 40_000, kind: "SUPPLIER_PAYMENT" }] }), "NORMAL", 30);
    expect(r.opening).toBe(10_000_000);
    expect(r.weeks[1]!.outReal).toBe(40_000);
    expect(r.closing).toBe(10_000_000 - 40_000);
  });
});

describe("cash forecast — no double counting", () => {
  it("expected customer money = total − already paid, never the total", () => {
    const r = forecastCash(base({ customerInvoices: [inv("F1", 1_000_000, 400_000, "2026-10-25")] }), "OPTIMISTIC", 30);
    expect(r.totals.inCustomers).toBe(600_000);
    expect(r.items).toEqual([expect.objectContaining({ kind: "CUSTOMER", amount: 600_000, day: "2026-10-25" })]);
  });

  it("a payment after the balance raises today's balance AND lowers what is expected, by the same amount only once", () => {
    // Invoice 1 000 000 issued, 400 000 paid on 2026-10-18 (after the balance of 2026-10-15).
    const r = forecastCash(
      base({ movements: [{ day: "2026-10-18", amount: 400_000, kind: "CUSTOMER_PAYMENT" }], customerInvoices: [inv("F1", 1_000_000, 400_000, "2026-10-25")] }),
      "OPTIMISTIC",
      30,
    );
    // End balance = start + total of the invoice, exactly once.
    expect(r.closing).toBe(10_000_000 + 1_000_000);
  });

  it("fully paid invoices, overpaid invoices and fully received refunds bring nothing", () => {
    const r = forecastCash(
      base({
        customerInvoices: [inv("PAID", 500_000, 500_000, "2026-10-25"), inv("OVER", 500_000, 600_000, "2026-10-25")],
        refunds: [{ id: "C1", label: "GAR-1", expected: 0, decidedDay: "2026-10-01" }],
        supplierInvoices: [inv("S-PAID", 300_000, 300_000, "2026-10-25")],
      }),
      "OPTIMISTIC",
      30,
    );
    expect(r.items).toEqual([]);
    expect(r.closing).toBe(10_000_000);
  });

  it("supplier invoices: only what is left to pay goes out", () => {
    const r = forecastCash(base({ supplierInvoices: [inv("S1", 900_000, 250_000, "2026-11-02")] }), "PRUDENT", 30);
    expect(r.totals.outSuppliers).toBe(650_000);
    expect(r.closing).toBe(10_000_000 - 650_000);
  });
});

describe("cash forecast — scenarios and their explicit assumptions", () => {
  const invoices = [
    inv("DUE-SOON", 100_000, 0, "2026-10-25"), // not overdue
    inv("LATE-40", 200_000, 0, "2026-09-11"), // 40 days late
    inv("LATE-70", 300_000, 0, "2026-08-12"), // 70 days late
    inv("LATE-100", 400_000, 0, "2026-07-13"), // 100 days late
  ];
  const refunds = [{ id: "C1", label: "GAR-0001", expected: 50_000, decidedDay: "2026-10-10" }];

  it("prudent: > 60 days late = 0 %, others 30 days after max(due, today), refunds 0 %", () => {
    const r = forecastCash(base({ customerInvoices: invoices, refunds }), "PRUDENT", 90);
    const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
    expect(byId["DUE-SOON"]).toMatchObject({ amount: 100_000, day: "2026-11-24", ratePct: 100 });
    expect(byId["LATE-40"]).toMatchObject({ amount: 200_000, day: "2026-11-20", overdueDays: 40 });
    expect(byId["LATE-70"]).toMatchObject({ amount: 0, ratePct: 0, overdueDays: 70 });
    expect(byId["LATE-100"]).toMatchObject({ amount: 0, ratePct: 0 });
    expect(byId["C1"]).toMatchObject({ amount: 0 });
    expect(r.notCounted).toEqual({ customers: 700_000, refunds: 50_000 });
    expect(r.totals.inCustomers).toBe(300_000);
  });

  it("normal: > 90 days late = 50 %, others at due + 15 days, refunds 100 % 30 days after decision", () => {
    const r = forecastCash(base({ customerInvoices: invoices, refunds }), "NORMAL", 90);
    const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
    expect(byId["DUE-SOON"]).toMatchObject({ amount: 100_000, day: "2026-11-09" });
    expect(byId["LATE-70"]).toMatchObject({ amount: 300_000, ratePct: 100, day: "2026-11-05" });
    expect(byId["LATE-100"]).toMatchObject({ amount: 200_000, ratePct: 50 });
    expect(byId["C1"]).toMatchObject({ amount: 50_000, day: "2026-11-20" });
    expect(r.notCounted).toEqual({ customers: 200_000, refunds: 0 });
  });

  it("optimistic: everything at its due date (overdue = today)", () => {
    const r = forecastCash(base({ customerInvoices: invoices, refunds }), "OPTIMISTIC", 90);
    const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
    expect(byId["DUE-SOON"]!.day).toBe("2026-10-25");
    expect(byId["LATE-100"]).toMatchObject({ amount: 400_000, day: TODAY });
    expect(byId["C1"]).toMatchObject({ amount: 50_000, day: TODAY });
    expect(r.totals.inCustomers + r.totals.inRefunds).toBe(1_050_000);
  });

  it("prudent ≤ normal ≤ optimistic for the same data", () => {
    const data = base({ customerInvoices: invoices, refunds, expenses: [{ id: "E1", label: "Loyer", amount: 800_000, dueDay: "2026-11-01" }] });
    const [p, n, o] = (["PRUDENT", "NORMAL", "OPTIMISTIC"] as const).map((s) => forecastCash(data, s, 90).closing!);
    expect(p!).toBeLessThanOrEqual(n!);
    expect(n!).toBeLessThanOrEqual(o!);
  });

  it("outflows are 100 % at their due date in every scenario (overdue = today)", () => {
    const data = base({
      supplierInvoices: [inv("S-LATE", 100_000, 0, "2026-09-01"), inv("S-NEXT", 200_000, 0, "2026-11-10")],
      expenses: [{ id: "E1", label: "Loyer", amount: 800_000, dueDay: "2026-11-01" }],
    });
    for (const s of ["PRUDENT", "NORMAL", "OPTIMISTIC"] as const) {
      const r = forecastCash(data, s, 30);
      expect(r.items.map((i) => [i.id, i.day, i.amount])).toEqual([
        ["S-LATE", TODAY, 100_000],
        ["E1", "2026-11-01", 800_000],
        ["S-NEXT", "2026-11-10", 200_000],
      ]);
      expect(r.weeks[0]!.outSuppliers).toBe(100_000);
    }
  });

  it("the assumptions object is what the page shows", () => {
    expect(SCENARIOS.PRUDENT).toEqual({ collectDelayDays: 30, oldOverdueDays: 60, oldOverdueRate: 0, refundRate: 0, refundDelayDays: 30 });
    expect(SCENARIOS.OPTIMISTIC.oldOverdueDays).toBeNull();
  });
});

describe("cash forecast — incomplete data, horizon, buckets", () => {
  it("invoice without due date: issue date + payment terms, and it is reported", () => {
    const r = forecastCash(base({ customerInvoices: [inv("F-NODUE", 100_000, 0, null, "2026-10-20")], paymentTermsDays: 15 }), "OPTIMISTIC", 30);
    expect(r.items[0]).toMatchObject({ dueDay: "2026-11-04", day: "2026-11-04" });
    expect(r.warnings.invoicesWithoutDueDate).toBe(1);
  });

  it("supplier invoice without due date: payable on receipt (issue date), reported", () => {
    const r = forecastCash(base({ supplierInvoices: [inv("S-NODUE", 100_000, 0, null, "2026-10-01")] }), "NORMAL", 30);
    expect(r.items[0]).toMatchObject({ day: TODAY, dueDay: "2026-10-01" });
    expect(r.warnings.supplierInvoicesWithoutDueDate).toBe(1);
  });

  it("flows after the horizon are left out and totalled apart", () => {
    const r = forecastCash(base({ customerInvoices: [inv("FAR", 100_000, 0, "2027-03-01")], expenses: [{ id: "E", label: "x", amount: 70_000, dueDay: "2027-02-01" }] }), "OPTIMISTIC", 30);
    expect(r.totals.inCustomers).toBe(0);
    expect(r.beyondHorizon).toEqual({ in: 100_000, out: 70_000 });
    expect(r.closing).toBe(10_000_000);
  });

  it("weekly buckets cover exactly the horizon (30 → 5 weeks, last one 2 days)", () => {
    const r = forecastCash(base(), "NORMAL", 30);
    expect(r.weeks).toHaveLength(5);
    expect(r.weeks[0]).toMatchObject({ from: TODAY, to: "2026-10-27" });
    expect(r.weeks[4]).toMatchObject({ from: "2026-11-18", to: "2026-11-19" });
    expect(r.end).toBe("2026-11-19");
    expect(forecastCash(base(), "NORMAL", 90).weeks).toHaveLength(13);
  });

  it("closing balances chain week by week and the lowest point is found inside a week", () => {
    const r = forecastCash(
      base({
        balance: { amount: 1_000_000, asOf: "2026-10-20" },
        expenses: [{ id: "RENT", label: "Loyer", amount: 900_000, dueDay: "2026-10-22" }],
        customerInvoices: [inv("F1", 500_000, 0, "2026-10-26")],
      }),
      "OPTIMISTIC",
      30,
    );
    expect(r.weeks[0]!.closing).toBe(600_000);
    expect(r.lowest).toEqual({ amount: 100_000, day: "2026-10-22" });
    expect(firstBreach(r, 200_000)).toEqual({ day: "2026-10-22", balance: 100_000 });
    expect(firstBreach(r, 50_000)).toBeNull();
    expect(firstBreach(r, 0)).toBeNull();
  });

  it("an opening balance already under the threshold alerts today", () => {
    const r = forecastCash(base({ balance: { amount: -5_000, asOf: "2026-10-20" } }), "PRUDENT", 30);
    expect(firstBreach(r, 1_000)).toEqual({ day: TODAY, balance: -5_000 });
  });

  it("old balance and balance dated in the future are reported", () => {
    expect(forecastCash(base({ balance: { amount: 0, asOf: "2026-08-01" } }), "NORMAL", 30).warnings.balanceAgeDays).toBe(81);
    expect(forecastCash(base({ balance: { amount: 0, asOf: "2026-10-30" } }), "NORMAL", 30).warnings.balanceInFuture).toBe(true);
  });

  it("rounds percentages to the millime", () => {
    const r = forecastCash(base({ customerInvoices: [inv("ODD", 333, 0, "2026-07-01")] }), "NORMAL", 30);
    expect(r.items[0]!.amount).toBe(167);
    expect(r.notCounted.customers).toBe(166);
  });
});
