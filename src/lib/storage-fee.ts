import type { WorkOrderStatus } from "@prisma/client";

/**
 * V16 Lot 4 — storage fee (gardiennage), pure rule, unit-tested in tests/lot4-v16.test.ts.
 *
 * - Starts when the car is READY **and** the customer was told (READY message sent, or « client prévenu » noted by
 *   hand): the first such notice that falls while the car is ready. No notice → no fee.
 * - The grace period (Setting.storageGraceHours) runs from that notice.
 * - Counted while the car is READY, and while it waits for parts (WAITING_PARTS) only when the wait is NOT the
 *   garage's doing AND the car stayed at the garage (Lot 3 decision « garder / restituer » + « imputable au
 *   garage », which is yes by default — no decision = garage-caused). Never during a garage-caused wait, a return
 *   to the workshop, nor once the car was handed back.
 * - Every started day counts: days = ceil(counted time / 24 h); amount = days × Setting.storageFeePerDay.
 */

export type StatusMove = { at: Date; to: WorkOrderStatus };
export type PartsWaitDecision = { at: Date; decision: "KEEP_VEHICLE" | "RETURN_LATER"; garageCaused: boolean };

export type StorageFeeInput = {
  /** Status moves of the order, any order (STATUS_CHANGED events). */
  moves: StatusMove[];
  /** When the customer was told the car is ready (messages sent, notes). */
  notices: Date[];
  partsDecisions: PartsWaitDecision[];
  graceHours: number;
  feePerDay: number;
  /** End of the count: now (invoice at pick-up) or the delivery time. */
  end: Date;
};

export type StorageFee = { days: number; amount: number; start: Date | null; countedMs: number; reason: "notReady" | "notNotified" | "inGrace" | "due" };

const DAY = 86_400_000;

type Interval = { from: number; to: number; status: WorkOrderStatus };

function intervals(moves: StatusMove[], end: number): Interval[] {
  const sorted = [...moves].sort((a, b) => a.at.getTime() - b.at.getTime());
  return sorted
    .map((m, i) => ({ from: m.at.getTime(), to: Math.min(i + 1 < sorted.length ? sorted[i + 1]!.at.getTime() : end, end), status: m.to }))
    .filter((iv) => iv.to > iv.from);
}

/** The decision that applies to a parts wait: the latest one recorded before the wait ended. */
function decisionFor(iv: Interval, decisions: PartsWaitDecision[]): PartsWaitDecision | null {
  let last: PartsWaitDecision | null = null;
  for (const d of decisions) if (d.at.getTime() < iv.to && (!last || d.at > last.at)) last = d;
  return last;
}

/** Is this period billable as storage (before the start / grace cut)? */
function chargeable(iv: Interval, decisions: PartsWaitDecision[]): boolean {
  if (iv.status === "READY") return true;
  if (iv.status !== "WAITING_PARTS") return false;
  const d = decisionFor(iv, decisions);
  // No decision recorded: garage-caused by default (Lot 3), never charged.
  return !!d && d.decision === "KEEP_VEHICLE" && !d.garageCaused;
}

export function computeStorageFee(input: StorageFeeInput): StorageFee {
  const end = input.end.getTime();
  const ivs = intervals(input.moves, end);
  const ready = ivs.filter((iv) => iv.status === "READY");
  if (ready.length === 0) return { days: 0, amount: 0, start: null, countedMs: 0, reason: "notReady" };
  // The first notice given while the car was ready (a notice a few seconds before the READY event of the same
  // click is accepted: tolerance of 1 minute).
  const notices = input.notices.map((d) => d.getTime()).sort((a, b) => a - b);
  let start: number | null = null;
  for (const n of notices) {
    const iv = ready.find((r) => n >= r.from - 60_000 && n < r.to);
    if (iv) {
      start = Math.max(n, iv.from);
      break;
    }
  }
  if (start === null) return { days: 0, amount: 0, start: null, countedMs: 0, reason: "notNotified" };
  const from = start + Math.max(0, input.graceHours) * 3_600_000;
  let counted = 0;
  for (const iv of ivs) {
    if (!chargeable(iv, input.partsDecisions)) continue;
    const a = Math.max(iv.from, from);
    if (iv.to > a) counted += iv.to - a;
  }
  if (counted <= 0) return { days: 0, amount: 0, start: new Date(start), countedMs: 0, reason: "inGrace" };
  const days = Math.ceil(counted / DAY);
  return { days, amount: days * Math.max(0, input.feePerDay), start: new Date(start), countedMs: counted, reason: "due" };
}
