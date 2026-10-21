/**
 * Warranties (V8.4, Prompt 4/5) — pure rules, unit-tested in tests/warranty.test.ts.
 * Dates are garage days "YYYY-MM-DD" (Africa/Tunis): a warranty is valid up to and
 * including its last day. With both a date and a mileage limit, the first one reached wins.
 */

export const WARRANTY_KINDS = ["REPAIR", "PART"] as const;
export type WarrantyKind = (typeof WARRANTY_KINDS)[number];

export const CLAIM_STATUSES = ["OPEN", "SUBMITTED", "ACCEPTED", "PARTIAL", "REJECTED", "CLOSED"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Allowed claim moves. OPEN → CLOSED = claim dropped before being sent. CLOSED is final. */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  OPEN: ["SUBMITTED", "CLOSED"],
  SUBMITTED: ["ACCEPTED", "PARTIAL", "REJECTED"],
  ACCEPTED: ["CLOSED"],
  PARTIAL: ["CLOSED"],
  REJECTED: ["CLOSED"],
  CLOSED: [],
};

export function canMoveClaim(from: string, to: string): boolean {
  return (CLAIM_TRANSITIONS[from as ClaimStatus] ?? []).includes(to as ClaimStatus);
}

export type ValidityStatus = "ACTIVE" | "EXPIRED" | "VOID" | "UNKNOWN";

export type ValidityInput = {
  /** First covered day. */
  startDay: string;
  /** Last covered day (inclusive), null = no date limit. */
  endDay: string | null;
  /** Odometer at which the cover ends, null = no mileage limit. */
  endKm: number | null;
  voided: boolean;
};

export type Validity = {
  status: ValidityStatus;
  /** Which limit ended the cover ("date" / "km"), when EXPIRED. */
  endedBy: "date" | "km" | null;
  /** Days left including today (ACTIVE with a date limit), else null. */
  daysLeft: number | null;
  /** Km left (km limit known and current mileage known), else null. */
  kmLeft: number | null;
  /** A km limit exists but the vehicle's current mileage is unknown: only the date was checked. */
  kmUnchecked: boolean;
};

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/**
 * Is the warranty valid on `today` with the vehicle at `currentKm`?
 * - voided → VOID;
 * - date passed OR mileage reached → EXPIRED (whichever comes first);
 * - no limit at all, or only a mileage limit while the mileage is unknown → UNKNOWN
 *   (nothing is assumed: the page asks to check);
 * - otherwise ACTIVE.
 */
export function warrantyValidity(w: ValidityInput, today: string, currentKm: number | null): Validity {
  const kmKnown = w.endKm !== null && currentKm !== null;
  const base = { daysLeft: null, kmLeft: null, kmUnchecked: w.endKm !== null && currentKm === null };
  if (w.voided) return { status: "VOID", endedBy: null, ...base };
  if (w.endDay !== null && today > w.endDay) return { status: "EXPIRED", endedBy: "date", ...base };
  if (kmKnown && currentKm! >= w.endKm!) return { status: "EXPIRED", endedBy: "km", ...base };
  const daysLeft = w.endDay !== null ? dayNumber(w.endDay) - dayNumber(today < w.startDay ? w.startDay : today) + 1 : null;
  const kmLeft = kmKnown ? w.endKm! - currentKm! : null;
  if (w.endDay === null && !kmKnown) return { status: "UNKNOWN", endedBy: null, ...base };
  return { status: "ACTIVE", endedBy: null, daysLeft, kmLeft, kmUnchecked: base.kmUnchecked };
}

/** "2026-01-31" + 1 month → "2026-02-28" (end of month kept, never overflows into the next month). */
export function addMonthsToDay(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * Automatic repair warranty at delivery (Settings warrantyMonths / warrantyKm, 0 = off).
 * Returns null when both settings are 0. The cover ends the day before the same date N months later.
 * The km limit needs a starting mileage: unknown → no km limit (endKm null) and `kmMissing`.
 */
export function autoWarrantyTerms(
  settings: { warrantyMonths: number; warrantyKm: number },
  deliveredDay: string,
  startKm: number | null,
): { startDay: string; endDay: string | null; startKm: number | null; endKm: number | null; kmMissing: boolean } | null {
  const months = Math.max(0, Math.trunc(settings.warrantyMonths || 0));
  const km = Math.max(0, Math.trunc(settings.warrantyKm || 0));
  if (months === 0 && km === 0) return null;
  const endDay = months > 0 ? addDaysToDay(addMonthsToDay(deliveredDay, months), -1) : null;
  const endKm = km > 0 && startKm !== null ? startKm + km : null;
  return { startDay: deliveredDay, endDay, startKm, endKm, kmMissing: km > 0 && startKm === null };
}

export function addDaysToDay(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Money already received on a claim (voided refunds excluded) and what is still expected.
 * Only an ACCEPTED or PARTIAL claim is still waiting for money: CLOSED means the file is
 * finished (whatever was received), REJECTED means nothing will come.
 */
export function claimBalance(claim: { status: string; amountAccepted: number | null }, refunds: { amount: number; voided: boolean }[]) {
  const received = refunds.filter((r) => !r.voided).reduce((s, r) => s + r.amount, 0);
  const accepted = claim.status === "REJECTED" ? 0 : (claim.amountAccepted ?? 0);
  const waiting = claim.status === "ACCEPTED" || claim.status === "PARTIAL";
  return { accepted, received, expected: waiting ? Math.max(0, accepted - received) : 0 };
}

export const claimNumber = (n: number) => `GAR-${String(n).padStart(4, "0")}`;
