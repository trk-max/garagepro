import "server-only";
import { utcToZoned, zonedToUtc } from "@/lib/booking";
import { firstBreach, forecastCash, SCENARIO_LIST, type ForecastInput, type Scenario } from "@/lib/cash-forecast";
import { dayToDbDate, dbDay } from "@/lib/expense-schedule";
import { GARAGE_TZ } from "@/lib/format";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { addDaysToDay, claimBalance, claimNumber } from "@/lib/warranty";
import { audit } from "@/server/audit";
import { ensureOccurrences } from "@/server/expenses";
import { getSettings } from "@/server/settings";

/**
 * Cash forecast (V8.4): loads plain data from the database and hands it to the pure
 * forecastCash() (src/lib/cash-forecast.ts). Read: administrator, manager, accountant (readCashForecast); typed balance: administrator + manager.
 * Single garage: there is no branch in GaragePro, every figure is the whole garage's.
 */

/** Longest horizon offered (days): data is always loaded for it, pages slice 30 / 60 / 90. */
export const MAX_HORIZON = 90;

/** Reading: readCashForecast (V9: + accountant). Typing the balance: viewCashForecast (administrator + manager). */
function assertCan(actor: StaffUser, permission: "readCashForecast" | "viewCashForecast" = "readCashForecast") {
  if (!can(actor, permission)) throw new AppError("forbidden", {}, 403);
}

export const isScenario = (s: unknown): s is Scenario => typeof s === "string" && (SCENARIO_LIST as string[]).includes(s);

/** Everything the forecast needs, as plain data (days in the garage's time zone). */
export async function loadForecastInput(now = new Date()): Promise<ForecastInput & { balanceRow: { id: string; createdAt: Date; note: string | null } | null }> {
  const settings = await getSettings();
  const tz = settings.timezone || GARAGE_TZ;
  const day = (d: Date) => utcToZoned(d, tz).date;
  const today = day(now);
  const until = addDaysToDay(today, MAX_HORIZON);
  await ensureOccurrences(until);

  const balance = await prisma.cashBalance.findFirst({ orderBy: [{ asOf: "desc" }, { createdAt: "desc" }] });
  const asOf = balance ? dbDay(balance.asOf) : null;
  // Real money dated after the END of the balance day (garage time).
  const after = asOf ? zonedToUtc(addDaysToDay(asOf, 1), "00:00", tz) : null;

  const [payments, supplierPayments, paidOccurrences, refundsReceived, invoices, supplierInvoices, occurrences, claims] = await Promise.all([
    after ? prisma.payment.findMany({ where: { paidAt: { gte: after } }, select: { amount: true, paidAt: true } }) : [],
    after ? prisma.supplierPayment.findMany({ where: { paidAt: { gte: after } }, select: { amount: true, paidAt: true } }) : [],
    after ? prisma.expenseOccurrence.findMany({ where: { paidAt: { gte: after } }, select: { amount: true, paidAmount: true, paidAt: true } }) : [],
    after ? prisma.warrantyRefund.findMany({ where: { receivedAt: { gte: after }, voidedAt: null }, select: { amount: true, receivedAt: true } }) : [],
    prisma.invoice.findMany({ where: { status: { not: "PAID" } }, select: { id: true, number: true, totalTtc: true, paidAmount: true, dueDate: true, issuedAt: true, customer: { select: { name: true } } } }),
    prisma.supplierInvoice.findMany({ where: { status: { not: "PAID" } }, select: { id: true, number: true, totalTtc: true, paidAmount: true, dueDate: true, issuedAt: true, supplier: { select: { name: true } } } }),
    prisma.expenseOccurrence.findMany({
      where: { paidAt: null, dueDate: { lte: dayToDbDate(until) }, expense: { active: true } },
      select: { id: true, amount: true, dueDate: true, expense: { select: { label: true, endDate: true } } },
    }),
    prisma.warrantyClaim.findMany({
      where: { status: { in: ["ACCEPTED", "PARTIAL"] } },
      select: { id: true, number: true, status: true, amountAccepted: true, decidedAt: true, updatedAt: true, refunds: { select: { amount: true, voidedAt: true } }, warranty: { select: { label: true, supplier: { select: { name: true } } } } },
    }),
  ]);

  return {
    today,
    balance: balance ? { amount: balance.amount, asOf: asOf! } : null,
    balanceRow: balance ? { id: balance.id, createdAt: balance.createdAt, note: balance.note } : null,
    movements: [
      ...payments.map((p) => ({ day: day(p.paidAt), amount: p.amount, kind: "CUSTOMER_PAYMENT" as const })),
      ...refundsReceived.map((r) => ({ day: day(r.receivedAt), amount: r.amount, kind: "WARRANTY_REFUND" as const })),
      ...supplierPayments.map((p) => ({ day: day(p.paidAt), amount: p.amount, kind: "SUPPLIER_PAYMENT" as const })),
      ...paidOccurrences.map((o) => ({ day: day(o.paidAt!), amount: o.paidAmount ?? o.amount, kind: "EXPENSE_PAID" as const })),
    ],
    customerInvoices: invoices.map((i) => ({ id: i.id, label: `${i.number} · ${i.customer.name}`, totalTtc: i.totalTtc, paid: i.paidAmount, dueDay: i.dueDate ? day(i.dueDate) : null, issuedDay: day(i.issuedAt) })),
    paymentTermsDays: settings.paymentTermsDays,
    refunds: claims.map((c) => ({
      id: c.id,
      label: `${claimNumber(c.number)} · ${c.warranty.supplier?.name ?? c.warranty.label}`,
      expected: claimBalance(c, c.refunds.map((r) => ({ amount: r.amount, voided: !!r.voidedAt }))).expected,
      decidedDay: day(c.decidedAt ?? c.updatedAt),
    })),
    supplierInvoices: supplierInvoices.map((s) => ({ id: s.id, label: `${s.supplier.name} · ${s.number}`, totalTtc: s.totalTtc, paid: s.paidAmount, dueDay: s.dueDate ? day(s.dueDate) : null, issuedDay: day(s.issuedAt) })),
    // A due date after the cost's end date (end moved earlier) is no longer to pay.
    expenses: occurrences.filter((o) => !o.expense.endDate || o.dueDate <= o.expense.endDate).map((o) => ({ id: o.id, label: o.expense.label, amount: o.amount, dueDay: dbDay(o.dueDate) })),
  };
}

export async function cashForecast(actor: StaffUser, opts: { scenario: Scenario; horizon: number; now?: Date }) {
  assertCan(actor);
  const [input, settings] = await Promise.all([loadForecastInput(opts.now), getSettings()]);
  const horizon = Math.min(MAX_HORIZON, Math.max(1, opts.horizon));
  const result = forecastCash(input, opts.scenario, horizon);
  // Alert: always on the configured scenario and the full 90 days, whatever is displayed.
  const alertScenario = isScenario(settings.cashAlertScenario) ? settings.cashAlertScenario : "PRUDENT";
  const breach = settings.cashAlertThreshold > 0 ? firstBreach(forecastCash(input, alertScenario, MAX_HORIZON), settings.cashAlertThreshold) : null;
  const closings = Object.fromEntries(SCENARIO_LIST.map((s) => [s, forecastCash(input, s, horizon).closing])) as Record<Scenario, number | null>;
  return { input, result, closings, alert: { threshold: settings.cashAlertThreshold, scenario: alertScenario, breach } };
}

/** For the alerts list: null when off, without a typed balance, or when the balance stays above the threshold. */
export async function cashLowAlert(now = new Date()) {
  const settings = await getSettings();
  if (settings.cashAlertThreshold <= 0) return null;
  const scenario = isScenario(settings.cashAlertScenario) ? settings.cashAlertScenario : "PRUDENT";
  const input = await loadForecastInput(now);
  const r = forecastCash(input, scenario, MAX_HORIZON);
  const breach = firstBreach(r, settings.cashAlertThreshold);
  return breach ? { scenario, day: breach.day, balance: breach.balance, lowest: r.lowest!, threshold: settings.cashAlertThreshold } : null;
}

/** Cash + bank balance typed by hand (history kept; the most recent date is used). */
export async function recordCashBalance(actor: StaffUser, input: { amount: number; asOf: string; note?: string | null }, now = new Date()) {
  assertCan(actor, "viewCashForecast");
  const settings = await getSettings();
  const today = utcToZoned(now, settings.timezone || GARAGE_TZ).date;
  if (input.asOf > today) throw new AppError("balanceFuture", {}, 422);
  return prisma.$transaction(async (tx) => {
    const b = await tx.cashBalance.create({ data: { amount: input.amount, asOf: dayToDbDate(input.asOf), note: input.note || null, createdById: actor.id }, select: { id: true } });
    await audit(tx, actor, "cash.balance", "CashBalance", b.id, { after: input });
    return b;
  });
}

export async function listCashBalances(actor: StaffUser, take = 10) {
  assertCan(actor);
  const rows = await prisma.cashBalance.findMany({ orderBy: [{ asOf: "desc" }, { createdAt: "desc" }], take });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  return rows.map((r) => ({ ...r, asOfDay: dbDay(r.asOf), by: users.find((u) => u.id === r.createdById)?.name ?? null }));
}
