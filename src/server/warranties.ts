import "server-only";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { utcToZoned, zonedToUtc } from "@/lib/booking";
import { GARAGE_TZ } from "@/lib/format";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { addDaysToDay, addMonthsToDay, autoWarrantyTerms, canMoveClaim, claimBalance, warrantyValidity, type ClaimStatus, type Validity, type WarrantyKind } from "@/lib/warranty";
import { audit, type AuditActor } from "@/server/audit";
import { getSettings } from "@/server/settings";

/**
 * Warranties on repairs and parts (V8.4, Prompt 4/5).
 * - everybody on the floor (manageWarranties) sees warranties and claims and can open a claim,
 *   WITHOUT any amount;
 * - amounts (costs, claimed / accepted, refunds), decisions and cancellations: viewWarrantyMoney
 *   (administrator + manager). Amounts are removed on the server, not just hidden in the page.
 * Every change is written to the audit journal in the same transaction.
 */

type Db = Prisma.TransactionClient;

const dayOf = (d: Date, tz: string) => utcToZoned(d, tz).date;
/** A day typed in a form ("2026-10-21") → midday in the garage's zone (never shifts to another day). */
export const dayToInstant = (day: string, tz: string) => zonedToUtc(day, "12:00", tz);

function assertCan(actor: StaffUser, permission: "manageWarranties" | "viewWarrantyMoney") {
  if (!can(actor, permission)) throw new AppError("forbidden", {}, 403);
}

// ── Creation ────────────────────────────────────────────────────────────────

/**
 * Automatic repair warranty when a work order is DELIVERED (called inside the status-change
 * transaction). Settings warrantyMonths / warrantyKm = 0 → nothing. Idempotent: one automatic
 * warranty per work order (unique autoWorkOrderId); a second call does nothing.
 */
export async function createAutoRepairWarranty(tx: Db, actor: AuditActor, workOrderId: string, deliveredAt: Date) {
  const s = await tx.setting.findUnique({ where: { id: "garage" }, select: { warrantyMonths: true, warrantyKm: true, timezone: true } });
  if (!s) return null;
  const tz = s.timezone || GARAGE_TZ;
  const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true, number: true, vehicleId: true, customerId: true, mileageIn: true, vehicle: { select: { mileage: true } } } });
  if (!wo) return null;
  const terms = autoWarrantyTerms(s, dayOf(deliveredAt, tz), wo.mileageIn ?? wo.vehicle.mileage ?? null);
  if (!terms) return null;
  const existing = await tx.warranty.findUnique({ where: { autoWorkOrderId: workOrderId }, select: { id: true } });
  if (existing) return existing;
  const w = await tx.warranty.create({
    data: {
      kind: "REPAIR",
      workOrderId,
      vehicleId: wo.vehicleId,
      customerId: wo.customerId,
      label: `OR-${String(wo.number).padStart(4, "0")}`,
      startsAt: deliveredAt,
      endsAt: terms.endDay ? dayToInstant(terms.endDay, tz) : null,
      startKm: terms.startKm,
      endKm: terms.endKm,
      autoWorkOrderId: workOrderId,
      createdById: actor?.id ?? null,
    },
    select: { id: true },
  });
  await audit(tx, actor, "warranty.auto", "Warranty", w.id, { after: { workOrderId, months: s.warrantyMonths, km: s.warrantyKm, endDay: terms.endDay, endKm: terms.endKm, kmMissing: terms.kmMissing } });
  return w;
}

export type NewWarranty = {
  kind: WarrantyKind;
  label: string;
  months?: number;
  endDate?: string;
  km?: number;
  supplierId?: string;
  lineId?: string;
  terms?: string;
};

/** A warranty added by hand on a repair (REPAIR = the garage's own, PART = the supplier's). */
export async function createWarranty(actor: StaffUser, workOrderId: string, input: NewWarranty) {
  assertCan(actor, "manageWarranties");
  if (!input.months && !input.endDate && !input.km) throw new AppError("warrantyLimit", {}, 422);
  if (input.kind === "PART" && !input.supplierId) throw new AppError("warrantySupplier", {}, 422);
  const settings = await getSettings();
  const tz = settings.timezone || GARAGE_TZ;
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, vehicleId: true, customerId: true, mileageIn: true, deliveredAt: true, createdAt: true, vehicle: { select: { mileage: true } } },
    });
    if (!wo) throw new AppError("notFound", {}, 404);
    let partId: string | null = null;
    if (input.lineId) {
      const line = await tx.workOrderLine.findUnique({ where: { id: input.lineId }, select: { workOrderId: true, type: true, partId: true } });
      if (!line || line.workOrderId !== workOrderId || line.type !== "PART") throw new AppError("invalid", {}, 422);
      partId = line.partId;
    }
    if (input.supplierId) {
      const sup = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
      if (!sup) throw new AppError("invalid", {}, 422);
    }
    const startsAt = wo.deliveredAt ?? new Date();
    const startDay = dayOf(startsAt, tz);
    const startKm = wo.mileageIn ?? wo.vehicle.mileage ?? null;
    if (input.km && startKm === null) throw new AppError("warrantyNoKm", {}, 422);
    const fromMonths = input.months ? addDaysToDay(addMonthsToDay(startDay, input.months), -1) : null;
    // Both given: the earlier date is the real limit.
    const endDay = [fromMonths, input.endDate ?? null].filter((d): d is string => !!d).sort()[0] ?? null;
    if (endDay !== null && endDay < startDay) throw new AppError("warrantyLimit", {}, 422);
    const data = {
      kind: input.kind,
      workOrderId,
      vehicleId: wo.vehicleId,
      customerId: wo.customerId,
      supplierId: input.supplierId || null,
      partId,
      workOrderLineId: input.lineId || null,
      label: input.label,
      startsAt,
      endsAt: endDay ? dayToInstant(endDay, tz) : null,
      startKm,
      endKm: input.km && startKm !== null ? startKm + input.km : null,
      terms: input.terms || null,
      createdById: actor.id,
    };
    const w = await tx.warranty.create({ data, select: { id: true } });
    await audit(tx, actor, "warranty.create", "Warranty", w.id, { after: { ...data, endDay } });
    return w;
  });
}

/** Never deleted: cancelled with a reason (claims stay readable). */
export async function voidWarranty(actor: StaffUser, warrantyId: string, reason: string) {
  assertCan(actor, "viewWarrantyMoney");
  return prisma.$transaction(async (tx) => {
    const old = await tx.warranty.findUnique({ where: { id: warrantyId }, select: { id: true, label: true, kind: true } });
    if (!old) throw new AppError("notFound", {}, 404);
    const { count } = await tx.warranty.updateMany({ where: { id: warrantyId, voidedAt: null }, data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason } });
    if (count === 0) throw new AppError("alreadyVoided", {}, 409);
    await audit(tx, actor, "warranty.void", "Warranty", warrantyId, { before: old, after: { voided: true, reason } });
  });
}

// ── Reading (amounts removed for roles without viewWarrantyMoney) ───────────

const warrantySelect = {
  id: true,
  kind: true,
  label: true,
  terms: true,
  startsAt: true,
  endsAt: true,
  startKm: true,
  endKm: true,
  autoWorkOrderId: true,
  voidedAt: true,
  voidReason: true,
  createdAt: true,
  workOrderLineId: true,
  workOrder: { select: { id: true, number: true } },
  vehicle: { select: { id: true, plate: true, make: true, model: true, mileage: true } },
  customer: { select: { id: true, name: true, phone: true } },
  supplier: { select: { id: true, name: true } },
  part: { select: { id: true, sku: true, name: true } },
} satisfies Prisma.WarrantySelect;

type WarrantyRow = Prisma.WarrantyGetPayload<{ select: typeof warrantySelect }>;

function validityOf(w: WarrantyRow, today: string, tz: string): Validity {
  return warrantyValidity({ startDay: dayOf(w.startsAt, tz), endDay: w.endsAt ? dayOf(w.endsAt, tz) : null, endKm: w.endKm, voided: !!w.voidedAt }, today, w.vehicle.mileage);
}

export type ClaimMoney = { costParts: number; costLabor: number; amountClaimed: number; amountAccepted: number | null; received: number; expected: number };

export type WarrantyFilter = "active" | "expired" | "claims" | "all";

export async function listWarranties(actor: StaffUser, opts: { filter?: WarrantyFilter; vehicleId?: string; workOrderId?: string; now?: Date } = {}) {
  assertCan(actor, "manageWarranties");
  const settings = await getSettings();
  const tz = settings.timezone || GARAGE_TZ;
  const today = dayOf(opts.now ?? new Date(), tz);
  const rows = await prisma.warranty.findMany({
    where: { ...(opts.vehicleId ? { vehicleId: opts.vehicleId } : {}), ...(opts.workOrderId ? { workOrderId: opts.workOrderId } : {}) },
    select: { ...warrantySelect, claims: { select: { id: true, status: true } } },
    orderBy: { startsAt: "desc" },
    take: 500,
  });
  const out = rows.map((w) => ({
    ...w,
    validity: validityOf(w, today, tz),
    startDay: dayOf(w.startsAt, tz),
    endDay: w.endsAt ? dayOf(w.endsAt, tz) : null,
    openClaims: w.claims.filter((c) => c.status !== "CLOSED" && c.status !== "REJECTED").length,
  }));
  const f = opts.filter ?? "all";
  if (f === "active") return out.filter((w) => w.validity.status === "ACTIVE" || w.validity.status === "UNKNOWN");
  if (f === "expired") return out.filter((w) => w.validity.status === "EXPIRED" || w.validity.status === "VOID");
  if (f === "claims") return out.filter((w) => w.openClaims > 0);
  return out;
}

/** One warranty with its claims. `money` is null for roles that may not see amounts. */
export async function getWarranty(actor: StaffUser, warrantyId: string, now = new Date()) {
  assertCan(actor, "manageWarranties");
  const showMoney = can(actor, "viewWarrantyMoney");
  const settings = await getSettings();
  const tz = settings.timezone || GARAGE_TZ;
  const w = await prisma.warranty.findUnique({
    where: { id: warrantyId },
    select: { ...warrantySelect, claims: { orderBy: { openedAt: "desc" }, include: { refunds: { select: { amount: true, voidedAt: true } } } } },
  });
  if (!w) return null;
  const { claims, ...rest } = w;
  return {
    ...rest,
    validity: validityOf(w, dayOf(now, tz), tz),
    startDay: dayOf(w.startsAt, tz),
    endDay: w.endsAt ? dayOf(w.endsAt, tz) : null,
    claims: claims.map((c) => ({
      id: c.id,
      number: c.number,
      status: c.status,
      openedAt: c.openedAt,
      description: c.description,
      decidedAt: c.decidedAt,
      money: showMoney ? moneyOf(c, c.refunds) : null,
    })),
  };
}

function moneyOf(c: { status: string; costParts: number; costLabor: number; amountClaimed: number; amountAccepted: number | null }, refunds: { amount: number; voidedAt: Date | null }[]): ClaimMoney {
  const b = claimBalance(c, refunds.map((r) => ({ amount: r.amount, voided: !!r.voidedAt })));
  return { costParts: c.costParts, costLabor: c.costLabor, amountClaimed: c.amountClaimed, amountAccepted: c.amountAccepted, received: b.received, expected: b.expected };
}

/** One claim. Without viewWarrantyMoney: no amount, no refund, no decision text. */
export async function getClaim(actor: StaffUser, claimId: string) {
  assertCan(actor, "manageWarranties");
  const showMoney = can(actor, "viewWarrantyMoney");
  const c = await prisma.warrantyClaim.findUnique({
    where: { id: claimId },
    include: { refunds: { orderBy: { receivedAt: "desc" } }, warranty: { select: { ...warrantySelect } } },
  });
  if (!c) return null;
  const names = await prisma.user.findMany({ where: { id: { in: [c.openedById, c.decidedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const nameOf = (uid: string | null) => (uid ? (names.find((n) => n.id === uid)?.name ?? null) : null);
  return {
    id: c.id,
    number: c.number,
    status: c.status as ClaimStatus,
    openedAt: c.openedAt,
    openedBy: nameOf(c.openedById),
    description: c.description,
    submittedAt: c.submittedAt,
    decidedAt: c.decidedAt,
    decidedBy: nameOf(c.decidedById),
    closedAt: c.closedAt,
    warranty: c.warranty,
    decision: showMoney ? c.decision : null,
    money: showMoney ? moneyOf(c, c.refunds) : null,
    refunds: showMoney ? c.refunds : null,
  };
}

// ── Claims ──────────────────────────────────────────────────────────────────

/** Anybody on the floor can open a claim on a warranty that is still valid (or not determinable). */
export async function openClaim(actor: StaffUser, warrantyId: string, description: string, now = new Date()) {
  assertCan(actor, "manageWarranties");
  const settings = await getSettings();
  const tz = settings.timezone || GARAGE_TZ;
  return prisma.$transaction(async (tx) => {
    const w = await tx.warranty.findUnique({ where: { id: warrantyId }, select: warrantySelect });
    if (!w) throw new AppError("notFound", {}, 404);
    const v = validityOf(w, dayOf(now, tz), tz);
    if (v.status === "VOID") throw new AppError("warrantyVoided", {}, 409);
    if (v.status === "EXPIRED") throw new AppError("warrantyExpired", {}, 409);
    const c = await tx.warrantyClaim.create({ data: { warrantyId, description, openedById: actor.id, openedAt: now }, select: { id: true, number: true } });
    await audit(tx, actor, "warrantyClaim.open", "WarrantyClaim", c.id, { after: { warrantyId, number: c.number, description } });
    return c;
  });
}

/** Costs and amount claimed (money roles), while the claim is not closed. */
export async function setClaimAmounts(actor: StaffUser, claimId: string, input: { costParts: number; costLabor: number; amountClaimed: number }) {
  assertCan(actor, "viewWarrantyMoney");
  return prisma.$transaction(async (tx) => {
    const old = await tx.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, costParts: true, costLabor: true, amountClaimed: true } });
    if (!old) throw new AppError("notFound", {}, 404);
    if (old.status === "CLOSED") throw new AppError("claimClosed", {}, 409);
    await tx.warrantyClaim.update({ where: { id: claimId }, data: input });
    await audit(tx, actor, "warrantyClaim.amounts", "WarrantyClaim", claimId, { before: { costParts: old.costParts, costLabor: old.costLabor, amountClaimed: old.amountClaimed }, after: input });
  });
}

/**
 * Status change (money roles): OPEN → SUBMITTED → ACCEPTED | PARTIAL | REJECTED → CLOSED.
 * ACCEPTED: accepted = the amount given, or the amount claimed. PARTIAL: an amount > 0 is required.
 * REJECTED: accepted = 0. Conditional write: two simultaneous decisions cannot both pass.
 */
export async function moveClaim(actor: StaffUser, claimId: string, to: ClaimStatus, input: { decision?: string | null; amountAccepted?: number | null } = {}) {
  assertCan(actor, "viewWarrantyMoney");
  return prisma.$transaction(async (tx) => {
    const c = await tx.warrantyClaim.findUnique({ where: { id: claimId }, select: { status: true, amountClaimed: true, amountAccepted: true, decision: true } });
    if (!c) throw new AppError("notFound", {}, 404);
    if (!canMoveClaim(c.status, to)) throw new AppError("claimTransition", {}, 409);
    const now = new Date();
    const data: Prisma.WarrantyClaimUpdateManyMutationInput = { status: to };
    if (to === "SUBMITTED") data.submittedAt = now;
    if (to === "ACCEPTED" || to === "PARTIAL" || to === "REJECTED") {
      let accepted: number;
      if (to === "REJECTED") accepted = 0;
      else if (to === "PARTIAL") {
        if (!input.amountAccepted || input.amountAccepted <= 0) throw new AppError("claimAmount", {}, 422);
        accepted = input.amountAccepted;
      } else accepted = input.amountAccepted ?? c.amountClaimed;
      // A typo (5 000 instead of 500) would inflate the expected refunds of the cash forecast.
      if (c.amountClaimed > 0 && accepted > c.amountClaimed) throw new AppError("claimAmountTooHigh", {}, 422);
      Object.assign(data, { amountAccepted: accepted, decidedAt: now, decidedById: actor.id, decision: input.decision?.trim() || null });
    }
    if (to === "CLOSED") data.closedAt = now;
    const { count } = await tx.warrantyClaim.updateMany({ where: { id: claimId, status: c.status }, data });
    if (count === 0) throw new AppError("claimTransition", {}, 409);
    await audit(tx, actor, "warrantyClaim.status", "WarrantyClaim", claimId, { before: { status: c.status, amountAccepted: c.amountAccepted }, after: data });
  });
}

/** Money really received from the supplier (or insurer) for an accepted claim. */
export async function addRefund(actor: StaffUser, claimId: string, input: { amount: number; receivedDay: string; method: PaymentMethod; reference?: string | null }) {
  assertCan(actor, "viewWarrantyMoney");
  const settings = await getSettings();
  const tz = settings.timezone || GARAGE_TZ;
  return prisma.$transaction(async (tx) => {
    // Row lock on the claim: two refunds typed at the same time are checked one after the other.
    const c = await tx.warrantyClaim.update({ where: { id: claimId }, data: { updatedAt: new Date() }, select: { status: true, amountAccepted: true, refunds: { select: { amount: true, voidedAt: true } } } })
      .catch((e: { code?: string }) => {
        if (e?.code === "P2025") return null; // no such claim
        throw e; // database error: shown as such, not as "not found"
      });
    if (!c) throw new AppError("notFound", {}, 404);
    if (c.status !== "ACCEPTED" && c.status !== "PARTIAL") throw new AppError("refundNotAccepted", {}, 409);
    const b = claimBalance(c, c.refunds.map((r) => ({ amount: r.amount, voided: !!r.voidedAt })));
    if (input.amount > b.expected) throw new AppError("refundTooHigh", { max: (b.expected / 1000).toFixed(3) }, 422);
    const r = await tx.warrantyRefund.create({
      data: { claimId, amount: input.amount, receivedAt: dayToInstant(input.receivedDay, tz), method: input.method, reference: input.reference || null, createdById: actor.id },
      select: { id: true },
    });
    await audit(tx, actor, "warrantyRefund.add", "WarrantyRefund", r.id, { after: { claimId, ...input } });
    return r;
  });
}

export async function voidRefund(actor: StaffUser, refundId: string, reason: string) {
  assertCan(actor, "viewWarrantyMoney");
  return prisma.$transaction(async (tx) => {
    const old = await tx.warrantyRefund.findUnique({ where: { id: refundId }, select: { claimId: true, amount: true, receivedAt: true } });
    if (!old) throw new AppError("notFound", {}, 404);
    const { count } = await tx.warrantyRefund.updateMany({ where: { id: refundId, voidedAt: null }, data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason } });
    if (count === 0) throw new AppError("alreadyVoided", {}, 409);
    await audit(tx, actor, "warrantyRefund.void", "WarrantyRefund", refundId, { before: old, after: { voided: true, reason } });
    return old.claimId;
  });
}

/** Claim ids / warranty ids the pages link to, for revalidation. */
export async function warrantyIdOfClaim(claimId: string) {
  return (await prisma.warrantyClaim.findUnique({ where: { id: claimId }, select: { warrantyId: true } }))?.warrantyId ?? null;
}
