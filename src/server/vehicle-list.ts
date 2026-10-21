import "server-only";
import type { FuelType, Prisma } from "@prisma/client";
import { normalizePlate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/server/workflow";

/**
 * V10.2 — vehicle cards for the "Véhicules" page (callers check viewCustomers).
 * Search: plate (any spacing), make, model, VIN or owner's name. Newest changes first.
 */
export type VehicleCard = {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  fuel: FuelType | null;
  mileage: number | null;
  owner: { id: string; name: string };
  /** createdAt of the latest repair order (null = never came). */
  lastVisit: Date | null;
  /** Latest repair order when it is still open in the workshop. */
  inShop: { id: string; number: number } | null;
};

const cardSelect = {
  id: true,
  plate: true,
  make: true,
  model: true,
  year: true,
  fuel: true,
  mileage: true,
  customer: { select: { id: true, name: true } },
  workOrders: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, number: true, status: true, createdAt: true } },
} satisfies Prisma.VehicleSelect;

type Row = Prisma.VehicleGetPayload<{ select: typeof cardSelect }>;
const toCard = (v: Row): VehicleCard => {
  const last = v.workOrders[0];
  return {
    id: v.id,
    plate: v.plate,
    make: v.make,
    model: v.model,
    year: v.year,
    fuel: v.fuel,
    mileage: v.mileage,
    owner: v.customer,
    lastVisit: last?.createdAt ?? null,
    inShop: last && ACTIVE_STATUSES.includes(last.status) ? { id: last.id, number: last.number } : null,
  };
};

function searchWhere(raw?: string): Prisma.VehicleWhereInput {
  const q = raw?.trim().slice(0, 100);
  if (!q) return {};
  const plate = normalizePlate(q);
  return {
    OR: [
      ...(plate.length >= 2 ? [{ plate: { contains: plate } }] : []),
      { make: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { vin: { contains: q.replace(/\s+/g, ""), mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
    ],
  };
}

/** One page of cards; pass back `nextCursor` for the next page (null = last page). */
export async function vehicleCards(opts: { q?: string; take?: number; cursor?: string | null } = {}): Promise<{ items: VehicleCard[]; nextCursor: string | null }> {
  const take = Math.max(1, Math.min(opts.take ?? 24, 100));
  const rows = await prisma.vehicle.findMany({
    where: searchWhere(opts.q),
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: cardSelect,
  });
  const more = rows.length > take;
  const items = rows.slice(0, take).map(toCard);
  return { items, nextCursor: more ? (items.at(-1)?.id ?? null) : null };
}
