import "server-only";
import type { Prisma } from "@prisma/client";
import { lastMonths, monthKey } from "@/lib/dashboard-series";
import { compared, garageMidnight, percentOfMinimum, stockValue } from "@/lib/dashboard-v10";
import { prisma } from "@/lib/prisma";
import { utcToZoned } from "@/lib/booking";
import { assertCan, type Viewer } from "@/server/dashboard-v10";
import { isLow } from "@/server/parts";
import { getSettings } from "@/server/settings";

/** V10 dashboard — stock (quantities stored × 100, money in millimes HT at cost price). */

export type StockOverview = {
  /** Σ stock × current cost price of active parts. */
  value: number;
  /**
   * Value at the start of this garage month: quantities rebuilt from the stock movements since
   * then (every stock change writes one), valued at TODAY's cost prices (cost history is not kept),
   * so the delta reflects quantity changes, not price changes.
   */
  previousValue: number;
  deltaPercent: number | null;
  itemsInStock: number;
  totalParts: number;
};

export type StockCounts = { itemsInStock: number; totalParts: number };

/** Parts in stock / active parts — no money (viewStock: mechanics and storekeepers too). */
export async function stockCounts(viewer: Viewer): Promise<StockCounts> {
  assertCan(viewer, "viewStock");
  const [itemsInStock, totalParts] = await Promise.all([
    prisma.part.count({ where: { isActive: true, stockX100: { gt: 0 } } }),
    prisma.part.count({ where: { isActive: true } }),
  ]);
  return { itemsInStock, totalParts };
}

/**
 * Stock value (money) and items in stock: viewStock AND viewFinance — the amount never
 * reaches roles without finance access (they use stockCounts).
 */
export async function stockOverview(viewer: Viewer, now = new Date()): Promise<StockOverview> {
  assertCan(viewer, "viewStock");
  assertCan(viewer, "viewFinance");
  const timeZone = (await getSettings()).timezone;
  const monthStart = garageMidnight(`${utcToZoned(now, timeZone).date.slice(0, 7)}-01`, timeZone);
  const [parts, moves] = await Promise.all([
    prisma.part.findMany({ where: { isActive: true }, select: { id: true, stockX100: true, costPrice: true } }),
    prisma.stockMovement.groupBy({ by: ["partId"], where: { createdAt: { gte: monthStart }, part: { isActive: true } }, _sum: { deltaX100: true } }),
  ]);
  const since = new Map(moves.map((m) => [m.partId, m._sum.deltaX100 ?? 0]));
  const value = stockValue(parts);
  const previousValue = stockValue(parts.map((p) => ({ costPrice: p.costPrice, stockX100: p.stockX100 - (since.get(p.id) ?? 0) })));
  return { value, previousValue, deltaPercent: compared(value, previousValue).deltaPercent, itemsInStock: parts.filter((p) => p.stockX100 > 0).length, totalParts: parts.length };
}

/** Goods received per garage month (Σ quantity × unit cost of the receipt lines), oldest first. viewSuppliers. */
export async function monthlyPurchases(viewer: Viewer, count = 6, now = new Date()): Promise<{ month: string; amount: number }[]> {
  assertCan(viewer, "viewSuppliers");
  const timeZone = (await getSettings()).timezone;
  const months = lastMonths(now, Math.max(1, Math.min(count, 24)), timeZone);
  const from = garageMidnight(`${months[0]}-01`, timeZone);
  const lines = await prisma.goodsReceiptLine.findMany({ where: { receipt: { receivedAt: { gte: from } } }, select: { quantityX100: true, unitCost: true, receipt: { select: { receivedAt: true } } } });
  const sums = new Map(months.map((m) => [m, 0]));
  for (const l of lines) {
    const k = monthKey(l.receipt.receivedAt, timeZone);
    if (sums.has(k)) sums.set(k, sums.get(k)! + Math.round((l.quantityX100 * l.unitCost) / 100));
  }
  return months.map((month) => ({ month, amount: sums.get(month)! }));
}

export type PartCard = {
  id: string;
  name: string;
  sku: string;
  supplier: string | null;
  stockX100: number;
  minStockX100: number;
  /** Stock as % of the minimum (null = no minimum set). */
  percentOfMin: number | null;
  isLow: boolean;
  unit: string;
};

/** Active parts by name, searchable by name / SKU / brand; `nextCursor` for the next page. viewStock is checked by the caller. */
export async function partCards(opts: { q?: string; take?: number; cursor?: string | null } = {}): Promise<{ items: PartCard[]; nextCursor: string | null }> {
  const take = Math.max(1, Math.min(opts.take ?? 24, 100));
  const q = opts.q?.trim().slice(0, 100);
  const where: Prisma.PartWhereInput = {
    isActive: true,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const rows = await prisma.part.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: { id: true, name: true, sku: true, stockX100: true, minStockX100: true, unit: true, defaultSupplier: { select: { name: true } } },
  });
  const items = rows.slice(0, take).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    supplier: p.defaultSupplier?.name ?? null,
    stockX100: p.stockX100,
    minStockX100: p.minStockX100,
    percentOfMin: percentOfMinimum(p.stockX100, p.minStockX100),
    isLow: isLow(p),
    unit: p.unit,
  }));
  return { items, nextCursor: rows.length > take ? (items.at(-1)?.id ?? null) : null };
}

/**
 * Stock alerts that really exist today. The low-stock alert is always on: a part at or under its
 * own minimum (set per part on the stock page) appears in « Suivi & retards » and in the KPI.
 * There is no garage-level switch, no e-mail, no weekly stock report and no automatic reorder
 * reminder: the UI must not show toggles for them.
 */
export function stockAlertSettings(): { lowStockAlert: { enabled: true; configurable: false; thresholdSource: "partMinimum" }; toggles: [] } {
  return { lowStockAlert: { enabled: true, configurable: false, thresholdSource: "partMinimum" }, toggles: [] };
}
