/**
 * Web Push « Nouveau véhicule pour vous »: subscriptions per person, sent only to the assigned mechanic
 * (web-push mocked), nothing without VAPID keys, dead subscriptions (410) removed.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffUser } from "@/lib/session";

const sent = vi.hoisted(() => ({ calls: [] as { endpoint: string; payload: string }[], status: 0 }));
vi.mock("web-push", () => ({
  default: {
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      sent.calls.push({ endpoint: sub.endpoint, payload });
      if (sent.status) throw Object.assign(new Error("push"), { statusCode: sent.status });
      return { statusCode: 201 };
    },
  },
}));
vi.mock("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));

const helpers = await import("./helpers/db");
const { makeWorkOrder, prisma } = helpers;
const { assignMechanic } = await import("@/server/work-orders");
const push = await import("@/server/push");

const KEYS = { VAPID_PUBLIC_KEY: "pub-test", VAPID_PRIVATE_KEY: "priv-test", VAPID_SUBJECT: "mailto:test@example.invalid" };
const created: string[] = [];
const makeUser = async (role: "ADMIN" | "MECHANIC") => {
  const u = await helpers.makeUser(role);
  created.push(u.id);
  return u;
};
const sub = (n: string) => ({ endpoint: `https://push.example.invalid/${n}`, keys: { p256dh: `p-${n}`, auth: `a-${n}` } });
const settle = () => new Promise((r) => setTimeout(r, 300));

beforeEach(() => {
  sent.calls = [];
  sent.status = 0;
  Object.assign(process.env, KEYS);
});
afterAll(async () => {
  for (const k of Object.keys(KEYS)) delete process.env[k];
  await prisma.user.updateMany({ where: { id: { in: created } }, data: { isActive: false } });
});

describe("web push", () => {
  it("a subscription belongs to one person (the same phone signing in as someone else moves it)", async () => {
    const a = await makeUser("MECHANIC");
    const b = await makeUser("MECHANIC");
    await push.saveSubscription(a.id, sub("one"), "UA");
    await push.saveSubscription(a.id, sub("two"), null);
    expect(await prisma.pushSubscription.count({ where: { userId: a.id } })).toBe(2);
    await push.saveSubscription(b.id, sub("two"), null);
    expect(await prisma.pushSubscription.count({ where: { userId: a.id } })).toBe(1);
    expect(await prisma.pushSubscription.count({ where: { userId: b.id } })).toBe(1);
    expect(push.isSubscription({ endpoint: "http://insecure", keys: { p256dh: "x", auth: "y" } })).toBe(false);
  });

  it("an assignment pushes to the assigned mechanic only (never to the person who assigned)", async () => {
    const admin = (await makeUser("ADMIN")) as StaffUser;
    const m = await makeUser("MECHANIC");
    const other = await makeUser("MECHANIC");
    await push.saveSubscription(m.id, sub(`m-${m.id}`), null);
    await push.saveSubscription(other.id, sub(`o-${other.id}`), null);
    await push.saveSubscription(admin.id, sub(`a-${admin.id}`), null);
    const { wo } = await makeWorkOrder({ status: "DIAGNOSIS" });
    await assignMechanic(wo.id, m.id, admin);
    await settle();
    expect(sent.calls.map((c) => c.endpoint)).toEqual([`https://push.example.invalid/m-${m.id}`]);
    const payload = JSON.parse(sent.calls[0]!.payload);
    expect(payload).toMatchObject({ title: "Nouveau véhicule pour vous", url: `/garage/app/ordre/${wo.id}`, tag: `wo-${wo.id}` });
    // Assigning oneself: no push.
    sent.calls = [];
    await assignMechanic(wo.id, admin.id, admin as StaffUser);
    await settle();
    expect(sent.calls).toEqual([]);
  });

  it("no VAPID keys: nothing is sent, no error, the assignment still works", async () => {
    for (const k of Object.keys(KEYS)) delete process.env[k];
    const admin = (await makeUser("ADMIN")) as StaffUser;
    const m = await makeUser("MECHANIC");
    await push.saveSubscription(m.id, sub(`nokeys-${m.id}`), null);
    const { wo } = await makeWorkOrder({ status: "DIAGNOSIS" });
    await expect(assignMechanic(wo.id, m.id, admin)).resolves.toBeTruthy();
    await settle();
    expect(sent.calls).toEqual([]);
    expect(await push.pushAssignment(wo.id, m.id, admin.id)).toBe(0);
    expect((await prisma.workOrder.findUnique({ where: { id: wo.id } }))?.mechanicId).toBe(m.id);
  });

  it("410 from the push service removes the dead subscription; 500 only marks it", async () => {
    const m = await makeUser("MECHANIC");
    await push.saveSubscription(m.id, sub(`dead-${m.id}`), null);
    sent.status = 410;
    expect(await push.sendPushToUser(m.id, { title: "t", body: "b", url: "/garage/app", tag: "x" })).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { userId: m.id } })).toBe(0);
    await push.saveSubscription(m.id, sub(`flaky-${m.id}`), null);
    sent.status = 500;
    await push.sendPushToUser(m.id, { title: "t", body: "b", url: "/garage/app", tag: "x" });
    const s = await prisma.pushSubscription.findFirst({ where: { userId: m.id } });
    expect(s?.failedAt).toBeTruthy();
  });
});
