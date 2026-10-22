import "server-only";
import type { Role } from "@prisma/client";
import { compared, monthToDateWindows, presenceFrom, revenueByMonthFrom, sumIn, targetProgress, todayWindows, weekWindows, yearWindow, type Compared, type Presence, type RevenueMonth } from "@/lib/dashboard-v10";
import { AppError } from "@/lib/http";
import { can, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { lowStockParts } from "@/server/parts";
import { getSettings } from "@/server/settings";
import { ACTIVE_STATUSES, DELIVERED_STATUSES } from "@/server/workflow";

/**
 * V10 dashboard — figures (money = integer millimes, periods cut in Setting.timezone).
 * Money functions take the viewer and refuse roles without `viewFinance` (403 "forbidden"),
 * even if the page already checked: the queries are never run for other roles.
 */
export type Viewer = { role: Role };

export function assertCan(viewer: Viewer, permission: Permission): void {
  if (!can(viewer, permission)) throw new AppError("forbidden", {}, 403);
}

const tz = async () => (await getSettings()).timezone;

async function paymentsBetween(from: Date, to: Date) {
  return prisma.payment.findMany({ where: { paidAt: { gte: from, lt: to } }, select: { paidAt: true, amount: true } });
}

async function received(windows: { current: { from: Date; to: Date }; previous: { from: Date; to: Date } }): Promise<Compared> {
  const from = windows.previous.from < windows.current.from ? windows.previous.from : windows.current.from;
  const pays = await paymentsBetween(from, windows.current.to);
  const sum = (w: { from: Date; to: Date }) => sumIn(pays, w, (p) => p.paidAt, (p) => p.amount);
  return compared(sum(windows.current), sum(windows.previous));
}

/**
 * Payments received today (garage day, up to `now`) vs the same elapsed part of the same
 * day-of-month last month (its last day when it has none). Finance roles only.
 */
export async function todayRevenue(viewer: Viewer, now = new Date()): Promise<Compared> {
  assertCan(viewer, "viewFinance");
  return received(todayWindows(now, await tz()));
}

/**
 * Open repair orders `at` a past instant, rebuilt from dates: created by then and neither
 * delivered (deliveredAt) nor cancelled (STATUS_CHANGED → CANCELLED event) by then.
 * null when a date is missing (delivered without deliveredAt, cancelled without event).
 */
export async function openOrdersAt(at: Date): Promise<number | null> {
  const orders = await prisma.workOrder.findMany({
    where: { createdAt: { lte: at }, OR: [{ status: { in: ACTIVE_STATUSES } }, { status: { in: DELIVERED_STATUSES }, OR: [{ deliveredAt: null }, { deliveredAt: { gt: at } }] }, { status: "CANCELLED", updatedAt: { gt: at } }] },
    select: { status: true, deliveredAt: true, events: { where: { type: "STATUS_CHANGED" }, orderBy: { createdAt: "asc" }, select: { data: true, createdAt: true } } },
  });
  let open = 0;
  for (const o of orders) {
    if ((o.status === "DELIVERED" || o.status === "CLOSED") && !o.deliveredAt) return null;
    if (o.status === "CANCELLED") {
      const cancel = o.events.filter((e) => (e.data as { to?: string } | null)?.to === "CANCELLED").at(-1);
      if (!cancel) return null;
      if (cancel.createdAt <= at) continue;
    }
    open++;
  }
  return open;
}

export type Kpis = {
  /** Payments received this month vs last month up to the same day and time; null for non-finance roles. */
  revenue: Compared | null;
  /** Open = ACTIVE_STATUSES (READY included: the car is still in the garage). Previous = 7 days ago (null if not rebuildable). */
  openOrders: { current: number; previous: number | null; deltaPercent: number | null };
  /** DELIVERED with deliveredAt this garage week (Monday 00:00 → now) vs the same elapsed part of last week. */
  completedThisWeek: Compared;
  /** Active parts at or under their minimum (same rule as the stock page); no history → delta null. */
  lowStock: { current: number; deltaPercent: null };
};

export async function kpis(viewer: Viewer, now = new Date()): Promise<Kpis> {
  const zone = await tz();
  const week = weekWindows(now, zone);
  const [revenue, openNow, openBefore, delivered, low] = await Promise.all([
    can(viewer, "viewFinance") ? received(monthToDateWindows(now, zone)) : null,
    prisma.workOrder.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    openOrdersAt(new Date(now.getTime() - 7 * 86_400_000)),
    prisma.workOrder.findMany({ where: { status: { in: DELIVERED_STATUSES }, deliveredAt: { gte: week.previous.from, lt: now } }, select: { deliveredAt: true } }),
    lowStockParts(),
  ]);
  const count = (w: { from: Date; to: Date }) => sumIn(delivered, w, (o) => o.deliveredAt!, () => 1);
  return {
    revenue,
    openOrders: { current: openNow, previous: openBefore, deltaPercent: openBefore === null ? null : compared(openNow, openBefore).deltaPercent },
    completedThisWeek: compared(count(week.current), count(week.previous)),
    lowStock: { current: low.length, deltaPercent: null },
  };
}

/** Jan–Dec of `year`: paid = payments received in the month, pending = still unpaid on invoices issued in the month. */
export async function revenueByMonth(viewer: Viewer, year: number): Promise<RevenueMonth[]> {
  assertCan(viewer, "viewFinance");
  const zone = await tz();
  const w = yearWindow(year, zone);
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { issuedAt: { gte: w.from, lt: w.to } }, select: { issuedAt: true, totalTtc: true, paidAmount: true } }),
    paymentsBetween(w.from, w.to),
  ]);
  return revenueByMonthFrom(year, invoices, payments, zone);
}

/** Monthly target (Setting.monthlyRevenueTarget, 0 = none) vs payments received this garage month so far. */
export async function monthlyTarget(viewer: Viewer, now = new Date()) {
  assertCan(viewer, "viewFinance");
  const settings = await getSettings();
  const month = monthToDateWindows(now, settings.timezone).current;
  const agg = await prisma.payment.aggregate({ where: { paidAt: { gte: month.from, lt: month.to } }, _sum: { amount: true } });
  return targetProgress(settings.monthlyRevenueTarget, agg._sum.amount ?? 0);
}

/** Paramètres → monthly target (millimes, 0 = none). Administrator only (manageSettings), audited. */
export async function setMonthlyTarget(actor: StaffUser, amount: number): Promise<void> {
  assertCan(actor, "manageSettings");
  if (!Number.isInteger(amount) || amount < 0 || amount > 2_000_000_000) throw new AppError("invalid", {}, 422);
  await prisma.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { id: "garage" }, select: { monthlyRevenueTarget: true } });
    await tx.setting.upsert({ where: { id: "garage" }, update: { monthlyRevenueTarget: amount }, create: { id: "garage", monthlyRevenueTarget: amount } });
    await audit(tx, actor, "settings.monthlyTarget", "Setting", "garage", { before, after: { monthlyRevenueTarget: amount } });
  });
}

export type MechanicNow = { id: string; name: string; activeOrders: number; presence: Presence };

/**
 * Active MECHANIC accounts: repair orders assigned to them that still need work
 * (ACTIVE_STATUSES minus READY — a ready car waits for its owner, not for a mechanic)
 * and presence from their last clock event of the past 24 h. Present first, then busiest.
 */
export async function mechanicsNow(now = new Date(), take = 6): Promise<MechanicNow[]> {
  const working = ACTIVE_STATUSES.filter((s) => s !== "READY");
  const [mechanics, events] = await Promise.all([
    prisma.user.findMany({
      where: { role: "MECHANIC", isActive: true },
      select: { id: true, name: true, _count: { select: { assignedWorkOrders: { where: { status: { in: working } } } } } },
    }),
    prisma.clockEvent.findMany({
      where: { at: { gte: new Date(now.getTime() - 86_400_000), lte: now }, voidedAt: null, user: { role: "MECHANIC" } },
      orderBy: { at: "asc" },
      select: { userId: true, kind: true },
    }),
  ]);
  const last = new Map<string, string>();
  for (const e of events) last.set(e.userId, e.kind);
  const rank: Record<Presence, number> = { ACTIVE: 0, ON_BREAK: 1, OFF: 2 };
  return mechanics
    .map((m) => ({ id: m.id, name: m.name, activeOrders: m._count.assignedWorkOrders, presence: presenceFrom(last.get(m.id)) }))
    .sort((a, b) => rank[a.presence] - rank[b.presence] || b.activeOrders - a.activeOrders || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, Math.min(take, 50)));
}
