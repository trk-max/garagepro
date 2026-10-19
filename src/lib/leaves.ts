import { addDays, utcToZoned, weekdayOf, zonedToUtc, type OpeningHours } from "@/lib/booking";

/**
 * Leave / absence periods (pure).
 * - Whole days: stored from local midnight of the first day to local midnight
 *   after the last day (end excluded). Counted days = days the garage is open.
 * - Authorisation (a few hours): exact start and end times, counted in hours.
 */
export type LeaveSpan = { startAt: Date; endAt: Date; allDay: boolean };

export function wholeDaysSpan(firstDay: string, lastDay: string, timeZone: string): { startAt: Date; endAt: Date } {
  return { startAt: zonedToUtc(firstDay, "00:00", timeZone), endAt: zonedToUtc(addDays(lastDay, 1), "00:00", timeZone) };
}

/** Local dates covered by a span (end excluded). */
export function spanDates(span: { startAt: Date; endAt: Date }, timeZone: string): string[] {
  const first = utcToZoned(span.startAt, timeZone).date;
  const lastInstant = new Date(span.endAt.getTime() - 1);
  const last = utcToZoned(lastInstant, timeZone).date;
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Working days (garage open) in a whole-day span. */
export function workingDays(span: { startAt: Date; endAt: Date }, timeZone: string, hours: OpeningHours): number {
  return spanDates(span, timeZone).filter((d) => hours[String(weekdayOf(d))] !== null).length;
}

export function spanHours(span: { startAt: Date; endAt: Date }): number {
  return Math.round(((span.endAt.getTime() - span.startAt.getTime()) / 3_600_000) * 100) / 100;
}

export const overlaps = (a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) => a.startAt < b.endAt && b.startAt < a.endAt;
