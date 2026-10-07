import { describe, expect, it } from "vitest";
import { computeTotals, lineTotalHt } from "@/lib/format";
import { money, paymentSchema, quantity } from "@/lib/validators";

// Amounts are millimes (1 DT = 1000), quantities ×100 (1,5 = 150).
const TVA19 = 1900;
const TVA7 = 700;

describe("lineTotalHt", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineTotalHt({ quantityX100: 100, unitPrice: 45_000 })).toBe(45_000);
    expect(lineTotalHt({ quantityX100: 150, unitPrice: 40_000 })).toBe(60_000); // 1,5 h × 40 DT
  });
  it("rounds to the millime, never returns a float", () => {
    const v = lineTotalHt({ quantityX100: 33, unitPrice: 1_001 });
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBe(330);
  });
  it("zero quantity or zero price = 0", () => {
    expect(lineTotalHt({ quantityX100: 0, unitPrice: 9_999 })).toBe(0);
    expect(lineTotalHt({ quantityX100: 100, unitPrice: 0 })).toBe(0);
  });
});

describe("computeTotals", () => {
  it("100 + 200 DT with 19 % VAT and stamp duty", () => {
    const t = computeTotals(
      [
        { quantityX100: 100, unitPrice: 100_000, taxRateBp: TVA19 },
        { quantityX100: 100, unitPrice: 200_000, taxRateBp: TVA19 },
      ],
      1_000,
    );
    expect(t.totalHt).toBe(300_000);
    expect(t.totalTax).toBe(57_000);
    expect(t.stampDuty).toBe(1_000);
    expect(t.totalTtc).toBe(358_000);
  });

  it("groups VAT by rate", () => {
    const t = computeTotals(
      [
        { quantityX100: 100, unitPrice: 100_000, taxRateBp: TVA19 },
        { quantityX100: 100, unitPrice: 50_000, taxRateBp: TVA7 },
      ],
      0,
    );
    expect(t.taxByRate).toEqual([
      { rateBp: TVA7, base: 50_000, tax: 3_500 },
      { rateBp: TVA19, base: 100_000, tax: 19_000 },
    ]);
    expect(t.totalTtc).toBe(172_500);
  });

  it("empty invoice = 0 and no stamp duty", () => {
    expect(computeTotals([], 1_000)).toMatchObject({ totalHt: 0, totalTax: 0, stampDuty: 0, totalTtc: 0 });
  });

  it("no floating-point drift on 0.1 + 0.2 style amounts", () => {
    const t = computeTotals(
      [
        { quantityX100: 100, unitPrice: 100, taxRateBp: TVA19 }, // 0,100 DT
        { quantityX100: 100, unitPrice: 200, taxRateBp: TVA19 }, // 0,200 DT
      ],
      0,
    );
    expect(t.totalHt).toBe(300);
    expect(t.totalTax).toBe(57);
  });

  it("large invoice stays exact", () => {
    const t = computeTotals([{ quantityX100: 1_000_000, unitPrice: 9_999_999, taxRateBp: TVA19 }], 1_000);
    expect(Number.isSafeInteger(t.totalTtc)).toBe(true);
    expect(t.totalHt).toBe(99_999_990_000);
  });
});

describe("money input (DT → millimes)", () => {
  it("accepts French comma and spaces", () => {
    expect(money.parse("45,5")).toBe(45_500);
    expect(money.parse("1 250.750")).toBe(1_250_750);
    expect(money.parse("0")).toBe(0);
  });
  it("rounds safely (1.005 DT)", () => {
    expect(money.parse("1.005")).toBe(1_005);
    expect(money.parse("0.1")).toBe(100);
  });
  it("rejects negative, text, huge and empty values", () => {
    // Regression: "" and "  " used to be accepted as 0 DT.
    for (const bad of ["-1", "abc", "99999999", "", "  ", "NaN", "Infinity"]) {
      expect(money.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("a payment must be strictly positive", () => {
    expect(paymentSchema.safeParse({ amount: "0", method: "CASH" }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: "10", method: "BITCOIN" }).success).toBe(false);
    expect(paymentSchema.parse({ amount: "10", method: "CASH" }).amount).toBe(10_000);
  });
});

describe("quantity input", () => {
  it("decimals with comma", () => expect(quantity.parse("1,5")).toBe(150));
  it("rejects zero, negative and blank", () => {
    expect(quantity.safeParse("0").success).toBe(false);
    expect(quantity.safeParse("").success).toBe(false);
    expect(quantity.safeParse("-2").success).toBe(false);
  });
});
