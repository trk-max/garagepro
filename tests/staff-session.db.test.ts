/**
 * Déconnexion partout (feat/staff-ux) — on a real PostgreSQL test database (npm run test:db).
 * The Auth.js cookie is replaced by a fake session { id, sv }; signOut by a spy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; sv?: number } | null, signedOut: 0 }));
vi.mock("@/lib/auth", () => ({
  auth: async () => (session.user ? { user: session.user } : null),
  signOut: async () => {
    session.signedOut++;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { endStaffSessions, sessionVersionValid, staffFromSession } = await import("@/server/staff-session");
const { POST: logoutPOST } = await import("@/app/api/staff/logout/route");
const { GET: sessionGET } = await import("@/app/api/staff/session/route");
const { makeUser, prisma } = await import("./helpers/db");

beforeEach(() => {
  session.user = null;
  session.signedOut = 0;
});

const post = (headers: Record<string, string> = {}) => new Request("http://localhost/api/staff/logout", { method: "POST", headers });

describe("session version", () => {
  it("compares the cookie's version with the user's", () => {
    expect(sessionVersionValid(undefined, 0)).toBe(true); // cookies issued before the column existed
    expect(sessionVersionValid(0, 0)).toBe(true);
    expect(sessionVersionValid(2, 2)).toBe(true);
    expect(sessionVersionValid(1, 2)).toBe(false);
    expect(sessionVersionValid(undefined, 1)).toBe(false);
  });

  it("refuses a token with an old session version", async () => {
    const u = await makeUser("RECEPTION");
    expect(await staffFromSession({ id: u.id, sv: 0 })).toMatchObject({ id: u.id });
    await prisma.user.update({ where: { id: u.id }, data: { sessionVersion: 3 } });
    expect(await staffFromSession({ id: u.id, sv: 2 })).toBeNull();
    expect(await staffFromSession({ id: u.id })).toBeNull();
    expect(await staffFromSession({ id: u.id, sv: 3 })).toMatchObject({ id: u.id });
  });

  it("logout bumps only that user, with a journal line in the same transaction", async () => {
    const me = await makeUser("ADMIN");
    const other = await makeUser("MECHANIC");
    const v = await endStaffSessions(me.id, { ip: "1.2.3.4" });
    expect(v).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).sessionVersion).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).sessionVersion).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { entity: "User", entityId: me.id, action: "auth.logoutEverywhere" } });
    expect(log).toMatchObject({ actorId: me.id, ip: "1.2.3.4" });
    // Other user's cookie still valid; mine (sv 0, from before) not any more.
    expect(await staffFromSession({ id: other.id, sv: 0 })).not.toBeNull();
    expect(await staffFromSession({ id: me.id, sv: 0 })).toBeNull();
  });
});

describe("POST /api/staff/logout", () => {
  it("ends every session of the account, clears the cookie and lands on /login", async () => {
    const me = await makeUser("RECEPTION");
    const other = await makeUser("RECEPTION");
    session.user = { id: me.id, sv: 0 };
    const res = await logoutPOST(post({ "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
    expect(session.signedOut).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).sessionVersion).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).sessionVersion).toBe(0);
    // Another tab / the phone still holding the old cookie: refused.
    expect((await sessionGET()).status).toBe(401);
    session.user = { id: other.id, sv: 0 };
    expect((await sessionGET()).status).toBe(204);
  });

  it("already signed out: still clears the cookie and redirects, bumps nothing", async () => {
    const res = await logoutPOST(post());
    expect(res.status).toBe(303);
    expect(session.signedOut).toBe(1);
  });

  it("refuses a cross-site post (no forced logout from another site)", async () => {
    const me = await makeUser("ADMIN");
    session.user = { id: me.id, sv: 0 };
    const res = await logoutPOST(post({ "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).sessionVersion).toBe(0);
  });
});
