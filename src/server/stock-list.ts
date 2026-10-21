import "server-only";
import type { Prisma } from "@prisma/client";
import { can, type PermSubject } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/http";
import { pageOf, sortRows, stockState, stockTotals, type SortDir, type StockRow, type StockSort, type StockTotals } from "@/lib/stock-list";

export type StockList = { items: StockRow[]; page: number; pages: number; totals: StockTotals; showMoney: boolean };

/**
 * The full stock list for the « Tableau » view: EVERY active part matching the search (no cap),
 * optionally only the low ones, sorted, then cut into pages of 50 — the count and the totals cover
 * all of them. viewStock required. Prices only reach viewers with viewFinance or manageStock (who
 * edits them); otherwise they are zeroed here, and value sort falls back to name.
 */
export async function stockList(
  viewer: Exclude<PermSubject, string | null | undefined>,
  opts: { q?: string; lowOnly?: boolean; sort?: StockSort; dir?: SortDir; page?: number } = {},
): Promise<StockList> {
  if (!can(viewer, "viewStock")) throw new AppError("forbidden", {}, 403);
  const showMoney = can(viewer, "viewFinance");
  const withPrices = showMoney || can(viewer, "manageStock");
  const q = opts.q?.trim().slice(0, 100);
  const where: Prisma.PartWhereInput = {
    isActive: true,
    ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const parts = await prisma.part.findMany({
    where,
    select: { id: true, sku: true, name: true, brand: true, unit: true, stockX100: true, minStockX100: true, reservedX100: true, costPrice: true, salePrice: true, defaultSupplier: { select: { name: true } } },
  });
  let rows: StockRow[] = parts.map(({ defaultSupplier, costPrice, salePrice, ...p }) => ({
    ...p,
    supplier: defaultSupplier?.name ?? null,
    costPrice: withPrices ? costPrice : 0,
    salePrice: withPrices ? salePrice : 0,
  }));
  if (opts.lowOnly) rows = rows.filter((r) => stockState(r) !== "ok");
  const sort = opts.sort === "value" && !showMoney ? "name" : (opts.sort ?? "name");
  const sorted = sortRows(rows, sort, opts.dir ?? (sort === "name" ? "asc" : "desc"));
  const totals = stockTotals(sorted);
  const { items, page, pages } = pageOf(sorted, opts.page ?? 1);
  return { items, page, pages, totals: showMoney ? totals : { ...totals, value: 0 }, showMoney };
}
