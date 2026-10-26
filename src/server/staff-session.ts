import "server-only";
import type { Role } from "@prisma/client";
import { overridesFrom, type PermOverrides } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";

/**
 * Staff sessions — « Déconnexion partout ».
 *
 * The sign-in cookie (Auth.js JWT) carries `sv`, the user's `sessionVersion` when it was issued. Signing out adds 1
 * to that version: from then on EVERY cookie of this account (other tabs, other browsers, the phone) is refused at
 * its next request, because `getStaff` reads the user row on every request anyway (same query, no extra cost).
 * Only that user is concerned. The version lives in the local database (works offline on the garage hub) and
 * travels with the "User" row to the online copy.
 */

export type SessionStaff = { id: string; name: string; email: string; role: Role; perms?: PermOverrides };

/** A cookie stays valid while its version is not older than the user's current one (older cookies have no sv = 0). */
export function sessionVersionValid(tokenVersion: number | null | undefined, userVersion: number | null | undefined): boolean {
  return (tokenVersion ?? 0) >= (userVersion ?? 0);
}

/** The team member behind a decoded session, or null (unknown, deactivated, or signed out everywhere since). */
export async function staffFromSession(user: { id?: string | null; sv?: number | null } | null | undefined): Promise<SessionStaff | null> {
  const id = user?.id;
  if (!id) return null;
  const row = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true, sessionVersion: true, permissionOverrides: { select: { permission: true, effect: true } } },
  });
  if (!row || !row.isActive || !sessionVersionValid(user?.sv, row.sessionVersion)) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role, perms: overridesFrom(row.permissionOverrides) };
}

/**
 * Ends every session of this user (all tabs, all devices): +1 on sessionVersion, journal line in the same
 * transaction. Returns the new version. Other users are untouched.
 */
export async function endStaffSessions(userId: string, opts: { ip?: string | null; reason?: "logout" } = {}): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } }, select: { id: true, name: true, sessionVersion: true } });
    await audit(tx, { id: u.id, name: u.name }, "auth.logoutEverywhere", "User", u.id, { after: { sessionVersion: u.sessionVersion, reason: opts.reason ?? "logout" }, ip: opts.ip ?? null });
    return u.sessionVersion;
  });
}
