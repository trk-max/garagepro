import "server-only";
import { audit, type AuditActor } from "@/server/audit";
import type { LineType, Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AppError } from "@/lib/http";
import { assertAdminKeepsTeam } from "@/server/access";
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

export async function createPackage(input: { name: string; description?: string }, actor: AuditActor) {
  return prisma.$transaction(async (tx) => {
    const pkg = await tx.servicePackage.create({ data: input, select: { id: true } });
    await audit(tx, actor, "package.create", "ServicePackage", pkg.id, { after: input });
    return pkg;
  });
}

export async function addPackageLine(
  packageId: string,
  input: { type: LineType; partId?: string; description?: string; quantityX100: number; unitPrice?: number },
  actor: AuditActor,
) {
  let description = input.description;
  if (input.type === "PART" && input.partId) {
    const part = await prisma.part.findUnique({ where: { id: input.partId }, select: { name: true } });
    if (!part) throw new AppError("notFound", {}, 404);
    description ??= part.name;
  }
  if (!description) throw new AppError("invalid");
  if (input.type === "PART" && !input.partId && input.unitPrice === undefined) throw new AppError("invalid");

  await prisma.$transaction(async (tx) => {
    const position = await tx.packageLine.count({ where: { packageId } });
    const data = {
      packageId,
      type: input.type,
      partId: input.type === "PART" ? (input.partId ?? null) : null,
      description: description!,
      quantityX100: input.quantityX100,
      unitPrice: input.unitPrice ?? null,
      position,
    };
    const line = await tx.packageLine.create({ data, select: { id: true } });
    await audit(tx, actor, "package.addLine", "ServicePackage", packageId, { after: { lineId: line.id, ...data } });
  });
}

export async function removePackageLine(lineId: string, actor: AuditActor) {
  await prisma.$transaction(async (tx) => {
    const line = await tx.packageLine.findUnique({ where: { id: lineId } });
    if (!line) throw new AppError("notFound", {}, 404);
    await tx.packageLine.delete({ where: { id: lineId } });
    await audit(tx, actor, "package.removeLine", "ServicePackage", line.packageId, { before: line });
  });
}

export async function archivePackage(packageId: string, actor: AuditActor) {
  await prisma.$transaction(async (tx) => {
    await tx.servicePackage.update({ where: { id: packageId }, data: { isActive: false } });
    await audit(tx, actor, "package.archive", "ServicePackage", packageId, { after: { isActive: false } });
  });
}

// ── Staff ────────────────────────────────────────────────────────────────────

export async function listStaff() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, phone: true, isActive: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

// Staff changes go to the journal; passwords never do (only "it changed").

export async function createStaff(input: { name: string; email: string; phone?: string; role: Role; password: string }, actor: AuditActor) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, phone: input.phone, role: input.role, passwordHash },
      select: { id: true },
    });
    await audit(tx, actor, "staff.create", "User", user.id, { after: { name: input.name, email: input.email, phone: input.phone ?? null, role: input.role } });
  });
}

export async function setStaffActive(userId: string, isActive: boolean, actor: AuditActor) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    if (!user) throw new AppError("notFound", {}, 404);
    if (!isActive && user.role === "ADMIN" && user.isActive) await assertAnotherAdmin(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    await audit(tx, actor, isActive ? "staff.activate" : "staff.deactivate", "User", userId, { before: { isActive: user.isActive }, after: { isActive } });
  });
}

type Tx = Prisma.TransactionClient;

/**
 * The garage must always keep at least one active admin (otherwise nobody can manage it).
 * V10.3: an admin whose manageTeam is refused by a custom access does not count.
 */
async function assertAnotherAdmin(tx: Tx, exceptUserId: string) {
  await assertAdminKeepsTeam(tx, exceptUserId);
}

/** Change a team member's role. An admin cannot change their own role (no accidental lock-out). */
export async function setStaffRole(actor: { id: string; name: string }, userId: string, role: Role) {
  if (actor.id === userId) throw new AppError("ownRole", {}, 403);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    if (!user) throw new AppError("notFound", {}, 404);
    if (user.role === "ADMIN" && role !== "ADMIN" && user.isActive) await assertAnotherAdmin(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { role } });
    await audit(tx, actor, "staff.role", "User", userId, { before: { role: user.role }, after: { role } });
  });
}

/** Set a new password (the admin gives it to the person, who can then log in with it). */
export async function setStaffPassword(userId: string, password: string, actor: AuditActor) {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await audit(tx, actor, "staff.password", "User", userId, { after: { change: "mot de passe" } });
  });
}

/**
 * Permanently remove a team member. Their history stays: work orders, payments,
 * stock movements… keep their data and simply lose the name link (onDelete: SetNull).
 * Not yourself, and never the last active admin.
 */
export async function deleteStaff(actor: { id: string; name: string }, userId: string) {
  if (actor.id === userId) throw new AppError("ownDelete", {}, 403);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true, name: true, email: true } });
    if (!user) throw new AppError("notFound", {}, 404);
    if (user.role === "ADMIN" && user.isActive) await assertAnotherAdmin(tx, userId);
    await tx.user.delete({ where: { id: userId } });
    // The journal keeps who the deleted person was (name and e-mail), since the account is gone.
    await audit(tx, actor, "staff.delete", "User", userId, { before: { name: user.name, email: user.email, role: user.role, isActive: user.isActive } });
  });
}
