import "server-only";
import type { PaymentMethod } from "@prisma/client";
import { utcToZoned } from "@/lib/booking";
import { dayToDbDate, dbDay, dueDates } from "@/lib/expense-schedule";
import { GARAGE_TZ } from "@/lib/format";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { addDaysToDay } from "@/lib/warranty";
import { audit } from "@/server/audit";
import { getSettings } from "@/server/settings";
import { dayToInstant } from "@/server/warranties";

/**
 * Fixed costs and due dates (V8.4, page « Dépenses et échéances »): rent, salaries,
 * electricity, loans… one-off or recurring. Due dates are created lazily, idempotently
 * (unique expenseId + dueDate), up to the horizon that is asked for. Administrator + manager.
 */

function assertCan(actor: StaffUser) {
  if (!can(actor, "manageExpenses")) throw new AppError("forbidden", {}, 403);
}

export async function garageToday(now = new Date()) {
  const s = await getSettings();
  return utcToZoned(now, s.timezone || GARAGE_TZ).date;
}

/**
 * Creates the missing due dates of every ACTIVE cost up to `until` (inclusive).
 * Safe to call on every page view: existing rows are skipped (ON CONFLICT DO NOTHING).
 */
export async function ensureOccurrences(until: string) {
  const expenses = await prisma.recurringExpense.findMany({
    where: { active: true, firstDueDate: { lte: dayToDbDate(until) } },
    select: { id: true, amount: true, frequency: true, firstDueDate: true, endDate: true },
  });
  const data = expenses.flatMap((e) =>
    dueDates({ frequency: e.frequency, firstDueDate: dbDay(e.firstDueDate), endDate: e.endDate ? dbDay(e.endDate) : null }, until).map((d) => ({ expenseId: e.id, dueDate: dayToDbDate(d), amount: e.amount })),
  );
  if (data.length === 0) return 0;
  const { count } = await prisma.expenseOccurrence.createMany({ data, skipDuplicates: true });
  return count;
}

export type NewExpense = { label: string; category: string; amount: number; frequency: string; firstDueDate: string; endDate?: string; supplierId?: string; notes?: string };

export async function createExpense(actor: StaffUser, input: NewExpense) {
  assertCan(actor);
  if (input.endDate && input.endDate < input.firstDueDate) throw new AppError("expenseDates", {}, 422);
  return prisma.$transaction(async (tx) => {
    const data = {
      label: input.label,
      category: input.category,
      amount: input.amount,
      frequency: input.frequency,
      firstDueDate: dayToDbDate(input.firstDueDate),
      endDate: input.endDate && input.frequency !== "ONCE" ? dayToDbDate(input.endDate) : null,
      supplierId: input.supplierId || null,
      notes: input.notes || null,
      createdById: actor.id,
    };
    const e = await tx.recurringExpense.create({ data, select: { id: true } });
    await audit(tx, actor, "fixedCost.create", "RecurringExpense", e.id, { after: { ...input } });
    return e;
  });
}

/**
 * Label, category, amount, end date, supplier, notes. Frequency and first due date are fixed
 * (stop the cost and create a new one to change them). A new amount applies to the due dates
 * not yet paid from today on; paid ones are never changed.
 */
export async function updateExpense(actor: StaffUser, expenseId: string, input: { label: string; category: string; amount: number; endDate?: string; supplierId?: string; notes?: string }, now = new Date()) {
  assertCan(actor);
  const today = await garageToday(now);
  return prisma.$transaction(async (tx) => {
    const old = await tx.recurringExpense.findUnique({ where: { id: expenseId } });
    if (!old) throw new AppError("notFound", {}, 404);
    if (input.endDate && input.endDate < dbDay(old.firstDueDate)) throw new AppError("expenseDates", {}, 422);
    const data = {
      label: input.label,
      category: input.category,
      amount: input.amount,
      endDate: input.endDate && old.frequency !== "ONCE" ? dayToDbDate(input.endDate) : null,
      supplierId: input.supplierId || null,
      notes: input.notes || null,
    };
    await tx.recurringExpense.update({ where: { id: expenseId }, data });
    const { count } = await tx.expenseOccurrence.updateMany({ where: { expenseId, paidAt: null, dueDate: { gte: dayToDbDate(today) } }, data: { amount: input.amount } });
    await audit(tx, actor, "fixedCost.update", "RecurringExpense", expenseId, {
      before: { label: old.label, category: old.category, amount: old.amount, endDate: old.endDate, supplierId: old.supplierId, notes: old.notes },
      after: { ...data, unpaidDueDatesUpdated: count },
    });
  });
}

/** Stop (or restart) a cost. Stopped: its unpaid due dates are no longer forecast (kept, not deleted). */
export async function setExpenseActive(actor: StaffUser, expenseId: string, active: boolean) {
  assertCan(actor);
  return prisma.$transaction(async (tx) => {
    const old = await tx.recurringExpense.findUnique({ where: { id: expenseId }, select: { active: true } });
    if (!old) throw new AppError("notFound", {}, 404);
    await tx.recurringExpense.update({ where: { id: expenseId }, data: { active } });
    await audit(tx, actor, active ? "fixedCost.restart" : "fixedCost.stop", "RecurringExpense", expenseId, { before: old, after: { active } });
  });
}

/** Marks a due date as paid (= settled): what was really paid, when, how. */
export async function payOccurrence(actor: StaffUser, occurrenceId: string, input: { paidDay: string; paidAmount: number; method: PaymentMethod; reference?: string | null }) {
  assertCan(actor);
  const s = await getSettings();
  const tz = s.timezone || GARAGE_TZ;
  return prisma.$transaction(async (tx) => {
    const old = await tx.expenseOccurrence.findUnique({ where: { id: occurrenceId }, select: { amount: true, dueDate: true, expenseId: true } });
    if (!old) throw new AppError("notFound", {}, 404);
    const data = { paidAt: dayToInstant(input.paidDay, tz), paidAmount: input.paidAmount, method: input.method, reference: input.reference || null, paidById: actor.id };
    const { count } = await tx.expenseOccurrence.updateMany({ where: { id: occurrenceId, paidAt: null }, data });
    if (count === 0) throw new AppError("occurrencePaid", {}, 409);
    await audit(tx, actor, "fixedCost.pay", "ExpenseOccurrence", occurrenceId, { before: { amount: old.amount, dueDate: dbDay(old.dueDate), expenseId: old.expenseId }, after: { ...input } });
  });
}

/** Payment typed by mistake: back to "to pay", with a reason kept in the journal. */
export async function cancelOccurrencePayment(actor: StaffUser, occurrenceId: string, reason: string) {
  assertCan(actor);
  return prisma.$transaction(async (tx) => {
    const old = await tx.expenseOccurrence.findUnique({ where: { id: occurrenceId }, select: { paidAt: true, paidAmount: true, method: true, reference: true } });
    if (!old) throw new AppError("notFound", {}, 404);
    const { count } = await tx.expenseOccurrence.updateMany({ where: { id: occurrenceId, paidAt: { not: null } }, data: { paidAt: null, paidAmount: null, method: null, reference: null, paidById: null } });
    if (count === 0) throw new AppError("alreadyVoided", {}, 409);
    await audit(tx, actor, "fixedCost.unpay", "ExpenseOccurrence", occurrenceId, { before: old, after: { paid: false, reason } });
  });
}

/** Page data: the costs, what is to pay (overdue + next `horizonDays`), what was paid recently. */
export async function expensesOverview(actor: StaffUser, horizonDays = 90, now = new Date()) {
  assertCan(actor);
  const today = await garageToday(now);
  const until = addDaysToDay(today, horizonDays);
  await ensureOccurrences(until);
  const [expenses, toPay, paid] = await Promise.all([
    prisma.recurringExpense.findMany({ orderBy: [{ active: "desc" }, { label: "asc" }], include: { supplier: { select: { id: true, name: true } } } }),
    prisma.expenseOccurrence.findMany({
      where: { paidAt: null, dueDate: { lte: dayToDbDate(until) }, expense: { active: true } },
      orderBy: { dueDate: "asc" },
      include: { expense: { select: { label: true, category: true, endDate: true } } },
      take: 500,
    }),
    prisma.expenseOccurrence.findMany({ where: { paidAt: { not: null } }, orderBy: { paidAt: "desc" }, take: 30, include: { expense: { select: { label: true } } } }),
  ]);
  // A due date after the cost's end date (end date moved earlier) is not to pay any more.
  const due = toPay.filter((o) => !o.expense.endDate || o.dueDate <= o.expense.endDate).map((o) => ({ ...o, day: dbDay(o.dueDate), overdue: dbDay(o.dueDate) < today }));
  return { today, until, expenses, toPay: due, paid };
}
