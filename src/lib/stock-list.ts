/**
 * V10.5 — the full stock list (« Tableau » view): state of each part, value, sort, totals and
 * pages of 50. Pure functions (no database): the server loads the parts, this file orders them.
 * Quantities are stored × 100, money in millimes HT.
 */

export type StockState = "ok" | "low" | "out";
export type StockSort = "name" | "qty" | "value";
export type SortDir = "asc" | "desc";

export const STOCK_PAGE_SIZE = 50;

export type StockRow = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  supplier: string | null;
  unit: string;
  stockX100: number;
  minStockX100: number;
  reservedX100: number;
  costPrice: number;
  salePrice: number;
};

/** Out of stock at 0 or less, low at or under the minimum (same rule as the alerts), otherwise OK. */
export function stockState(p: { stockX100: number; minStockX100: number }): StockState {
  if (p.stockX100 <= 0) return "out";
  return p.stockX100 <= p.minStockX100 ? "low" : "ok";
}

/** Quantity × cost price, in millimes (a negative stock is worth nothing). */
export function rowValue(p: { stockX100: number; costPrice: number }): number {
  return Math.round((Math.max(0, p.stockX100) * p.costPrice) / 100);
}

/** Reads the sort from the URL: `tri=nom|qte|valeur`, `ordre=asc|desc`. Value only for finance roles. */
export function parseSort(tri: string | undefined, ordre: string | undefined, canSeeMoney: boolean): { sort: StockSort; dir: SortDir } {
  const sort: StockSort = tri === "qte" ? "qty" : tri === "valeur" && canSeeMoney ? "value" : "name";
  const dir: SortDir = ordre === "desc" ? "desc" : ordre === "asc" ? "asc" : sort === "name" ? "asc" : "desc";
  return { sort, dir };
}

export const SORT_PARAM: Record<StockSort, string> = { name: "nom", qty: "qte", value: "valeur" };

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Sorted copy; ties broken by name then id so pages never overlap. */
export function sortRows<T extends StockRow>(rows: T[], sort: StockSort, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const key = (r: T) => (sort === "qty" ? r.stockX100 : sort === "value" ? rowValue(r) : 0);
  return [...rows].sort((a, b) => {
    const main = sort === "name" ? collator.compare(a.name, b.name) : key(a) - key(b);
    if (main !== 0) return sign * main;
    return collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

export type StockTotals = { parts: number; quantityX100: number; value: number; low: number; out: number };

/** Totals over every row of the filtered list (not only the page shown). */
export function stockTotals(rows: StockRow[]): StockTotals {
  let quantityX100 = 0;
  let value = 0;
  let low = 0;
  let out = 0;
  for (const r of rows) {
    quantityX100 += Math.max(0, r.stockX100);
    value += rowValue(r);
    const s = stockState(r);
    if (s === "low") low++;
    else if (s === "out") out++;
  }
  return { parts: rows.length, quantityX100, value, low, out };
}

/** One page (1-based, clamped to the last page). */
export function pageOf<T>(rows: T[], page: number, size = STOCK_PAGE_SIZE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1), pages);
  return { items: rows.slice((p - 1) * size, p * size), page: p, pages };
}
