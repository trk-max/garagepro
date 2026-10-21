import "server-only";
import { AppError } from "@/lib/http";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
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
  vehicles: {
    select: { id: true, plate: true, make: true, model: true, mileage: true, vin: true, year: true, fuel: true, color: true },
    orderBy: { createdAt: "asc" },
  },
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

const CUSTOMER_AUDIT = { name: true, phone: true, email: true, address: true, taxId: true, notes: true, isCompany: true, reminderOptOut: true } as const;

export async function createCustomer(data: Prisma.CustomerCreateInput, actor: StaffUser) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({ data, select: { id: true, ...CUSTOMER_AUDIT } });
    const { id, ...after } = customer;
    await audit(tx, actor, "customer.create", "Customer", id, { after });
    return { id };
  });
}

export async function updateCustomer(id: string, data: Prisma.CustomerUpdateInput, actor: StaffUser) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id }, select: CUSTOMER_AUDIT });
    if (!before) throw new AppError("notFound", {}, 404);
    const after = await tx.customer.update({ where: { id }, data, select: CUSTOMER_AUDIT });
    await audit(tx, actor, "customer.update", "Customer", id, { before, after });
  });
}

export async function addVehicle(customerId: string, data: Omit<Prisma.VehicleCreateWithoutCustomerInput, "workOrders">, actor: StaffUser) {
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.create({ data: { ...data, customerId }, select: { id: true } });
    await audit(tx, actor, "vehicle.create", "Vehicle", vehicle.id, { after: { customerId, ...data } });
    return vehicle;
  });
}
