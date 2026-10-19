/**
 * Time spent on a repair (pure).
 * - person-minutes: sum of each mechanic's time (2 mechanics × 2 h = 4 h) →
 *   used for the employees' reports;
 * - elapsed minutes: the union of the intervals (2 mechanics together for 2 h = 2 h)
 *   → one possible basis for the labour billed to the customer.
 * The billed labour itself stays the work order's LABOR lines: nothing here
 * changes an invoice; it only suggests a quantity.
 */
export type Interval = { userId: string; start: Date; end: Date };

export function personMinutes(intervals: Interval[]): number {
  return Math.round(intervals.reduce((s, i) => s + Math.max(0, i.end.getTime() - i.start.getTime()), 0) / 60_000);
}

export function elapsedMinutes(intervals: Interval[]): number {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start.getTime() - b.start.getTime());
  let total = 0;
  let curStart: number | null = null;
  let curEnd = 0;
  for (const i of sorted) {
    const s = i.start.getTime();
    const e = i.end.getTime();
    if (curStart === null || s > curEnd) {
      if (curStart !== null) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else curEnd = Math.max(curEnd, e);
  }
  if (curStart !== null) total += curEnd - curStart;
  return Math.round(total / 60_000);
}

export function minutesByUser(intervals: Interval[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of intervals) out.set(i.userId, (out.get(i.userId) ?? 0) + Math.max(0, Math.round((i.end.getTime() - i.start.getTime()) / 60_000)));
  return out;
}

export type LaborBillingMode = "ELAPSED" | "PERSON";

/** Suggested billed quantity in hours × 100 (rounded to the quarter hour above). */
export function suggestedBilledX100(intervals: Interval[], mode: LaborBillingMode): number {
  const minutes = mode === "PERSON" ? personMinutes(intervals) : elapsedMinutes(intervals);
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 15) * 25;
}
