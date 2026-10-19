import "server-only";
import bcrypt from "bcryptjs";
import type { CompanyRole } from "@prisma/client";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { markAttemptsOk, reserveAttempt } from "@/server/rate-limit";

/**
 * Company (fleet) portal. EVERY query below is filtered by the customerId of
 * the signed-in company account, taken from the session on the server — never
 * from the URL or the form. An id belonging to another company returns nothing.
 */
export type CompanyViewer = { id: string; customerId: string; role: CompanyRole; name: string; email: string };

export const canSeeMoney = (role: CompanyRole) => role === "FLEET_ADMIN" || role === "MANAGER";

/** Sign-in: email + password, rate-limited per IP and per e-mail. */
export async function authenticateCompanyUser(email: string, password: string, ip: string) {
  const normalized = email.trim().toLowerCase();
  const reserved = await reserveAttempt(
    [
      { key: `company-login-ip:${ip}`, max: 20 },
      { key: `company-login:${normalized}`, max: 8 },
    ],
    15,
    true,
  );
  if (!reserved) throw new AppError("tooMany", {}, 429);
  const user = await prisma.companyUser.findUnique({ where: { email: normalized }, include: { customer: { select: { isCompany: true } } } });
  // Same work whether the account exists or not (no e-mail enumeration by timing).
  const hash = user?.passwordHash ?? "$2b$12$eC5BuRcUIHN7N1lpACqZP.9WFQ2y0gipZqNiNHJQVbezd0eTcO/l6";
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok || !user.isActive || !user.customer.isCompany) throw new AppError("companyLogin", {}, 401);
  await markAttemptsOk(reserved);
  await prisma.companyUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

export async function companyOverview(viewer: CompanyViewer) {
  const customerId = viewer.customerId;
  const [customer, vehicles, active] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } }),
    prisma.vehicle.findMany({
      where: { customerId },
      orderBy: { plate: "asc" },
      select: {
        id: true,
        plate: true,
        make: true,
        model: true,
        year: true,
        mileage: true,
        workOrders: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, number: true, status: true, createdAt: true } },
      },
    }),
    prisma.workOrder.findMany({
      where: { customerId, status: { notIn: ["DELIVERED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, status: true, promisedAt: true, complaint: true, createdAt: true, vehicle: { select: { plate: true, make: true, model: true } } },
    }),
  ]);
  return { companyName: customer?.name ?? "", vehicles, active };
}

export async function companyWorkOrders(viewer: CompanyViewer, vehicleId?: string) {
  return prisma.workOrder.findMany({
    where: { customerId: viewer.customerId, ...(vehicleId ? { vehicleId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      deliveredAt: true,
      mileageIn: true,
      complaint: true,
      vehicle: { select: { id: true, plate: true, make: true, model: true } },
      invoice: canSeeMoney(viewer.role) ? { select: { number: true, totalTtc: true, paidAmount: true, status: true } } : false,
    },
  });
}

/** One repair of THIS company, or null (also when the id belongs to someone else). */
export async function companyWorkOrder(viewer: CompanyViewer, workOrderId: string) {
  const money = canSeeMoney(viewer.role);
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, customerId: viewer.customerId },
    select: {
      id: true,
      number: true,
      status: true,
      complaint: true,
      diagnosis: true,
      mileageIn: true,
      promisedAt: true,
      quoteApprovedAt: true,
      readyAt: true,
      deliveredAt: true,
      createdAt: true,
      vehicle: { select: { plate: true, make: true, model: true, year: true } },
      lines: { orderBy: { position: "asc" }, select: { id: true, type: true, description: true, quantityX100: true, unitPrice: money, taxRateBp: money } },
      media: { where: { visibleToCustomer: true }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true, caption: true } },
      invoice: money ? { select: { id: true, number: true, totalHt: true, totalTtc: true, paidAmount: true, status: true, issuedAt: true, dueDate: true } } : false,
    },
  });
  return wo;
}

// ── Staff side: accounts of a company ────────────────────────────────────────

export async function listCompanyUsers(customerId: string) {
  return prisma.companyUser.findMany({ where: { customerId }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true } });
}

export async function createCompanyUser(actor: StaffUser, customerId: string, input: { email: string; name: string; role: CompanyRole; password: string }) {
  if (!can(actor.role, "manageCompanyAccess")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new AppError("notFound", {}, 404);
    await tx.customer.update({ where: { id: customerId }, data: { isCompany: true } });
    const user = await tx.companyUser.create({
      data: { customerId, email: input.email.trim().toLowerCase(), name: input.name, role: input.role, passwordHash: await bcrypt.hash(input.password, 12) },
      select: { id: true },
    });
    await audit(tx, actor, "companyUser.create", "CompanyUser", user.id, { after: { customerId, email: input.email, role: input.role } });
    return user;
  });
}

export async function updateCompanyUser(actor: StaffUser, companyUserId: string, input: { isActive?: boolean; role?: CompanyRole; password?: string }) {
  if (!can(actor.role, "manageCompanyAccess")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const old = await tx.companyUser.findUnique({ where: { id: companyUserId }, select: { isActive: true, role: true, customerId: true } });
    if (!old) throw new AppError("notFound", {}, 404);
    await tx.companyUser.update({
      where: { id: companyUserId },
      data: {
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.role ? { role: input.role } : {}),
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
      },
    });
    await audit(tx, actor, "companyUser.update", "CompanyUser", companyUserId, {
      before: { isActive: old.isActive, role: old.role },
      after: { isActive: input.isActive ?? old.isActive, role: input.role ?? old.role, passwordChanged: !!input.password },
    });
  });
}
