import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { normalizePlate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { assertCan } from "@/server/dashboard-v10";

/**
 * V10 dashboard — customer cards. A company is a customer with `isCompany` (professional /
 * fleet customer, the one that can have company-portal accounts). Callers check viewCustomers.
 */
export type CustomerTab = "all" | "favourites" | "companies";
export type CustomerCard = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  kind: "PERSON" | "COMPANY";
  vehicles: number;
  /** createdAt of the customer's latest repair order (null = never came). */
  lastVisit: Date | null;
  isFavorite: boolean;
};

const cardSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  isCompany: true,
  isFavorite: true,
  _count: { select: { vehicles: true } },
  workOrders: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
} satisfies Prisma.CustomerSelect;

type Row = Prisma.CustomerGetPayload<{ select: typeof cardSelect }>;
const toCard = (c: Row): CustomerCard => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  kind: c.isCompany ? "COMPANY" : "PERSON",
  vehicles: c._count.vehicles,
  lastVisit: c.workOrders[0]?.createdAt ?? null,
  isFavorite: c.isFavorite,
});

/** Same plate search as the former customer list (V10 UI): "123 TU 4567" finds the owner. */
function plateFilter(q: string): Prisma.CustomerWhereInput[] {
  const key = normalizePlate(q);
  return key.length >= 2 ? [{ vehicles: { some: { plate: { contains: key } } } }] : [];
}

/** One page of cards, by name; pass back `nextCursor` for the next page (null = last page). */
export async function customerCards(opts: { tab?: CustomerTab; q?: string; take?: number; cursor?: string | null } = {}): Promise<{ items: CustomerCard[]; nextCursor: string | null }> {
  const take = Math.max(1, Math.min(opts.take ?? 24, 100));
  const q = opts.q?.trim().slice(0, 100);
  const where: Prisma.CustomerWhereInput = {
    ...(opts.tab === "favourites" ? { isFavorite: true } : opts.tab === "companies" ? { isCompany: true } : {}),
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\s+/g, "") } }, { email: { contains: q, mode: "insensitive" } }, ...plateFilter(q)] }
      : {}),
  };
  const rows = await prisma.customer.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: cardSelect,
  });
  const more = rows.length > take;
  const items = rows.slice(0, take).map(toCard);
  return { items, nextCursor: more ? (items.at(-1)?.id ?? null) : null };
}

/** The `n` customers seen most recently (latest repair order first). */
export async function recentCustomers(n = 5): Promise<CustomerCard[]> {
  const latest = await prisma.workOrder.findMany({
    orderBy: { createdAt: "desc" },
    distinct: ["customerId"],
    take: Math.max(1, Math.min(n, 50)),
    select: { customerId: true },
  });
  const ids = latest.map((w) => w.customerId);
  const rows = await prisma.customer.findMany({ where: { id: { in: ids } }, select: cardSelect });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => (byId.has(id) ? [toCard(byId.get(id)!)] : []));
}

/** Star / unstar a customer (viewCustomers, same as editing the file). Audited. Returns the new state. */
export async function toggleFavoriteCustomer(actor: StaffUser, customerId: string): Promise<{ isFavorite: boolean }> {
  assertCan(actor, "viewCustomers");
  return prisma.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id: customerId }, select: { isFavorite: true } });
    if (!before) throw new AppError("notFound", {}, 404);
    const after = await tx.customer.update({ where: { id: customerId }, data: { isFavorite: !before.isFavorite }, select: { isFavorite: true } });
    await audit(tx, actor, "customer.favorite", "Customer", customerId, { before, after });
    return after;
  });
}
