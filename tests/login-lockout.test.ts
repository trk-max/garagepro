import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attemptsDb, resetAttempts, tick } from "./helpers/fake-attempts";

/** Staff login: the 5-failures-per-e-mail lock holds under parallel requests. */
const state = vi.hoisted(() => ({ lookups: 0, hash: "" }));

vi.mock("@/lib/prisma", async () => {
  const h = await import("./helpers/fake-attempts");
  return {
    prisma: {
      portalAttempt: h.portalAttempt,
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => h.fakeTransaction(fn),
      user: {
        findUnique: async () => {
          state.lookups++;
          await h.tick();
          return { id: "u1", email: "chef@garage.example", name: "Chef", role: "ADMIN", isActive: true, passwordHash: state.hash };
        },
        update: async () => ({}),
      },
    },
  };
});

// Auth.js itself is not under test (and needs the Next runtime): only its error class is used.
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: async () => null, signIn: async () => {}, signOut: async () => {} }),
  CredentialsSignin: class extends Error {},
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (c: unknown) => c }));

const { authorizeStaff } = await import("@/lib/auth");
const req = (ip = "203.0.113.7") => new Request("http://localhost/api/auth/callback/credentials", { headers: { "x-forwarded-for": ip } });
const login = (password: string) => authorizeStaff({ email: "chef@garage.example", password }, req()).catch((e: { code?: string }) => (e.code === "locked" ? "locked" : Promise.reject(e)));

beforeEach(() => {
  resetAttempts();
  state.lookups = 0;
  state.hash ||= bcrypt.hashSync("bon-mot-de-passe", 4);
});

describe("staff login lockout", () => {
  it("20 wrong passwords in parallel: at most 5 are checked, the rest are locked", async () => {
    const res = await Promise.all(Array.from({ length: 20 }, () => login("faux")));
    expect(state.lookups).toBe(5);
    expect(res.filter((r) => r === "locked")).toHaveLength(15);
    expect(res.filter((r) => r === null)).toHaveLength(5);
  });

  it("even the right password is refused once the e-mail is locked", async () => {
    for (let i = 0; i < 5; i++) expect(await login("faux")).toBeNull();
    expect(await login("bon-mot-de-passe")).toBe("locked");
  });

  it("a successful login is not counted as a failure", async () => {
    for (let i = 0; i < 4; i++) await login("faux");
    expect(await login("bon-mot-de-passe")).toMatchObject({ id: "u1", role: "ADMIN" });
    expect(attemptsDb.rows.filter((r) => r.key.startsWith("login:email:") && !r.ok)).toHaveLength(4);
    expect(await login("faux")).toBeNull(); // 5th failure still allowed
    await tick();
  });
});
