import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeDemoAccounts, isDemoEmail, validateNewAdmin } from "../scripts/lib/accounts.mjs";

/** First admin without the demo seed, and the doctor's demo-account warning. */
const db = vi.hoisted(() => ({ users: [] as { id: string; email: string; name: string; role: string; isActive: boolean; passwordHash?: string }[] }));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    user = {
      findUnique: async ({ where }: { where: { email: string } }) => db.users.find((u) => u.email === where.email) ?? null,
      findMany: async () => db.users,
      create: async ({ data }: { data: (typeof db.users)[number] }) => (db.users.push({ ...data, id: `u${db.users.length + 1}` }), data),
    };
    $disconnect = async () => {};
  },
}));

async function runResetAccess(...args: string[]) {
  vi.resetModules();
  const argv = process.argv;
  process.argv = ["node", "reset-access.mjs", ...args];
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
  try {
    await import("../scripts/reset-access.mjs");
    return { out: log.mock.calls.flat().join("\n"), err: err.mock.calls.flat().join("\n"), code: process.exitCode };
  } finally {
    process.argv = argv;
    process.exitCode = undefined;
    log.mockRestore();
    err.mockRestore();
  }
}

beforeEach(() => {
  db.users = [];
});

describe("rules", () => {
  it("validates the first admin", () => {
    expect(validateNewAdmin({ email: " Chef@Mon-Garage.TN ", password: "Un-Vrai-Mot-2026", name: "Malek" })).toEqual({ ok: true, email: "chef@mon-garage.tn", password: "Un-Vrai-Mot-2026", name: "Malek" });
    expect(validateNewAdmin({ email: "admin@garage.tn", password: "Un-Vrai-Mot-2026" }).ok).toBe(false); // demo domain
    expect(validateNewAdmin({ email: "chef@mon-garage.tn", password: "court" }).ok).toBe(false);
    expect(validateNewAdmin({ email: "chef@mon-garage.tn", password: "password123" }).ok).toBe(false);
    expect(validateNewAdmin({ email: "pas-un-email", password: "Un-Vrai-Mot-2026" }).ok).toBe(false);
  });
  it("finds every active demo account, whatever the role", () => {
    const users = [
      { email: "admin@garage.tn", role: "ADMIN", isActive: false },
      { email: "accueil@garage.tn", role: "RECEPTION", isActive: true },
      { email: "karim@garage.tn", role: "MECHANIC", isActive: true },
      { email: "stock@garage.tn", role: "STOREKEEPER", isActive: true },
      { email: "chef@mon-garage.tn", role: "ADMIN", isActive: true },
    ];
    expect(activeDemoAccounts(users).map((u: { email: string }) => u.email)).toEqual(["accueil@garage.tn", "karim@garage.tn", "stock@garage.tn"]);
    expect(isDemoEmail("KARIM@GARAGE.TN")).toBe(true);
  });
});

describe("npm run reset-access -- --create-admin", () => {
  it("creates an ADMIN with a hashed password", async () => {
    const r = await runResetAccess("--create-admin", "chef@mon-garage.tn", "Un-Vrai-Mot-2026", "Malek", "B.");
    expect(r.code).toBeUndefined();
    expect(r.out).toContain("Administrateur créé");
    expect(db.users).toHaveLength(1);
    expect(db.users[0]).toMatchObject({ email: "chef@mon-garage.tn", role: "ADMIN", isActive: true, name: "Malek B." });
    expect(db.users[0]!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(db.users[0]!.passwordHash).not.toContain("Un-Vrai-Mot");
  });
  it("refuses an existing e-mail and weak input", async () => {
    db.users.push({ id: "u1", email: "chef@mon-garage.tn", name: "x", role: "ADMIN", isActive: true });
    expect((await runResetAccess("--create-admin", "chef@mon-garage.tn", "Un-Vrai-Mot-2026")).code).toBe(1);
    expect((await runResetAccess("--create-admin", "autre@mon-garage.tn", "court")).code).toBe(1);
    expect(db.users).toHaveLength(1);
  });
  it("warns when demo accounts are still active", async () => {
    db.users.push({ id: "u9", email: "karim@garage.tn", name: "Karim", role: "MECHANIC", isActive: true });
    const r = await runResetAccess("--create-admin", "chef@mon-garage.tn", "Un-Vrai-Mot-2026");
    expect(r.out).toContain("karim@garage.tn");
  });
});
