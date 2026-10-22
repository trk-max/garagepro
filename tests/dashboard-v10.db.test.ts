/**
 * V10 dashboard data on the real database: money only for finance roles, no double counting,
 * favourites and target audited, open orders rebuilt from dates. Run: npm run test:db
 * The test database is shared by all files: figures are checked as before/after differences
 * or on dates no other test uses (2019, 2031).
 */
import { afterAll, describe, expect, it } from "vitest";
import { setAppointmentStatus } from "@/server/booking";
import { kpis, mechanicsNow, monthlyTarget, openOrdersAt, revenueByMonth, setMonthlyTarget, todayRevenue } from "@/server/dashboard-v10";
import { customerCards, recentCustomers, toggleFavoriteCustomer } from "@/server/dashboard-v10-customers";
import { todaySchedule } from "@/server/dashboard-v10-schedule";
import { monthlyPurchases, partCards, stockAlertSettings, stockCounts, stockOverview } from "@/server/dashboard-v10-stock";
import { createPart } from "@/server/parts";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

let n = 0;
const tag = () => `v10${Date.now().toString(36)}${(n++).toString(36)}`;

async function invoice(issuedAt: Date, totalTtc: number, paidAmount: number) {
  const { wo, customer } = await makeWorkOrder();
  return prisma.invoice.create({
    data: { number: `F-${tag()}`, workOrderId: wo.id, customerId: customer.id, totalHt: totalTtc, totalTax: 0, stampDuty: 0, totalTtc, paidAmount, issuedAt, status: paidAmount >= totalTtc ? "PAID" : paidAmount > 0 ? "PARTIAL" : "ISSUED", snapshot: {} },
  });
}
const pay = (invoiceId: string, amount: number, paidAt: Date) => prisma.payment.create({ data: { invoiceId, amount, method: "CASH", paidAt } });

afterAll(() => prisma.setting.updateMany({ where: { id: "garage" }, data: { monthlyRevenueTarget: 0 } }));

describe("V10 — money is for finance roles only", () => {
  it("mechanics, storekeepers and HR are refused; kpis hides the revenue for them", async () => {
    for (const role of ["MECHANIC", "STOREKEEPER", "HR"] as const) {
      const u = await makeUser(role);
      await expect(todayRevenue(u)).rejects.toMatchObject({ code: "forbidden" });
      await expect(revenueByMonth(u, 2031)).rejects.toMatchObject({ code: "forbidden" });
      await expect(monthlyTarget(u)).rejects.toMatchObject({ code: "forbidden" });
      expect((await kpis(u)).revenue).toBeNull();
    }
    expect((await kpis(await makeUser("ACCOUNTANT"))).revenue).not.toBeNull();
  });

  it("revenueByMonth: paid by payment month, pending by invoice month, never twice", async () => {
    const admin = await makeUser("ADMIN");
    const a = await invoice(new Date("2031-01-10T10:00:00Z"), 100_000, 60_000);
    await pay(a.id, 40_000, new Date("2031-01-12T10:00:00Z"));
    await pay(a.id, 20_000, new Date("2031-02-03T10:00:00Z"));
    await invoice(new Date("2031-02-20T10:00:00Z"), 30_000, 0);
    const rows = await revenueByMonth(admin, 2031);
    expect(rows[0]).toEqual({ month: "2031-01", paid: 40_000, pending: 40_000 });
    expect(rows[1]).toEqual({ month: "2031-02", paid: 20_000, pending: 30_000 });
    expect(rows.reduce((s, r) => s + r.paid + r.pending, 0)).toBe(130_000);
  });

  it("todayRevenue and the monthly target count a payment received now", async () => {
    const admin = await makeUser("ADMIN");
    const before = await todayRevenue(admin);
    const target0 = await monthlyTarget(admin);
    const inv = await invoice(new Date(), 12_345, 12_345);
    await pay(inv.id, 12_345, new Date(Date.now() - 60_000));
    expect((await todayRevenue(admin)).current - before.current).toBe(12_345);
    expect((await monthlyTarget(admin)).achieved - target0.achieved).toBe(12_345);
  });
});

describe("V10 — monthly target setting", () => {
  it("only the administrator sets it, audited; 0 = no target", async () => {
    const admin = await makeUser("ADMIN");
    await expect(setMonthlyTarget(await makeUser("MANAGER"), 1_000)).rejects.toMatchObject({ code: "forbidden" });
    await expect(setMonthlyTarget(admin, -5)).rejects.toMatchObject({ code: "invalid" });
    await setMonthlyTarget(admin, 5_000_000);
    const t = await monthlyTarget(admin);
    expect(t.target).toBe(5_000_000);
    expect(t.percent).toBe(Math.round((t.achieved / 5_000_000) * 1000) / 10);
    expect(await prisma.auditLog.count({ where: { action: "settings.monthlyTarget", actorId: admin.id } })).toBe(1);
    await setMonthlyTarget(admin, 0);
    expect((await monthlyTarget(admin)).percent).toBeNull();
  });
});

describe("V10 — customers", () => {
  it("favourite toggle is audited and refused without viewCustomers", async () => {
    const reception = await makeUser("RECEPTION");
    const { customer } = await makeWorkOrder();
    expect(await toggleFavoriteCustomer(reception, customer.id)).toEqual({ isFavorite: true });
    expect(await toggleFavoriteCustomer(reception, customer.id)).toEqual({ isFavorite: false });
    const logs = await prisma.auditLog.findMany({ where: { entity: "Customer", entityId: customer.id, action: "customer.favorite" }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.after)).toEqual([{ isFavorite: true }, { isFavorite: false }]);
    for (const role of ["STOREKEEPER", "HR", "ACCOUNTANT"] as const) {
      await expect(toggleFavoriteCustomer(await makeUser(role), customer.id)).rejects.toMatchObject({ code: "forbidden" });
    }
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).isFavorite).toBe(false);
  });

  it("cards: tabs, search, vehicles, last visit and pages", async () => {
    const t = tag();
    const person = await prisma.customer.create({ data: { name: `Zz ${t} Ali`, phone: "20000001" } });
    const company = await prisma.customer.create({ data: { name: `Zz ${t} Transport`, phone: "20000002", isCompany: true, isFavorite: true } });
    const { wo } = await makeWorkOrder({ customerId: person.id });
    await makeWorkOrder({ customerId: person.id });
    const all = await customerCards({ q: t });
    expect(all.items.map((c) => c.id)).toEqual([person.id, company.id]);
    expect(all.items[0]).toMatchObject({ kind: "PERSON", vehicles: 2, isFavorite: false });
    expect(all.items[0]!.lastVisit!.getTime()).toBeGreaterThanOrEqual(wo.createdAt.getTime());
    expect(all.items[1]).toMatchObject({ kind: "COMPANY", vehicles: 0, lastVisit: null });
    expect((await customerCards({ q: t, tab: "favourites" })).items.map((c) => c.id)).toEqual([company.id]);
    expect((await customerCards({ q: t, tab: "companies" })).items.map((c) => c.id)).toEqual([company.id]);
    const p1 = await customerCards({ q: t, take: 1 });
    expect(p1.nextCursor).toBe(person.id);
    const p2 = await customerCards({ q: t, take: 1, cursor: p1.nextCursor });
    expect(p2).toEqual({ items: [expect.objectContaining({ id: company.id })], nextCursor: null });
    expect((await recentCustomers(1))[0]!.id).toBe(person.id);
  });
});

describe("V10 — repair orders and mechanics", () => {
  it("open orders 7 days ago are rebuilt from delivery / cancellation dates", async () => {
    const at = new Date("2020-01-01T00:00:00Z");
    const old = new Date("2019-06-01T10:00:00Z");
    const mk = async (status: string, extra: Record<string, unknown> = {}) => {
      const { wo } = await makeWorkOrder({ status });
      return prisma.workOrder.update({ where: { id: wo.id }, data: { createdAt: old, ...extra } });
    };
    const cancelEvent = (workOrderId: string, createdAt: Date) => prisma.workOrderEvent.create({ data: { workOrderId, type: "STATUS_CHANGED", data: { from: "RECEIVED", to: "CANCELLED" }, createdAt } });
    await mk("IN_PROGRESS");
    await mk("DELIVERED", { deliveredAt: new Date("2019-07-01T10:00:00Z") });
    await mk("DELIVERED", { deliveredAt: new Date("2020-02-01T10:00:00Z") });
    await cancelEvent((await mk("CANCELLED")).id, new Date("2019-08-01T10:00:00Z"));
    await cancelEvent((await mk("CANCELLED")).id, new Date("2020-03-01T10:00:00Z"));
    expect(await openOrdersAt(at)).toBe(3);
    const unknown = await mk("CANCELLED");
    expect(await openOrdersAt(at)).toBeNull();
    await prisma.workOrder.delete({ where: { id: unknown.id } });
  });

  it("completed this week counts a delivery made now", async () => {
    const admin = await makeUser("ADMIN");
    const before = (await kpis(admin)).completedThisWeek.current;
    await makeWorkOrder({ status: "DELIVERED" }).then(({ wo }) => prisma.workOrder.update({ where: { id: wo.id }, data: { deliveredAt: new Date(Date.now() - 60_000) } }));
    expect((await kpis(admin)).completedThisWeek.current).toBe(before + 1);
  });

  it("mechanics: work still to do (READY excluded) and presence from the clock", async () => {
    const m = await makeUser("MECHANIC");
    for (const status of ["IN_PROGRESS", "DIAGNOSIS", "READY", "DELIVERED"]) {
      const { wo } = await makeWorkOrder({ status });
      await prisma.workOrder.update({ where: { id: wo.id }, data: { mechanicId: m.id } });
    }
    await prisma.clockEvent.create({ data: { userId: m.id, kind: "IN", at: new Date(Date.now() - 3_600_000), method: "CORRECTION" } });
    const off = await makeUser("MECHANIC");
    // The shared test database holds every mechanic created by the other files: take them all (an idle one sorts last).
    const list = await mechanicsNow(new Date(), 10_000);
    expect(list.find((x) => x.id === m.id)).toMatchObject({ activeOrders: 2, presence: "ACTIVE" });
    expect(list.find((x) => x.id === off.id)).toMatchObject({ activeOrders: 0, presence: "OFF" });
  });
});

describe("V10 — stock and schedule", () => {
  it("stock value, items in stock, purchases and part cards", async () => {
    const keeper = await makeUser("STOREKEEPER");
    await expect(monthlyPurchases(await makeUser("MECHANIC"))).rejects.toMatchObject({ code: "forbidden" });
    await expect(stockOverview(await makeUser("HR"))).rejects.toMatchObject({ code: "forbidden" });
    // Stock value is money: storekeepers and mechanics get the counts only.
    const admin = await makeUser("ADMIN");
    await expect(stockOverview(keeper)).rejects.toMatchObject({ code: "forbidden" });
    await expect(stockOverview(await makeUser("MECHANIC"))).rejects.toMatchObject({ code: "forbidden" });
    const countsBefore = await stockCounts(await makeUser("MECHANIC"));
    expect(Object.keys(countsBefore).sort()).toEqual(["itemsInStock", "totalParts"]);
    const before = await stockOverview(admin);
    const buysBefore = await monthlyPurchases(keeper);
    const t = tag();
    const supplier = await prisma.supplier.create({ data: { name: `Fournisseur ${t}` } });
    const part = await createPart({ sku: `SKU-${t}`, name: `Filtre ${t}`, unit: "pce", costPrice: 2_000, salePrice: 3_000, stock: 300, minStock: 600 }, keeper);
    await prisma.part.update({ where: { id: part.id }, data: { defaultSupplierId: supplier.id } });
    await prisma.goodsReceipt.create({ data: { number: `BR-${t}`, supplierId: supplier.id, lines: { create: [{ partId: part.id, quantityX100: 250, unitCost: 2_000 }] } } });
    const after = await stockOverview(admin);
    const countsAfter = await stockCounts(keeper);
    expect(countsAfter.itemsInStock - countsBefore.itemsInStock).toBe(1);
    expect(countsAfter.totalParts - countsBefore.totalParts).toBe(1);
    expect(after.value - before.value).toBe(6_000);
    expect(after.previousValue).toBe(before.previousValue); // the stock arrived this month
    expect(after.itemsInStock - before.itemsInStock).toBe(1);
    expect(after.totalParts - before.totalParts).toBe(1);
    const buys = await monthlyPurchases(keeper);
    expect(buys).toHaveLength(6);
    expect(buys.at(-1)!.amount - buysBefore.at(-1)!.amount).toBe(5_000);
    const cards = await partCards({ q: t });
    expect(cards.items).toEqual([expect.objectContaining({ id: part.id, supplier: `Fournisseur ${t}`, stockX100: 300, minStockX100: 600, percentOfMin: 50, isLow: true, unit: "pce" })]);
    expect(stockAlertSettings().toggles).toEqual([]);
  });

  it("today's schedule leaves cancelled ones out; cancelling is audited", async () => {
    const reception = await makeUser("RECEPTION");
    const service = await prisma.bookableService.create({ data: { name: `Vidange ${tag()}`, durationMin: 30 } });
    const mk = (plate: string) =>
      prisma.appointment.create({ data: { reference: `RDV-${tag()}`, serviceId: service.id, startAt: new Date(), endAt: new Date(Date.now() + 1_800_000), firstName: "Sami", lastName: "B", phone: "20000003", plate } });
    const keep = await mk("111TU1");
    const drop = await mk("111TU2");
    await setAppointmentStatus(drop.id, "CANCELLED", reception);
    const { items } = await todaySchedule();
    expect(items.some((i) => i.id === keep.id && i.service === service.name && i.customerName === "Sami B")).toBe(true);
    expect(items.some((i) => i.id === drop.id)).toBe(false);
    expect(await prisma.auditLog.count({ where: { entity: "Appointment", entityId: drop.id, action: "appointment.status", actorId: reception.id } })).toBe(1);
    await expect(setAppointmentStatus(drop.id, "NO_SHOW", reception)).rejects.toMatchObject({ code: "invalid" });
  });
});
