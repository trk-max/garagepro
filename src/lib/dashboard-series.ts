import { GARAGE_TZ } from "@/lib/format";

/** "2026-10" for a date, in the garage's time zone (a payment at 00:30 in Tunis counts for that day's month). */
export function monthKey(date: Date, timeZone = GARAGE_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

/** The last `count` month keys, oldest first, ending with the month of `now`. */
export function lastMonths(now: Date, count: number, timeZone = GARAGE_TZ): string[] {
  const [y, m] = monthKey(now, timeZone).split("-").map(Number) as [number, number];
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export type MonthPoint = { month: string; invoiced: number; collected: number };

/**
 * Money per month, each amount counted once: invoices by their issue date (TTC),
 * payments by the day they were received. Items outside the months are ignored.
 */
export function monthlyMoney(
  months: string[],
  invoices: { issuedAt: Date; totalTtc: number }[],
  payments: { paidAt: Date; amount: number }[],
  timeZone = GARAGE_TZ,
): MonthPoint[] {
  const points = new Map(months.map((month) => [month, { month, invoiced: 0, collected: 0 }]));
  for (const i of invoices) {
    const p = points.get(monthKey(i.issuedAt, timeZone));
    if (p) p.invoiced += i.totalTtc;
  }
  for (const pay of payments) {
    const p = points.get(monthKey(pay.paidAt, timeZone));
    if (p) p.collected += pay.amount;
  }
  return [...points.values()];
}

/** Midnight of the garage's day containing `now` (e.g. the online copy runs in UTC, the garage in Tunis). */
export function startOfGarageDay(now: Date, timeZone = GARAGE_TZ): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const wallAsUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+p.year!, +p.month! - 1, +p.day!) - offset);
}
