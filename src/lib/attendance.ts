/**
 * Presence hours from punches (pure). Days are cut in the garage's time zone.
 * Presence = from IN to OUT, minus breaks. A session without OUT is
 * "incomplete": it counts 0 minutes and is flagged (never guessed).
 */
export type Punch = { kind: "IN" | "OUT" | "BREAK_START" | "BREAK_END"; at: Date };
export type DayTotal = { date: string; presenceMinutes: number; breakMinutes: number; firstIn: Date | null; lastOut: Date | null; incomplete: boolean };

const FORGOTTEN_MS = 16 * 3_600_000;

export function localDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function attendanceByDay(punches: Punch[], timeZone: string): DayTotal[] {
  const sorted = [...punches].sort((a, b) => a.at.getTime() - b.at.getTime());
  const days = new Map<string, DayTotal>();
  const day = (d: Date) => {
    const key = localDate(d, timeZone);
    if (!days.has(key)) days.set(key, { date: key, presenceMinutes: 0, breakMinutes: 0, firstIn: null, lastOut: null, incomplete: false });
    return days.get(key)!;
  };

  let start: Date | null = null; // current session start (IN)
  let breakStart: Date | null = null;
  let breakMs = 0;
  const closeIncomplete = () => {
    if (start) day(start).incomplete = true;
    start = null;
    breakStart = null;
    breakMs = 0;
  };

  for (const p of sorted) {
    if (start && p.at.getTime() - start.getTime() > FORGOTTEN_MS) closeIncomplete();
    if (p.kind === "IN") {
      if (start) closeIncomplete();
      start = p.at;
      const d = day(p.at);
      if (!d.firstIn || p.at < d.firstIn) d.firstIn = p.at;
    } else if (p.kind === "BREAK_START") {
      if (start && !breakStart) breakStart = p.at;
    } else if (p.kind === "BREAK_END") {
      if (start && breakStart) {
        breakMs += p.at.getTime() - breakStart.getTime();
        breakStart = null;
      }
    } else if (p.kind === "OUT") {
      if (!start) continue;
      if (breakStart) {
        breakMs += p.at.getTime() - breakStart.getTime();
        breakStart = null;
      }
      const d = day(start);
      const total = p.at.getTime() - start.getTime();
      d.presenceMinutes += Math.max(0, Math.round((total - breakMs) / 60_000));
      d.breakMinutes += Math.round(breakMs / 60_000);
      d.lastOut = p.at;
      start = null;
      breakMs = 0;
    }
  }
  if (start) day(start).incomplete = true;
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const minutesToHours = (m: number) => Math.round((m / 60) * 100) / 100;
