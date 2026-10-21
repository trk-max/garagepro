import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { normaliseOverrides, SELF_PROTECTED, type OverrideChoice, type PermEffect } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";

/**
 * V10.3 — custom access per employee (table UserPermission).
 * Rule applied everywhere by `can(staff, …)`: DENY override > GRANT override > role matrix.
 * Only an ADMIN (who also holds manageTeam) may change them; every change is audited.
 */

export type OverrideMap = Record<string, PermEffect>;

/** The overrides of one employee, as { permission: "GRANT" | "DENY" }. */
export async function getUserOverrides(userId: string): Promise<OverrideMap> {
  const rows = await prisma.userPermission.findMany({ where: { userId }, select: { permission: true, effect: true }, orderBy: { permission: "asc" } });
  return Object.fromEntries(rows.map((r) => [r.permission, r.effect as PermEffect]));
}

/** Number of overrides per employee (team list chip "N accès sur mesure"). */
export async function countOverridesByUser(): Promise<Map<string, number>> {
  const rows = await prisma.userPermission.groupBy({ by: ["userId"], _count: { _all: true } });
  return new Map(rows.map((r) => [r.userId, r._count._all]));
}

/**
 * Replaces ALL the overrides of `userId` by `wanted` ({ permission: "ROLE" | "GRANT" | "DENY" };
 * missing = "ROLE"). Overrides equal to the role default are not stored.
 * Refused when:
 * - the actor is not an administrator (403 forbidden);
 * - an administrator would refuse themselves manageTeam / manageSettings (403 ownAccess);
 * - no active administrator would keep manageTeam (409 lastAdminAccess).
 */
export async function setUserPermissions(actor: StaffUser, userId: string, wanted: Record<string, OverrideChoice>): Promise<OverrideMap> {
  if (actor.role !== "ADMIN") throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) throw new AppError("notFound", {}, 404);
    const next = normaliseOverrides(user.role, wanted);
    if (actor.id === userId && next.some((o) => o.effect === "DENY" && SELF_PROTECTED.includes(o.permission))) {
      throw new AppError("ownAccess", {}, 403);
    }
    const beforeRows = await tx.userPermission.findMany({ where: { userId }, select: { permission: true, effect: true }, orderBy: { permission: "asc" } });
    const before: OverrideMap = Object.fromEntries(beforeRows.map((r) => [r.permission, r.effect as PermEffect]));
    const after: OverrideMap = Object.fromEntries(next.map((o) => [o.permission, o.effect]));

    await tx.userPermission.deleteMany({ where: { userId } });
    if (next.length > 0) {
      await tx.userPermission.createMany({ data: next.map((o) => ({ userId, permission: o.permission, effect: o.effect, grantedById: actor.id })) });
    }
    await assertAdminKeepsTeam(tx);
    await audit(tx, actor, "user.permissions", "User", userId, { before, after });
    return after;
  });
}

type Tx = Prisma.TransactionClient;

/** At least one active administrator must keep manageTeam (no DENY override on it). */
export async function assertAdminKeepsTeam(tx: Tx, exceptUserId?: string): Promise<void> {
  // Lock the admin rows so two simultaneous changes cannot remove the last two.
  await tx.$queryRaw`SELECT id FROM "User" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`;
  const keep = await tx.user.count({
    where: {
      role: "ADMIN",
      isActive: true,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      permissionOverrides: { none: { permission: "manageTeam", effect: "DENY" } },
    },
  });
  if (keep === 0) throw new AppError(exceptUserId ? "lastAdmin" : "lastAdminAccess", {}, 409);
}
