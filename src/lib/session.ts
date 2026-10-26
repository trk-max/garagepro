import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/http";
import { can, type Permission, type PermOverrides } from "@/lib/permissions";
import { staffFromSession } from "@/server/staff-session";

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
  // Same single lookup as before, plus the session version: a cookie older than the last « Déconnexion »
  // of this account (another tab, the phone…) is treated as signed out (server/staff-session.ts).
  return staffFromSession(session?.user);
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
