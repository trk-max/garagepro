/**
 * V12 — agenda des prochaines réparations, on a real PostgreSQL test database.
 * SMS / e-mail are replaced by fake senders (nothing leaves the PC). Run: npm run test:db
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (session.userId ? { user: { id: session.userId } } : null) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const agenda = await import("@/server/agenda");
const { agendaBulkAction, sendAgendaAction } = await import("@/actions/agenda");
const { changeStatus } = await import("@/server/work-orders");
const { issueVehicleQr, revokeVehicleQr } = await import("@/server/vehicle-qr");
const { makeUser, makeWorkOrder, prisma } = await import("./helpers/db");
import type { Sender } from "@/server/reminders";

afterEach(() => {
  session.userId = null;
  vi.unstubAllEnvs();
});

const DAY = 86_400_000;
let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

function fakeSender() {
  const sms: string[] = [];
  const sender: Sender = {
    channels: () => ["SMS"],
    sms: async (to) => {
      sms.push(to);
      return { ok: true };
    },
    email: async () => ({ ok: true, id: "e1" }),
  };
  return { sender, sms };
}

async function makeItem(extra: Partial<{ keywords: string[]; partIds: string[]; packageIds: string[]; intervalKm: number | null; intervalMonths: number | null }> = {}) {
  const code = `T-${uniq()}`;
  return prisma.maintenanceItem.create({
    data: { code, nameFr: `Plaquettes ${code}`, keywords: extra.keywords ?? [`plaquettes ${code.toLowerCase()}`], partIds: extra.partIds ?? [], packageIds: extra.packageIds ?? [], intervalKm: extra.intervalKm === undefined ? 10_000 : extra.intervalKm, intervalMonths: extra.intervalMonths ?? null },
  });
}

/**
 * A vehicle with an earlier visit (120 days ago, 40 000 km) and a delivered order 20 days ago at 44 000 km
 * whose line names the item → rhythm ≈ 1 000 km/month, last replacement 44 000 km, due 54 000 km.
 */
async function vehicleWithReplacement(item: { code: string }, opts: { customerId?: string; line?: string } = {}) {
  const { wo: first, vehicle, customer } = await makeWorkOrder({ customerId: opts.customerId });
  await prisma.workOrder.update({ where: { id: first.id }, data: { mileageIn: 40_000, createdAt: new Date(Date.now() - 120 * DAY), status: "DELIVERED", deliveredAt: new Date(Date.now() - 119 * DAY) } });
  const wo = await prisma.workOrder.create({
    data: { complaint: "Freins", customerId: customer.id, vehicleId: vehicle.id, mileageIn: 44_000, status: "DELIVERED", deliveredAt: new Date(Date.now() - 20 * DAY), createdAt: new Date(Date.now() - 21 * DAY) },
  });
  // V16 Lot 2: work actually done = lines the customer accepted (a delivered order's lines).
  await prisma.workOrderLine.create({ data: { workOrderId: wo.id, approvalStatus: "APPROVED", type: "PART", description: opts.line ?? `Plaquettes ${item.code.toLowerCase()} Bosch`, quantityX100: 100, unitPrice: 150_000 } });
  await agenda.detectForOrders([wo.id]);
  await agenda.recomputeForecasts([vehicle.id]);
  return { vehicle, customer, wo };
}

const current = (vehicleId: string, itemId: string) => prisma.maintenanceForecast.findFirstOrThrow({ where: { vehicleId, itemId, isCurrent: true } });

describe("détection des remplacements", () => {
  it("from delivered orders: linked part, package, keyword; cancelled and open orders ignored", async () => {
    const part = await prisma.part.create({ data: { sku: `P-${uniq()}`, name: "Filtre", salePrice: 20_000 } });
    const pkg = await prisma.servicePackage.create({ data: { name: `Vidange ${uniq()}` } });
    const byPart = await makeItem({ partIds: [part.id], keywords: [] });
    const byPkg = await makeItem({ packageIds: [pkg.id], keywords: [] });
    const byKw = await makeItem({ keywords: ["courroie de distribution"] });
    const { wo, vehicle } = await makeWorkOrder({ status: "DELIVERED" });
    await prisma.workOrder.update({ where: { id: wo.id }, data: { deliveredAt: new Date(), mileageIn: 80_000 } });
    await prisma.workOrderLine.createMany({
      data: [
        { workOrderId: wo.id, approvalStatus: "APPROVED", type: "PART", description: "Filtre", partId: part.id, quantityX100: 100, unitPrice: 20_000 },
        { workOrderId: wo.id, approvalStatus: "APPROVED", type: "LABOR", description: "Remplacement Courroie de distribution", quantityX100: 200, unitPrice: 35_000 },
      ],
    });
    await prisma.workOrderEvent.create({ data: { workOrderId: wo.id, type: "PACKAGE_APPLIED", data: { name: pkg.name, packageId: pkg.id } } });
    const cancelled = await prisma.workOrder.create({ data: { complaint: "x", customerId: wo.customerId, vehicleId: vehicle.id, status: "CANCELLED" } });
    const open = await prisma.workOrder.create({ data: { complaint: "x", customerId: wo.customerId, vehicleId: vehicle.id, status: "IN_PROGRESS" } });
    for (const o of [cancelled, open]) await prisma.workOrderLine.create({ data: { workOrderId: o.id, type: "LABOR", description: "Courroie de distribution", quantityX100: 100, unitPrice: 1 } });

    expect(await agenda.detectForOrders([wo.id, cancelled.id, open.id])).toBe(3);
    const events = await prisma.maintenanceEvent.findMany({ where: { vehicleId: vehicle.id }, orderBy: { source: "asc" } });
    expect(events.map((e) => [e.itemId, e.source, e.km, e.workOrderId])).toEqual([
      [byKw.id, "KEYWORD", 80_000, wo.id],
      [byPkg.id, "PACKAGE", 80_000, wo.id],
      [byPart.id, "PART", 80_000, wo.id],
    ]);
    expect(events.find((e) => e.source === "PART")!.amountTtc).toBe(23_800);
    // Running it again creates nothing (one event per order and item).
    expect(await agenda.detectForOrders([wo.id, cancelled.id, open.id])).toBe(0);
  });

  it("delivering an order (real status change) detects and computes the forecast", async () => {
    const item = await makeItem();
    const admin = await makeUser("ADMIN");
    const { wo, vehicle } = await makeWorkOrder({ status: "READY" });
    await prisma.workOrder.update({ where: { id: wo.id }, data: { mileageIn: 30_000 } });
    await prisma.workOrderLine.create({ data: { workOrderId: wo.id, approvalStatus: "APPROVED", type: "LABOR", description: `Plaquettes ${item.code.toLowerCase()}`, quantityX100: 100, unitPrice: 50_000 } });
    await changeStatus(wo.id, "DELIVERED", admin, { override: true, reason: "Test : livraison sans facture (dérogation V16)" }); // V16: no invoice here → traced override
    const f = await current(vehicle.id, item.id);
    expect(f).toMatchObject({ method: "REFERENCE", dueKm: 40_000, lastDoneKm: 30_000, status: "PROPOSED" });
    // A single reading: rhythm unknown → km only, no invented date.
    expect(f.dueDate).toBeNull();
    expect(f.missing).toContain("rhythm");
  });

  it("a correction is journaled and keeps the original data; a cancellation removes the event from the calculation", async () => {
    const item = await makeItem();
    const admin = await makeUser("MANAGER");
    const { vehicle } = await vehicleWithReplacement(item);
    const ev = await prisma.maintenanceEvent.findFirstOrThrow({ where: { vehicleId: vehicle.id, itemId: item.id } });
    await agenda.correctEvent(admin, ev.id, { doneAt: ev.doneAt, km: 45_000 });
    const after = await prisma.maintenanceEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect([after.km, after.correctedKm, after.correctedById]).toEqual([44_000, 45_000, admin.id]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "MaintenanceEvent", entityId: ev.id, action: "agenda.eventCorrect" } });
    expect(log.before).toMatchObject({ km: 44_000 });
    expect(log.after).toMatchObject({ km: 45_000 });
    expect((await current(vehicle.id, item.id)).dueKm).toBe(55_000);

    await agenda.correctEvent(admin, ev.id, { cancelReason: "Ligne mal saisie" });
    expect(await prisma.auditLog.count({ where: { entityId: ev.id, action: "agenda.eventCancel" } })).toBe(1);
    const f = await current(vehicle.id, item.id);
    expect(f.method).toBe("IMPOSSIBLE");
    expect(f.missing).toEqual(["lastReplacement"]);
    // Re-scanning the delivered orders does not bring the cancelled detection back.
    await agenda.scanDeliveredOrders();
    expect((await prisma.maintenanceEvent.findUniqueOrThrow({ where: { id: ev.id } })).cancelledAt).not.toBeNull();
  });
});

describe("recalcul", () => {
  it("is idempotent: same data → no new version", async () => {
    const item = await makeItem();
    const { vehicle } = await vehicleWithReplacement(item);
    const f = await current(vehicle.id, item.id);
    expect(f.method).toBe("REFERENCE");
    expect(f.kmPerMonth).toBeGreaterThan(900);
    expect(f.dueDate).not.toBeNull();
    const again = await agenda.recomputeForecasts([vehicle.id]);
    expect(again.created).toBe(0);
    expect(await prisma.maintenanceForecast.count({ where: { vehicleId: vehicle.id, itemId: item.id } })).toBe(1);
  });

  it("simulated OBD readings and lower mileages are excluded from the driving rhythm", async () => {
    const item = await makeItem();
    const { vehicle } = await vehicleWithReplacement(item);
    const before = await current(vehicle.id, item.id);
    await prisma.vehicleReading.createMany({
      data: [
        { vehicleId: vehicle.id, source: "SIMULATED", odometerKm: 900_000, odometerStatus: "SIMULATED" },
        { vehicleId: vehicle.id, source: "ADAPTER", odometerKm: 10_000, odometerStatus: "LOWER" },
      ],
    });
    // Same result as before: nothing new is written (a 900 000 km simulated reading changes nothing).
    expect((await agenda.recomputeForecasts([vehicle.id])).created).toBe(0);
    const after = await current(vehicle.id, item.id);
    expect([after.id, after.kmPerMonth, after.dueDate]).toEqual([before.id, before.kmPerMonth, before.dueDate]);
    // A real reading does change it (new version, rhythm recomputed).
    await prisma.vehicleReading.create({ data: { vehicleId: vehicle.id, source: "ADAPTER", odometerKm: 47_000, odometerStatus: "APPLIED" } });
    await agenda.afterReading(vehicle.id);
    const real = await current(vehicle.id, item.id);
    expect(real.version).toBe(2);
    expect((real.explain as { rhythm: { excluded: number; readings: number } }).rhythm).toMatchObject({ excluded: 2, readings: 3 });
  });

  it("history: a forecast already sent is never rewritten — a new version is created", async () => {
    const item = await makeItem();
    const rec = await makeUser("RECEPTION");
    const { vehicle } = await vehicleWithReplacement(item);
    const v1 = await current(vehicle.id, item.id);
    await agenda.validateForecasts(rec, [v1.id]);
    await agenda.sendForecasts(rec, [v1.id], { sender: fakeSender().sender });
    expect((await prisma.maintenanceForecast.findUniqueOrThrow({ where: { id: v1.id } })).status).toBe("SENT");

    await prisma.maintenanceItem.update({ where: { id: item.id }, data: { intervalKm: 15_000 } });
    await agenda.recomputeForecasts([vehicle.id]);
    const old = await prisma.maintenanceForecast.findUniqueOrThrow({ where: { id: v1.id } });
    expect([old.isCurrent, old.dueKm, old.signature, old.status]).toEqual([false, 54_000, v1.signature, "SENT"]);
    const v2 = await current(vehicle.id, item.id);
    expect([v2.version, v2.dueKm, v2.previousId, v2.status]).toEqual([2, 59_000, v1.id, "SENT"]);
  });

  it("a new replacement (new cycle) marks the sent forecast 'done' and starts a new proposal", async () => {
    const item = await makeItem();
    const rec = await makeUser("RECEPTION");
    const { vehicle, customer } = await vehicleWithReplacement(item);
    const v1 = await current(vehicle.id, item.id);
    await agenda.validateForecasts(rec, [v1.id]);
    await agenda.sendForecasts(rec, [v1.id], { sender: fakeSender().sender });
    const wo = await prisma.workOrder.create({ data: { complaint: "x", customerId: customer.id, vehicleId: vehicle.id, mileageIn: 53_500, status: "DELIVERED", deliveredAt: new Date() } });
    await prisma.workOrderLine.create({ data: { workOrderId: wo.id, approvalStatus: "APPROVED", type: "PART", description: `Plaquettes ${item.code.toLowerCase()}`, quantityX100: 100, unitPrice: 150_000 } });
    await agenda.afterOrderDelivered(wo.id);
    const old = await prisma.maintenanceForecast.findUniqueOrThrow({ where: { id: v1.id } });
    expect([old.status, old.doneWorkOrderId]).toEqual(["DONE", wo.id]);
    expect(await current(vehicle.id, item.id)).toMatchObject({ status: "PROPOSED", dueKm: 63_500 });
  });
});

describe("envoi des messages", () => {
  it("nothing is sent without the garage's validation; then one SMS, never twice for the same cycle", async () => {
    const item = await makeItem();
    const rec = await makeUser("RECEPTION");
    const { vehicle, customer } = await vehicleWithReplacement(item);
    const f = await current(vehicle.id, item.id);
    const fake = fakeSender();
    expect(await agenda.sendForecasts(rec, [f.id], { sender: fake.sender })).toEqual([{ id: f.id, result: "NOT_VALIDATED" }]);
    expect(fake.sms).toEqual([]);
    expect(await prisma.notification.count({ where: { customerId: customer.id } })).toBe(0);

    await agenda.validateForecasts(rec, [f.id]);
    expect((await agenda.sendForecasts(rec, [f.id], { sender: fake.sender, lang: "ar" }))[0]!.result).toBe("SENT");
    const rows = await prisma.notification.findMany({ where: { customerId: customer.id } });
    expect(rows.map((r) => [r.kind, r.channel, r.status, r.forecastId])).toEqual([["AGENDA", "SMS", "SENT", f.id]]);
    expect(rows[0]!.body).toContain("تقدير");

    // Ignored then validated again: same item, same cycle → refused (anti-repetition).
    await agenda.ignoreForecasts(rec, [f.id], "client injoignable");
    await agenda.validateForecasts(rec, [f.id]);
    expect((await agenda.sendForecasts(rec, [f.id], { sender: fake.sender }))[0]!.result).toBe("ALREADY_SENT");
    expect(fake.sms).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entityId: f.id, action: { in: ["agenda.validate", "agenda.send", "agenda.ignore"] } } })).toBe(4);
  });

  it("customer refused reminders → no message, a 'skipped' line says why", async () => {
    const item = await makeItem();
    const rec = await makeUser("RECEPTION");
    const { vehicle, customer } = await vehicleWithReplacement(item);
    await prisma.customer.update({ where: { id: customer.id }, data: { reminderOptOut: true } });
    const f = await current(vehicle.id, item.id);
    await agenda.validateForecasts(rec, [f.id]);
    const fake = fakeSender();
    expect((await agenda.sendForecasts(rec, [f.id], { sender: fake.sender }))[0]!.result).toBe("OPT_OUT");
    expect(fake.sms).toEqual([]);
    expect((await prisma.notification.findMany({ where: { customerId: customer.id } })).map((r) => [r.status, r.channel])).toEqual([["SKIPPED", "NONE"]]);
    expect((await current(vehicle.id, item.id)).status).toBe("VALIDATED");
  });

  it("daily job: automatic sending is OFF by default (only validated forecasts go); ON only by setting", async () => {
    const item = await makeItem({ intervalKm: null, intervalMonths: 1 }); // due ~10 days after the replacement → within the lead time
    const { vehicle } = await vehicleWithReplacement(item);
    const f = await current(vehicle.id, item.id);
    expect(f.status).toBe("PROPOSED");
    const fake = fakeSender();
    await agenda.runAgendaDaily(new Date(), fake.sender);
    expect((await current(vehicle.id, item.id)).status).toBe("PROPOSED");
    expect(fake.sms).toEqual([]);
    await prisma.setting.upsert({ where: { id: "garage" }, update: { agendaAutoSend: true, agendaAutoMinConfidence: "MEDIUM" }, create: { id: "garage", agendaAutoSend: true } });
    try {
      await agenda.runAgendaDaily(new Date(), fake.sender);
      expect((await current(vehicle.id, item.id)).status).toBe("SENT");
      expect(fake.sms.length).toBeGreaterThan(0);
    } finally {
      await prisma.setting.update({ where: { id: "garage" }, data: { agendaAutoSend: false } });
    }
  });
});

describe("droits d'accès", () => {
  const as = (id: string) => {
    session.userId = id;
  };

  it("a mechanic sees but cannot validate nor send; reception can", async () => {
    const item = await makeItem();
    const { vehicle } = await vehicleWithReplacement(item);
    const f = await current(vehicle.id, item.id);
    as((await makeUser("MECHANIC")).id);
    expect(await agendaBulkAction("validate", [f.id])).toMatchObject({ ok: false });
    expect(await sendAgendaAction([f.id], "fr")).toMatchObject({ ok: false });
    expect((await current(vehicle.id, item.id)).status).toBe("PROPOSED");
    as((await makeUser("RECEPTION")).id);
    expect(await agendaBulkAction("validate", [f.id])).toMatchObject({ ok: true });
    expect((await current(vehicle.id, item.id)).status).toBe("VALIDATED");
  });

  it("customer (tracking session) sees only the vehicle of their order", async () => {
    const item = await makeItem();
    const a = await vehicleWithReplacement(item);
    await vehicleWithReplacement(item);
    const list = await agenda.trackingForecasts(a.wo.id);
    expect(list.map((x) => x.id)).toEqual([(await current(a.vehicle.id, item.id)).id]);
  });

  it("company portal: its own fleet only; amounts hidden for a viewer", async () => {
    const item = await makeItem();
    const fleet = await prisma.customer.create({ data: { name: `Flotte ${uniq()}`, phone: "71000000", isCompany: true } });
    const mine = await vehicleWithReplacement(item, { customerId: fleet.id });
    await vehicleWithReplacement(item); // another customer's car
    const viewer = { id: "cu", customerId: fleet.id, name: "x", email: "x@t.tn" };
    const admin = await agenda.companyAgenda({ ...viewer, role: "FLEET_ADMIN" });
    expect(admin.rows.map((r) => r.vehicle.id)).toEqual([mine.vehicle.id]);
    expect(admin.rows[0]!.priceTtc).toBe(178_500); // last price invoiced: 150 DT HT + 19 %
    const ro = await agenda.companyAgenda({ ...viewer, role: "VIEWER" });
    expect([ro.money, ro.rows[0]!.priceTtc]).toEqual([false, null]);
  });

  it("QR: public card without amounts; a revoked QR gets nothing", async () => {
    const item = await makeItem();
    const admin = await makeUser("ADMIN");
    const { vehicle } = await vehicleWithReplacement(item);
    const token = await issueVehicleQr(admin, vehicle.id);
    const who = { staff: null, company: null, ip: `203.0.113.${n % 200}` };
    const list = await agenda.qrForecasts(token, who);
    expect(list).toHaveLength(1);
    expect(list![0]!.priceTtc).toBeNull();
    await revokeVehicleQr(admin, vehicle.id);
    expect(await agenda.qrForecasts(token, who)).toBeNull();
  });
});

describe("liens avec le reste", () => {
  it("online booking naming the item → forecast 'booked'; add to quote uses the linked package", async () => {
    const pkg = await prisma.servicePackage.create({ data: { name: `Freins ${uniq()}`, lines: { create: [{ type: "LABOR", description: "Main-d'œuvre freins", quantityX100: 100, unitPrice: 40_000 }] } } });
    const item = await makeItem({ packageIds: [pkg.id] });
    const rec = await makeUser("RECEPTION");
    const { vehicle, customer } = await vehicleWithReplacement(item);
    const f = await current(vehicle.id, item.id);
    expect([f.priceTtc, f.priceSource]).toEqual([47_600, "PACKAGE"]);

    const open = await prisma.workOrder.create({ data: { complaint: "Révision", customerId: customer.id, vehicleId: vehicle.id, mileageIn: 52_000 } });
    expect((await agenda.suggestionsForOrder(open.id)).map((s) => s.id)).toEqual([f.id]);
    await agenda.addForecastToOrder(rec, open.id, f.id);
    expect((await prisma.workOrderLine.findMany({ where: { workOrderId: open.id } })).map((l) => l.description)).toEqual(["Main-d'œuvre freins"]);

    const svc = await prisma.bookableService.create({ data: { name: "Entretien", durationMin: 60 } });
    const appt = await prisma.appointment.create({ data: { reference: `RDV-${uniq()}`, serviceId: svc.id, startAt: new Date(), endAt: new Date(), firstName: "A", lastName: "B", phone: "20111222", plate: vehicle.plate, vehicleId: vehicle.id, notes: `Entretien : ${item.nameFr}` } });
    expect(await agenda.linkAppointment(appt)).toBe(1);
    expect(await current(vehicle.id, item.id)).toMatchObject({ status: "BOOKED", appointmentId: appt.id });
  });

  it("warranty still running on the item is shown", async () => {
    const item = await makeItem();
    const { vehicle, customer } = await vehicleWithReplacement(item);
    const ends = new Date(Date.now() + 200 * DAY);
    await prisma.warranty.create({ data: { kind: "REPAIR", vehicleId: vehicle.id, customerId: customer.id, label: `Plaquettes ${item.code.toLowerCase()} posées`, startsAt: new Date(), endsAt: ends } });
    await agenda.recomputeForecasts([vehicle.id]);
    expect((await current(vehicle.id, item.id)).warrantyUntil?.toISOString()).toBe(ends.toISOString());
  });
});
