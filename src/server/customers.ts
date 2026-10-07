import "server-only";
import type { Prisma } from "@prisma/client";
import { normalizePlate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export async function listCustomers(q?: string) {
  const query = q?.trim();
  const plateKey = query ? normalizePlate(query) : "";
  const where: Prisma.CustomerWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query.replace(/\s/g, "") } },
          ...(plateKey.length >= 2 ? [{ vehicles: { some: { plate: { contains: plateKey } } } }] : []),
        ],
      }
    : {};

  return prisma.customer.findMany({
    where,
    include: {
      vehicles: { select: { id: true, plate: true, make: true, model: true } },
      _count: { select: { workOrders: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

/** Compact list for the check-in form pickers. */
export async function customerOptions() {
  return prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      vehicles: { select: { id: true, plate: true, make: true, model: true, mileage: true } },
    },
    orderBy: { name: "asc" },
    take: 1000,
  });
}

export type CustomerOption = Awaited<ReturnType<typeof customerOptions>>[number];

export async function getCustomer(id: string) {
  const [customer, invoiced] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        vehicles: { orderBy: { createdAt: "asc" } },
        workOrders: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { vehicle: { select: { plate: true } }, invoice: { select: { number: true, totalTtc: true } } },
        },
      },
    }),
    prisma.invoice.aggregate({ where: { customerId: id }, _sum: { totalTtc: true } }),
  ]);
  if (!customer) return null;
  return { ...customer, totalInvoiced: invoiced._sum.totalTtc ?? 0 };
}

export async function createCustomer(data: Prisma.CustomerCreateInput) {
  return prisma.customer.create({ data, select: { id: true } });
}

export async function updateCustomer(id: string, data: Prisma.CustomerUpdateInput) {
  await prisma.customer.update({ where: { id }, data });
}

export async function addVehicle(customerId: string, data: Omit<Prisma.VehicleCreateWithoutCustomerInput, "workOrders">) {
  return prisma.vehicle.create({ data: { ...data, customerId }, select: { id: true } });
}
