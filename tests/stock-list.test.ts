/** V10.5 — full stock list: state, value, sort, totals, pages of 50. */
import { describe, expect, it } from "vitest";
import { pageOf, parseSort, rowValue, sortRows, stockState, stockTotals, type StockRow } from "@/lib/stock-list";

const row = (id: string, name: string, stock: number, min: number, cost = 1_000): StockRow => ({
  id, sku: `SKU-${id}`, name, brand: null, supplier: null, unit: "pce", stockX100: stock, minStockX100: min, reservedX100: 0, costPrice: cost, salePrice: 2 * cost,
});

describe("stock list", () => {
  it("state: out at 0 or less, low at or under the minimum, OK above", () => {
    expect(stockState({ stockX100: 0, minStockX100: 0 })).toBe("out");
    expect(stockState({ stockX100: -100, minStockX100: 200 })).toBe("out");
    expect(stockState({ stockX100: 200, minStockX100: 200 })).toBe("low");
    expect(stockState({ stockX100: 201, minStockX100: 200 })).toBe("ok");
  });

  it("value = quantity × cost price, never negative", () => {
    expect(rowValue({ stockX100: 250, costPrice: 4_000 })).toBe(10_000);
    expect(rowValue({ stockX100: -300, costPrice: 4_000 })).toBe(0);
  });

  it("sorts by name, quantity or value, ties by name", () => {
    const rows = [row("a", "Filtre", 500, 0, 1_000), row("b", "bougie", 100, 0, 50_000), row("c", "Amortisseur", 500, 0, 3_000)];
    expect(sortRows(rows, "name", "asc").map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(sortRows(rows, "qty", "desc").map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(sortRows(rows, "value", "desc").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortRows(rows, "value", "asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("parseSort: value only with finance access; defaults name ↑, numbers ↓", () => {
    expect(parseSort(undefined, undefined, true)).toEqual({ sort: "name", dir: "asc" });
    expect(parseSort("qte", undefined, false)).toEqual({ sort: "qty", dir: "desc" });
    expect(parseSort("valeur", "asc", true)).toEqual({ sort: "value", dir: "asc" });
    expect(parseSort("valeur", undefined, false)).toEqual({ sort: "name", dir: "asc" });
  });

  it("totals cover every row; pages of 50 with nothing dropped", () => {
    const rows = Array.from({ length: 123 }, (_, i) => row(String(i).padStart(3, "0"), `P${i}`, i % 3 === 0 ? 0 : 400, 300, 500));
    const totals = stockTotals(rows);
    expect(totals.parts).toBe(123);
    expect(totals.out).toBe(41);
    expect(totals.quantityX100).toBe(82 * 400);
    expect(totals.value).toBe(82 * 2_000);
    const pages = [1, 2, 3].map((p) => pageOf(rows, p));
    expect(pages.map((p) => p.items.length)).toEqual([50, 50, 23]);
    expect(pages[0]?.pages).toBe(3);
    expect(new Set(pages.flatMap((p) => p.items.map((r) => r.id))).size).toBe(123);
    expect(pageOf(rows, 99).page).toBe(3);
    expect(pageOf([], 1)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
