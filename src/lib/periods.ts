import { addDays } from "@/lib/booking";

/** "Today" as YYYY-MM-DD in the garage's time zone. */
export const localToday = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** First and last day of a month (offset from the current one), as YYYY-MM-DD. */
export function monthRange(timeZone: string, offsetMonths = 0, now = new Date()): { from: string; to: string } {
  const [y, m] = localToday(timeZone, now).split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { from: start.toISOString().slice(0, 10), to: addDays(next.toISOString().slice(0, 10), -1) };
}

export function yearRange(timeZone: string, now = new Date()): { from: string; to: string } {
  const y = localToday(timeZone, now).slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export const isIsoDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
