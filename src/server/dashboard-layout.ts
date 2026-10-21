import "server-only";
import { Prisma } from "@prisma/client";
import { layoutSchema, layoutToStore, parseSavedLayout, type LayoutEntry } from "@/lib/dashboard-layout";
import { prisma } from "@/lib/prisma";

/**
 * V10.3 — each user's own dashboard layout (User.dashboardLayout).
 * Personal preference: no permission beyond being signed in, only the CURRENT user's row is
 * written, and it is NOT written to the audit journal (it changes nothing for anyone else).
 */

export async function getDashboardLayout(userId: string): Promise<LayoutEntry[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dashboardLayout: true } });
  return parseSavedLayout(user?.dashboardLayout ?? null);
}

/** `layout` null = back to the default layout. Unknown ids / duplicates → ZodError (422). */
export async function saveDashboardLayout(userId: string, layout: unknown): Promise<LayoutEntry[] | null> {
  if (layout === null) {
    await prisma.user.update({ where: { id: userId }, data: { dashboardLayout: Prisma.DbNull } });
    return null;
  }
  const submitted = layoutSchema.parse(layout);
  const stored = layoutToStore(submitted, await getDashboardLayout(userId));
  await prisma.user.update({ where: { id: userId }, data: { dashboardLayout: stored } });
  return stored;
}
