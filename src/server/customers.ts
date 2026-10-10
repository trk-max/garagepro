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

const optionSelect = {
  id: true,
  name: true,
  phone: true,
  vehicles: { select: { id: true, plate: true, make: true, model: true, mileage: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.CustomerSelect;

export type CustomerOption = Prisma.CustomerGetPayload<{ select: typeof optionSelect }>;

/**
 * Check-in form picker: only the customers matching what is typed (name, phone
 * or plate), 12 at most. Replaces sending the whole customer list to the browser.
 */
export async function searchCustomerOptions(q: string): Promise<CustomerOption[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const plateKey = normalizePlate(query);
  const digits = query.replace(/\D/g, "");
  return prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ...(plateKey.length >= 2 ? [{ vehicles: { some: { plate: { contains: plateKey } } } }] : []),
      ],
    },
    select: optionSelect,
    orderBy: { updatedAt: "desc" },
    take: 12,
  });
}

/** One customer for the picker (when the form is opened from a customer page). */
export async function customerOption(id: string): Promise<CustomerOption | null> {
  return prisma.customer.findUnique({ where: { id }, select: optionSelect });
}

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
