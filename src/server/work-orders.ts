import "server-only";
import { newToken as newQrToken } from "@/server/vehicle-qr";
import { consumeReservations, releaseAllFor, releaseForLine, reserveForLine, workOrderStockMove } from "@/server/parts";
import { approvalAllowsWork, deliverQuoteNotice, reapplyApprovals, refuseOpenQuoteTx, sendQuoteTx, settleDeferredStock } from "@/server/quotes";
import { recordRevisionTx } from "@/server/delays";
import { linesNeedingWaiver, promiseRevisionNeeded, sameMinute, waiverLineIds } from "@/lib/delays";
import { depositOutstanding } from "@/lib/billing";
import { mileageLowerThanKnown, withinCeiling } from "@/lib/handover";
import { computeTotals } from "@/lib/format";
import { handoverSinceReady } from "@/server/handover";
import { intakeSigned } from "@/server/signatures";
import { audit } from "@/server/audit";
import { assertQualityApproved, resetQualityApproval } from "@/server/quality";
import { createAutoRepairWarranty } from "@/server/warranties";
import { missingVehicleInfo } from "@/lib/vehicle-info";
import type { IntakeForm } from "@/lib/repair-order-forms";
import type { FuelType, LinePriority, LineType, PartCondition, Prisma, Priority, PromiseReason, WorkOrderStatus } from "@prisma/client";
import { formatMoney, normalizePlate } from "@/lib/format";
import { fr } from "@/lib/i18n/fr";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { getSettings } from "@/server/settings";
import { generatePin } from "@/server/portal-session";
import {
  ACTIVE_STATUSES,
  TRANSITIONS,
  balanceDue,
  cleanReason,
  deliveryBlock,
  handoverMissing,
  isApprovalMove,
  isFinal,
  reasonRequired,
  transitionPermission,
  workWithoutQuoteBlocked,
} from "@/server/workflow";

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
    QUOTE_REFUSED: 0, WAITING_CUSTOMER: 0, CLOSED: 0,
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
      // V14: supervisor badge.
      supervisor: { select: { id: true, name: true } },
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
    select: { id: true, status: true, mechanicId: true, workflowV16: true, quoteApprovedAt: true, invoice: { select: { id: true } } },
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

/** Stock movement of a repair (exit / return), journalised — shared with the quote decisions (server/parts.ts). */
function moveStock(
  tx: Tx,
  actor: StaffUser,
  input: { partId: string; deltaX100: number; reason: "WORK_ORDER" | "WORK_ORDER_RETURN"; workOrderId: string },
) {
  return workOrderStockMove(tx, actor, input);
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
  /** V10.6 — repair order details typed at check-in (fuel, body, parts origin, estimate, deposit, CIN). */
  intake?: IntakeForm;
  /**
   * V16 Lot 3 — the diagnostic fee of Paramètres (if set) was announced at reception and accepted: a line
   * « Frais de diagnostic », accepted at once and billable even if the quote is refused.
   */
  diagnosticFee?: boolean;
  /** V16 Lot 4 — the check-in mileage is lower than the vehicle's last reading and the desk confirmed it. */
  confirmLowerMileage?: boolean;
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
  confirmLowerMileage = false,
) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { status: true, mileageIn: true, vehicleId: true, vehicle: { select: { vin: true, year: true, fuel: true, color: true, mileage: true } } },
    });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (isFinal(wo.status)) throw new AppError("final", {}, 409);
    // V16 Lot 4: the check-in mileage is part of the signed intake; never lowered without a confirmation.
    if (mileageIn !== undefined && mileageIn !== wo.mileageIn && (await intakeSigned(tx, workOrderId))) throw new AppError("intakeLocked", {}, 409);
    if (mileageIn !== undefined && mileageLowerThanKnown(mileageIn, wo.vehicle.mileage) && !confirmLowerMileage) throw new AppError("mileageLower", { km: wo.vehicle.mileage! }, 409);
    const { mileage: knownMileage, ...vehicleBefore } = wo.vehicle;
    const data = Object.fromEntries(Object.entries(fill).filter(([, v]) => v !== undefined && v !== ""));
    if (Object.keys(data).length) {
      await tx.vehicle.update({ where: { id: wo.vehicleId }, data });
      await audit(tx, actor, "vehicle.update", "Vehicle", wo.vehicleId, {
        before: Object.fromEntries(Object.keys(data).map((k) => [k, vehicleBefore[k as keyof typeof vehicleBefore] ?? null])),
        after: data,
      });
    }
    const km = mileageIn ?? wo.mileageIn ?? undefined;
    if (mileageIn !== undefined) {
      await tx.workOrder.update({ where: { id: workOrderId }, data: { mileageIn } });
      await tx.vehicle.update({ where: { id: wo.vehicleId }, data: { mileage: mileageIn } });
      if (mileageLowerThanKnown(mileageIn, knownMileage)) {
        await audit(tx, actor, "vehicle.mileageLowered", "Vehicle", wo.vehicleId, { before: { mileage: knownMileage }, after: { mileage: mileageIn, confirmed: true, workOrderId } });
      }
    }
    assertVehicleComplete({ ...vehicleBefore, ...data }, km);
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
      const newCustomer = { ...input.newCustomer, ...(input.intake?.customerNationalId ? { nationalId: input.intake.customerNationalId } : {}) };
      customerId = (await tx.customer.create({ data: newCustomer, select: { id: true } })).id;
      await audit(tx, actor, "customer.create", "Customer", customerId, { after: newCustomer });
    } else if (input.intake?.customerNationalId) {
      // CIN typed at check-in for a known customer: completes (or corrects) the customer file.
      const c = await tx.customer.findUnique({ where: { id: customerId }, select: { nationalId: true } });
      if (c && c.nationalId !== input.intake.customerNationalId) {
        await tx.customer.update({ where: { id: customerId }, data: { nationalId: input.intake.customerNationalId } });
        await audit(tx, actor, "customer.update", "Customer", customerId, { before: { nationalId: c.nationalId }, after: { nationalId: input.intake.customerNationalId } });
      }
    }

    let vehicleId = input.vehicleId;
    if (vehicleId) {
      const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { customerId: true, vin: true, year: true, fuel: true, color: true, mileage: true } });
      // V16 Lot 4: a check-in mileage lower than the last reading is never written without a confirmation.
      if (mileageLowerThanKnown(input.mileageIn, vehicle?.mileage) && !input.confirmLowerMileage) throw new AppError("mileageLower", { km: vehicle!.mileage! }, 409);
      if (vehicle && mileageLowerThanKnown(input.mileageIn, vehicle.mileage)) {
        await audit(tx, actor, "vehicle.mileageLowered", "Vehicle", vehicleId, { before: { mileage: vehicle.mileage }, after: { mileage: input.mileageIn, confirmed: true, atCheckIn: true } });
      }
      if (!vehicle || vehicle.customerId !== customerId) throw new AppError("invalid");
      const fill = Object.fromEntries(Object.entries(input.completeVehicle ?? {}).filter(([, v]) => v !== undefined && v !== ""));
      if (Object.keys(fill).length) {
        await tx.vehicle.update({ where: { id: vehicleId }, data: fill });
        await audit(tx, actor, "vehicle.update", "Vehicle", vehicleId, {
          before: Object.fromEntries(Object.keys(fill).map((k) => [k, vehicle[k as keyof typeof vehicle] ?? null])),
          after: fill,
        });
      }
      if (input.requireCompleteVehicle) assertVehicleComplete({ ...vehicle!, ...fill }, input.mileageIn);
    } else {
      if (!input.newVehicle) throw new AppError("invalid");
      if (input.requireCompleteVehicle) assertVehicleComplete(input.newVehicle, input.mileageIn);
      vehicleId = (await tx.vehicle.create({ data: { ...input.newVehicle, customerId }, select: { id: true } })).id;
      await audit(tx, actor, "vehicle.create", "Vehicle", vehicleId, { after: { customerId, ...input.newVehicle } });
    }

    if (input.mileageIn !== undefined) {
      await tx.vehicle.update({ where: { id: vehicleId }, data: { mileage: input.mileageIn } });
    }

    // The car enters the garage: give it its QR Code if it has none yet (never replaces an existing one).
    const { count: qrIssued } = await tx.vehicle.updateMany({ where: { id: vehicleId, qrToken: null }, data: { qrToken: newQrToken(), qrIssuedAt: new Date() } });
    if (qrIssued) await audit(tx, actor, "vehicle.qrIssue", "Vehicle", vehicleId, { before: { hadQr: false }, after: { hasQr: true, atCheckIn: true } });

    const wo = await tx.workOrder.create({
      data: {
        customerId,
        vehicleId,
        complaint: input.complaint,
        priority: input.priority,
        mileageIn: input.mileageIn,
        promisedAt: input.promisedAt,
        // V16: the first promised date is kept for good (later changes are traced in the journal).
        promisedAtInitial: input.promisedAt,
        mechanicId: input.mechanicId,
        createdById: actor.id,
        trackingPin: generatePin(),
        ...intakeData(input.intake),
        // V16 Lot 4: the deposit becomes a payment dated today at the invoice; the diagnostic fee answer is kept.
        ...(input.intake?.depositAmount ? { depositReceivedAt: new Date() } : {}),
        diagnosticFeeAccepted: (await tx.setting.findUnique({ where: { id: "garage" }, select: { diagnosticFee: true } }))?.diagnosticFee ? !!input.diagnosticFee : null,
      },
      select: { id: true },
    });
    await event(tx, wo.id, actor.id, "CREATED");
    if (input.diagnosticFee) await addDiagnosticFeeLine(tx, wo.id, actor);
    return wo;
  });
}

/** V16 Lot 3 — « Frais de diagnostic » line (announced fee, accepted at reception). Nothing when no fee is set. */
async function addDiagnosticFeeLine(tx: Tx, workOrderId: string, actor: StaffUser) {
  const s = await tx.setting.findUnique({ where: { id: "garage" }, select: { diagnosticFee: true, defaultTaxBp: true } });
  if (!s?.diagnosticFee || s.diagnosticFee <= 0) return;
  const line = await tx.workOrderLine.create({
    data: {
      workOrderId,
      type: "LABOR",
      description: fr.v16.lot3.refusal.diagnosticLine,
      quantityX100: 100,
      unitPrice: s.diagnosticFee,
      taxRateBp: s.defaultTaxBp,
      approvalStatus: "APPROVED",
      isAnnouncedFee: true,
    },
    select: { id: true, description: true },
  });
  await event(tx, workOrderId, actor.id, "LINE_ADDED", { description: line.description, announcedFee: true });
  await audit(tx, actor, "workOrder.lineAdd", "WorkOrderLine", line.id, {
    after: { workOrderId, type: "LABOR", description: line.description, quantityX100: 100, unitPrice: s.diagnosticFee, approvalStatus: "APPROVED", isAnnouncedFee: true, announcedAtReception: true },
  });
}

/** Columns of the repair order details (V10.6); nothing when the form did not send them. */
function intakeData(i: IntakeForm | undefined) {
  if (!i) return {};
  return {
    fuelLevel: i.fuelLevel ?? null,
    partsOrigin: i.partsOrigin ?? null,
    bodyChecklist: i.bodyChecklist as unknown as Prisma.InputJsonValue,
    bodyDamageNotes: i.bodyDamageNotes ?? null,
    estimateTtc: i.estimateTtc ?? null,
    depositAmount: i.depositAmount ?? null,
    depositMethod: i.depositAmount ? (i.depositMethod ?? "CASH") : null,
    // V16 Lot 4
    warningLights: (i.warningLights ?? []) as unknown as Prisma.InputJsonValue,
    itemsLeft: i.itemsLeft ?? null,
    keyCount: i.keyCount ?? null,
    authorizationCeiling: i.authorizationCeiling ?? null,
  };
}

export type StatusChangeOptions = {
  /** Mandatory for some moves (cancel, refused quote, back to the workshop…), see reasonRequired(). Never shown to the customer. */
  reason?: string | null;
  /** V16 — deliver despite a missing invoice or a balance due (permission deliverWithBalance + reason). */
  override?: boolean;
  /** V16 Lot 3 — refused quote → « Prêt »: the car was put back together (recorded in the event). */
  reassembled?: boolean;
  /** V16 Lot 3 — the customer signed the printed safety waiver (refused SAFETY line), permission recordSafetyWaiver. */
  safetyWaiver?: boolean;
};

export async function changeStatus(workOrderId: string, to: WorkOrderStatus, actor: StaffUser, opts: StatusChangeOptions = {}) {
  const done = await changeStatusTx(workOrderId, to, actor, opts);
  // V16 Lot 2: « devis à valider » queued with the quote, sent after the commit (never blocks the move).
  await deliverQuoteNotice(done.quoteNotice);
  // V12: delivered → replacements detected in its lines → forecasts of the vehicle recomputed.
  // After the commit and never blocking: a failure here does not undo the delivery.
  if (to === "DELIVERED") {
    const { afterOrderDelivered } = await import("@/server/agenda");
    await afterOrderDelivered(workOrderId).catch((e) => console.error("[agenda] after delivery", e));
  }
}

async function workflowSettings(tx: Tx) {
  const s = await tx.setting.findUnique({
    where: { id: "garage" },
    select: { allowWorkWithoutQuote: true, requirePaidBeforeDelivery: true, requireSafetyWaiver: true, requireSignedHandover: true, stampDuty: true },
  });
  return {
    allowWorkWithoutQuote: s?.allowWorkWithoutQuote ?? false,
    requirePaidBeforeDelivery: s?.requirePaidBeforeDelivery ?? true,
    requireSafetyWaiver: s?.requireSafetyWaiver ?? true,
    requireSignedHandover: s?.requireSignedHandover ?? true,
    stampDuty: s?.stampDuty ?? 0,
  };
}

async function changeStatusTx(workOrderId: string, to: WorkOrderStatus, actor: StaffUser, opts: StatusChangeOptions): Promise<{ quoteNotice: string | null }> {
  return prisma.$transaction(async (tx) => {
    const head = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { workflowV16: true } });
    if (!head) throw new AppError("notFound", {}, 404);
    // V16 Lot 2: customer decisions synchronised from online are re-applied to the lines (append-only proof),
    // and accepted parts still in reservation leave the stock now (not when cancelling: nothing to take out).
    if (head.workflowV16) {
      await reapplyApprovals(tx, workOrderId);
      if (to !== "CANCELLED") await settleDeferredStock(tx, actor, workOrderId);
    }
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        status: true,
        workflowV16: true,
        quoteApprovedAt: true,
        depositAmount: true,
        workflowLot4: true,
        readyAt: true,
        invoice: { select: { id: true, totalTtc: true, paidAmount: true, status: true } },
        // Voided lines already gave their parts back, and parts still in reservation (V16 quote) never left
        // the shelf: never returned twice.
        lines: { where: { partId: { not: null }, voidedAt: null, stockDeferred: false }, select: { partId: true, quantityX100: true } },
      },
    });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (!TRANSITIONS[wo.status].includes(to) || (to === "CANCELLED" && wo.invoice)) {
      throw new AppError("transition", { from: wo.status, to }, 409);
    }
    // V16: one permission per move (customisable per employee), checked for EVERY order (audit n° 1).
    if (!can(actor, transitionPermission(wo.status, to))) throw new AppError("statusForbidden", {}, 403);
    const settings = await workflowSettings(tx);
    // New orders only (non-retroactive): no work straight from reception / diagnosis unless allowed — or, V16 Lot 4,
    // under the authorization ceiling signed at reception (the lines present now are pre-authorised by it).
    const ceiling = workWithoutQuoteBlocked(wo.status, to, { workflowV16: wo.workflowV16, ...settings }) ? await ceilingAllows(tx, workOrderId, settings.stampDuty) : null;
    if (workWithoutQuoteBlocked(wo.status, to, { workflowV16: wo.workflowV16, ...settings, withinCeiling: !!ceiling })) throw new AppError("workWithoutQuote", {}, 409);
    // V16 Lot 2 (new orders): the work starts only on a RECORDED agreement (portal or staff form) on the latest
    // quote, with at least one accepted line — never on a simple click any more (replaces the Lot 1 reason).
    if (wo.workflowV16 && isApprovalMove(wo.status, to) && !(await approvalAllowsWork(tx, workOrderId))) throw new AppError("approvalRequired", {}, 409);
    const reason = cleanReason(opts.reason);
    if (reasonRequired(wo.status, to) && !reason) {
      throw new AppError("reasonRequired", {}, 422);
    }

    // V16 delivery check (new orders, setting on): invoice issued and settled, deposit deducted — or a traced override.
    // V16 Lot 4: the deposit of the new orders is already a payment on the invoice (never deducted twice).
    const deposit = depositOutstanding(wo);
    let override: { block: "noInvoice" | "balanceDue"; due: number } | null = null;
    if (to === "DELIVERED") {
      // V16 Lot 3: nothing billable (refused quote without announced fee) → no invoice needed.
      const billable = wo.invoice ? true : await hasBillableLines(tx, workOrderId, wo.workflowV16);
      const block = deliveryBlock({ ...settings, workflowV16: wo.workflowV16, invoice: wo.invoice && wo.invoice.status === "CREDITED" ? { totalTtc: 0, paidAmount: 0 } : wo.invoice, depositAmount: deposit, billable });
      if (block) {
        const due = balanceDue(wo.invoice, deposit) ?? 0;
        if (!opts.override) {
          throw block === "noInvoice" ? new AppError("deliveryNoInvoice", {}, 409) : new AppError("deliveryBalanceDue", { amount: formatMoney(due, "fr") }, 409);
        }
        if (!can(actor, "deliverWithBalance")) throw new AppError("statusForbidden", {}, 403);
        if (!reason) throw new AppError("reasonRequired", {}, 422);
        override = { block, due };
      }
    }
    // V16 Lot 4: a signed handover (bon de restitution) since the order became READY (setting, new orders). Checked
    // after the invoice / balance (Lot 1 messages first); the manager's override covers the balance, never this.
    if (to === "DELIVERED" && handoverMissing({ requireSignedHandover: settings.requireSignedHandover, workflowLot4: wo.workflowLot4, handoverDone: await handoverSinceReady(tx, workOrderId, wo.readyAt) })) {
      throw new AppError("handoverRequired", {}, 409);
    }
    if (to === "CLOSED" && (balanceDue(wo.invoice, deposit) ?? 1) > 0) throw new AppError("notSettled", {}, 409);

    // Mandatory quality control: "Ready" only after the checklist is validated by a manager
    // (also after a refused quote: the car was put back together, the FULL check applies).
    if (to === "READY") await assertQualityApproved(tx, workOrderId);
    // V16 Lot 3: a refused SAFETY line → the customer's signed waiver (printed) before « Prêt » (setting, new orders).
    let waiver: string[] = [];
    if (to === "READY" && wo.workflowV16 && settings.requireSafetyWaiver) {
      waiver = await safetyWaiverMissing(tx, workOrderId);
      if (waiver.length) {
        if (!opts.safetyWaiver) throw new AppError("safetyWaiverRequired", {}, 409);
        if (!can(actor, "recordSafetyWaiver")) throw new AppError("forbidden", {}, 403);
      }
    }
    // Back to the workshop: the checklist must be validated again afterwards.
    if (to === "IN_PROGRESS" || to === "WAITING_PARTS" || to === "QUOTE_SENT") await resetQualityApproval(tx, workOrderId);
    // V16 Lot 2: sending the quote (initial, or supplement from the workshop) creates its version: frozen copy,
    // number, SHA-256 fingerprint, customer notice. With a hub, refused online (numbered at the garage).
    const quoteNotice = to === "QUOTE_SENT" && wo.workflowV16 ? (await sendQuoteTx(tx, actor, workOrderId, { channel: "PORTAL" })).dedupeKey : null;

    const now = new Date();
    const data: Prisma.WorkOrderUpdateManyMutationInput = { status: to };
    const approval = isApprovalMove(wo.status, to);
    if (approval && wo.status === "QUOTE_SENT") data.quoteApprovedAt = now;
    // Orders opened before V16 keep the one-click agreement: their pending lines become accepted with it.
    if (approval && !wo.workflowV16) await tx.workOrderLine.updateMany({ where: { workOrderId, approvalStatus: "PENDING", voidedAt: null }, data: { approvalStatus: "APPROVED" } });
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

    // V16 Lot 3: refusal recorded by the garage (no answer, refusal by phone without detail…): pending lines
    // refused and kept, open quote closed, reservations released — only the announced fees stay billable.
    const refusedLines = to === "QUOTE_REFUSED" && wo.workflowV16 ? await refuseOpenQuoteTx(tx, actor, workOrderId) : [];
    if (waiver.length) {
      const e = await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { safetyWaiver: true, lineIds: waiver, signedOnPaper: true } }, select: { id: true } });
      await audit(tx, actor, "workOrder.safetyWaiver", "WorkOrderEvent", e.id, { after: { workOrderId, lineIds: waiver, signedOnPaper: true } });
    }

    // Delivered or cancelled: parts still reserved for it become available again.
    if (to === "CANCELLED" || to === "DELIVERED") await releaseAllFor(tx, actor, workOrderId, to === "CANCELLED" ? "ordre annulé" : "véhicule livré");
    // Delivered: automatic repair warranty when set in Paramètres (0 = off), once per order.
    // V16 Lot 4 (audit n° 3): new orders get it at the invoice; at delivery only if the invoice exists (idempotent).
    if (to === "DELIVERED" && (!wo.workflowLot4 || wo.invoice)) await createAutoRepairWarranty(tx, actor, workOrderId, now);
    // V16 Lot 4: work started under the signed ceiling — the lines present now are accepted by it (journalised).
    if (ceiling) {
      const { count: pre } = await tx.workOrderLine.updateMany({ where: { workOrderId, voidedAt: null, approvalStatus: "PENDING" }, data: { approvalStatus: "APPROVED" } });
      await settleDeferredStock(tx, actor, workOrderId);
      const e = await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { preAuthorized: true, ceiling: ceiling.ceiling, totalTtc: ceiling.totalTtc, lines: pre } }, select: { id: true } });
      await audit(tx, actor, "workOrder.preAuthorized", "WorkOrderEvent", e.id, { after: { workOrderId, ceiling: ceiling.ceiling, totalTtc: ceiling.totalTtc, lines: pre } });
    }

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

    // The reason stays internal: it is removed from the events shown on the customer portal (server/portal.ts).
    const extra = {
      ...(reason ? { reason } : {}),
      ...(override ? { override: "deliverWithBalance", block: override.block, balanceDue: override.due } : {}),
      ...(approval ? { approval: true } : {}),
      ...(refusedLines.length ? { refusedLines: refusedLines.length } : {}),
      ...(wo.status === "QUOTE_REFUSED" && to === "READY" ? { reassembled: !!opts.reassembled } : {}),
    };
    await event(tx, workOrderId, actor.id, "STATUS_CHANGED", { from: wo.status, to, ...extra });
    await audit(tx, actor, "workOrder.status", "WorkOrder", workOrderId, { before: { status: wo.status }, after: { status: to, ...extra } });

    // Delivered and already paid: closed at once (owner's decision: automatic closing).
    if (to === "DELIVERED") await closeIfSettled(tx, workOrderId, actor);
    return { quoteNotice };
  });
}

/** V16 Lot 4 — the order's total TTC fits under the authorization ceiling of its SIGNED intake (else null). */
async function ceilingAllows(tx: Tx, workOrderId: string, stampDuty: number): Promise<{ ceiling: number; totalTtc: number } | null> {
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: { authorizationCeiling: true, lines: { where: { voidedAt: null, approvalStatus: { not: "REFUSED" } }, select: { quantityX100: true, unitPrice: true, taxRateBp: true } } },
  });
  if (!wo?.authorizationCeiling) return null;
  const totalTtc = computeTotals(wo.lines, stampDuty).totalTtc;
  return withinCeiling({ ceiling: wo.authorizationCeiling, intakeSigned: await intakeSigned(tx, workOrderId), totalTtc }) ? { ceiling: wo.authorizationCeiling, totalTtc } : null;
}

/**
 * V16 — automatic closing: a DELIVERED order whose invoice is settled (payments + deposit ≥ total) becomes
 * CLOSED. Called after a delivery and after each payment (server/invoices.ts), in the same transaction.
 */
export async function closeIfSettled(tx: Tx, workOrderId: string, actor: { id: string; name: string } | null) {
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: { status: true, workflowV16: true, workflowLot4: true, depositAmount: true, invoice: { select: { totalTtc: true, paidAmount: true, status: true } } },
  });
  if (!wo || wo.status !== "DELIVERED") return false;
  // V16 Lot 3: a new order with nothing billable (refused quote, no announced fee) owes nothing: closed too.
  const nothingToBill = !wo.invoice && wo.workflowV16 && !(await hasBillableLines(tx, workOrderId, true));
  // V16 Lot 4: an invoice cancelled by a credit note is settled too (prompt: « facture soldée (ou avoir) »).
  if (!nothingToBill && (!wo.invoice || (balanceDue(wo.invoice, depositOutstanding(wo)) ?? 1) > 0)) return false;
  const { count } = await tx.workOrder.updateMany({ where: { id: workOrderId, status: "DELIVERED" }, data: { status: "CLOSED" } });
  if (!count) return false;
  await event(tx, workOrderId, actor?.id ?? null, "STATUS_CHANGED", { from: "DELIVERED", to: "CLOSED", auto: true });
  await audit(tx, actor, "workOrder.status", "WorkOrder", workOrderId, { before: { status: "DELIVERED" }, after: { status: "CLOSED", auto: true } });
  return true;
}

/** V16 Lot 3 — the order has lines that would go on the invoice (same rule as createInvoice). */
export async function hasBillableLines(tx: Tx, workOrderId: string, workflowV16: boolean) {
  const where: Prisma.WorkOrderLineWhereInput = workflowV16 ? { voidedAt: null, approvalStatus: "APPROVED" } : { voidedAt: null, approvalStatus: { not: "REFUSED" } };
  return (await tx.workOrderLine.count({ where: { workOrderId, ...where } })) > 0;
}

/** V16 Lot 3 — refused SAFETY lines of the order not yet covered by a signed waiver (ids). */
export async function safetyWaiverMissing(tx: Tx, workOrderId: string) {
  const [lines, notes] = await Promise.all([
    tx.workOrderLine.findMany({ where: { workOrderId, priority: "SAFETY", approvalStatus: "REFUSED" }, select: { id: true, priority: true, approvalStatus: true, voidedAt: true } }),
    tx.workOrderEvent.findMany({ where: { workOrderId, type: "NOTE" }, select: { data: true } }),
  ]);
  return linesNeedingWaiver(lines, waiverLineIds(notes));
}

/**
 * V16 — last known agreement on an order opened BEFORE V16 (V16 orders use the traced agreements of Lot 2,
 * server/quotes.ts): the latest of
 * quoteApprovedAt, a portal approval (QUOTE_APPROVED) and a move from the quote / insurance to the work.
 * quoteApprovedAt alone is not enough: each complementary quote clears it.
 */
export async function lastApprovalAt(tx: Tx, workOrderId: string): Promise<Date | null> {
  const [wo, events] = await Promise.all([
    tx.workOrder.findUnique({ where: { id: workOrderId }, select: { quoteApprovedAt: true } }),
    tx.workOrderEvent.findMany({
      where: {
        workOrderId,
        OR: [
          { type: "QUOTE_APPROVED" },
          { type: "STATUS_CHANGED", data: { path: ["from"], equals: "QUOTE_SENT" } },
          { type: "STATUS_CHANGED", data: { path: ["from"], equals: "WAITING_INSURANCE" } },
        ],
      },
      select: { type: true, data: true, createdAt: true },
    }),
  ]);
  let last = wo?.quoteApprovedAt ?? null;
  for (const e of events) {
    const d = (e.data ?? {}) as { from?: WorkOrderStatus; to?: WorkOrderStatus };
    const counts = e.type === "QUOTE_APPROVED" || (!!d.from && !!d.to && isApprovalMove(d.from, d.to));
    if (counts && (!last || e.createdAt > last)) last = e.createdAt;
  }
  return last;
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
      supervisor: { select: { name: true } },
      _count: { select: { media: true } },
      // Latest photos/videos, shown as a strip on the workshop card (with delete).
      media: { orderBy: { createdAt: "desc" }, take: 6, select: { id: true, kind: true, caption: true } },
    },
    orderBy: [{ priority: "desc" }, { promisedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

/**
 * V14: every assignment goes through the skills check (src/server/skills.ts): refused only when a
 * required skill demands a habilitation the mechanic does not hold; other cases = warnings on the order.
 * The supervisor already on the order is kept.
 */
export async function assignMechanic(workOrderId: string, mechanicId: string | null, actor: StaffUser) {
  const { assignWithSkills } = await import("@/server/skills");
  return assignWithSkills(actor, workOrderId, { mechanicId });
}

export async function updateMeta(
  workOrderId: string,
  input: { diagnosis?: string; priority?: Priority; promisedAt?: Date; mileageIn?: number; promiseReason?: PromiseReason | null; promiseNote?: string | null },
  actor: StaffUser,
): Promise<{ dedupeKey: string | null }> {
  return prisma.$transaction(async (tx) => {
    await loadEditable(tx, workOrderId, { allowInvoiced: true });
    const before = await tx.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { diagnosis: true, priority: true, promisedAt: true, promisedAtInitial: true, mileageIn: true },
    });
    // V16 Lot 4: the check-in mileage belongs to the signed intake (frozen document): no change afterwards.
    if (input.mileageIn !== undefined && input.mileageIn !== before.mileageIn && (await intakeSigned(tx, workOrderId))) throw new AppError("intakeLocked", {}, 409);
    const data = {
      diagnosis: input.diagnosis ?? null,
      priority: input.priority,
      promisedAt: input.promisedAt ?? null,
      mileageIn: input.mileageIn,
      // V16: the first promise ever made is kept (an order opened without a date gets it here).
      ...(!before.promisedAtInitial && input.promisedAt ? { promisedAtInitial: input.promisedAt } : {}),
    };
    // V16 Lot 3: an existing promised date that moves (or is cleared) is never overwritten silently: reason
    // mandatory, PromiseRevision (append-only) and the customer is told (same transaction). The same minute as the
    // stored date (the form works to the minute) is not a change: the stored value is kept.
    const revise = promiseRevisionNeeded(before.promisedAt, data.promisedAt);
    if (revise && !input.promiseReason) throw new AppError("promiseReasonRequired", {}, 422);
    if (!revise && before.promisedAt && sameMinute(before.promisedAt, data.promisedAt)) data.promisedAt = before.promisedAt;
    await tx.workOrder.update({ where: { id: workOrderId }, data });
    const dedupeKey = revise
      ? (await recordRevisionTx(tx, actor, { workOrderId, oldDate: before.promisedAt, newDate: data.promisedAt, reason: input.promiseReason!, note: input.promiseNote })).dedupeKey
      : null;
    // V16 (audit trail): before → after of what really changed, the promised date included.
    const comparable = (v: unknown) => (v instanceof Date ? v.getTime() : (v ?? null));
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => data[k] !== undefined && comparable(before[k]) !== comparable(data[k]));
    if (changed.length) {
      await audit(tx, actor, "workOrder.update", "WorkOrder", workOrderId, {
        before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])),
        after: Object.fromEntries(changed.map((k) => [k, data[k] ?? null])),
      });
    }
    return { dedupeKey };
  });
}

type NewLine = {
  type: LineType;
  partId?: string;
  description?: string;
  quantityX100: number;
  unitPrice?: number;
  /** V16 Lot 2 — shown to the customer on the quote. */
  priority?: LinePriority | null;
  partCondition?: PartCondition | null;
  /**
   * V16 Lot 3 — fee announced to the customer at reception (diagnostic, announced dismantling): labour only,
   * new orders, before the quote (RECEIVED / DIAGNOSIS), permission manageQuotes. Accepted at once; billable even
   * if the quote is refused.
   */
  announcedFee?: boolean;
};
type EditableOrder = { id: string; status: WorkOrderStatus; workflowV16: boolean; quoteApprovedAt: Date | null };

/**
 * V16 Lot 2 — agreement status of a new line. New orders: always PENDING (the customer accepts it on a quote,
 * a line added after the agreement is a supplement). Orders opened before V16 keep their one-click agreement:
 * accepted at once, except while their quote waits for the answer (then accepted with it).
 */
function newLineApproval(wo: EditableOrder, announcedFee = false) {
  if (wo.workflowV16) return announcedFee ? ("APPROVED" as const) : ("PENDING" as const);
  return wo.status === "QUOTE_SENT" && !wo.quoteApprovedAt ? ("PENDING" as const) : ("APPROVED" as const);
}

/**
 * Adds a labour or part line. Part lines take name/price from stock unless overridden. Orders opened before
 * V16: the part leaves the stock immediately (unchanged). V16 Lot 2 orders: the part is RESERVED until the
 * customer accepts the line (then it leaves the stock), released if refused. Returns a low-stock warning.
 */
async function insertLine(tx: Tx, wo: EditableOrder, line: NewLine, actor: StaffUser, laborRate: number, taxBp: number) {
  const workOrderId = wo.id;
  const fee = !!line.announcedFee;
  if (fee && (!wo.workflowV16 || line.type !== "LABOR" || (wo.status !== "RECEIVED" && wo.status !== "DIAGNOSIS") || !can(actor, "manageQuotes"))) {
    throw new AppError("announcedFeeNotAllowed", {}, 422);
  }
  const deferred = wo.workflowV16 && line.type === "PART" && !!line.partId;
  let partName: string | null = null;
  let description = line.description;
  let unitPrice = line.unitPrice;
  // Purchase cost at the moment of use: later price changes never rewrite a repair's real cost.
  let unitCost: number | null = null;
  let warning: { name: string; stockX100: number } | null = null;

  if (line.type === "PART") {
    if (!line.partId) {
      if (!description || unitPrice === undefined) throw new AppError("invalid");
    } else {
      const part = await tx.part.findUnique({ where: { id: line.partId } });
      if (!part) throw new AppError("notFound", {}, 404);
      description ??= part.brand ? `${part.name} (${part.brand})` : part.name;
      unitPrice ??= part.salePrice;
      unitCost = part.costPrice > 0 ? part.costPrice : null;
      partName = part.name;
      if (!deferred) {
        // Business rule (unchanged): a part may be used even if the recorded stock is short
        // (it can be physically on the shelf); the user gets a warning instead of a block.
        await consumeReservations(tx, actor, workOrderId, part.id, line.quantityX100);
        const remaining = await moveStock(tx, actor, { partId: part.id, deltaX100: -line.quantityX100, reason: "WORK_ORDER", workOrderId });
        // Business rule (unchanged): allowed, with a warning, even when the recorded free stock is short.
        const after = await tx.part.findUnique({ where: { id: part.id }, select: { reservedX100: true } });
        if (remaining - (after?.reservedX100 ?? 0) < 0) warning = { name: part.name, stockX100: remaining - (after?.reservedX100 ?? 0) };
      }
    }
  } else {
    if (!description) throw new AppError("invalid");
    unitPrice ??= laborRate;
  }

  const position = await tx.workOrderLine.count({ where: { workOrderId } });
  const created = await tx.workOrderLine.create({
    select: { id: true },
    data: {
      workOrderId,
      type: line.type,
      description: description!,
      quantityX100: line.quantityX100,
      unitPrice: unitPrice!,
      taxRateBp: taxBp,
      partId: line.type === "PART" ? (line.partId ?? null) : null,
      unitCost,
      position,
      approvalStatus: newLineApproval(wo, fee),
      priority: line.priority ?? null,
      partCondition: line.type === "PART" ? (line.partCondition ?? null) : null,
      stockDeferred: deferred,
      isAnnouncedFee: fee,
    },
  });
  if (deferred) {
    // Put aside on the free stock (atomic); what cannot be reserved is only a warning, as before.
    const short = await reserveForLine(tx, actor, { workOrderId, partId: line.partId!, lineId: created.id, quantityX100: line.quantityX100 });
    if (short > 0) warning = { name: partName ?? description!, stockX100: -short };
  }
  return { id: created.id, description: description!, unitPrice: unitPrice!, warning };
}

export async function addLine(workOrderId: string, line: NewLine, actor: StaffUser) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const wo = await loadEditable(tx, workOrderId);
    const result = await insertLine(tx, wo, line, actor, settings.laborRate, settings.defaultTaxBp);
    await event(tx, workOrderId, actor.id, "LINE_ADDED", { description: result.description, ...(line.announcedFee ? { announcedFee: true } : {}) });
    await audit(tx, actor, "workOrder.lineAdd", "WorkOrderLine", result.id, {
      after: {
        workOrderId,
        type: line.type,
        description: result.description,
        quantityX100: line.quantityX100,
        unitPrice: result.unitPrice,
        partId: line.partId ?? null,
        approvalStatus: newLineApproval(wo, !!line.announcedFee),
        priority: line.priority ?? null,
        partCondition: line.partCondition ?? null,
        ...(line.announcedFee ? { isAnnouncedFee: true } : {}),
      },
    });
    // V16 (audit n° 4): the work changed, the quality check must be validated again.
    await resetQualityApproval(tx, workOrderId);
    await tx.workOrder.update({ where: { id: workOrderId }, data: { updatedAt: new Date() } });
    return result.warning;
  });
}

/**
 * Removes a line. V16: a line that existed at the customer's last known agreement is VOIDED (kept, struck
 * through, reason mandatory) instead of deleted, so what the customer accepted stays provable. Its parts go
 * back to stock once; voided lines are left out of totals, invoice and documents.
 */
export async function removeLine(lineId: string, actor: StaffUser, reason?: string | null) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.workOrderLine.findUnique({ where: { id: lineId } });
    if (!line) throw new AppError("notFound", {}, 404);
    if (line.voidedAt) throw new AppError("invalid", {}, 409);
    const wo = await loadEditable(tx, line.workOrderId);
    let voidIt: boolean;
    if (wo.workflowV16) {
      // V16 Lot 2: an ACCEPTED line is locked (voided with a reason, never deleted); a REFUSED line is kept as
      // the customer's answer (follow-up later); only a PENDING line may be deleted.
      if (line.approvalStatus === "REFUSED") throw new AppError("lineRefusedLocked", {}, 409);
      voidIt = line.approvalStatus === "APPROVED";
    } else {
      const approvedAt = await lastApprovalAt(tx, line.workOrderId);
      voidIt = !!approvedAt && line.createdAt <= approvedAt;
    }
    const why = cleanReason(reason);
    if (voidIt) {
      if (!why) throw new AppError("reasonRequired", {}, 422);
      // Conditional: a double click cannot void the line (and give its parts back) twice.
      const { count } = await tx.workOrderLine.updateMany({ where: { id: lineId, voidedAt: null }, data: { voidedAt: new Date(), voidReason: why, voidedById: actor.id } });
      if (count === 0) throw new AppError("invalid", {}, 409);
    } else {
      await tx.workOrderLine.delete({ where: { id: lineId } });
    }
    if (line.partId && line.stockDeferred) {
      // V16 Lot 2: the part never left the shelf, it was only put aside for the quote.
      await releaseForLine(tx, actor, line.id, voidIt ? "ligne annulée" : "ligne supprimée");
    } else if (line.partId) {
      await moveStock(tx, actor, {
        partId: line.partId,
        deltaX100: line.quantityX100,
        reason: "WORK_ORDER_RETURN",
        workOrderId: line.workOrderId,
      });
    }
    // V16 Lot 2: a pending line removed from the quote the customer is reading: that version no longer matches
    // the work, it is replaced (the customer cannot accept it any more; « Renvoyer le devis » sends a new one).
    if (!voidIt && line.quoteId) {
      const { count } = await tx.quote.updateMany({ where: { id: line.quoteId, status: "SENT" }, data: { status: "SUPERSEDED" } });
      if (count) await audit(tx, actor, "quote.supersede", "Quote", line.quoteId, { before: { status: "SENT" }, after: { status: "SUPERSEDED", removedLine: line.description } });
    }
    await event(tx, line.workOrderId, actor.id, "LINE_REMOVED", { description: line.description, ...(voidIt ? { voided: true, reason: why } : {}) });
    const snapshot = { workOrderId: line.workOrderId, type: line.type, description: line.description, quantityX100: line.quantityX100, unitPrice: line.unitPrice, partId: line.partId };
    await audit(tx, actor, voidIt ? "workOrder.lineVoid" : "workOrder.lineRemove", "WorkOrderLine", line.id, {
      before: snapshot,
      after: voidIt ? { voided: true, reason: why } : null,
    });
    await resetQualityApproval(tx, line.workOrderId);
    await tx.workOrder.update({ where: { id: line.workOrderId }, data: { updatedAt: new Date() } });
  });
}

/** Lines of this order that will be voided (not deleted) when removed: they existed at the last agreement. */
export async function voidOnlyLineIds(workOrderId: string): Promise<string[]> {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { workflowV16: true } });
  // V16 Lot 2: the lines the customer accepted (locked).
  if (wo?.workflowV16) return (await prisma.workOrderLine.findMany({ where: { workOrderId, voidedAt: null, approvalStatus: "APPROVED" }, select: { id: true } })).map((l) => l.id);
  const approvedAt = await lastApprovalAt(prisma as unknown as Tx, workOrderId);
  if (!approvedAt) return [];
  const lines = await prisma.workOrderLine.findMany({ where: { workOrderId, voidedAt: null, createdAt: { lte: approvedAt } }, select: { id: true } });
  return lines.map((l) => l.id);
}

export async function applyPackage(workOrderId: string, packageId: string, actor: StaffUser) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const wo = await loadEditable(tx, workOrderId);
    const pkg = await tx.servicePackage.findFirst({
      where: { id: packageId, isActive: true },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    if (!pkg) throw new AppError("notFound", {}, 404);

    const warnings: { name: string; stockX100: number }[] = [];
    const added: { id: string; description: string; quantityX100: number; unitPrice: number }[] = [];
    for (const l of pkg.lines) {
      const result = await insertLine(
        tx,
        wo,
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
      added.push({ id: result.id, description: result.description, quantityX100: l.quantityX100, unitPrice: result.unitPrice });
    }
    await tx.servicePackage.update({ where: { id: pkg.id }, data: { usageCount: { increment: 1 } } });
    await event(tx, workOrderId, actor.id, "PACKAGE_APPLIED", { name: pkg.name, packageId: pkg.id });
    await audit(tx, actor, "workOrder.packageApply", "WorkOrder", workOrderId, { after: { packageId: pkg.id, name: pkg.name, lines: added } });
    await resetQualityApproval(tx, workOrderId);
    await tx.workOrder.update({ where: { id: workOrderId }, data: { updatedAt: new Date() } });
    return warnings;
  });
}

export async function addNote(workOrderId: string, body: string, actor: StaffUser) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true } });
  if (!wo) throw new AppError("notFound", {}, 404);
  await prisma.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", body } });
}
