import "server-only";
import { lastDays, perDay, startOfGarageDay } from "@/lib/dashboard-series";
import { prisma } from "@/lib/prisma";
import { lowStockParts } from "@/server/parts";
import { ACTIVE_STATUSES } from "@/server/workflow";
import { countByStatus } from "@/server/work-orders";

export async function getDashboard() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [byStatus, dueToday, revenue, unpaid, lowStock, recent, credited] = await Promise.all([
    countByStatus(),
    prisma.workOrder.count({
      where: { status: { in: ACTIVE_STATUSES }, promisedAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.invoice.aggregate({ where: { issuedAt: { gte: startOfMonth } }, _sum: { totalHt: true } }),
    prisma.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIAL"] } }, select: { totalTtc: true, paidAmount: true } }),
    lowStockParts(),
    prisma.workOrder.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        vehicle: { select: { plate: true, make: true, model: true } },
        customer: { select: { name: true } },
        mechanic: { select: { name: true } },
      },
    }),
    // V16 Lot 4: credit notes of the month are deducted from the month's revenue.
    prisma.creditNote.aggregate({ where: { issuedAt: { gte: startOfMonth } }, _sum: { totalHt: true } }),
  ]);

  const inShop = ACTIVE_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);

  return {
    byStatus,
    inShop,
    ready: byStatus.READY,
    dueToday,
    revenueMonthHt: (revenue._sum.totalHt ?? 0) - (credited._sum.totalHt ?? 0),
    unpaidTotal: unpaid.reduce((sum, i) => sum + (i.totalTtc - i.paidAmount), 0),
    lowStock,
    recent,
  };
}

/** Today's booked appointments (not cancelled), in time order. */
export async function todayAppointments(now = new Date()) {
  const startOfDay = startOfGarageDay(now);
  return prisma.appointment.findMany({
    where: { startAt: { gte: startOfDay, lt: new Date(startOfDay.getTime() + 86_400_000) }, status: { in: ["CONFIRMED", "CHECKED_IN"] } },
    orderBy: { startAt: "asc" },
    take: 6,
    select: { id: true, startAt: true, status: true, plate: true, firstName: true, lastName: true, service: { select: { name: true } } },
  });
}

/** Who is at work right now: last clock event of the past 24 h is IN or BREAK_END (on break counted apart). */
export async function presentNow(now = new Date()) {
  const events = await prisma.clockEvent.findMany({
    where: { at: { gte: new Date(now.getTime() - 86_400_000), lte: now }, voidedAt: null },
    orderBy: { at: "asc" },
    select: { userId: true, kind: true },
  });
  const last = new Map<string, string>();
  for (const e of events) last.set(e.userId, e.kind);
  let working = 0;
  let onBreak = 0;
  for (const kind of last.values()) {
    if (kind === "IN" || kind === "BREAK_END") working++;
    else if (kind === "BREAK_START") onBreak++;
  }
  return { working, onBreak };
}

/**
 * This week vs last week (garage days), for the top figures and the 7-day charts.
 * Money only when `finance` is true: the queries are not even run for other roles.
 */
export async function weekOverview(opts: { finance: boolean }, now = new Date()) {
  const days14 = lastDays(now, 14);
  // 14 garage days back, plus a day of margin: the exact cut is done per garage day by perDay.
  const since = new Date(startOfGarageDay(now).getTime() - 15 * 86_400_000);
  const [orders, delivered, invoices, payments] = await Promise.all([
    prisma.workOrder.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.workOrder.findMany({ where: { deliveredAt: { gte: since } }, select: { deliveredAt: true } }),
    // V16 Lot 4: credit notes count negatively on their day (never twice).
    opts.finance
      ? Promise.all([
          prisma.invoice.findMany({ where: { issuedAt: { gte: since } }, select: { issuedAt: true, totalTtc: true } }),
          prisma.creditNote.findMany({ where: { issuedAt: { gte: since } }, select: { issuedAt: true, totalTtc: true } }),
        ]).then(([i, c]) => [...i, ...c.map((n) => ({ issuedAt: n.issuedAt, totalTtc: -n.totalTtc }))])
      : [],
    opts.finance ? prisma.payment.findMany({ where: { paidAt: { gte: since } }, select: { paidAt: true, amount: true } }) : [],
  ]);
  const split = (values: number[]) => ({ previous: values.slice(0, 7), current: values.slice(7) });
  return {
    days: days14.slice(7),
    ordersIn: split(perDay(days14, orders, (o) => o.createdAt)),
    ordersOut: split(perDay(days14, delivered, (o) => o.deliveredAt)),
    invoiced: opts.finance ? split(perDay(days14, invoices, (i) => i.issuedAt, (i) => i.totalTtc)) : null,
    collected: opts.finance ? split(perDay(days14, payments, (p) => p.paidAt, (p) => p.amount)) : null,
  };
}

/** Latest customer invoices with what is still due (finance roles only). */
export async function recentInvoices(take = 5) {
  return prisma.invoice.findMany({
    orderBy: { issuedAt: "desc" },
    take,
    select: { id: true, number: true, issuedAt: true, dueDate: true, totalTtc: true, paidAmount: true, status: true, customer: { select: { name: true } } },
  });
}

/** Latest events of the repair orders (who did what), for the activity feed. */
export async function recentActivity(opts: { finance: boolean }, take = 6) {
  return prisma.workOrderEvent.findMany({
    where: opts.finance ? {} : { type: { notIn: ["PAYMENT", "INVOICED"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, type: true, data: true, createdAt: true, actor: { select: { name: true } }, workOrder: { select: { id: true, number: true, vehicle: { select: { plate: true } } } } },
  });
}
