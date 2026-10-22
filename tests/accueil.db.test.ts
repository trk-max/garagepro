/**
 * V15 — file d'attente de l'accueil, on a real PostgreSQL test database (npm run test:db).
 * SMS are replaced by a fake sender (nothing leaves the PC); the ticket printer by a local TCP server.
 */
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, deviceCookie: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (session.userId ? { user: { id: session.userId } } : null) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gp_queue_device" && session.deviceCookie ? { value: session.deviceCookie } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const q = await import("@/server/accueil");
const { GET: screenGET } = await import("@/app/api/accueil/ecran/route");
const { POST: kioskPOST } = await import("@/app/api/accueil/borne/ticket/route");
const { POST: smsPOST } = await import("@/app/api/accueil/borne/sms/route");
const { GET: trackGET } = await import("@/app/api/accueil/t/[token]/route");
const { deskNextAction } = await import("@/actions/accueil");
const { makeUser, prisma } = await import("./helpers/db");
import type { Sender } from "@/server/reminders";
import type { StaffUser } from "@/lib/session";

const DAY = 86_400_000;
let n = 0;
let p = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

function fakeSender() {
  const sms: { to: string; text: string }[] = [];
  const sender: Sender = {
    channels: () => ["SMS"],
    sms: async (to, text) => {
      sms.push({ to, text });
      return { ok: true };
    },
    email: async () => ({ ok: true, id: "e1" }),
  };
  return { sender, sms };
}

/** Each test works on its own reasons / counters (unique prefix) and a clean queue of the day. */
async function setup() {
  const prefix = `Z${String.fromCharCode(65 + (p++ % 26))}`;
  const reason = await prisma.queueReason.create({ data: { code: `T_${uniq()}`.toUpperCase().slice(0, 20), prefix, nameFr: `Motif ${prefix}`, nameAr: "سبب", kind: "DROP_OFF" } });
  const c1 = await prisma.queueCounter.create({ data: { name: `Guichet ${uniq()}` } });
  const c2 = await prisma.queueCounter.create({ data: { name: `Caisse ${uniq()}` } });
  const reception = (await makeUser("RECEPTION")) as StaffUser;
  const kiosk = await q.createDevice((await makeUser("ADMIN")) as StaffUser, { name: "Tablette entrée", kind: "KIOSK" });
  return { reason, c1, c2, reception, kiosk: { id: kiosk.device.id, name: kiosk.device.name, kind: "KIOSK" as const }, kioskToken: kiosk.token };
}

beforeEach(async () => {
  // Tickets of other tests must not be in the way of « Suivant » (history is never deleted in the app;
  // here old test rows are simply closed).
  await prisma.queueTicket.updateMany({ where: { status: { in: ["WAITING", "CALLED", "SERVING"] } }, data: { status: "DONE" } });
  await prisma.queueSetting.update({ where: { id: "garage" }, data: { maxCalls: 3, callTimeoutSec: 60, aheadThreshold: 2, screenMaskedPlate: false, waitMinTickets: 3, waitWindow: 20, fastFirst: false, apptWindowMin: 15, printerHost: null } });
});

afterEach(() => {
  session.userId = null;
  session.deviceCookie = null;
  vi.unstubAllEnvs();
});

describe("V15 numbering", () => {
  it("20 tickets taken at the same moment: 20 different numbers, 1 to 20, no collision", async () => {
    const { reason, kiosk } = await setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk })));
    const numbers = results.map((r) => r.ticket.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(20);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(results[0]!.label).toMatch(new RegExp(`^${reason.prefix}-\\d+$`));
  });

  it("with a garage hub the garage PC numbers with odd numbers", async () => {
    vi.stubEnv("GARAGE_HUB_LOCAL", "1");
    const { reason, kiosk } = await setup();
    const a = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    const b = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    expect([a.ticket.number, b.ticket.number]).toEqual([1, 3]);
  });

  it("a new day starts again at 1", async () => {
    const { reason, kiosk } = await setup();
    const today = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    const tomorrow = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk }, new Date(Date.now() + DAY));
    expect(today.ticket.number).toBe(1);
    expect(tomorrow.ticket.number).toBe(1);
    expect(tomorrow.ticket.day).not.toBe(today.ticket.day);
  });
});

describe("V15 « Suivant » lock", () => {
  it("two counters pressing « Suivant » at the same time never get the same ticket", async () => {
    const { reason, c1, c2, kiosk } = await setup();
    const r1 = (await makeUser("RECEPTION")) as StaffUser;
    const r2 = (await makeUser("RECEPTION")) as StaffUser;
    for (let i = 0; i < 16; i++) await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk }, new Date(Date.now() - (16 - i) * 1000));
    const calledIds: string[] = [];
    for (let round = 0; round < 8; round++) {
      const [a, b] = await Promise.all([q.callNext(r1, c1.id), q.callNext(r2, c2.id)]);
      for (const t of [a, b]) if (t) calledIds.push(t.id);
      // Each counter receives its customer, then serves the next one.
      for (const t of [a, b]) if (t) await q.moveTicket(t.counterId === c1.id ? r1 : r2, t.id, "finish");
    }
    expect(calledIds).toHaveLength(16);
    expect(new Set(calledIds).size).toBe(16);
    const rows = await prisma.queueTicket.findMany({ where: { id: { in: calledIds } } });
    expect(rows.every((t) => t.callCount === 1 && t.status === "DONE")).toBe(true);
    // Each ticket was called exactly once in the journal.
    const calls = await prisma.auditLog.groupBy({ by: ["entityId"], where: { action: "queue.next", entityId: { in: calledIds } }, _count: { _all: true } });
    expect(calls.every((c) => c._count._all === 1)).toBe(true);
    expect(calls).toHaveLength(16);
  });

  it("« Suivant » respects the priority (on-time appointment first) and refuses while a customer is still called", async () => {
    const { reason, c1, reception, kiosk } = await setup();
    const now = new Date();
    const plate = `${uniq()}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9);
    const customer = await prisma.customer.create({ data: { name: "Client RDV", phone: "20111222" } });
    const vehicle = await prisma.vehicle.create({ data: { plate, make: "Renault", model: "Clio", customerId: customer.id } });
    const service = await prisma.bookableService.create({ data: { name: "Vidange", durationMin: 30 } });
    await prisma.appointment.create({ data: { reference: `RDV-${uniq()}`, serviceId: service.id, startAt: new Date(now.getTime() + 5 * 60_000), endAt: new Date(now.getTime() + 35 * 60_000), firstName: "A", lastName: "B", phone: "20111222", plate, vehicleId: vehicle.id, customerId: customer.id } });
    const walk = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk }, new Date(now.getTime() - 60_000));
    const rdv = await q.createTicket({ reasonId: reason.id, plate, source: "KIOSK", device: kiosk }, now);
    expect(rdv.appointment).not.toBeNull();
    const first = await q.callNext(reception, c1.id);
    expect(first!.id).toBe(rdv.ticket.id);
    await expect(q.callNext(reception, c1.id)).rejects.toMatchObject({ code: "queueCounterBusy" });
    await q.moveTicket(reception, first!.id, "serve");
    const second = await q.callNext(reception, c1.id); // the served one is closed automatically
    expect(second!.id).toBe(walk.ticket.id);
    expect((await prisma.queueTicket.findUniqueOrThrow({ where: { id: first!.id } })).status).toBe("DONE");
  });

  it("a mechanic cannot call; the desk action refuses without permission", async () => {
    const { c1, reason, kiosk } = await setup();
    await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    const mech = (await makeUser("MECHANIC")) as StaffUser;
    await expect(q.callNext(mech, c1.id)).rejects.toMatchObject({ code: "forbidden" });
    session.userId = mech.id;
    expect((await deskNextAction(c1.id)).ok).toBe(false);
  });
});

describe("V15 calls, absent, transfer, cancel (audit journal)", () => {
  it("3 unanswered calls → ABSENT after the delay (never deleted), the desk can call an absent again", async () => {
    const { reason, c1, reception, kiosk } = await setup();
    const { ticket } = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    const t0 = new Date();
    await q.callNext(reception, c1.id, { now: t0 });
    await expect(q.recallTicket(reception, ticket.id, null, { now: new Date(t0.getTime() + 10_000) })).rejects.toMatchObject({ code: "queueTooSoon" });
    expect(await q.recallTicket(reception, ticket.id, null, { now: new Date(t0.getTime() + 61_000) })).toBe("CALLED"); // 2nd call
    expect(await q.recallTicket(reception, ticket.id, null, { now: new Date(t0.getTime() + 122_000) })).toBe("CALLED"); // 3rd call
    expect((await prisma.queueTicket.findUniqueOrThrow({ where: { id: ticket.id } })).callCount).toBe(3);
    // Nobody came: after the delay the reader (screen / desk) marks it absent.
    expect(await q.sweepAbsents(new Date(t0.getTime() + 150_000))).toBe(0);
    expect(await q.sweepAbsents(new Date(t0.getTime() + 183_000))).toBe(1);
    const absent = await prisma.queueTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(absent.status).toBe("ABSENT");
    expect(absent.absentAt).not.toBeNull();
    // Called again by the desk.
    expect(await q.recallTicket(reception, ticket.id, c1.id, { now: new Date(t0.getTime() + 300_000) })).toBe("CALLED");
    const back = await prisma.queueTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(back).toMatchObject({ status: "CALLED", callCount: 1, counterId: c1.id });
    const actions = (await prisma.auditLog.findMany({ where: { entityId: ticket.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["queue.ticketCreate", "queue.next", "queue.recall", "queue.recall", "queue.absent", "queue.recallAbsent"]);
  });

  it("transfer and cancel are written to the journal (who, before → after)", async () => {
    const { reason, c1, c2, reception, kiosk } = await setup();
    const a = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    const b = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    await q.callTicket(reception, a.ticket.id, c1.id);
    await q.transferTicket(reception, a.ticket.id, c2.id);
    expect(await prisma.queueTicket.findUniqueOrThrow({ where: { id: a.ticket.id } })).toMatchObject({ status: "CALLED", counterId: c2.id });
    await expect(q.moveTicket(reception, b.ticket.id, "cancel", { reason: " " })).rejects.toMatchObject({ code: "queueReason" });
    await q.moveTicket(reception, b.ticket.id, "cancel", { reason: "Parti" });
    await q.moveTicket(reception, a.ticket.id, "absent");
    const log = await prisma.auditLog.findMany({ where: { entityId: { in: [a.ticket.id, b.ticket.id] }, action: { in: ["queue.transfer", "queue.cancel", "queue.absent", "queue.call"] } } });
    const byAction = Object.fromEntries(log.map((l) => [l.action, l]));
    expect(byAction["queue.call"]!.actorId).toBe(reception.id);
    expect(byAction["queue.transfer"]!.before).toMatchObject({ counter: c1.name });
    expect(byAction["queue.transfer"]!.after).toMatchObject({ counter: c2.name });
    expect(byAction["queue.cancel"]!.after).toMatchObject({ status: "CANCELLED", reason: "Parti" });
    expect(byAction["queue.absent"]!.after).toMatchObject({ status: "ABSENT" });
    expect(await prisma.queueTicket.count({ where: { id: { in: [a.ticket.id, b.ticket.id] } } })).toBe(2); // never deleted
  });
});

describe("V15 ticket ↔ appointment ↔ vehicle", () => {
  it("a ticket with the plate of today's appointment opens the check-in of THAT vehicle", async () => {
    const { reason, reception, kiosk } = await setup();
    const now = new Date();
    const plate = `${uniq()}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9);
    const customer = await prisma.customer.create({ data: { name: "Propriétaire", phone: "20333444" } });
    const vehicle = await prisma.vehicle.create({ data: { plate, make: "Kia", model: "Picanto", customerId: customer.id } });
    const other = await prisma.vehicle.create({ data: { plate: `X${plate}`.slice(0, 12), make: "Kia", model: "Rio", customerId: customer.id } });
    const service = await prisma.bookableService.create({ data: { name: "Freins", durationMin: 60 } });
    const appt = await prisma.appointment.create({ data: { reference: `RDV-${uniq()}`, serviceId: service.id, startAt: new Date(now.getTime() + 10 * 60_000), endAt: new Date(now.getTime() + 70 * 60_000), firstName: "P", lastName: "Q", phone: "20333444", plate, vehicleId: vehicle.id, customerId: customer.id } });
    const { ticket, appointment } = await q.createTicket({ reasonId: reason.id, plate: plate.toLowerCase(), source: "KIOSK", device: kiosk });
    expect(appointment?.startAt.getTime()).toBe(appt.startAt.getTime());
    expect(ticket).toMatchObject({ appointmentId: appt.id, vehicleId: vehicle.id, customerId: customer.id });
    const admin = (await makeUser("ADMIN")) as StaffUser; // check-in needs manageAppointments too
    const wo = await q.checkInFromTicket(admin, ticket.id);
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    expect(order.vehicleId).toBe(vehicle.id);
    expect(order.vehicleId).not.toBe(other.id);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("CHECKED_IN");
    expect((await prisma.queueTicket.findUniqueOrThrow({ where: { id: ticket.id } })).workOrderId).toBe(wo.id);
    void reception;
  });

  it("the vehicle QR scanned at the kiosk finds the vehicle (revoked QR → no vehicle)", async () => {
    const { reason, kiosk } = await setup();
    const customer = await prisma.customer.create({ data: { name: "QR", phone: "20000000" } });
    const token = "A".repeat(16) + uniq().padEnd(16, "x").slice(0, 16);
    const vehicle = await prisma.vehicle.create({ data: { plate: `QR${uniq()}`.toUpperCase().slice(0, 12), make: "VW", model: "Golf", customerId: customer.id, qrToken: token } });
    const r = await q.createTicket({ reasonId: reason.id, qr: `http://garage.local/v/${token}`, source: "KIOSK", device: kiosk });
    expect(r.ticket.vehicleId).toBe(vehicle.id);
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { qrToken: null } });
    const r2 = await q.createTicket({ reasonId: reason.id, qr: token, source: "KIOSK", device: kiosk });
    expect(r2.ticket.vehicleId).toBeNull();
  });
});

describe("V15 devices: kiosk and screen need a valid token", () => {
  it("no token, wrong kind, revoked token → refused (401)", async () => {
    const { reason } = await setup();
    const admin = (await makeUser("ADMIN")) as StaffUser;
    const screen = await q.createDevice(admin, { name: "TV salle", kind: "SCREEN" });
    const kiosk = await q.createDevice(admin, { name: "Tablette", kind: "KIOSK" });
    const post = (body: unknown) => kioskPOST(new Request("http://x/api/accueil/borne/ticket", { method: "POST", body: JSON.stringify(body) }));

    expect((await screenGET()).status).toBe(401); // no cookie
    expect((await post({ reasonId: reason.id })).status).toBe(401);
    session.deviceCookie = kiosk.token; // a kiosk token does not open the screen…
    expect((await screenGET()).status).toBe(401);
    expect((await post({ reasonId: reason.id })).status).toBe(200); // …but takes tickets
    session.deviceCookie = screen.token; // a screen token does not take tickets
    expect((await post({ reasonId: reason.id })).status).toBe(401);
    expect((await screenGET()).status).toBe(200);
    session.deviceCookie = "x".repeat(43);
    expect((await screenGET()).status).toBe(401);

    await q.revokeDevice(admin, screen.device.id);
    session.deviceCookie = screen.token;
    expect((await screenGET()).status).toBe(401);
    expect((await prisma.auditLog.findFirst({ where: { entityId: screen.device.id, action: "queue.deviceRevoke" } }))?.actorId).toBe(admin.id);
    // Only the hash of the token is stored.
    const stored = await prisma.queueDevice.findUniqueOrThrow({ where: { id: kiosk.device.id } });
    expect(JSON.stringify(stored)).not.toContain(kiosk.token);
    // Only an administrator manages devices.
    await expect(q.createDevice((await makeUser("MANAGER")) as StaffUser, { name: "x", kind: "KIOSK" })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("V15 public screen and tracking never expose personal data", () => {
  it("screen JSON: number + reason + counter only (masked plate only when the option is on)", async () => {
    const { reason, c1, reception, kiosk } = await setup();
    const admin = (await makeUser("ADMIN")) as StaffUser;
    const screen = await q.createDevice(admin, { name: "TV", kind: "SCREEN" });
    const plate = "215TU" + String(1000 + (n++ % 8999));
    const customer = await prisma.customer.create({ data: { name: "Zorro Secretnom", phone: "98765432", email: "zorro@secret.tn" } });
    await prisma.vehicle.create({ data: { plate, make: "Peugeot", model: "208", customerId: customer.id } });
    const a = await q.createTicket({ reasonId: reason.id, plate, source: "KIOSK", device: kiosk, phone: "98765432", consent: true });
    await q.createTicket({ reasonId: reason.id, plate, source: "KIOSK", device: kiosk });
    await q.callTicket(reception, a.ticket.id, c1.id, { sender: fakeSender().sender });

    session.deviceCookie = screen.token;
    const read = async () => {
      // The route shares one computation for 1.5 s between TVs: wait for a fresh one.
      await new Promise((r) => setTimeout(r, 1600));
      return (await screenGET()).text();
    };
    let body = await read();
    const data = JSON.parse(body);
    expect(data.calls[0]).toMatchObject({ label: a.label, counter: { fr: c1.name } });
    for (const secret of ["Zorro", "Secretnom", "98765432", "zorro@secret.tn", plate, plate.slice(-4), "215 TU", customer.id, a.ticket.id, a.ticket.trackToken]) expect(body).not.toContain(secret);
    expect(Object.keys(data.calls[0]).sort()).toEqual(["calledAt", "counter", "key", "label", "plate", "reason", "status"]);
    expect(data.calls[0].plate).toBeNull();

    await prisma.queueSetting.update({ where: { id: "garage" }, data: { screenMaskedPlate: true } });
    body = await read();
    expect(JSON.parse(body).calls[0].plate).toBe(`215 TU ${plate.slice(5, 7)}**`);
    expect(body).not.toContain(plate);

    const track = await (await trackGET(new Request("http://x"), { params: Promise.resolve({ token: a.ticket.trackToken }) })).text();
    for (const secret of ["Zorro", "98765432", plate, customer.id]) expect(track).not.toContain(secret);
    expect(JSON.parse(track)).toMatchObject({ label: a.label, status: "CALLED", counter: { fr: c1.name } });
    expect((await trackGET(new Request("http://x"), { params: Promise.resolve({ token: "nope" }) })).status).toBe(404);
  });
});

describe("V15 messages: never without consent", () => {
  it("called ticket without consent → nothing queued; with consent → « c'est votre tour » + « encore N personnes »", async () => {
    const { reason, c1, reception, kiosk } = await setup();
    const { sender, sms } = fakeSender();
    const noConsent = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk, phone: "20111222", consent: false });
    expect(noConsent.ticket.phone).toBeNull();
    const withConsent = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    const third = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    // Phone typed at the kiosk: refused without consent, accepted with it.
    await expect(q.setTicketPhone(kiosk, withConsent.ticket.trackToken, "20555666", false)).rejects.toMatchObject({ code: "queueConsent" });
    await q.setTicketPhone(kiosk, withConsent.ticket.trackToken, "20555666", true);
    await q.setTicketPhone(kiosk, third.ticket.trackToken, "20777888", true);

    await q.callNext(reception, c1.id, { sender }); // calls noConsent: no message at all
    expect(await prisma.notification.count({ where: { kind: "QUEUE", dedupeKey: { startsWith: `queue:${noConsent.ticket.id}` } } })).toBe(0);
    // withConsent is now first (0 before), third has 1 person before → « encore 1 personne » (threshold 2).
    expect(sms.map((s) => s.to)).toEqual(["+21620777888"]);
    expect(sms[0]!.text).toContain("encore 1 personne(s)");
    await q.moveTicket(reception, noConsent.ticket.id, "absent");
    await q.callNext(reception, c1.id, { sender });
    expect(sms.at(-1)).toMatchObject({ to: "+21620555666" });
    expect(sms.at(-1)!.text).toContain(`c'est votre tour ! Ticket ${withConsent.label}, ${c1.name}`);
    // The kiosk API refuses a phone without the consent box.
    session.deviceCookie = (await q.createDevice((await makeUser("ADMIN")) as StaffUser, { name: "K2", kind: "KIOSK" })).token;
    const res = await smsPOST(new Request("http://x", { method: "POST", body: JSON.stringify({ token: third.ticket.trackToken, phone: "20777888", consent: false }) }));
    expect(res.status).toBe(422);
    expect((await prisma.auditLog.findFirst({ where: { entityId: withConsent.ticket.id, action: "queue.consent" } }))?.after).toMatchObject({ consent: true });
  });

  it("with a hub, the online copy queues but does not send (the garage hub sends)", async () => {
    vi.stubEnv("GARAGE_HUB", "1");
    vi.stubEnv("GARAGE_HUB_LOCAL", "0");
    const { reason, c1, reception, kiosk } = await setup();
    const { sender, sms } = fakeSender();
    const t = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk, phone: "20999000", consent: true });
    expect(t.ticket.number % 2).toBe(0); // online copy: even numbers
    await q.callNext(reception, c1.id, { sender });
    expect(sms).toHaveLength(0);
    expect(await prisma.notification.findFirst({ where: { dedupeKey: { startsWith: `queue:${t.ticket.id}:call` } } })).toMatchObject({ status: "PENDING", channel: "SMS" });
  });
});

describe("V15 estimate, printer, statistics", () => {
  it("estimated wait = real mean of the last tickets of the reason; « — » (null) when too few", async () => {
    const { reason, c1, reception, kiosk } = await setup();
    const t0 = Date.now() - 3 * 3600_000;
    const view = async () => (await q.publicScreenState()).waits.find((w) => w.reasonId === reason.id)!.minutes;
    expect(await view()).toBeNull();
    for (const [i, wait] of [10, 20, 30].entries()) {
      const { ticket } = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk }, new Date(t0 + i * 3600_000));
      await q.callTicket(reception, ticket.id, c1.id, { now: new Date(t0 + i * 3600_000 + wait * 60_000) });
      await q.moveTicket(reception, ticket.id, "finish");
    }
    expect(await view()).toBe(20);
    await prisma.queueSetting.update({ where: { id: "garage" }, data: { waitWindow: 2, waitMinTickets: 2 } });
    expect(await view()).toBe(25); // the two most recent: 20 and 30
  });

  it("prints on a network ESC/POS printer when one is set; nothing (no error) otherwise", async () => {
    const { reason, kiosk } = await setup();
    const { ticket, label } = await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    expect(await q.printTicket(kiosk, ticket.trackToken)).toEqual({ printed: false, reason: "noPrinter" });
    const received: Buffer[] = [];
    const server = net.createServer((s) => s.on("data", (d) => received.push(d)));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as net.AddressInfo).port;
    await prisma.queueSetting.update({ where: { id: "garage" }, data: { printerHost: "127.0.0.1", printerPort: port } });
    expect(await q.printTicket(kiosk, ticket.trackToken)).toEqual({ printed: true });
    await new Promise((r) => setTimeout(r, 100));
    server.close();
    expect(Buffer.concat(received).toString("latin1")).toContain(label);
    await prisma.queueSetting.update({ where: { id: "garage" }, data: { printerHost: "127.0.0.1", printerPort: 1 } });
    expect(await q.printTicket(kiosk, ticket.trackToken)).toEqual({ printed: false, reason: "error" });
  });

  it("desk state, « À traiter » and dashboard summary count long waits", async () => {
    const { reason, reception, kiosk } = await setup();
    await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk }, new Date(Date.now() - 45 * 60_000));
    await q.createTicket({ reasonId: reason.id, source: "KIOSK", device: kiosk });
    expect(await q.countLongWaits()).toBe(1);
    const s = await q.receptionSummary();
    expect(s.waiting).toBe(2);
    expect(s.longest).toBeGreaterThanOrEqual(45);
    const desk = await q.deskState(reception);
    expect(desk.waiting.map((w) => w.label)).toHaveLength(2);
    await expect(q.deskState((await makeUser("MECHANIC")) as StaffUser)).rejects.toMatchObject({ code: "forbidden" });
  });
});
