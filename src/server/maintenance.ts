import "server-only";
import { AppError } from "@/lib/http";
import { nextDue } from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import type { CompanyViewer } from "@/server/company-portal";
import { getSettings } from "@/server/settings";

/** Maintenance plans of a vehicle (oil change every N km / N days…), with their next due date. */
export async function vehiclePlans(vehicleId: string, now = new Date()) {
  const [vehicle, plans, settings] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, plate: true, make: true, model: true, mileage: true, customerId: true, customer: { select: { name: true, reminderOptOut: true } } } }),
    prisma.vehicleMaintenance.findMany({ where: { vehicleId }, orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
    getSettings(),
  ]);
  if (!vehicle) return null;
  return { vehicle, plans: plans.map((p) => ({ ...p, due: nextDue(p, vehicle.mileage, now, settings.reminderLeadDays) })) };
}

export type PlanInput = { kind: string; label?: string | null; intervalDays?: number | null; intervalKm?: number | null; lastDoneAt?: Date | null; lastDoneKm?: number | null };

export async function createPlan(actor: StaffUser, vehicleId: string, input: PlanInput) {
  if (!input.intervalDays && !input.intervalKm) throw new AppError("maintenanceInterval", {}, 422);
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!v) throw new AppError("notFound", {}, 404);
    const plan = await tx.vehicleMaintenance.create({
      data: { vehicleId, kind: input.kind, label: input.label || null, intervalDays: input.intervalDays ?? null, intervalKm: input.intervalKm ?? null, lastDoneAt: input.lastDoneAt ?? null, lastDoneKm: input.lastDoneKm ?? null, createdById: actor.id },
      select: { id: true },
    });
    await audit(tx, actor, "maintenance.create", "VehicleMaintenance", plan.id, { after: { vehicleId, ...input } });
    return plan;
  });
}

/**
 * The maintenance was done: restarts the countdown. The km typed is kept on the
 * plan; the vehicle's mileage is raised only if it is higher (never lowered,
 * never invented).
 */
export async function markPlanDone(actor: StaffUser, planId: string, input: { doneAt: Date; km?: number | null }) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.vehicleMaintenance.findUnique({ where: { id: planId }, include: { vehicle: { select: { id: true, mileage: true } } } });
    if (!p) throw new AppError("notFound", {}, 404);
    await tx.vehicleMaintenance.update({ where: { id: planId }, data: { lastDoneAt: input.doneAt, lastDoneKm: input.km ?? null } });
    if (input.km && (p.vehicle.mileage === null || input.km > p.vehicle.mileage)) await tx.vehicle.update({ where: { id: p.vehicle.id }, data: { mileage: input.km } });
    await audit(tx, actor, "maintenance.done", "VehicleMaintenance", planId, { before: { lastDoneAt: p.lastDoneAt, lastDoneKm: p.lastDoneKm }, after: { lastDoneAt: input.doneAt, lastDoneKm: input.km ?? null } });
    return p.vehicle.id;
  });
}

export async function setPlanActive(actor: StaffUser, planId: string, isActive: boolean) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.vehicleMaintenance.findUnique({ where: { id: planId }, select: { vehicleId: true, isActive: true } });
    if (!p) throw new AppError("notFound", {}, 404);
    await tx.vehicleMaintenance.update({ where: { id: planId }, data: { isActive } });
    await audit(tx, actor, isActive ? "maintenance.enable" : "maintenance.disable", "VehicleMaintenance", planId, { before: { isActive: p.isActive }, after: { isActive } });
    return p.vehicleId;
  });
}

/** Company portal: next maintenance of the company's OWN vehicles only. */
export async function companyMaintenance(viewer: CompanyViewer, now = new Date()) {
  const [plans, settings] = await Promise.all([
    prisma.vehicleMaintenance.findMany({
      where: { isActive: true, vehicle: { customerId: viewer.customerId } },
      include: { vehicle: { select: { plate: true, make: true, model: true, mileage: true } } },
      orderBy: { createdAt: "asc" },
    }),
    getSettings(),
  ]);
  return plans.map((p) => ({ id: p.id, kind: p.kind, label: p.label, vehicle: p.vehicle, due: nextDue(p, p.vehicle.mileage, now, settings.reminderLeadDays) }));
}
