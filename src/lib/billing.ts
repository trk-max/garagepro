import type { InvoiceStatus } from "@prisma/client";

/**
 * V16 Lot 4 — invoices, credit notes and payments: pure rules (no database), unit-tested in tests/lot4-v16.test.ts.
 */

/**
 * Deposit taken at reception that is NOT a payment on the invoice (to deduct from the balance, Lot 1 rule).
 * Orders of Lot 4 on (workflowLot4): the deposit becomes a real Payment when the invoice is created, it is already
 * in paidAmount → 0 here, so it is never counted twice. Older orders: the deposit as before.
 */
export function depositOutstanding(wo: { workflowLot4?: boolean | null; depositAmount: number | null | undefined }): number {
  return wo.workflowLot4 ? 0 : (wo.depositAmount ?? 0);
}

/** What is still owed on an invoice: 0 once cancelled by a credit note (what was paid is then owed BACK). */
export function invoiceBalance(inv: { totalTtc: number; paidAmount: number; status: InvoiceStatus }): number {
  if (inv.status === "CREDITED") return 0;
  return Math.max(0, inv.totalTtc - inv.paidAmount);
}

/** Money to give back to the customer: paid on an invoice cancelled by a credit note, or overpaid. */
export function refundDue(inv: { totalTtc: number; paidAmount: number; status: InvoiceStatus }): number {
  if (inv.status === "CREDITED") return Math.max(0, inv.paidAmount);
  return Math.max(0, inv.paidAmount - inv.totalTtc);
}

/** Invoice status from what was paid (a credited invoice keeps CREDITED). */
export function statusFromPaid(totalTtc: number, paidAmount: number, current: InvoiceStatus): InvoiceStatus {
  if (current === "CREDITED") return "CREDITED";
  if (paidAmount <= 0) return "ISSUED";
  return paidAmount >= totalTtc ? "PAID" : "PARTIAL";
}

export const AGED_BUCKETS = ["d0_30", "d31_60", "d61_90", "d90_plus"] as const;
export type AgedBucket = (typeof AGED_BUCKETS)[number];
export type AgedBalance = Record<AgedBucket, { count: number; amount: number }> & { total: number };

/** 0–30, 31–60, 61–90, > 90 days since the invoice date. */
export function agedBucket(issuedAt: Date, now: Date): AgedBucket {
  const days = Math.floor((now.getTime() - issuedAt.getTime()) / 86_400_000);
  return days <= 30 ? "d0_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90_plus";
}

/**
 * Aged balance of the customer invoices still owed (credited ones owe nothing; the deposit of older orders is
 * deducted like the delivery rule does).
 */
export function agedBalance(
  invoices: { issuedAt: Date; totalTtc: number; paidAmount: number; status: InvoiceStatus; deposit?: number }[],
  now = new Date(),
): AgedBalance {
  const out = Object.fromEntries(AGED_BUCKETS.map((b) => [b, { count: 0, amount: 0 }])) as unknown as AgedBalance;
  out.total = 0;
  for (const inv of invoices) {
    const due = Math.max(0, invoiceBalance(inv) - (inv.deposit ?? 0));
    if (due <= 0) continue;
    const b = out[agedBucket(inv.issuedAt, now)];
    b.count++;
    b.amount += due;
    out.total += due;
  }
  return out;
}

/** Graduated reminders after the due date (days late). */
export const REMINDER_LEVELS = [7, 15, 30] as const;

/** Highest reminder level reached for this many days late (null = none yet). */
export function reminderLevel(daysLate: number): (typeof REMINDER_LEVELS)[number] | null {
  let level: (typeof REMINDER_LEVELS)[number] | null = null;
  for (const l of REMINDER_LEVELS) if (daysLate >= l) level = l;
  return level;
}

/** A payment may be dated in the past (entered late) but never in the future nor before the invoice − 1 year. */
export function paymentDateAllowed(paidAt: Date, invoiceIssuedAt: Date, now = new Date()): boolean {
  return paidAt.getTime() <= now.getTime() + 5 * 60_000 && paidAt.getTime() >= invoiceIssuedAt.getTime() - 366 * 86_400_000;
}

/** A credit note number « AV-2026-0001 ». */
export const creditNoteNumber = (year: number, n: number) => `AV-${year}-${String(n).padStart(4, "0")}`;
