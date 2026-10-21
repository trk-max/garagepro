import { addMonthsToDay } from "@/lib/warranty";

/**
 * Due dates of a fixed cost (V8.4) — pure, unit-tested in tests/expenses.test.ts.
 * Days are "YYYY-MM-DD". Each due date is computed from the FIRST one (never chained), so a
 * cost due on the 31st falls on the last day of shorter months and comes back to the 31st.
 */
export type Frequency = "ONCE" | "MONTHLY" | "QUARTERLY" | "YEARLY";

const STEP_MONTHS: Record<Exclude<Frequency, "ONCE">, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

/** Safety cap: never more than this many due dates for one cost in one call. */
export const MAX_OCCURRENCES = 400;

export function dueDates(e: { frequency: Frequency | string; firstDueDate: string; endDate: string | null }, until: string): string[] {
  const last = e.endDate && e.endDate < until ? e.endDate : until;
  if (e.firstDueDate > last) return [];
  if (e.frequency === "ONCE") return [e.firstDueDate];
  const step = STEP_MONTHS[e.frequency as keyof typeof STEP_MONTHS];
  if (!step) return [];
  const out: string[] = [];
  for (let n = 0; out.length < MAX_OCCURRENCES; n++) {
    const d = addMonthsToDay(e.firstDueDate, n * step);
    if (d > last) break;
    out.push(d);
  }
  return out;
}

/** A @db.Date value (UTC midnight) ↔ "YYYY-MM-DD". */
export const dbDay = (d: Date) => d.toISOString().slice(0, 10);
export const dayToDbDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
