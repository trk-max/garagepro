import "server-only";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit, type AuditActor } from "@/server/audit";

export async function listParts(q?: string, lowOnly = false) {
  const query = q?.trim();
  const parts = await prisma.part.findMany({
    where: {
      isActive: true,
      ...(query
        ? {
            OR: [
              { sku: { contains: query, mode: "insensitive" } },
              { name: { contains: query, mode: "insensitive" } },
              { brand: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 500,
  });
  return lowOnly ? parts.filter(isLow) : parts;
}

export const isLow = (p: { stockX100: number; minStockX100: number }) => p.stockX100 <= p.minStockX100;

export async function lowStockParts() {
  const parts = await prisma.part.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return parts.filter(isLow);
}

export async function partOptions() {
  return prisma.part.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, brand: true, salePrice: true, costPrice: true, stockX100: true, unit: true },
    orderBy: { name: "asc" },
  });
}

export type PartOption = Awaited<ReturnType<typeof partOptions>>[number];

export async function recentMovements(limit = 30) {
  return prisma.stockMovement.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      part: { select: { sku: true, name: true } },
      workOrder: { select: { id: true, number: true } },
      actor: { select: { name: true } },
      supplier: { select: { name: true } },
      correctedBy: { select: { id: true } },
    },
  });
}

export async function createPart(
  input: { sku: string; name: string; brand?: string; unit: string; costPrice?: number; salePrice: number; stock?: number; minStock?: number },
  actor: StaffUser,
) {
  return prisma.$transaction(async (tx) => {
    const part = await tx.part.create({
      data: {
        sku: input.sku,
        name: input.name,
        brand: input.brand,
        unit: input.unit,
        costPrice: input.costPrice ?? 0,
        salePrice: input.salePrice,
        stockX100: input.stock ?? 0,
        minStockX100: input.minStock ?? 0,
      },
      select: { id: true },
    });
    if (input.stock) {
      await tx.stockMovement.create({ data: { partId: part.id, deltaX100: input.stock, reason: "PURCHASE", actorId: actor.id, note: "Stock initial" } });
    }
    await audit(tx, actor, "part.create", "Part", part.id, { after: input });
    return part;
  });
}

const PART_AUDIT = { sku: true, name: true, brand: true, unit: true, costPrice: true, salePrice: true, minStockX100: true } as const;

export async function updatePart(id: string, data: Prisma.PartUpdateInput, actor: StaffUser) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.part.findUnique({ where: { id }, select: PART_AUDIT });
    if (!before) throw new AppError("notFound", {}, 404);
    const after = await tx.part.update({ where: { id }, data, select: PART_AUDIT });
    await audit(tx, actor, "part.update", "Part", id, { before, after });
  });
}

type Tx = Prisma.TransactionClient;

/**
 * Atomic stock change, checked by the UPDATE itself (no read-then-write race):
 * an exit is refused when it would take parts reserved for a repair or go below
 * zero. Two simultaneous exits of the last free unit: the second matches 0 rows.
 * Returns the new stock, or null when refused.
 */
async function applyDelta(tx: Tx, partId: string, delta: number) {
  const rows = await tx.$queryRaw<{ stockX100: number; reservedX100: number }[]>`
    UPDATE "Part" SET "stockX100" = "stockX100" + ${delta}, "updatedAt" = now()
    WHERE id = ${partId} AND (${delta} >= 0 OR "stockX100" - "reservedX100" + ${delta} >= 0)
    RETURNING "stockX100", "reservedX100"`;
  return rows[0] ?? null;
}

async function refuse(tx: Tx, partId: string): Promise<never> {
  const part = await tx.part.findUnique({ where: { id: partId }, select: { stockX100: true, reservedX100: true } });
  if (!part) throw new AppError("notFound", {}, 404);
  throw new AppError("insufficientStock", { stock: (part.stockX100 - part.reservedX100) / 100 }, 409);
}

export type ManualReason = "PURCHASE" | "ADJUSTMENT" | "SUPPLIER_RETURN";

/** Manual movement from the stock page: entry, stocktake adjustment, or return to a supplier. */
export async function moveStock(
  partId: string,
  input: { delta: number; reason: ManualReason; note?: string; supplierId?: string | null },
  actor: StaffUser,
) {
  if (input.delta === 0) throw new AppError("invalid", {}, 422);
  // A return to the supplier always takes parts out, and says to whom.
  if (input.reason === "SUPPLIER_RETURN" && (input.delta > 0 || !input.supplierId)) throw new AppError("supplierReturnInvalid", {}, 422);
  await prisma.$transaction(async (tx) => {
    const after = await applyDelta(tx, partId, input.delta);
    if (!after) await refuse(tx, partId);
    const movement = await tx.stockMovement.create({
      data: {
        partId,
        deltaX100: input.delta,
        reason: input.reason,
        note: input.note,
        supplierId: input.reason === "SUPPLIER_RETURN" ? input.supplierId : null,
        actorId: actor.id,
      },
      select: { id: true },
    });
    await audit(tx, actor, input.reason === "SUPPLIER_RETURN" ? "stock.supplierReturn" : "stock.manual", "StockMovement", movement.id, {
      before: { partId, stockX100: after!.stockX100 - input.delta },
      after: { partId, deltaX100: input.delta, reason: input.reason, supplierId: input.supplierId ?? null, note: input.note ?? null, stockX100: after!.stockX100 },
    });
  });
}

const CORRECTABLE = ["PURCHASE", "ADJUSTMENT", "SUPPLIER_RETURN"] as const;

/**
 * Corrects a wrong manual movement: a CORRECTION movement of the opposite
 * quantity, linked to the original (which stays in the history). One correction
 * per movement (unique link in the database). Repair and goods-receipt movements
 * are corrected from their own documents, not here.
 */
export async function correctMovement(actor: StaffUser, movementId: string, reason: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const m = await tx.stockMovement.findUnique({ where: { id: movementId }, select: { id: true, partId: true, deltaX100: true, reason: true, correctedBy: { select: { id: true } } } });
      if (!m) throw new AppError("notFound", {}, 404);
      if (!(CORRECTABLE as readonly string[]).includes(m.reason)) throw new AppError("notCorrectable", {}, 409);
      if (m.correctedBy) throw new AppError("alreadyCorrected", {}, 409);
      const after = await applyDelta(tx, m.partId, -m.deltaX100);
      if (!after) await refuse(tx, m.partId);
      const correction = await tx.stockMovement.create({
        data: { partId: m.partId, deltaX100: -m.deltaX100, reason: "CORRECTION", correctsId: m.id, note: reason, actorId: actor.id },
        select: { id: true },
      });
      await audit(tx, actor, "stock.correct", "StockMovement", correction.id, {
        before: { movementId: m.id, reason: m.reason, deltaX100: m.deltaX100, stockX100: after!.stockX100 + m.deltaX100 },
        after: { deltaX100: -m.deltaX100, note: reason, stockX100: after!.stockX100 },
      });
      return correction;
    });
  } catch (error) {
    // Two people correcting the same movement at once: the unique link refuses the second.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError("alreadyCorrected", {}, 409);
    throw error;
  }
}

// ── Reservations (parts put aside for a repair) ─────────────────────────────

export async function listReservations(workOrderId: string) {
  return prisma.stockReservation.findMany({
    where: { workOrderId },
    orderBy: { createdAt: "asc" },
    include: { part: { select: { sku: true, name: true, unit: true } } },
  });
}

export async function reservePart(actor: StaffUser, workOrderId: string, partId: string, quantityX100: number) {
  if (quantityX100 <= 0) throw new AppError("invalid", {}, 422);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.status === "DELIVERED" || wo.status === "CLOSED" || wo.status === "CANCELLED") throw new AppError("final", {}, 409);
    // Atomic: only if that quantity is still free (stock − already reserved).
    const rows = await tx.$queryRaw<{ stockX100: number; reservedX100: number }[]>`
      UPDATE "Part" SET "reservedX100" = "reservedX100" + ${quantityX100}, "updatedAt" = now()
      WHERE id = ${partId} AND "isActive" AND "stockX100" - "reservedX100" >= ${quantityX100}
      RETURNING "stockX100", "reservedX100"`;
    if (!rows[0]) await refuse(tx, partId);
    const reservation = await tx.stockReservation.create({ data: { partId, workOrderId, quantityX100, createdById: actor.id }, select: { id: true } });
    await audit(tx, actor, "stock.reserve", "StockReservation", reservation.id, { after: { workOrderId, partId, quantityX100, reservedX100: rows[0]!.reservedX100 } });
    return reservation;
  });
}

async function unreserve(tx: Tx, partId: string, quantityX100: number) {
  await tx.$executeRaw`UPDATE "Part" SET "reservedX100" = GREATEST(0, "reservedX100" - ${quantityX100}), "updatedAt" = now() WHERE id = ${partId}`;
}

/** Frees a reservation (no longer needed). Conditional: a reservation is released once. */
export async function releaseReservation(actor: StaffUser | null, reservationId: string, note: string) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.stockReservation.findUnique({ where: { id: reservationId } });
    if (!r) throw new AppError("notFound", {}, 404);
    const { count } = await tx.stockReservation.updateMany({ where: { id: reservationId, status: "ACTIVE" }, data: { status: "RELEASED", closedAt: new Date(), closedNote: note } });
    if (count === 0) throw new AppError("reservationClosed", {}, 409);
    await unreserve(tx, r.partId, r.quantityX100);
    await audit(tx, actor, "stock.release", "StockReservation", r.id, { before: { status: "ACTIVE", quantityX100: r.quantityX100 }, after: { status: "RELEASED", note } });
    return r.workOrderId;
  });
}

/**
 * The part is now used on the repair: its reservation for this order is
 * consumed (in full or in part), so the same units are not counted twice
 * (once reserved, once taken out).
 */
export async function consumeReservations(tx: Tx, actor: AuditActor, workOrderId: string, partId: string, quantityX100: number, lineId?: string) {
  let remaining = quantityX100;
  // V16 Lot 2: a quote line's own reservation first, then the ones made by hand for the order; never the
  // reservation of ANOTHER quote line (it is released or consumed with that line).
  const found = await tx.stockReservation.findMany({
    where: { workOrderId, partId, status: "ACTIVE", OR: [{ workOrderLineId: null }, ...(lineId ? [{ workOrderLineId: lineId }] : [])] },
    orderBy: { createdAt: "asc" },
  });
  const active = [...found.filter((r) => r.workOrderLineId), ...found.filter((r) => !r.workOrderLineId)];
  for (const r of active) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, r.quantityX100);
    if (take === r.quantityX100) {
      await tx.stockReservation.update({ where: { id: r.id }, data: { status: "CONSUMED", closedAt: new Date() } });
    } else {
      await tx.stockReservation.update({ where: { id: r.id }, data: { quantityX100: r.quantityX100 - take } });
    }
    await unreserve(tx, partId, take);
    await audit(tx, actor, "stock.consumeReservation", "StockReservation", r.id, { after: { workOrderId, partId, quantityX100: take } });
    remaining -= take;
  }
}

// ── V16 Lot 2 — parts of a quote line: reserved until the customer's decision, taken out at the agreement ──

/**
 * Movement of a repair order (exit WORK_ORDER / return WORK_ORDER_RETURN), journalised. Same behaviour as
 * before (an exit is allowed even when the recorded stock is short: the part may be on the shelf). Returns
 * the new stock.
 */
export async function workOrderStockMove(
  tx: Tx,
  actor: AuditActor,
  input: { partId: string; deltaX100: number; reason: "WORK_ORDER" | "WORK_ORDER_RETURN"; workOrderId: string },
) {
  const updated = await tx.part.update({
    where: { id: input.partId },
    data: { stockX100: { increment: input.deltaX100 } },
    select: { stockX100: true },
  });
  const movement = await tx.stockMovement.create({ data: { ...input, actorId: actor?.id ?? null }, select: { id: true } });
  await audit(tx, actor, "stock.workOrder", "StockMovement", movement.id, {
    before: { stockX100: updated.stockX100 - input.deltaX100 },
    after: { ...input, stockX100: updated.stockX100 },
  });
  return updated.stockX100;
}

/**
 * A part proposed on a quote (V16 order): put aside, not taken out. Reservations made by hand for this order
 * and this part are attached to the line first (whole reservations only), then what is still free is reserved,
 * atomically (row lock). Returns the quantity that could NOT be reserved (0 = fully reserved): the caller warns.
 */
export async function reserveForLine(tx: Tx, actor: AuditActor, input: { workOrderId: string; partId: string; lineId: string; quantityX100: number }) {
  let remaining = input.quantityX100;
  const manual = await tx.stockReservation.findMany({ where: { workOrderId: input.workOrderId, partId: input.partId, status: "ACTIVE", workOrderLineId: null }, orderBy: { createdAt: "asc" } });
  for (const r of manual) {
    if (r.quantityX100 > remaining) continue;
    await tx.stockReservation.update({ where: { id: r.id }, data: { workOrderLineId: input.lineId } });
    remaining -= r.quantityX100;
  }
  if (remaining <= 0) return 0;
  return reserveFree(tx, actor, { workOrderId: input.workOrderId, partId: input.partId, lineId: input.lineId, quantityX100: remaining });
}

/**
 * Reserves for an order (and a line, if given) what is still FREE of a part, up to the quantity, atomically
 * (row lock). Returns the quantity that could NOT be reserved. Shared by the quote lines (Lot 2) and the goods
 * receipt that brings a missing part in for an order (V16 Lot 3).
 */
export async function reserveFree(tx: Tx, actor: AuditActor, input: { workOrderId: string; partId: string; lineId?: string | null; quantityX100: number }) {
  if (input.quantityX100 <= 0) return 0;
  const rows = await tx.$queryRaw<{ take: number; reservedX100: number }[]>`
    WITH p AS (SELECT id, LEAST(${input.quantityX100}::int, GREATEST(0, "stockX100" - "reservedX100")) AS take FROM "Part" WHERE id = ${input.partId} FOR UPDATE)
    UPDATE "Part" SET "reservedX100" = "Part"."reservedX100" + p.take, "updatedAt" = now()
    FROM p WHERE "Part".id = p.id
    RETURNING p.take AS take, "Part"."reservedX100" AS "reservedX100"`;
  const take = Number(rows[0]?.take ?? 0);
  if (take > 0) {
    const reservation = await tx.stockReservation.create({
      data: { partId: input.partId, workOrderId: input.workOrderId, workOrderLineId: input.lineId ?? null, quantityX100: take, createdById: actor?.id ?? null },
      select: { id: true },
    });
    await audit(tx, actor, "stock.reserve", "StockReservation", reservation.id, {
      after: { workOrderId: input.workOrderId, partId: input.partId, lineId: input.lineId ?? null, quantityX100: take, reservedX100: rows[0]!.reservedX100 },
    });
  }
  return input.quantityX100 - take;
}

/** The customer refused (or the line was removed): what was put aside for this quote line becomes free again. */
export async function releaseForLine(tx: Tx, actor: AuditActor, lineId: string, note: string) {
  const active = await tx.stockReservation.findMany({ where: { workOrderLineId: lineId, status: "ACTIVE" } });
  for (const r of active) {
    const { count } = await tx.stockReservation.updateMany({ where: { id: r.id, status: "ACTIVE" }, data: { status: "RELEASED", closedAt: new Date(), closedNote: note } });
    if (!count) continue;
    await unreserve(tx, r.partId, r.quantityX100);
    await audit(tx, actor, "stock.release", "StockReservation", r.id, { before: { status: "ACTIVE", quantityX100: r.quantityX100 }, after: { status: "RELEASED", note, lineId } });
  }
}

/** Repair delivered or cancelled: what is still reserved for it goes back to "available". */
export async function releaseAllFor(tx: Tx, actor: AuditActor, workOrderId: string, note: string) {
  const active = await tx.stockReservation.findMany({ where: { workOrderId, status: "ACTIVE" } });
  for (const r of active) {
    await tx.stockReservation.update({ where: { id: r.id }, data: { status: "RELEASED", closedAt: new Date(), closedNote: note } });
    await unreserve(tx, r.partId, r.quantityX100);
    await audit(tx, actor, "stock.release", "StockReservation", r.id, { before: { status: "ACTIVE", quantityX100: r.quantityX100 }, after: { status: "RELEASED", note } });
  }
}
