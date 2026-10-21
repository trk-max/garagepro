import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/http";
import { can, overridesFrom, type Permission, type PermOverrides } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * `perms` = the user's own overrides (V10.3, table UserPermission). Pass the whole StaffUser to
 * `can(staff, …)` so they apply; `can(staff, …)` keeps the role-only answer.
 */
export type StaffUser = { id: string; name: string; email: string; role: Role; perms?: PermOverrides };

/**
 * Signed-in team member, re-checked against the database on every request:
 * a cookie for a deleted or deactivated user (e.g. after `db:reset`, or a
 * session left over from another app on localhost:3000) is treated as signed out.
 */
export const getStaff = cache(async (): Promise<StaffUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true, permissionOverrides: { select: { permission: true, effect: true } } },
  });
  if (!user || !user.isActive) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, perms: overridesFrom(user.permissionOverrides) };
});

/** Any signed-in team member. */
export async function requireStaff(): Promise<StaffUser> {
  const staff = await getStaff();
  if (!staff) throw new AppError("forbidden", {}, 401);
  return staff;
}

/** Restricts an action to some roles (e.g. invoicing = ADMIN + RECEPTION). */
export async function requireRole(...roles: Role[]): Promise<StaffUser> {
  const staff = await requireStaff();
  if (!roles.includes(staff.role)) throw new AppError("forbidden", {}, 403);
  return staff;
}

/** Throws 403 unless the signed-in user holds `permission` (see lib/permissions.ts). */
export async function requirePermission(permission: Permission): Promise<StaffUser> {
  const staff = await requireStaff();
  if (!can(staff, permission)) throw new AppError("forbidden", {}, 403);
  return staff;
}

/** For pages: sends users without `permission` back to the dashboard. */
export async function requirePageAccess(permission: Permission): Promise<StaffUser> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!can(staff, permission)) redirect("/garage");
  return staff;
}
