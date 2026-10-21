import { describe, expect, it } from "vitest";
import { computeProfit, sumProfits, type ProfitInput } from "@/lib/profit";

// Amounts in millimes (1 DT = 1000).
const base: ProfitInput = {
  invoiceTotalHt: null,
  lines: [],
  expenses: [],
  labor: [],
  garageHourlyCost: 0,
  overhead: { mode: "NONE", value: 0 },
  payments: [],
};
const part = (qty: number, price: number, cost: number | null, current: number | null = cost) => ({
  type: "PART" as const,
  quantityX100: qty * 100,
  unitPrice: price,
  unitCost: cost,
  currentPartCost: current,
  hasPart: true,
});
const labor = (hours: number, price: number) => ({ type: "LABOR" as const, quantityX100: hours * 100, unitPrice: price, unitCost: null, currentPartCost: null, hasPart: false });

describe("bénéfice réel d'une réparation", () => {
  it("full example: revenue, direct costs, margin, labour, overhead, profit", () => {
    const p = computeProfit({
      ...base,
      invoiceTotalHt: 200_000, // 200 DT HT invoiced
      lines: [part(2, 40_000, 25_000), labor(2, 60_000)], // 80 + 120 = 200 DT
      expenses: [15_000], // towing 15 DT
      labor: [{ userId: "a", minutes: 120, hourlyCost: null, running: false }],
      garageHourlyCost: 12_000, // 12 DT / h
      overhead: { mode: "PERCENT_REVENUE", value: 1_000 }, // 10 %
    });
    expect(p.revenue).toBe(200_000);
    expect(p.partsCost).toBe(50_000);
    expect(p.expenses).toBe(15_000);
    expect(p.directCosts).toBe(65_000);
    expect(p.grossMargin).toBe(135_000);
    expect(p.laborCost).toBe(24_000);
    expect(p.overhead).toBe(20_000);
    expect(p.profit).toBe(91_000);
    expect(p.marginBp).toBe(4_550); // 45.5 %
    expect(p.flags).toEqual([]);
  });

  it("hours worked vs hours billed: 2 mechanics × 2 h = 4 person-hours of cost, even if 2 h are billed", () => {
    const p = computeProfit({
      ...base,
      invoiceTotalHt: 120_000,
      lines: [labor(2, 60_000)], // 2 h billed
      labor: [
        { userId: "a", minutes: 120, hourlyCost: null, running: false },
        { userId: "b", minutes: 120, hourlyCost: 15_000, running: false }, // b's own cost
      ],
      garageHourlyCost: 10_000,
    });
    expect(p.laborMinutes).toBe(240);
    expect(p.laborCost).toBe(20_000 + 30_000);
    expect(p.revenue).toBe(120_000); // billing untouched
  });

  it("an unpaid invoice is revenue, never cash: collections are separate and split by payer", () => {
    const unpaid = computeProfit({ ...base, invoiceTotalHt: 100_000, lines: [labor(1, 100_000)] });
    expect(unpaid.revenue).toBe(100_000);
    expect(unpaid.collected.total).toBe(0);
    const paid = computeProfit({
      ...base,
      invoiceTotalHt: 100_000,
      lines: [labor(1, 100_000)],
      payments: [
        { amount: 70_000, payer: "INSURANCE" },
        { amount: 49_000, payer: "CUSTOMER" },
      ],
    });
    expect(paid.collected).toEqual({ customer: 49_000, insurance: 70_000, total: 119_000 });
    expect(paid.profit).toBe(unpaid.profit); // being paid does not change the profit
  });

  it("not invoiced yet: revenue from the lines, flagged", () => {
    const p = computeProfit({ ...base, lines: [labor(1, 50_000)] });
    expect(p.revenue).toBe(50_000);
    expect(p.flags).toContain("notInvoiced");
  });

  it("old part lines without cost snapshot use today's price and are flagged; manual part without cost is flagged unknown", () => {
    const p = computeProfit({
      ...base,
      lines: [part(1, 30_000, null, 18_000), { type: "PART", quantityX100: 100, unitPrice: 10_000, unitCost: null, currentPartCost: null, hasPart: false }],
    });
    expect(p.partsCost).toBe(18_000);
    expect(p.flags).toEqual(expect.arrayContaining(["partCostEstimated", "partCostUnknown"]));
  });

  it("the cost snapshot wins over today's price (price change after use does not rewrite history)", () => {
    const p = computeProfit({ ...base, lines: [part(1, 30_000, 18_000, 99_000)] });
    expect(p.partsCost).toBe(18_000);
    expect(p.flags).not.toContain("partCostEstimated");
  });

  it("no hourly cost configured: labour cost 0 but flagged, never silently exact", () => {
    const p = computeProfit({ ...base, invoiceTotalHt: 60_000, lines: [labor(1, 60_000)], labor: [{ userId: "a", minutes: 60, hourlyCost: null, running: true }] });
    expect(p.laborCost).toBe(0);
    expect(p.flags).toEqual(expect.arrayContaining(["laborRateMissing", "laborRunning"]));
  });

  it("billed labour but no time recorded is flagged", () => {
    expect(computeProfit({ ...base, invoiceTotalHt: 60_000, lines: [labor(1, 60_000)] }).flags).toContain("noLaborRecorded");
  });

  it("overhead per person-hour", () => {
    const p = computeProfit({ ...base, invoiceTotalHt: 0, labor: [{ userId: "a", minutes: 90, hourlyCost: 0, running: false }], overhead: { mode: "PER_LABOR_HOUR", value: 4_000 } });
    expect(p.overhead).toBe(6_000);
  });

  it("totals over several repairs: sums, merged flags, margin on the total (not an average of margins)", () => {
    const a = computeProfit({ ...base, invoiceTotalHt: 100_000, lines: [labor(1, 100_000)], expenses: [10_000] });
    const b = computeProfit({ ...base, lines: [labor(1, 300_000)] });
    const t = sumProfits([a, b]);
    expect(t.count).toBe(2);
    expect(t.revenue).toBe(400_000);
    expect(t.profit).toBe(a.profit + b.profit);
    expect(t.marginBp).toBe(Math.round((390_000 * 10_000) / 400_000));
    expect(t.flags).toContain("notInvoiced");
  });

  it("no revenue: margin is null, not a division by zero", () => {
    expect(computeProfit(base).marginBp).toBeNull();
  });
});
