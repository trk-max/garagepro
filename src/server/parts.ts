import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";

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
    return part;
  });
}

export async function updatePart(id: string, data: Prisma.PartUpdateInput) {
  await prisma.part.update({ where: { id }, data });
}

export async function moveStock(
  partId: string,
  input: { delta: number; reason: "PURCHASE" | "ADJUSTMENT"; note?: string },
  actor: StaffUser,
) {
  if (input.delta === 0) throw new AppError("invalid", {}, 422);
  await prisma.$transaction(async (tx) => {
    // Manual exit: the shelf cannot go below zero. The condition is checked by the
    // UPDATE itself, so two simultaneous exits cannot both pass (atomic, no race).
    const { count } = await tx.part.updateMany({
      where: { id: partId, ...(input.delta < 0 ? { stockX100: { gte: -input.delta } } : {}) },
      data: { stockX100: { increment: input.delta } },
    });
    if (count === 0) {
      const part = await tx.part.findUnique({ where: { id: partId }, select: { stockX100: true } });
      if (!part) throw new AppError("notFound", {}, 404);
      throw new AppError("insufficientStock", { stock: part.stockX100 / 100 }, 409);
    }
    await tx.stockMovement.create({ data: { partId, deltaX100: input.delta, reason: input.reason, note: input.note, actorId: actor.id } });
  });
}
