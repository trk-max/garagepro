/**
 * V10 dashboard — pure helpers (no database). Every period is cut in the garage's
 * time zone (Setting.timezone, Africa/Tunis by default), whatever the server's zone.
 */
import { addDays, utcToZoned, zonedToUtc } from "@/lib/booking";
import { GARAGE_TZ } from "@/lib/format";
import { monthKey } from "@/lib/dashboard-series";

export type Window = { from: Date; to: Date };
/** A figure with its comparison window and change in % (null = nothing to compare with). */
export type Compared = { current: number; previous: number; deltaPercent: number | null };

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1..12
const pad = (n: number) => String(n).padStart(2, "0");

/** Garage midnight (UTC instant) of a "YYYY-MM-DD" garage day. */
export const garageMidnight = (day: string, timeZone = GARAGE_TZ) => zonedToUtc(day, "00:00", timeZone);

/**
 * Today so far, and the SAME elapsed part of the same day-of-month last month
 * (21 Oct 00:00 → 14:30 is compared with 21 Sep 00:00 → 14:30). When last month
 * has no such day (31 Mar → February), its last day is used.
 */
export function todayWindows(now: Date, timeZone = GARAGE_TZ): { current: Window; previous: Window } {
  const today = utcToZoned(now, timeZone).date;
  const start = garageMidnight(today, timeZone);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const prevDay = `${py}-${pad(pm)}-${pad(Math.min(d, daysInMonth(py, pm)))}`;
  const prevStart = garageMidnight(prevDay, timeZone);
  return { current: { from: start, to: now }, previous: { from: prevStart, to: new Date(prevStart.getTime() + (now.getTime() - start.getTime())) } };
}

/**
 * Month to date vs last month up to the same day-of-month and time of day
 * (1–21 Oct 14:30 vs 1–21 Sep 14:30). When last month is shorter (31 Mar),
 * the whole of last month is used.
 */
export function monthToDateWindows(now: Date, timeZone = GARAGE_TZ): { current: Window; previous: Window } {
  const z = utcToZoned(now, timeZone);
  const [y, m, d] = z.date.split("-").map(Number) as [number, number, number];
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const monthStart = garageMidnight(`${y}-${pad(m)}-01`, timeZone);
  const prevStart = garageMidnight(`${py}-${pad(pm)}-01`, timeZone);
  const elapsedToday = now.getTime() - garageMidnight(z.date, timeZone).getTime();
  const prevEnd = d > daysInMonth(py, pm) ? monthStart : new Date(garageMidnight(`${py}-${pad(pm)}-${pad(d)}`, timeZone).getTime() + elapsedToday);
  return { current: { from: monthStart, to: now }, previous: { from: prevStart, to: prevEnd } };
}

/** Garage week (Monday 00:00) so far vs the same elapsed part of last week. */
export function weekWindows(now: Date, timeZone = GARAGE_TZ): { current: Window; previous: Window } {
  const z = utcToZoned(now, timeZone);
  const monday = addDays(z.date, -((z.weekday + 6) % 7));
  const start = garageMidnight(monday, timeZone);
  const prevStart = garageMidnight(addDays(monday, -7), timeZone);
  return { current: { from: start, to: now }, previous: { from: prevStart, to: new Date(prevStart.getTime() + (now.getTime() - start.getTime())) } };
}

/** First and last instants of a calendar year in the garage zone: [Jan 1 00:00, next Jan 1 00:00). */
export function yearWindow(year: number, timeZone = GARAGE_TZ): Window {
  return { from: garageMidnight(`${year}-01-01`, timeZone), to: garageMidnight(`${year + 1}-01-01`, timeZone) };
}

/** Sum of `amount` for items whose date falls in [from, to). */
export function sumIn<T>(items: T[], w: Window, at: (i: T) => Date, amount: (i: T) => number): number {
  let s = 0;
  for (const i of items) {
    const t = at(i).getTime();
    if (t >= w.from.getTime() && t < w.to.getTime()) s += amount(i);
  }
  return s;
}

export function compared(current: number, previous: number): Compared {
  return { current, previous, deltaPercent: previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10 };
}

export type RevenueMonth = { month: string; paid: number; pending: number };

/**
 * Jan–Dec of `year`. `paid` = payments RECEIVED in the month (by paidAt);
 * `pending` = what is STILL unpaid today (totalTtc − paidAmount) on invoices ISSUED
 * in the month. A millime is either received (in the month it was paid) or still
 * owed (in the month of its invoice), never both.
 */
export function revenueByMonthFrom(
  year: number,
  invoices: { issuedAt: Date; totalTtc: number; paidAmount: number }[],
  payments: { paidAt: Date; amount: number }[],
  timeZone = GARAGE_TZ,
): RevenueMonth[] {
  const rows = new Map(Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`).map((month) => [month, { month, paid: 0, pending: 0 }]));
  for (const p of payments) {
    const r = rows.get(monthKey(p.paidAt, timeZone));
    if (r) r.paid += p.amount;
  }
  for (const i of invoices) {
    const r = rows.get(monthKey(i.issuedAt, timeZone));
    if (r) r.pending += Math.max(0, i.totalTtc - i.paidAmount);
  }
  return [...rows.values()];
}

/** Target progress; percent is null when no target is set (0). */
export function targetProgress(target: number, achieved: number): { target: number; achieved: number; percent: number | null } {
  return { target, achieved, percent: target > 0 ? Math.round((achieved / target) * 1000) / 10 : null };
}

/** Stock value in millimes: Σ quantity × unit cost (quantities are stored × 100; negative stock counts 0). */
export function stockValue(parts: { stockX100: number; costPrice: number }[]): number {
  return parts.reduce((s, p) => s + Math.round((Math.max(0, p.stockX100) * p.costPrice) / 100), 0);
}

/** Stock as a % of the minimum (100 = exactly at the minimum); null when no minimum is set. */
export function percentOfMinimum(stockX100: number, minStockX100: number): number | null {
  return minStockX100 > 0 ? Math.round((Math.max(0, stockX100) / minStockX100) * 100) : null;
}

export type Presence = "ACTIVE" | "ON_BREAK" | "OFF";

/** Presence from the person's last clock event of the past 24 h (same rule as presentNow). */
export function presenceFrom(lastKind: string | undefined): Presence {
  if (lastKind === "IN" || lastKind === "BREAK_END") return "ACTIVE";
  if (lastKind === "BREAK_START") return "ON_BREAK";
  return "OFF";
}
