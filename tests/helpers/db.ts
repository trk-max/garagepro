import type { Role } from "@prisma/client";
import { prisma } from "./test-prisma";

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

/** Small factories for the database tests. */
export async function makeUser(role: Role = "MECHANIC", extra: Record<string, unknown> = {}) {
  const u = await prisma.user.create({ data: { email: `${uid()}@test.tn`, name: `${role} ${uid()}`, role, passwordHash: "x", ...extra } });
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

export async function makeWorkOrder(opts: { customerId?: string; status?: string } = {}) {
  const customer = opts.customerId ? { id: opts.customerId } : await prisma.customer.create({ data: { name: `Client ${uid()}`, phone: "20111222" } });
  const vehicle = await prisma.vehicle.create({ data: { plate: `T${uid()}`.toUpperCase(), make: "Peugeot", model: "208", customerId: customer.id } });
  const wo = await prisma.workOrder.create({ data: { complaint: "Freins", customerId: customer.id, vehicleId: vehicle.id, ...(opts.status ? { status: opts.status as never } : {}) } });
  return { wo, customer, vehicle };
}

export { prisma };

/**
 * V16 Lot 2 — the customer accepts every pending line of a (new) order, recorded by the team (in person):
 * what a real order goes through before its lines are invoiced and its parts leave the stock.
 */
export async function agreeAll(workOrderId: string, actor: { id: string; name: string; role: Role }) {
  const { recordStaffDecision } = await import("@/server/quotes");
  const pending = await prisma.workOrderLine.findMany({ where: { workOrderId, voidedAt: null, approvalStatus: "PENDING" }, select: { id: true } });
  if (pending.length === 0) return null;
  return recordStaffDecision(workOrderId, { approvedLineIds: pending.map((l) => l.id), approverName: "Client test", channel: "IN_PERSON" }, actor as never);
}
