import "server-only";
import { audit } from "@/server/audit";
import { assertQualityApproved, resetQualityApproval } from "@/server/quality";
import { missingVehicleInfo } from "@/lib/vehicle-info";
import type { FuelType, LineType, Prisma, Priority, WorkOrderStatus } from "@prisma/client";
import { normalizePlate } from "@/lib/format";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { getSettings } from "@/server/settings";
import { generatePin } from "@/server/portal-session";
import { ACTIVE_STATUSES, TRANSITIONS, isFinal } from "@/server/workflow";

type Tx = Prisma.TransactionClient;

// ─────────────────────────────── Queries ────────────────────────────────────

export type WorkOrderFilter = "active" | "all" | WorkOrderStatus;

export function workOrderSearchWhere(q: string | undefined): Prisma.WorkOrderWhereInput {
  const query = q?.trim();
  if (!query) return {};
  const number = /^(?:OR-?)?0*(\d{1,7})$/i.exec(query)?.[1];
  const plateKey = normalizePlate(query);
  return {
    OR: [
      ...(number ? [{ number: Number(number) }] : []),
      ...(plateKey.length >= 2 ? [{ vehicle: { plate: { contains: plateKey } } }] : []),
      { customer: { name: { contains: query, mode: "insensitive" } } },
      { customer: { phone: { contains: query.replace(/\s/g, "") } } },
      { vehicle: { model: { contains: query, mode: "insensitive" } } },
      { complaint: { contains: query, mode: "insensitive" } },
    ],
  };
}

export async function listWorkOrders(filter: WorkOrderFilter, q?: string, mechanicId?: string) {
  const statusWhere: Prisma.WorkOrderWhereInput =
    filter === "all" ? {} : filter === "active" ? { status: { in: ACTIVE_STATUSES } } : { status: filter };

  return prisma.workOrder.findMany({
    where: { AND: [statusWhere, workOrderSearchWhere(q), mechanicId ? { mechanicId } : {}] },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      vehicle: { select: { id: true, plate: true, make: true, model: true } },
      mechanic: { select: { id: true, name: true } },
      invoice: { select: { id: true, number: true, status: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
  });
}

export async function countByStatus(): Promise<Record<WorkOrderStatus, number>> {
  const groups = await prisma.workOrder.groupBy({ by: ["status"], _count: { _all: true } });
  const out = {
    RECEIVED: 0, DIAGNOSIS: 0, QUOTE_SENT: 0, WAITING_INSURANCE: 0, WAITING_PARTS: 0,
    IN_PROGRESS: 0, QUALITY_CONTROL: 0, WASHING: 0, READY: 0, DELIVERED: 0, CANCELLED: 0,
  } satisfies Record<WorkOrderStatus, number>;
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

export async function getWorkOrder(id: string) {
  return prisma.workOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      vehicle: true,
      mechanic: { select: { id: true, name: true } },
      lines: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { part: { select: { sku: true, stockX100: true } } } },
      events: { orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } },
      invoice: { select: { id: true, number: true, status: true, totalTtc: true, paidAmount: true } },
      media: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
      appointment: { select: { reference: true, startAt: true } },
    },
  });
}

export type WorkOrderDetail = NonNullable<Awaited<ReturnType<typeof getWorkOrder>>>;

/** The vehicle's other work orders, found from this work order id (one query, loadable in parallel). */
export async function getVehicleHistoryFor(workOrderId: string) {
  return prisma.workOrder.findMany({
    where: { id: { not: workOrderId }, vehicle: { workOrders: { some: { id: workOrderId } } } },
    select: { id: true, number: true, status: true, complaint: true, mileageIn: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

/**
 * Plate typed at the front desk: the vehicle (if known) with its owner and its
 * visits, newest first. The caller opens the current order when there is one.
 */
export async function lookupVehicleByPlate(rawPlate: string) {
  const plate = normalizePlate(rawPlate);
  if (plate.length < 2) return { plate, vehicle: null };
  const vehicle = await prisma.vehicle.findUnique({
    where: { plate },
    select: {
      id: true,
      plate: true,
      make: true,
      model: true,
      year: true,
      vin: true,
      fuel: true,
      color: true,
      mileage: true,
      customer: { select: { id: true, name: true, phone: true } },
      workOrders: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          number: true,
          status: true,
          complaint: true,
          diagnosis: true,
          mileageIn: true,
          createdAt: true,
          invoice: { select: { totalTtc: true } },
        },
      },
    },
  });
  return { plate, vehicle };
}

export async function listMechanics() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

// ─────────────────────────────── Commands ───────────────────────────────────

async function loadEditable(tx: Tx, workOrderId: string, { allowInvoiced = false } = {}) {
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, status: true, mechanicId: true, invoice: { select: { id: true } } },
  });
  if (!wo) throw new AppError("notFound", {}, 404);
  if (isFinal(wo.status)) throw new AppError("final", {}, 409);
  if (!allowInvoiced && wo.invoice) throw new AppError("locked", {}, 409);
  return wo;
}

function event(
  tx: Tx,
  workOrderId: string,
  actorId: string | null,
  type: Prisma.WorkOrderEventCreateManyInput["type"],
  data: Prisma.InputJsonObject = {},
  body?: string,
) {
  return tx.workOrderEvent.create({ data: { workOrderId, actorId, type, data, body } });
}

async function moveStock(
  tx: Tx,
  actor: StaffUser,
  input: { partId: string; deltaX100: number; reason: "WORK_ORDER" | "WORK_ORDER_RETURN"; workOrderId: string },
) {
  const updated = await tx.part.update({
    where: { id: input.partId },
    data: { stockX100: { increment: input.deltaX100 } },
    select: { stockX100: true },
  });
  const movement = await tx.stockMovement.create({ data: { ...input, actorId: actor.id }, select: { id: true } });
  await audit(tx, actor, "stock.workOrder", "StockMovement", movement.id, {
    before: { stockX100: updated.stockX100 - input.deltaX100 },
    after: { ...input, stockX100: updated.stockX100 },
  });
  return updated.stockX100;
}

export type CreateWorkOrderInput = {
  customerId?: string;
  vehicleId?: string;
  newCustomer?: Prisma.CustomerCreateWithoutVehiclesInput;
  newVehicle?: Omit<Prisma.VehicleCreateWithoutCustomerInput, "workOrders">;
  complaint: string;
  priority: Priority;
  mileageIn?: number;
  promisedAt?: Date;
  mechanicId?: string;
  /** Missing info typed at check-in for a known vehicle (VIN, year…). */
  completeVehicle?: { vin?: string; year?: number; fuel?: FuelType; color?: string };
  /** Refuse to open the order while the vehicle lacks VIN, year, fuel, colour or mileage. */
  requireCompleteVehicle?: boolean;
};

/**
 * Fills the missing pieces of a work order's vehicle file (orders opened from
 * an online booking, or cars created before VIN was mandatory).
 */
export async function completeVehicleInfo(
  workOrderId: string,
  fill: { vin?: string; year?: number; fuel?: FuelType; color?: string },
  mileageIn: number | undefined,
  actor: StaffUser,
) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { status: true, mileageIn: true, vehicleId: true, vehicle: { select: { vin: true, year: true, fuel: true, color: true } } },
    });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (isFinal(wo.status)) throw new AppError("final", {}, 409);
    const data = Object.fromEntries(Object.entries(fill).filter(([, v]) => v !== undefined && v !== ""));
    if (Object.keys(data).length) {
      await tx.vehicle.update({ where: { id: wo.vehicleId }, data });
      await audit(tx, actor, "vehicle.update", "Vehicle", wo.vehicleId, {
        before: Object.fromEntries(Object.keys(data).map((k) => [k, wo.vehicle[k as keyof typeof wo.vehicle] ?? null])),
        after: data,
      });
    }
    const km = mileageIn ?? wo.mileageIn ?? undefined;
    if (mileageIn !== undefined) {
      await tx.workOrder.update({ where: { id: workOrderId }, data: { mileageIn } });
      await tx.vehicle.update({ where: { id: wo.vehicleId }, data: { mileage: mileageIn } });
    }
    assertVehicleComplete({ ...wo.vehicle, ...data }, km);
  });
}

/** VIN, year, fuel, colour and the check-in mileage are mandatory to open an order. */
function assertVehicleComplete(v: { vin?: string | null; year?: number | null; fuel?: string | null; color?: string | null }, mileageIn: number | undefined) {
  if (missingVehicleInfo(v).length || mileageIn === undefined) throw new AppError("vehicleIncomplete", {}, 422);
}

/** Vehicle check-in: resolves/creates customer + vehicle, opens the order. */
export async function createWorkOrder(input: CreateWorkOrderInput, actor: StaffUser) {
  return prisma.$transaction(async (tx) => {
    let customerId = input.customerId;
    if (!customerId) {
      if (!input.newCustomer) throw new AppError("invalid");
      customerId = (await tx.customer.create({ data: input.newCustomer, select: { id: true } })).id;
      await audit(tx, actor, "customer.create", "Customer", customerId, { after: input.newCustomer });
    }

    let vehicleId = input.vehicleId;
    if (vehicleId) {
      const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { customerId: true, vin: true, year: true, fuel: true, color: true } });
      if (!vehicle || vehicle.customerId !== customerId) throw new AppError("invalid");
      const fill = Object.fromEntries(Object.entries(input.completeVehicle ?? {}).filter(([, v]) => v !== undefined && v !== ""));
      if (Object.keys(fill).length) {
        await tx.vehicle.update({ where: { id: vehicleId }, data: fill });
        await audit(tx, actor, "vehicle.update", "Vehicle", vehicleId, {
          before: Object.fromEntries(Object.keys(fill).map((k) => [k, vehicle[k as keyof typeof vehicle] ?? null])),
          after: fill,
        });
      }
      if (input.requireCompleteVehicle) assertVehicleComplete({ ...vehicle, ...fill }, input.mileageIn);
    } else {
      if (!input.newVehicle) throw new AppError("invalid");
      if (input.requireCompleteVehicle) assertVehicleComplete(input.newVehicle, input.mileageIn);
      vehicleId = (await tx.vehicle.create({ data: { ...input.newVehicle, customerId }, select: { id: true } })).id;
      await audit(tx, actor, "vehicle.create", "Vehicle", vehicleId, { after: { customerId, ...input.newVehicle } });
    }

    if (input.mileageIn !== undefined) {
      await tx.vehicle.update({ where: { id: vehicleId }, data: { mileage: input.mileageIn } });
    }

    const wo = await tx.workOrder.create({
      data: {
        customerId,
        vehicleId,
        complaint: input.complaint,
        priority: input.priority,
        mileageIn: input.mileageIn,
        promisedAt: input.promisedAt,
        mechanicId: input.mechanicId,
        createdById: actor.id,
        trackingPin: generatePin(),
      },
      select: { id: true },
    });
    await event(tx, wo.id, actor.id, "CREATED");
    return wo;
  });
}

export async function changeStatus(workOrderId: string, to: WorkOrderStatus, actor: StaffUser) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        status: true,
        invoice: { select: { id: true } },
        lines: { where: { partId: { not: null } }, select: { partId: true, quantityX100: true } },
      },
    });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (!TRANSITIONS[wo.status].includes(to) || (to === "CANCELLED" && wo.invoice)) {
      throw new AppError("transition", { from: wo.status, to }, 409);
    }

    // Mandatory quality control: "Ready" only after the checklist is validated by a manager.
    if (to === "READY") await assertQualityApproved(tx, workOrderId);
    // Back to the workshop: the checklist must be validated again afterwards.
    if (to === "IN_PROGRESS" || to === "WAITING_PARTS" || to === "QUOTE_SENT") await resetQualityApproval(tx, workOrderId);

    const now = new Date();
    const data: Prisma.WorkOrderUpdateManyMutationInput = { status: to };
    if (wo.status === "QUOTE_SENT" && (to === "IN_PROGRESS" || to === "WAITING_PARTS")) data.quoteApprovedAt = now;
    // A new (or complementary) quote must be approved again by the customer.
    if (to === "QUOTE_SENT") data.quoteApprovedAt = null;
    if (to === "READY") data.readyAt = now;
    if (to === "DELIVERED") data.deliveredAt = now;
    // Conditional write: only if the status is still the one checked above. Two
    // simultaneous requests (e.g. two "Cancel" clicks) cannot both pass: the second
    // UPDATE waits for the first, then matches 0 rows and stops here, BEFORE any
    // part is returned to stock a second time.
    const { count } = await tx.workOrder.updateMany({ where: { id: workOrderId, status: wo.status }, data });
    if (count === 0) throw new AppError("transition", { from: wo.status, to }, 409);

    // Cancelling puts every consumed part back on the shelf.
    if (to === "CANCELLED") {
      for (const line of wo.lines) {
        if (!line.partId) continue;
        await moveStock(tx, actor, {
          partId: line.partId,
          deltaX100: line.quantityX100,
          reason: "WORK_ORDER_RETURN",
          workOrderId,
        });
      }
    }

    await event(tx, workOrderId, actor.id, "STATUS_CHANGED", { from: wo.status, to });
    await audit(tx, actor, "workOrder.status", "WorkOrder", workOrderId, { before: { status: wo.status }, after: { status: to } });
  });
}

/** Issues a new 4-digit tracking code; old customer sessions stop working. */
export async function regenerateTrackingPin(workOrderId: string) {
  return prisma.workOrder.update({ where: { id: workOrderId }, data: { trackingPin: generatePin() }, select: { trackingPin: true } });
}

/** Active orders for the mobile workshop view (a mechanic sees his own by default). */
export async function workshopOrders(mechanicId?: string) {
  return prisma.workOrder.findMany({
    where: { status: { in: ACTIVE_STATUSES }, ...(mechanicId ? { mechanicId } : {}) },
    include: {
      vehicle: { select: { plate: true, make: true, model: true } },
      customer: { select: { name: true } },
      mechanic: { select: { name: true } },
      _count: { select: { media: true } },
      // Latest photos/videos, shown as a strip on the workshop card (with delete).
      media: { orderBy: { createdAt: "desc" }, take: 6, select: { id: true, kind: true, caption: true } },
    },
    orderBy: [{ priority: "desc" }, { promisedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

export async function assignMechanic(workOrderId: string, mechanicId: string | null, actor: StaffUser) {
  return prisma.$transaction(async (tx) => {
    const wo = await loadEditable(tx, workOrderId, { allowInvoiced: true });
    if (wo.mechanicId === mechanicId) return;
    const mechanic = mechanicId
      ? await tx.user.findFirst({ where: { id: mechanicId, isActive: true }, select: { name: true } })
      : null;
    if (mechanicId && !mechanic) throw new AppError("invalid");
    await tx.workOrder.update({ where: { id: workOrderId }, data: { mechanicId } });
    await event(tx, workOrderId, actor.id, "ASSIGNED", { to: mechanic?.name ?? null });
  });
}

export async function updateMeta(
  workOrderId: string,
  input: { diagnosis?: string; priority?: Priority; promisedAt?: Date; mileageIn?: number },
) {
  return prisma.$transaction(async (tx) => {
    await loadEditable(tx, workOrderId, { allowInvoiced: true });
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        diagnosis: input.diagnosis ?? null,
        priority: input.priority,
        promisedAt: input.promisedAt ?? null,
        mileageIn: input.mileageIn,
      },
    });
  });
}

type NewLine = { type: LineType; partId?: string; description?: string; quantityX100: number; unitPrice?: number };

/**
 * Adds a labour or part line. Part lines take name/price from stock unless
 * overridden, and consume stock immediately. Returns a low-stock warning.
 */
async function insertLine(tx: Tx, workOrderId: string, line: NewLine, actor: StaffUser, laborRate: number, taxBp: number) {
  let description = line.description;
  let unitPrice = line.unitPrice;
  let warning: { name: string; stockX100: number } | null = null;

  if (line.type === "PART") {
    if (!line.partId) {
      if (!description || unitPrice === undefined) throw new AppError("invalid");
    } else {
      const part = await tx.part.findUnique({ where: { id: line.partId } });
      if (!part) throw new AppError("notFound", {}, 404);
      description ??= part.brand ? `${part.name} (${part.brand})` : part.name;
      unitPrice ??= part.salePrice;
      // Business rule (unchanged): a part may be used even if the recorded stock is short
      // (it can be physically on the shelf); the user gets a warning instead of a block.
      const remaining = await moveStock(tx, actor, { partId: part.id, deltaX100: -line.quantityX100, reason: "WORK_ORDER", workOrderId });
      if (remaining < 0) warning = { name: part.name, stockX100: remaining };
    }
  } else {
    if (!description) throw new AppError("invalid");
    unitPrice ??= laborRate;
  }

  const position = await tx.workOrderLine.count({ where: { workOrderId } });
  await tx.workOrderLine.create({
    data: {
      workOrderId,
      type: line.type,
      description: description!,
      quantityX100: line.quantityX100,
      unitPrice: unitPrice!,
      taxRateBp: taxBp,
      partId: line.type === "PART" ? (line.partId ?? null) : null,
      position,
    },
  });
  return { description: description!, warning };
}

export async function addLine(workOrderId: string, line: NewLine, actor: StaffUser) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    await loadEditable(tx, workOrderId);
    const result = await insertLine(tx, workOrderId, line, actor, settings.laborRate, settings.defaultTaxBp);
    await event(tx, workOrderId, actor.id, "LINE_ADDED", { description: result.description });
    await tx.workOrder.update({ where: { id: workOrderId }, data: { updatedAt: new Date() } });
    return result.warning;
  });
}

export async function removeLine(lineId: string, actor: StaffUser) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.workOrderLine.findUnique({ where: { id: lineId } });
    if (!line) throw new AppError("notFound", {}, 404);
    await loadEditable(tx, line.workOrderId);
    await tx.workOrderLine.delete({ where: { id: lineId } });
    if (line.partId) {
      await moveStock(tx, actor, {
        partId: line.partId,
        deltaX100: line.quantityX100,
        reason: "WORK_ORDER_RETURN",
        workOrderId: line.workOrderId,
      });
    }
    await event(tx, line.workOrderId, actor.id, "LINE_REMOVED", { description: line.description });
  });
}

export async function applyPackage(workOrderId: string, packageId: string, actor: StaffUser) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    await loadEditable(tx, workOrderId);
    const pkg = await tx.servicePackage.findFirst({
      where: { id: packageId, isActive: true },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    if (!pkg) throw new AppError("notFound", {}, 404);

    const warnings: { name: string; stockX100: number }[] = [];
    for (const l of pkg.lines) {
      const result = await insertLine(
        tx,
        workOrderId,
        {
          type: l.type,
          partId: l.partId ?? undefined,
          description: l.description,
          quantityX100: l.quantityX100,
          unitPrice: l.unitPrice ?? undefined,
        },
        actor,
        settings.laborRate,
        settings.defaultTaxBp,
      );
      if (result.warning) warnings.push(result.warning);
    }
    await tx.servicePackage.update({ where: { id: pkg.id }, data: { usageCount: { increment: 1 } } });
    await event(tx, workOrderId, actor.id, "PACKAGE_APPLIED", { name: pkg.name });
    return warnings;
  });
}

export async function addNote(workOrderId: string, body: string, actor: StaffUser) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true } });
  if (!wo) throw new AppError("notFound", {}, 404);
  await prisma.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", body } });
}
