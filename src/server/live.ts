import "server-only";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/server/workflow";

/**
 * Real-time updates without any extra service, and without keeping a
 * connection open: each visible page asks "what is the version now?" every
 * few seconds (one short request), and re-renders only when it changed.
 *
 * Why not Server-Sent Events any more: on http:// a browser allows only 6
 * open connections per site. A few tabs each holding a live stream used them
 * all, and every button then waited — up to the 5-minute stream recycle.
 *
 * Several pages watching the same thing share one database query (2 s memo).
 */
const MEMO_MS = 2000;
const memo = new Map<string, { at: number; value: Promise<string | null> }>();

export function sharedVersion(key: string, read: () => Promise<string | null>): Promise<string | null> {
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.at < MEMO_MS) return hit.value;
  const value = read().catch((error) => {
    memo.delete(key);
    throw error;
  });
  memo.set(key, { at: now, value });
  if (memo.size > 500) for (const [k, v] of memo) if (now - v.at > MEMO_MS) memo.delete(k);
  return value;
}

/** JSON answer for the live poller: `{ version }`, or 410 when the item no longer exists. */
export async function versionResponse(key: string, read: () => Promise<string | null>): Promise<Response> {
  const version = await sharedVersion(key, read);
  const headers = { "Cache-Control": "no-store" };
  return version === null ? Response.json({ gone: true }, { status: 410, headers }) : Response.json({ version }, { headers });
}

export async function workOrderVersion(id: string): Promise<string | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: { updatedAt: true, _count: { select: { events: true, media: true } } },
  });
  return wo ? `${wo.updatedAt.getTime()}:${wo._count.events}:${wo._count.media}` : null;
}

export async function appointmentsVersion(): Promise<string> {
  const agg = await prisma.appointment.aggregate({ _max: { updatedAt: true }, _count: { _all: true } });
  return `${agg._max.updatedAt?.getTime() ?? 0}:${agg._count._all}`;
}

export async function workshopVersion(): Promise<string> {
  const agg = await prisma.workOrder.aggregate({
    where: { status: { in: ACTIVE_STATUSES } },
    _max: { updatedAt: true },
    _count: { _all: true },
  });
  return `${agg._max.updatedAt?.getTime() ?? 0}:${agg._count._all}`;
}

/** Stock: any part changed (quantity, reservation, price…) or any new stock movement. */
export async function stockVersion(): Promise<string> {
  const [parts, moves] = await Promise.all([
    prisma.part.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.stockMovement.aggregate({ _max: { createdAt: true }, _count: { _all: true } }),
  ]);
  return `${parts._max.updatedAt?.getTime() ?? 0}:${parts._count._all}:${moves._max.createdAt?.getTime() ?? 0}:${moves._count._all}`;
}

/** Customers and their vehicles: added, edited, mileage updated (also when received from the other copy). */
export async function customersVersion(): Promise<string> {
  const [customers, vehicles] = await Promise.all([
    prisma.customer.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.vehicle.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
  ]);
  return `${customers._max.updatedAt?.getTime() ?? 0}:${customers._count._all}:${vehicles._max.updatedAt?.getTime() ?? 0}:${vehicles._count._all}`;
}

/** Dashboard: anything its tiles show (repairs, stock, appointments, invoices, payments, clocking). */
export async function dashboardVersion(): Promise<string> {
  const [wo, stock, appts, inv, pay, clock] = await Promise.all([
    prisma.workOrder.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
    stockVersion(),
    appointmentsVersion(),
    prisma.invoice.aggregate({ _count: { _all: true }, _sum: { paidAmount: true } }),
    prisma.payment.aggregate({ _count: { _all: true } }),
    prisma.clockEvent.aggregate({ _count: { _all: true } }),
  ]);
  return [wo._max.updatedAt?.getTime() ?? 0, wo._count._all, stock, appts, inv._count._all, inv._sum.paidAmount ?? 0, pay._count._all, clock._count._all].join(":");
}
