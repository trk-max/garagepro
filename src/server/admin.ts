import "server-only";
import type { LineType, Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

// ── Service packages ─────────────────────────────────────────────────────────

export async function listPackages() {
  return prisma.servicePackage.findMany({
    where: { isActive: true },
    include: { lines: { orderBy: { position: "asc" }, include: { part: { select: { sku: true, salePrice: true } } } } },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
  });
}

export async function packageOptions() {
  return prisma.servicePackage.findMany({
    where: { isActive: true, lines: { some: {} } },
    select: { id: true, name: true },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
  });
}

export async function createPackage(input: { name: string; description?: string }) {
  return prisma.servicePackage.create({ data: input, select: { id: true } });
}

export async function addPackageLine(
  packageId: string,
  input: { type: LineType; partId?: string; description?: string; quantityX100: number; unitPrice?: number },
) {
  let description = input.description;
  if (input.type === "PART" && input.partId) {
    const part = await prisma.part.findUnique({ where: { id: input.partId }, select: { name: true } });
    if (!part) throw new AppError("notFound", {}, 404);
    description ??= part.name;
  }
  if (!description) throw new AppError("invalid");
  if (input.type === "PART" && !input.partId && input.unitPrice === undefined) throw new AppError("invalid");

  const position = await prisma.packageLine.count({ where: { packageId } });
  await prisma.packageLine.create({
    data: {
      packageId,
      type: input.type,
      partId: input.type === "PART" ? (input.partId ?? null) : null,
      description,
      quantityX100: input.quantityX100,
      unitPrice: input.unitPrice ?? null,
      position,
    },
  });
}

export async function removePackageLine(lineId: string) {
  await prisma.packageLine.delete({ where: { id: lineId } });
}

export async function archivePackage(packageId: string) {
  await prisma.servicePackage.update({ where: { id: packageId }, data: { isActive: false } });
}

// ── Staff ────────────────────────────────────────────────────────────────────

export async function listStaff() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function createStaff(input: { name: string; email: string; phone?: string; role: Role; password: string }) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.user.create({
    data: { name: input.name, email: input.email, phone: input.phone, role: input.role, passwordHash },
  });
}

export async function setStaffActive(userId: string, isActive: boolean) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    if (!user) throw new AppError("notFound", {}, 404);
    if (!isActive && user.role === "ADMIN" && user.isActive) await assertAnotherAdmin(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { isActive } });
  });
}

type Tx = Prisma.TransactionClient;

/** The garage must always keep at least one active admin (otherwise nobody can manage it). */
async function assertAnotherAdmin(tx: Tx, exceptUserId: string) {
  // Lock the admin rows so two simultaneous changes cannot remove the last two admins.
  await tx.$queryRaw`SELECT id FROM "User" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`;
  const others = await tx.user.count({ where: { role: "ADMIN", isActive: true, id: { not: exceptUserId } } });
  if (others === 0) throw new AppError("lastAdmin", {}, 409);
}

/** Change a team member's role. An admin cannot change their own role (no accidental lock-out). */
export async function setStaffRole(actorId: string, userId: string, role: Role) {
  if (actorId === userId) throw new AppError("ownRole", {}, 403);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    if (!user) throw new AppError("notFound", {}, 404);
    if (user.role === "ADMIN" && role !== "ADMIN" && user.isActive) await assertAnotherAdmin(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { role } });
  });
}

/** Set a new password (the admin gives it to the person, who can then log in with it). */
export async function setStaffPassword(userId: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

/**
 * Permanently remove a team member. Their history stays: work orders, payments,
 * stock movements… keep their data and simply lose the name link (onDelete: SetNull).
 * Not yourself, and never the last active admin.
 */
export async function deleteStaff(actorId: string, userId: string) {
  if (actorId === userId) throw new AppError("ownDelete", {}, 403);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    if (!user) throw new AppError("notFound", {}, 404);
    if (user.role === "ADMIN" && user.isActive) await assertAnotherAdmin(tx, userId);
    await tx.user.delete({ where: { id: userId } });
  });
}
