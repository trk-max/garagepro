/**
 * V10.3 — custom access per employee and personal dashboard, on a real database.
 * Run: npm run test:db   (see vitest.db.config.ts)
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeUser, prisma } from "./helpers/db";

// Signed-in user of the session helpers (re-read from the real database by getStaff).
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (session.userId ? { user: { id: session.userId } } : null) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { getStaff, requirePageAccess, requirePermission } = await import("@/lib/session");
const { setUserPermissions, getUserOverrides } = await import("@/server/access");
const { setUserPermissionsAction } = await import("@/actions/team");
const { saveDashboardLayoutAction } = await import("@/actions/dashboard");
const { getDashboardLayout } = await import("@/server/dashboard-layout");
const { todayRevenue } = await import("@/server/dashboard-v10");
const { setStaffActive } = await import("@/server/admin");

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error).message;
  }
  return "NO ERROR";
};
const as = async (userId: string) => {
  session.userId = userId;
  const staff = await getStaff();
  if (!staff) throw new Error("no staff");
  return staff;
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  await prisma.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
});
beforeEach(() => {
  session.userId = null;
});

describe("accès sur mesure", () => {
  it("GRANT lets a mechanic open a finance page and a money function", async () => {
    const admin = await as((await makeUser("ADMIN")).id);
    const mechanic = await makeUser("MECHANIC");

    // Before: role only.
    await as(mechanic.id);
    expect(await fail(requirePageAccess("viewClientInvoices"))).toBe("REDIRECT /garage");
    expect(await fail(todayRevenue((await getStaff())!))).toBe("forbidden");

    await setUserPermissions(admin, mechanic.id, { viewClientInvoices: "GRANT", viewFinance: "GRANT" });
    const me = await as(mechanic.id);
    expect(me.perms).toEqual({ grant: expect.arrayContaining(["viewClientInvoices", "viewFinance"]), deny: [] });
    expect((await requirePageAccess("viewClientInvoices")).id).toBe(mechanic.id);
    expect(await fail(todayRevenue(me))).toBe("NO ERROR");
    // Nothing else opened.
    expect(await fail(requirePermission("createInvoice"))).toBe("forbidden");
  });

  it("DENY blocks a manager from something the role allows", async () => {
    const admin = await as((await makeUser("ADMIN")).id);
    const manager = await makeUser("MANAGER");
    let me = await as(manager.id);
    expect(await fail(todayRevenue(me))).toBe("NO ERROR");

    await setUserPermissions(admin, manager.id, { viewFinance: "DENY" });
    me = await as(manager.id);
    expect(await fail(requirePageAccess("viewFinance"))).toBe("REDIRECT /garage");
    expect(await fail(requirePermission("viewFinance"))).toBe("forbidden");
    expect(await fail(todayRevenue(me))).toBe("forbidden");
    // The rest of the role is untouched.
    expect((await requirePermission("viewWorkOrders")).id).toBe(manager.id);
  });

  it("stores only differences with the role, and audits before → after", async () => {
    const admin = await as((await makeUser("ADMIN")).id);
    const mechanic = await makeUser("MECHANIC");
    await setUserPermissions(admin, mechanic.id, { viewStock: "GRANT", viewFinance: "GRANT", uploadMedia: "DENY", printQuote: "ROLE" });
    expect(await getUserOverrides(mechanic.id)).toEqual({ uploadMedia: "DENY", viewFinance: "GRANT" });
    await setUserPermissions(admin, mechanic.id, { viewFinance: "GRANT" });
    expect(await getUserOverrides(mechanic.id)).toEqual({ viewFinance: "GRANT" });

    const logs = await prisma.auditLog.findMany({ where: { action: "user.permissions", entity: "User", entityId: mechanic.id }, orderBy: { createdAt: "asc" } });
    expect(logs).toHaveLength(2);
    expect(logs[1]!.actorId).toBe(admin.id);
    expect(logs[1]!.before).toEqual({ uploadMedia: "DENY", viewFinance: "GRANT" });
    expect(logs[1]!.after).toEqual({ viewFinance: "GRANT" });
    expect((await prisma.userPermission.findFirstOrThrow({ where: { userId: mechanic.id } })).grantedById).toBe(admin.id);
  });

  it("an admin cannot refuse themselves team management or settings", async () => {
    const admin = await as((await makeUser("ADMIN")).id);
    expect(await fail(setUserPermissions(admin, admin.id, { manageTeam: "DENY" }))).toBe("ownAccess");
    expect(await fail(setUserPermissions(admin, admin.id, { manageSettings: "DENY" }))).toBe("ownAccess");
    // Other refusals on oneself are allowed.
    expect(await fail(setUserPermissions(admin, admin.id, { viewProfit: "DENY" }))).toBe("NO ERROR");
    await setUserPermissions(admin, admin.id, {});
  });

  it("at least one active administrator keeps manageTeam", async () => {
    // Only these two admins are active for this test.
    const others = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
    await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { isActive: false } });
    try {
      const a = await makeUser("ADMIN");
      const b = await makeUser("ADMIN");
      const actorA = await as(a.id);
      // A refuses B's team management: A still has it → fine.
      expect(await fail(setUserPermissions(actorA, b.id, { manageTeam: "DENY" }))).toBe("NO ERROR");
      // B (now without manageTeam) cannot be the last one: deactivating A is refused.
      expect(await fail(setStaffActive(a.id, false, actorA))).toBe("lastAdmin");
      // Restoring B, then B refuses A's: now A is the one without, B keeps it.
      await setUserPermissions(actorA, b.id, {});
      const actorB = await as(b.id);
      expect(await fail(setUserPermissions(actorB, a.id, { manageTeam: "DENY" }))).toBe("NO ERROR");
      // A (denied) cannot be used to remove B's either: there would be no admin left with it.
      expect(await fail(setUserPermissions(actorA, b.id, { manageTeam: "DENY" }))).toBe("lastAdminAccess");
      expect(await getUserOverrides(b.id)).toEqual({});
      await setUserPermissions(actorB, a.id, {});
    } finally {
      await prisma.user.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { isActive: true } });
    }
  });

  it("a non-administrator cannot change accesses, even with manageTeam", async () => {
    const manager = await makeUser("MANAGER");
    const hr = await makeUser("HR");
    const mechanic = await makeUser("MECHANIC");
    expect(await fail(setUserPermissions(await as(manager.id), mechanic.id, { viewFinance: "GRANT" }))).toBe("forbidden");

    // Through the server action (session = HR, who holds manageTeam).
    await as(hr.id);
    const res = await setUserPermissionsAction(mechanic.id, form({ viewFinance: "GRANT" }));
    expect(res.ok).toBe(false);
    // A mechanic has no manageTeam at all.
    await as(mechanic.id);
    expect((await setUserPermissionsAction(mechanic.id, form({ viewFinance: "GRANT" }))).ok).toBe(false);
    expect(await getUserOverrides(mechanic.id)).toEqual({});

    // An administrator through the same action: saved.
    await as((await makeUser("ADMIN")).id);
    const ok = await setUserPermissionsAction(mechanic.id, form({ viewFinance: "GRANT", nonsense: "GRANT" }));
    expect(ok.ok).toBe(true);
    expect(await getUserOverrides(mechanic.id)).toEqual({ viewFinance: "GRANT" });
    // An invalid choice is refused.
    expect((await setUserPermissionsAction(mechanic.id, form({ viewFinance: "MAYBE" }))).ok).toBe(false);
  });
});

describe("tableau de bord personnalisé", () => {
  it("user A's layout does not affect user B", async () => {
    const a = await makeUser("MANAGER");
    const b = await makeUser("MANAGER");
    await as(a.id);
    const layout = [
      { id: "lowStock", visible: true },
      { id: "kpis", visible: false },
    ];
    expect((await saveDashboardLayoutAction(layout)).ok).toBe(true);
    expect(await getDashboardLayout(a.id)).toEqual(layout);
    expect(await getDashboardLayout(b.id)).toEqual([]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).dashboardLayout).toBeNull();

    // B saves theirs: A's is unchanged.
    await as(b.id);
    expect((await saveDashboardLayoutAction([{ id: "alerts", visible: false }])).ok).toBe(true);
    expect(await getDashboardLayout(a.id)).toEqual(layout);

    // Unknown ids refused; reset = null.
    await as(a.id);
    expect((await saveDashboardLayoutAction([{ id: "ghost", visible: true }])).ok).toBe(false);
    expect((await saveDashboardLayoutAction(null)).ok).toBe(true);
    expect(await getDashboardLayout(a.id)).toEqual([]);
    expect(await getDashboardLayout(b.id)).toEqual([{ id: "alerts", visible: false }]);

    // Signed out: refused.
    session.userId = null;
    expect((await saveDashboardLayoutAction(layout)).ok).toBe(false);
  });
});
