/**
 * Pure scheduling helpers (no database): time-zone maths, opening hours and
 * capacity. The server can run in UTC while the garage works in Africa/Tunis,
 * so every slot is computed in the garage's time zone and stored as UTC.
 */

export type DayHours = { open: string; close: string } | null;
export type OpeningHours = Record<string, DayHours>; // "0" (dimanche) … "6" (samedi)

export const DEFAULT_OPENING_HOURS: OpeningHours = {
  "0": null,
  "1": { open: "08:00", close: "17:00" },
  "2": { open: "08:00", close: "17:00" },
  "3": { open: "08:00", close: "17:00" },
  "4": { open: "08:00", close: "17:00" },
  "5": { open: "08:00", close: "17:00" },
  "6": { open: "08:00", close: "13:00" },
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseOpeningHours(value: unknown): OpeningHours {
  const out: OpeningHours = {};
  const src = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  for (let d = 0; d < 7; d++) {
    const day = src[String(d)] as { open?: unknown; close?: unknown } | null | undefined;
    const open = typeof day?.open === "string" ? day.open : "";
    const close = typeof day?.close === "string" ? day.close : "";
    out[String(d)] = HHMM.test(open) && HHMM.test(close) && open < close ? { open, close } : null;
  }
  return out;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const minutesToHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Offset (ms) of `timeZone` from UTC at a given instant. */
function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** "2026-10-07" + "09:30" in Africa/Tunis → UTC Date. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  const first = guess - tzOffsetMs(guess, timeZone);
  // Second pass handles DST boundaries for zones that have them.
  return new Date(guess - tzOffsetMs(first, timeZone));
}

/** UTC instant → { date: "YYYY-MM-DD", time: "HH:MM", weekday } in the garage's zone. */
export function utcToZoned(instant: Date, timeZone: string): { date: string; time: string; weekday: number } {
  const shifted = new Date(instant.getTime() + tzOffsetMs(instant.getTime(), timeZone));
  const date = shifted.toISOString().slice(0, 10);
  const time = shifted.toISOString().slice(11, 16);
  return { date, time, weekday: shifted.getUTCDay() };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export type BookingRules = {
  timeZone: string;
  openingHours: OpeningHours;
  slotMinutes: number;
  capacity: number;
  leadMinutes: number;
  horizonDays: number;
};

export type Busy = { startAt: Date; endAt: Date };

/** How many existing appointments overlap [start, end) at its busiest moment. */
export function peakOverlap(start: number, end: number, busy: Busy[]): number {
  const points: [number, number][] = [];
  for (const b of busy) {
    const s = Math.max(start, b.startAt.getTime());
    const e = Math.min(end, b.endAt.getTime());
    if (s < e) points.push([s, 1], [e, -1]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // ends before starts at the same instant
  let current = 0;
  let peak = 0;
  for (const [, delta] of points) {
    current += delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

/**
 * Free start times ("HH:MM", garage time) on `date` for a service lasting
 * `durationMin`. A slot is free when the workshop never exceeds `capacity`
 * vehicles at once during the whole service, it fits before closing time,
 * and it starts at least `leadMinutes` from `now`.
 */
export function freeSlots(date: string, durationMin: number, rules: BookingRules, busy: Busy[], now: Date): string[] {
  const hours = rules.openingHours[String(weekdayOf(date))];
  if (!hours) return [];
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  const earliest = now.getTime() + rules.leadMinutes * 60_000;
  const out: string[] = [];

  for (let m = open; m + durationMin <= close; m += rules.slotMinutes) {
    const hhmm = minutesToHHMM(m);
    const start = zonedToUtc(date, hhmm, rules.timeZone).getTime();
    if (start < earliest) continue;
    const end = start + durationMin * 60_000;
    if (peakOverlap(start, end, busy) < rules.capacity) out.push(hhmm);
  }
  return out;
}

/** Calendar for the booking widget: every bookable day with its free slots. */
export function availability(
  durationMin: number,
  rules: BookingRules,
  busy: Busy[],
  now: Date,
): { date: string; slots: string[] }[] {
  const today = utcToZoned(now, rules.timeZone).date;
  const days: { date: string; slots: string[] }[] = [];
  for (let i = 0; i <= rules.horizonDays; i++) {
    const date = addDays(today, i);
    const slots = freeSlots(date, durationMin, rules, busy, now);
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

/** Digits a phone number must contain to be valid, and to be used to find an existing customer. */
export const MIN_PHONE_DIGITS = 8;

/**
 * Last 8 digits of a phone, used to link a booking to an existing customer
 * file; null when the number has fewer than 8 digits (an empty or short needle
 * would match an unrelated customer).
 */
export function phoneMatchNeedle(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= MIN_PHONE_DIGITS ? digits.slice(-MIN_PHONE_DIGITS) : null;
}
