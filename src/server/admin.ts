import "server-only";
import type { LineType, Role } from "@prisma/client";
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
  await prisma.user.update({ where: { id: userId }, data: { isActive } });
}
