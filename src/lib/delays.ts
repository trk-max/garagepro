/**
 * V16 Lot 3 — delays, refused quotes and waiting for parts: pure rules (no database), shared by the server
 * (src/server/delays.ts, work-orders.ts, quotes.ts), the pages and the unit tests.
 */
import type { LineApprovalStatus, LinePriority, PromiseReason } from "@prisma/client";

/** Why a promised date (or a part's expected date) moved. Shown to the customer with a neutral label only. */
export const PROMISE_REASONS = ["PARTS", "EXTRA_WORK", "CUSTOMER_DECISION", "INSURANCE", "WORKSHOP_LOAD", "OTHER"] as const satisfies readonly PromiseReason[];

/** While waiting for a part: the customer keeps the car at the garage, or takes it back and comes back. */
export const PARTS_WAIT_DECISIONS = ["KEEP_VEHICLE", "RETURN_LATER"] as const;
export type PartsWaitDecision = (typeof PARTS_WAIT_DECISIONS)[number];

/** A missing part still expected (not received, not cancelled). */
export const OPEN_NEED_STATUSES = ["NEEDED", "ORDERED"] as const;

/**
 * Two dates are « the same promise » when they fall in the same minute (the form works to the minute; a date
 * stored with seconds — e.g. an online booking — must not count as a change when only the diagnosis is saved).
 */
export function sameMinute(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);
}

/**
 * A promised date that existed changed (or was cleared): it needs a reason and a PromiseRevision. Setting the
 * FIRST date is not a change (it becomes the initial promise).
 */
export function promiseRevisionNeeded(before: Date | null | undefined, after: Date | null | undefined): boolean {
  return !!before && !sameMinute(before, after);
}

export type PromiseKpiRow = { deliveredAt: Date; promisedAtInitial?: Date | null; promisedAt?: Date | null };

/**
 * KPI « livré à la date promise initiale »: among the orders delivered in the period that had a promise, how
 * many were delivered no later than the FIRST promised date — and, for comparison, the current (revised) one.
 */
export function promiseKpi(rows: PromiseKpiRow[]) {
  const initial = rows.filter((r) => r.promisedAtInitial);
  const current = rows.filter((r) => r.promisedAt ?? r.promisedAtInitial);
  const onTimeInitial = initial.filter((r) => r.deliveredAt.getTime() <= r.promisedAtInitial!.getTime()).length;
  const onTimeCurrent = current.filter((r) => r.deliveredAt.getTime() <= (r.promisedAt ?? r.promisedAtInitial)!.getTime()).length;
  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
  return {
    withPromise: initial.length,
    onTimeInitial,
    pctInitial: pct(onTimeInitial, initial.length),
    withCurrent: current.length,
    onTimeCurrent,
    pctCurrent: pct(onTimeCurrent, current.length),
  };
}

type WaiverLine = { id: string; priority: LinePriority | null; approvalStatus: LineApprovalStatus; voidedAt: Date | null };

/**
 * Refused SAFETY lines not yet covered by a signed safety waiver (waivers = line ids of each waiver recorded).
 * Non-empty → the signed waiver is asked before « Prêt » (setting requireSafetyWaiver, new orders).
 */
export function linesNeedingWaiver(lines: WaiverLine[], waivers: string[][]): string[] {
  const covered = new Set(waivers.flat());
  return lines.filter((l) => l.priority === "SAFETY" && l.approvalStatus === "REFUSED" && !l.voidedAt && !covered.has(l.id)).map((l) => l.id);
}

/** Line ids recorded in the waiver events of an order (event data { safetyWaiver: true, lineIds: [...] }). */
export function waiverLineIds(events: { data: unknown }[]): string[][] {
  const out: string[][] = [];
  for (const e of events) {
    const d = e.data as { safetyWaiver?: unknown; lineIds?: unknown } | null;
    if (d?.safetyWaiver && Array.isArray(d.lineIds)) out.push(d.lineIds.filter((x): x is string => typeof x === "string"));
  }
  return out;
}

/**
 * Should a date change be sent to the customer? Never to a customer who refused automatic messages
 * (reminderOptOut). Without any contact the queue records « skipped + reason » (never a fake send).
 */
export function notifyAllowed(customer: { reminderOptOut: boolean }): boolean {
  return !customer.reminderOptOut;
}
