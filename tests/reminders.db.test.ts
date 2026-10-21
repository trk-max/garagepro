/**
 * Prompt 2/5, step D — customer reminders and alerts, on a real PostgreSQL test
 * database. SMS / e-mail are replaced by fake senders (nothing leaves the PC).
 * Run: npm run test:db
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as cronGET } from "@/app/api/cron/reminders/route";
import { listAlerts, updateAlert } from "@/server/alerts";
import { companyMaintenance, createPlan, markPlanDone } from "@/server/maintenance";
import { createPart } from "@/server/parts";
import { deliverPending, queueItems, collectDue, runReminders, type Sender } from "@/server/reminders";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

afterEach(() => vi.unstubAllEnvs());

const DAY = 86_400_000;
function fakeSender(opts: { channels?: ("SMS" | "EMAIL")[]; smsOk?: boolean } = {}) {
  const sms: string[] = [];
  const mails: string[] = [];
  const sender: Sender = {
    channels: () => opts.channels ?? ["SMS", "EMAIL"],
    sms: async (to) => {
      sms.push(to);
      return opts.smsOk === false ? { ok: false, error: "Twilio 400 : numéro refusé" } : { ok: true };
    },
    email: async (m) => {
      mails.push(m.to);
      return { ok: true, id: "e1" };
    },
  };
  return { sender, sms, mails };
}
const rowsFor = (customerId: string) => prisma.notification.findMany({ where: { customerId }, orderBy: { channel: "asc" } });

async function dueVehicle(extra: { optOut?: boolean; email?: string | null } = {}) {
  const admin = await makeUser("ADMIN");
  const { vehicle, customer } = await makeWorkOrder();
  await prisma.customer.update({ where: { id: customer.id }, data: { phone: "20123456", email: extra.email === undefined ? "client@test.tn" : extra.email, reminderOptOut: !!extra.optOut } });
  await createPlan(admin, vehicle.id, { kind: "OIL", intervalDays: 180, lastDoneAt: new Date(Date.now() - 178 * DAY) }); // due in 2 days
  return { admin, vehicle, customer };
}

describe("rappels d'entretien", () => {
  it("due soon → one SMS and one e-mail, really 'sent' by the provider; a second run sends nothing more", async () => {
    const { customer } = await dueVehicle();
    const f = fakeSender();
    await runReminders(new Date(), f.sender);
    const rows = await rowsFor(customer.id);
    expect(rows.map((r) => [r.channel, r.status])).toEqual([
      ["EMAIL", "SENT"],
      ["SMS", "SENT"],
    ]);
    expect(rows[1]!.to).toBe("+21620123456");
    expect(rows[1]!.body).toContain("Vidange");
    await runReminders(new Date(), f.sender);
    expect(await rowsFor(customer.id)).toHaveLength(2);
    expect(f.sms.filter((x) => x === "+21620123456")).toHaveLength(1);
  });

  it("the customer refused reminders → nothing is created", async () => {
    const { customer } = await dueVehicle({ optOut: true });
    await runReminders(new Date(), fakeSender().sender);
    expect(await rowsFor(customer.id)).toHaveLength(0);
  });

  it("km rule without recorded mileage → no reminder (never guessed)", async () => {
    const admin = await makeUser("ADMIN");
    const { vehicle, customer } = await makeWorkOrder();
    await createPlan(admin, vehicle.id, { kind: "FILTERS", intervalKm: 10_000, lastDoneKm: 40_000, lastDoneAt: new Date() });
    await runReminders(new Date(), fakeSender().sender);
    expect(await rowsFor(customer.id)).toHaveLength(0);
    await markPlanDone(admin, (await prisma.vehicleMaintenance.findFirstOrThrow({ where: { vehicleId: vehicle.id } })).id, { doneAt: new Date(), km: 40_000 });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).mileage).toBe(40_000); // recorded, only because it was typed
  });

  it("no channel configured → one 'not sent' row that says why, not a fake success", async () => {
    const { customer } = await dueVehicle();
    await runReminders(new Date(), fakeSender({ channels: [] }).sender);
    const rows = await rowsFor(customer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "NONE", status: "SKIPPED" });
    expect(rows[0]!.error).toMatch(/Aucun canal configuré/);
    await runReminders(new Date(), fakeSender({ channels: [] }).sender);
    expect(await rowsFor(customer.id)).toHaveLength(1);
  });

  it("provider error → FAILED with its message, retried later, then given up after 3 attempts", async () => {
    const { customer } = await dueVehicle({ email: null });
    const f = fakeSender({ channels: ["SMS"], smsOk: false });
    const t0 = new Date();
    await runReminders(t0, f.sender);
    let row = (await rowsFor(customer.id))[0]!;
    expect(row).toMatchObject({ status: "FAILED", attempts: 1, error: "Twilio 400 : numéro refusé" });
    await deliverPending(new Date(t0.getTime() + 60_000), f.sender); // too early for the retry
    expect((await rowsFor(customer.id))[0]!.attempts).toBe(1);
    await deliverPending(new Date(t0.getTime() + 16 * 60_000), f.sender);
    await deliverPending(new Date(t0.getTime() + 60 * 60_000), f.sender);
    row = (await rowsFor(customer.id))[0]!;
    expect(row).toMatchObject({ status: "FAILED", attempts: 3, nextAttemptAt: null });
    await deliverPending(new Date(t0.getTime() + 10 * DAY), f.sender);
    expect((await rowsFor(customer.id))[0]!.attempts).toBe(3);
  });

  it("two runs at the same time: each message is sent exactly once", async () => {
    const { customer } = await dueVehicle();
    const f = fakeSender();
    const items = (await collectDue()).filter((i) => i.customerId === customer.id);
    await Promise.all([queueItems(items, f.sender), queueItems(items, f.sender)]);
    await Promise.all([deliverPending(new Date(), f.sender), deliverPending(new Date(), f.sender)]);
    expect(f.sms.filter((x) => x === "+21620123456")).toHaveLength(1);
    expect((await rowsFor(customer.id)).every((r) => r.status === "SENT")).toBe(true);
  });

  it("appointment tomorrow and promised delivery tomorrow are reminded", async () => {
    const { customer, wo } = await makeWorkOrder({ status: "IN_PROGRESS" });
    await prisma.workOrder.update({ where: { id: wo.id }, data: { promisedAt: new Date(Date.now() + 20 * 3_600_000) } });
    const service = await prisma.bookableService.create({ data: { name: "Vidange", durationMin: 30 } });
    const appt = await prisma.appointment.create({
      data: { reference: `RDV-${Date.now()}`, serviceId: service.id, startAt: new Date(Date.now() + 18 * 3_600_000), endAt: new Date(Date.now() + 19 * 3_600_000), firstName: "A", lastName: "B", phone: "22333444", plate: "1TU1", customerId: customer.id },
    });
    const items = await collectDue();
    expect(items.some((i) => i.kind === "DELIVERY" && i.workOrderId === wo.id)).toBe(true);
    expect(items.some((i) => i.kind === "APPOINTMENT" && i.appointmentId === appt.id)).toBe(true);
  });

  it("with a garage hub, the online copy does not send (no double messages)", async () => {
    vi.stubEnv("GARAGE_HUB", "1");
    vi.stubEnv("GARAGE_HUB_LOCAL", "0");
    const r = await runReminders(new Date(), fakeSender().sender);
    expect(r.skipped).toBeTruthy();
  });

  it("company portal: only its own vehicles' maintenance", async () => {
    const { vehicle, customer } = await dueVehicle();
    const { customer: other } = await makeWorkOrder();
    const mine = await companyMaintenance({ id: "u", customerId: customer.id, role: "VIEWER", name: "x", email: "x@t.tn" });
    expect(mine.map((m) => m.vehicle.plate)).toEqual([vehicle.plate]);
    expect(await companyMaintenance({ id: "u", customerId: other.id, role: "VIEWER", name: "x", email: "x@t.tn" })).toEqual([]);
  });
});

describe("planificateur protégé", () => {
  it("the cron route refuses without the exact secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-very-long-cron-secret");
    expect((await cronGET(new Request("http://x/api/cron/reminders"))).status).toBe(401);
    expect((await cronGET(new Request("http://x/api/cron/reminders", { headers: { authorization: "Bearer wrong-secret-of-same-len" } }))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await cronGET(new Request("http://x/api/cron/reminders", { headers: { authorization: "Bearer " } }))).status).toBe(401);
  });
});

describe("alertes", () => {
  it("stuck repair, delivery at risk, low stock appear with responsible and contact", async () => {
    const admin = await makeUser("ADMIN");
    const mech = await makeUser("MECHANIC");
    const { wo: stuck } = await makeWorkOrder({ status: "IN_PROGRESS" });
    await prisma.workOrder.update({ where: { id: stuck.id }, data: { createdAt: new Date(Date.now() - 10 * DAY), mechanicId: mech.id } });
    const { wo: risky } = await makeWorkOrder({ status: "WAITING_PARTS" });
    await prisma.workOrder.update({ where: { id: risky.id }, data: { promisedAt: new Date(Date.now() + 5 * 3_600_000) } });
    const part = await createPart({ sku: `L${Date.now()}`, name: "Joint", unit: "pcs", salePrice: 1_000, stock: 100, minStock: 200 }, admin);
    const a = await listAlerts();
    const s = a.open.find((x) => x.type === "stuck" && x.workOrder?.id === stuck.id);
    expect(s?.responsible).toBe(mech.name);
    expect(a.open.some((x) => x.type === "deliveryRisk" && x.workOrder?.id === risky.id)).toBe(true);
    expect(a.open.some((x) => x.type === "lowStock" && x.key.includes(part.id))).toBe(true);
  });

  it("handled → leaves the list; a NEW promised time is a new alert; snooze and reopen; journal", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder({ status: "IN_PROGRESS" });
    await prisma.workOrder.update({ where: { id: wo.id }, data: { promisedAt: new Date(Date.now() - 2 * 3_600_000) } });
    let late = (await listAlerts()).open.find((x) => x.type === "lateOrder" && x.workOrder?.id === wo.id)!;
    await updateAlert(admin, late.key, { assignTo: admin.id });
    await updateAlert(admin, late.key, { handled: true });
    let a = await listAlerts();
    expect(a.open.some((x) => x.key === late.key)).toBe(false);
    expect(a.quiet.find((x) => x.key === late.key)?.state?.assignedName).toBe(admin.name);

    await prisma.workOrder.update({ where: { id: wo.id }, data: { promisedAt: new Date(Date.now() - 3_600_000) } }); // promised again, late again
    late = (await listAlerts()).open.find((x) => x.type === "lateOrder" && x.workOrder?.id === wo.id)!;
    expect(late).toBeTruthy();
    await updateAlert(admin, late.key, { snoozeDays: 1 });
    a = await listAlerts();
    expect(a.open.some((x) => x.key === late.key)).toBe(false);
    await updateAlert(admin, late.key, { handled: false });
    expect((await listAlerts()).open.some((x) => x.key === late.key)).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: late.key } })).toBe(2);
    await expect(updateAlert(admin, "x'; drop table--", { handled: true })).rejects.toMatchObject({ code: "invalid" });
  });
});
