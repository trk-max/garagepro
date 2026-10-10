import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffPasswordSchema } from "@/lib/validators";

type U = { id: string; role: "ADMIN" | "RECEPTION" | "MECHANIC" | "STOREKEEPER"; isActive: boolean; passwordHash: string };
const users = vi.hoisted(() => new Map<string, U>());

vi.mock("@/lib/prisma", () => {
  const user = {
    findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    count: async ({ where }: { where: { role: string; isActive: boolean; id: { not: string } } }) =>
      [...users.values()].filter((u) => u.role === where.role && u.isActive === where.isActive && u.id !== where.id.not).length,
    update: async ({ where, data }: { where: { id: string }; data: Partial<U> }) => Object.assign(users.get(where.id)!, data),
    delete: async ({ where }: { where: { id: string } }) => users.delete(where.id),
  };
  const tx = { user, $queryRaw: async () => [] };
  return { prisma: { user, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

const { deleteStaff, setStaffActive, setStaffPassword, setStaffRole } = await import("@/server/admin");

beforeEach(() => {
  users.clear();
  users.set("boss", { id: "boss", role: "ADMIN", isActive: true, passwordHash: "" });
  users.set("karim", { id: "karim", role: "MECHANIC", isActive: true, passwordHash: "" });
});

describe("change role", () => {
  it("admin promotes a mechanic to reception", async () => {
    await setStaffRole("boss", "karim", "RECEPTION");
    expect(users.get("karim")!.role).toBe("RECEPTION");
  });
  it("an admin cannot change their own role (no lock-out)", async () => {
    await expect(setStaffRole("boss", "boss", "MECHANIC")).rejects.toMatchObject({ code: "ownRole" });
  });
  it("the last admin cannot be demoted", async () => {
    users.set("other", { id: "other", role: "ADMIN", isActive: true, passwordHash: "" });
    // "other" demotes "boss": allowed, "other" stays admin.
    await setStaffRole("other", "boss", "RECEPTION");
    // now "boss" (reception) cannot be the one... and "other" is the last admin:
    users.set("boss2", { id: "boss2", role: "ADMIN", isActive: false, passwordHash: "" }); // inactive admins don't count
    await expect(setStaffRole("boss2", "other", "MECHANIC")).rejects.toMatchObject({ code: "lastAdmin" });
  });
  it("unknown user", async () => {
    await expect(setStaffRole("boss", "ghost", "MECHANIC")).rejects.toMatchObject({ code: "notFound" });
  });
});

describe("deactivate", () => {
  it("the last active admin cannot be deactivated", async () => {
    await expect(setStaffActive("boss", false)).rejects.toMatchObject({ code: "lastAdmin" });
    expect(users.get("boss")!.isActive).toBe(true);
  });
  it("a mechanic can be deactivated and reactivated", async () => {
    await setStaffActive("karim", false);
    expect(users.get("karim")!.isActive).toBe(false);
    await setStaffActive("karim", true);
    expect(users.get("karim")!.isActive).toBe(true);
  });
});

describe("new password", () => {
  it("is stored hashed (never in clear) and works for login", async () => {
    await setStaffPassword("karim", "Garage2026!");
    const hash = users.get("karim")!.passwordHash;
    expect(hash).not.toContain("Garage2026");
    expect(await bcrypt.compare("Garage2026!", hash)).toBe(true);
    expect(await bcrypt.compare("wrong", hash)).toBe(false);
  });
  it("form: 8 characters minimum and both fields identical", () => {
    expect(staffPasswordSchema.safeParse({ password: "Garage2026!", confirm: "Garage2026!" }).success).toBe(true);
    expect(staffPasswordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
    expect(staffPasswordSchema.safeParse({ password: "Garage2026!", confirm: "Garage2027!" }).success).toBe(false);
  });
});

describe("delete", () => {
  it("an admin deletes a mechanic", async () => {
    await deleteStaff("boss", "karim");
    expect(users.has("karim")).toBe(false);
  });
  it("an admin cannot delete themselves", async () => {
    await expect(deleteStaff("boss", "boss")).rejects.toMatchObject({ code: "ownDelete" });
    expect(users.has("boss")).toBe(true);
  });
  it("the last active admin cannot be deleted", async () => {
    users.set("other", { id: "other", role: "ADMIN", isActive: false, passwordHash: "" });
    await expect(deleteStaff("other", "boss")).rejects.toMatchObject({ code: "lastAdmin" });
    expect(users.has("boss")).toBe(true);
  });
  it("another admin can be deleted when one remains", async () => {
    users.set("other", { id: "other", role: "ADMIN", isActive: true, passwordHash: "" });
    await deleteStaff("boss", "other");
    expect(users.has("other")).toBe(false);
  });
  it("unknown user", async () => {
    await expect(deleteStaff("boss", "ghost")).rejects.toMatchObject({ code: "notFound" });
  });
});
