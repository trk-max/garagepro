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

/**
 * Days of whole-day leave falling in a calendar year (garage open days only),
 * e.g. a leave from 29 Dec to 3 Jan counts its December days in one year and
 * its January days in the next.
 */
export function leaveDaysInYear(spans: { startAt: Date; endAt: Date }[], year: number, timeZone: string, hours: OpeningHours): number {
  const prefix = `${year}-`;
  return spans.reduce((sum, span) => sum + spanDates(span, timeZone).filter((d) => d.startsWith(prefix) && hours[String(weekdayOf(d))] !== null).length, 0);
}

export type LeaveBalance = { year: number; allowance: number | null; taken: number; pending: number; remaining: number | null };

/** Fixed number of days per year (set on the employee file), minus approved paid leave; no carry-over. */
export function leaveBalance(allowance: number | null, taken: number, pending: number, year: number): LeaveBalance {
  return { year, allowance, taken, pending, remaining: allowance === null ? null : allowance - taken };
}
