import "server-only";
import { lastMonths, monthKey, monthlyMoney } from "@/lib/dashboard-series";
import { prisma } from "@/lib/prisma";
import { lowStockParts } from "@/server/parts";
import { ACTIVE_STATUSES } from "@/server/workflow";
import { countByStatus } from "@/server/work-orders";

export async function getDashboard() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [byStatus, dueToday, revenue, unpaid, lowStock, recent] = await Promise.all([
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
  ]);

  const inShop = ACTIVE_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);

  return {
    byStatus,
    inShop,
    ready: byStatus.READY,
    dueToday,
    revenueMonthHt: revenue._sum.totalHt ?? 0,
    unpaidTotal: unpaid.reduce((sum, i) => sum + (i.totalTtc - i.paidAmount), 0),
    lowStock,
    recent,
  };
}

/** Invoiced vs collected, last 6 months (garage time zone). Finance roles only. */
export async function moneySeries(now = new Date()) {
  const months = lastMonths(now, 6);
  // One day of margin before the first month: the exact cut is done in the garage's time zone.
  const [y, m] = (months[0] ?? monthKey(now)).split("-").map(Number) as [number, number];
  const since = new Date(Date.UTC(y, m - 1, 1) - 86_400_000);
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { issuedAt: { gte: since } }, select: { issuedAt: true, totalTtc: true } }),
    prisma.payment.findMany({ where: { paidAt: { gte: since } }, select: { paidAt: true, amount: true } }),
  ]);
  return monthlyMoney(months, invoices, payments);
}

/** Today's booked appointments (not cancelled), in time order. */
export async function todayAppointments(now = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return prisma.appointment.findMany({
    where: { startAt: { gte: startOfDay, lt: new Date(startOfDay.getTime() + 86_400_000) }, status: { in: ["CONFIRMED", "CHECKED_IN"] } },
    orderBy: { startAt: "asc" },
    take: 6,
    select: { id: true, startAt: true, status: true, plate: true, firstName: true, lastName: true, service: { select: { name: true } } },
  });
}

/** Who is at work right now: last clock event of the day is IN or BREAK_END (on break counted apart). */
export async function presentNow(now = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const events = await prisma.clockEvent.findMany({
    where: { at: { gte: startOfDay, lte: now }, voidedAt: null },
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
