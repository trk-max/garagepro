import type { InvoiceStatus } from "@prisma/client";
import { invoiceBalance } from "@/lib/billing";

/**
 * Paiements partiels — pure rules of the « date du prochain paiement » (unit-tested in tests/payment-promise.test.ts).
 * A promise is a row of PaymentPromise (append-only): the LATEST one of an invoice counts.
 *
 * - kept: since the promise was recorded, the customer paid at least the promised amount (or something, when no
 *   amount was promised) → it no longer alerts; the invoice waits for the next promise.
 * - overdue: the promised day is before today (garage day), the promise is not kept and a balance remains → it
 *   alerts again (« Promesse de paiement dépassée »).
 */
export type PromiseLike = { promisedAt: Date; amount: number | null; createdAt: Date };
export type PaymentLike = { amount: number; paidAt: Date };
export type InvoiceLike = { status: InvoiceStatus; totalTtc: number; paidAmount: number; dueDate: Date | null; issuedAt: Date };

/** Where an invoice with money still due goes in « À traiter » (null = nowhere: nothing due, or not yet due). */
export type PaymentFollowUp = "paymentPromisesDue" | "overdueInvoices" | "partialPayments";

/** Net amount paid since the promise was recorded (reversals count negative). */
export function paidSince(p: PromiseLike, payments: PaymentLike[]): number {
  return payments.filter((x) => x.paidAt.getTime() >= p.createdAt.getTime()).reduce((s, x) => s + x.amount, 0);
}

export function promiseKept(p: PromiseLike, payments: PaymentLike[]): boolean {
  return paidSince(p, payments) >= (p.amount && p.amount > 0 ? p.amount : 1);
}

export function promiseOverdue(p: PromiseLike, payments: PaymentLike[], todayStart: Date): boolean {
  return p.promisedAt.getTime() < todayStart.getTime() && !promiseKept(p, payments);
}

/** The promise still waited for (date to come, not kept), or null. */
export function activePromise<P extends PromiseLike>(latest: P | null, payments: PaymentLike[], todayStart: Date): P | null {
  return latest && !promiseKept(latest, payments) && latest.promisedAt.getTime() >= todayStart.getTime() ? latest : null;
}

/**
 * One entry per invoice, never two (no duplicates between the lists):
 *  1. latest promise passed and not kept → paymentPromisesDue (highlighted);
 *  2. past its due date with no promise to wait for → overdueInvoices (same rule as before otherwise);
 *  3. partly paid, or a promised day still to come → partialPayments (with the next payment date).
 */
export function paymentFollowUp(inv: InvoiceLike, latest: PromiseLike | null, payments: PaymentLike[], todayStart: Date): PaymentFollowUp | null {
  if ((inv.status !== "ISSUED" && inv.status !== "PARTIAL") || invoiceBalance(inv) <= 0) return null;
  if (latest && promiseOverdue(latest, payments, todayStart)) return "paymentPromisesDue";
  const waiting = activePromise(latest, payments, todayStart);
  if ((inv.dueDate ?? inv.issuedAt).getTime() < todayStart.getTime() && !waiting) return "overdueInvoices";
  if (inv.paidAmount > 0 || waiting) return "partialPayments";
  return null;
}

/** Days between the promised day and today (> 0 = late). */
export function daysPast(promisedAt: Date, todayStart: Date): number {
  return Math.max(0, Math.ceil((todayStart.getTime() - promisedAt.getTime()) / 86_400_000));
}

export type PromiseError = "promiseDate" | "promiseAmount" | "promiseSettled";

/**
 * Checks of a new promise: day today or later (yyyy-mm-dd, garage day, at most 366 days ahead), amount (millimes)
 * optional, > 0 and ≤ the remaining balance; nothing to promise on a settled or credited invoice.
 */
export function checkPromise(input: { day: string; amount: number | null }, today: string, balance: number): PromiseError | null {
  if (balance <= 0) return "promiseSettled";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || Number.isNaN(Date.parse(`${input.day}T00:00:00Z`)) || input.day < today) return "promiseDate";
  if (Date.parse(`${input.day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) > 366 * 86_400_000) return "promiseDate";
  if (input.amount !== null && (input.amount <= 0 || input.amount > balance)) return "promiseAmount";
  return null;
}
