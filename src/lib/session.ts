import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/http";
import { can, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type StaffUser = { id: string; name: string; email: string; role: Role };

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
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
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
  if (!can(staff.role, permission)) throw new AppError("forbidden", {}, 403);
  return staff;
}

/** For pages: sends users without `permission` back to the dashboard. */
export async function requirePageAccess(permission: Permission): Promise<StaffUser> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!can(staff.role, permission)) redirect("/garage");
  return staff;
}
