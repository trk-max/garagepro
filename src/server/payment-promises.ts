import "server-only";
import { cache } from "react";
import { invoiceBalance } from "@/lib/billing";
import { utcToZoned, zonedToUtc } from "@/lib/booking";
import { AppError } from "@/lib/http";
import { activePromise, checkPromise, paymentFollowUp, promiseKept, promiseOverdue, type PaymentFollowUp } from "@/lib/payment-promise";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { getSettings } from "@/server/settings";

/**
 * Paiements partiels — « date du prochain paiement » promise by the customer (PaymentPromise, append-only: the
 * latest row of an invoice counts, the earlier ones are its history). Recorded by whoever may record a payment
 * (recordPayment), journalised in the same transaction. The follow-up lists of « À traiter » (partly paid, overdue,
 * promise passed) are computed here from the same rules (lib/payment-promise).
 */

/** Today of the garage (yyyy-mm-dd) and its first instant. */
export async function garageToday(now = new Date()) {
  const tz = (await getSettings()).timezone;
  const today = utcToZoned(now, tz).date;
  return { tz, today, todayStart: zonedToUtc(today, "00:00", tz) };
}

export type PromiseInput = { day: string; amount: number | null; note: string | null };

export async function recordPaymentPromise(invoiceId: string, input: PromiseInput, actor: StaffUser, now = new Date()) {
  if (!can(actor, "recordPayment")) throw new AppError("forbidden", {}, 403);
  const { tz, today } = await garageToday(now);
  const note = input.note?.trim().slice(0, 300) || null;
  return prisma.$transaction(async (tx) => {
    // Same lock as a payment: the balance read here is the one after any payment being recorded.
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const inv = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { number: true, status: true, totalTtc: true, paidAmount: true, workOrderId: true, paymentPromises: { orderBy: { createdAt: "desc" }, take: 1, select: { promisedAt: true, amount: true } } },
    });
    if (!inv) throw new AppError("notFound", {}, 404);
    const balance = invoiceBalance(inv);
    const error = checkPromise({ day: input.day, amount: input.amount }, today, balance);
    if (error) throw new AppError(error, {}, error === "promiseSettled" ? 409 : 422);
    const promisedAt = zonedToUtc(input.day, "12:00", tz);
    const row = await tx.paymentPromise.create({
      data: { invoiceId, workOrderId: inv.workOrderId, promisedAt, amount: input.amount, note, recordedById: actor.id },
      select: { id: true },
    });
    const previous = inv.paymentPromises[0] ?? null;
    await audit(tx, actor, "payment.promise", "PaymentPromise", row.id, {
      before: previous ? { promisedAt: previous.promisedAt, amount: previous.amount } : undefined,
      after: { invoice: inv.number, promisedDay: input.day, amount: input.amount, note, balance },
    });
    await tx.workOrderEvent.create({
      data: { workOrderId: inv.workOrderId, actorId: actor.id, type: "NOTE", data: { paymentPromise: input.day, amount: input.amount, invoice: inv.number } },
    });
    return { id: row.id, promisedAt };
  });
}

export type PromiseState = "kept" | "overdue" | "waiting";

/** History of the promises of an invoice (newest first), with the state of the latest one. */
export async function invoicePromises(invoiceId: string, now = new Date()) {
  const { todayStart } = await garageToday(now);
  const [rows, payments] = await Promise.all([
    prisma.paymentPromise.findMany({ where: { invoiceId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.payment.findMany({ where: { invoiceId }, select: { amount: true, paidAt: true } }),
  ]);
  const ids = [...new Set(rows.map((r) => r.recordedById).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const name = new Map(users.map((u) => [u.id, u.name]));
  const latest = rows[0] ?? null;
  const state: PromiseState | null = !latest ? null : promiseKept(latest, payments) ? "kept" : promiseOverdue(latest, payments, todayStart) ? "overdue" : "waiting";
  return { rows: rows.map((r) => ({ ...r, recordedBy: r.recordedById ? (name.get(r.recordedById) ?? null) : null })), latest, state };
}

/** Next payment of an invoice: the latest promise still waited for or passed (null when kept / none). */
export function nextPaymentOf(latest: { promisedAt: Date; amount: number | null; createdAt: Date } | null, payments: { amount: number; paidAt: Date }[], todayStart: Date) {
  if (!latest || promiseKept(latest, payments)) return null;
  return { at: latest.promisedAt, amount: latest.amount, overdue: promiseOverdue(latest, payments, todayStart) };
}

const followSelect = {
  id: true,
  number: true,
  status: true,
  totalTtc: true,
  paidAmount: true,
  dueDate: true,
  issuedAt: true,
  customer: { select: { name: true, phone: true } },
  workOrder: { select: { id: true, number: true, vehicle: { select: { plate: true, make: true, model: true } } } },
  payments: { select: { amount: true, paidAt: true } },
  paymentPromises: { orderBy: { createdAt: "desc" as const }, take: 1, select: { promisedAt: true, amount: true, createdAt: true, note: true } },
} as const;

export type FollowUpRow = {
  key: PaymentFollowUp;
  id: string;
  number: string;
  totalTtc: number;
  paidAmount: number;
  balance: number;
  dueDate: Date;
  customer: { name: string; phone: string };
  workOrder: { id: string; number: number; vehicle: { plate: string; make: string; model: string } };
  next: { at: Date; amount: number | null; overdue: boolean } | null;
};

/**
 * Every open invoice (ISSUED / PARTIAL, money due) with its follow-up list (one per invoice). Read once per call;
 * the three counts and the detail rows of « À traiter » use it, so they always agree.
 */
export const paymentFollowUps = cache(async (now: Date = new Date()): Promise<FollowUpRow[]> => {
  const { todayStart } = await garageToday(now);
  const open = await prisma.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIAL"] } }, select: followSelect, orderBy: { issuedAt: "asc" }, take: 3000 });
  const out: FollowUpRow[] = [];
  for (const inv of open) {
    const latest = inv.paymentPromises[0] ?? null;
    const key = paymentFollowUp(inv, latest, inv.payments, todayStart);
    if (!key) continue;
    const waiting = activePromise(latest, inv.payments, todayStart);
    out.push({
      key,
      id: inv.id,
      number: inv.number,
      totalTtc: inv.totalTtc,
      paidAmount: inv.paidAmount,
      balance: invoiceBalance(inv),
      dueDate: inv.dueDate ?? inv.issuedAt,
      customer: inv.customer,
      workOrder: inv.workOrder,
      next: key === "paymentPromisesDue" && latest ? { at: latest.promisedAt, amount: latest.amount, overdue: true } : waiting ? { at: waiting.promisedAt, amount: waiting.amount, overdue: false } : null,
    });
  }
  return out;
});

export async function countPaymentFollowUp(key: PaymentFollowUp, now = new Date()): Promise<number> {
  return (await paymentFollowUps(now)).filter((r) => r.key === key).length;
}
