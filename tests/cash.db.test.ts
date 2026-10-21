/**
 * Prompt 4/5 — cash forecast on the real database: each millime counted once, incomplete data,
 * who may see it, and the configurable "cashLow" alert. Real PostgreSQL. Run: npm run test:db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { utcToZoned } from "@/lib/booking";
import { addDaysToDay } from "@/lib/warranty";
import { listAlerts, updateAlert } from "@/server/alerts";
import { cashForecast, cashLowAlert, loadForecastInput, recordCashBalance } from "@/server/cash";
import { createExpense, payOccurrence } from "@/server/expenses";
import { createInvoice, recordPayment } from "@/server/invoices";
import { paySupplierInvoice } from "@/server/purchasing";
import { addRefund, createWarranty, moveClaim, openClaim, setClaimAmounts } from "@/server/warranties";
import { addLine } from "@/server/work-orders";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

const today = () => utcToZoned(new Date(), "Africa/Tunis").date;
const setAlert = (cashAlertThreshold: number, cashAlertScenario = "PRUDENT") =>
  prisma.setting.upsert({ where: { id: "garage" }, update: { cashAlertThreshold, cashAlertScenario }, create: { id: "garage", cashAlertThreshold, cashAlertScenario } });

beforeAll(async () => {
  // Throw-away test database: start without any typed balance.
  await prisma.cashBalance.deleteMany();
  await setAlert(0);
});
afterAll(() => setAlert(0));

async function invoicedOrder(admin: { id: string; name: string; email: string; role: "ADMIN" }, unitPrice: number) {
  const { wo } = await makeWorkOrder();
  await addLine(wo.id, { type: "LABOR", description: "Main-d'œuvre", quantityX100: 100, unitPrice }, admin);
  return createInvoice(wo.id, admin);
}

describe("Trésorerie — données incomplètes et droits", () => {
  it("without a typed balance: flows shown, no balance invented, no alert", async () => {
    const admin = await makeUser("ADMIN");
    await setAlert(2_000_000_000);
    try {
      const f = await cashForecast(admin, { scenario: "NORMAL", horizon: 30 });
      expect(f.result.opening).toBeNull();
      expect(f.result.closing).toBeNull();
      expect(f.result.warnings.noBalance).toBe(true);
      expect(f.alert.breach).toBeNull();
      expect(await cashLowAlert()).toBeNull();
    } finally {
      await setAlert(0);
    }
  });

  it("mechanics and reception cannot open the forecast nor type a balance", async () => {
    for (const role of ["MECHANIC", "RECEPTION", "STOREKEEPER"] as const) {
      const u = await makeUser(role);
      await expect(cashForecast(u, { scenario: "NORMAL", horizon: 30 })).rejects.toMatchObject({ code: "forbidden" });
      await expect(recordCashBalance(u, { amount: 1, asOf: today() })).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("V9: the accountant READS the forecast but cannot type a balance; HR sees nothing", async () => {
    const accountant = await makeUser("ACCOUNTANT");
    const f = await cashForecast(accountant, { scenario: "NORMAL", horizon: 30 });
    expect(f.result).toBeTruthy();
    await expect(recordCashBalance(accountant, { amount: 1, asOf: today() })).rejects.toMatchObject({ code: "forbidden" });
    const hr = await makeUser("HR");
    await expect(cashForecast(hr, { scenario: "NORMAL", horizon: 30 })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a balance dated in the future is refused; history is kept and the latest date is used", async () => {
    const manager = await makeUser("MANAGER");
    await expect(recordCashBalance(manager, { amount: 1, asOf: addDaysToDay(today(), 1) })).rejects.toMatchObject({ code: "balanceFuture" });
    await recordCashBalance(manager, { amount: 5_000_000, asOf: addDaysToDay(today(), -10) });
    await recordCashBalance(manager, { amount: 7_000_000, asOf: addDaysToDay(today(), -1), note: "caisse + BIAT" });
    await recordCashBalance(manager, { amount: 1, asOf: addDaysToDay(today(), -20) }); // typed later, but older date
    const input = await loadForecastInput();
    expect(input.balance).toEqual({ amount: 7_000_000, asOf: addDaysToDay(today(), -1) });
    expect(await prisma.cashBalance.count()).toBe(3);
    expect(await prisma.auditLog.count({ where: { entity: "CashBalance", actorId: manager.id } })).toBe(3);
  });

  it("invoice without due date: issue date + payment terms, reported", async () => {
    const admin = (await makeUser("ADMIN")) as { id: string; name: string; email: string; role: "ADMIN" };
    const inv = await invoicedOrder(admin, 10_000);
    await prisma.invoice.update({ where: { id: inv.id }, data: { dueDate: null } });
    const f = await cashForecast(admin, { scenario: "OPTIMISTIC", horizon: 90 });
    const item = f.result.items.find((i) => i.id === inv.id)!;
    const terms = (await prisma.setting.findUniqueOrThrow({ where: { id: "garage" } })).paymentTermsDays;
    expect(item.dueDay).toBe(addDaysToDay(today(), terms));
    expect(f.result.warnings.invoicesWithoutDueDate).toBeGreaterThanOrEqual(1);
  });
});

describe("Trésorerie — sans double comptage", () => {
  it("customer invoice: before / partly paid / fully paid → the end balance moves by its total exactly once", async () => {
    const admin = (await makeUser("ADMIN")) as { id: string; name: string; email: string; role: "ADMIN" };
    const base = await cashForecast(admin, { scenario: "OPTIMISTIC", horizon: 90 });
    const inv = await invoicedOrder(admin, 100_000);
    const total = (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).totalTtc;

    const f1 = await cashForecast(admin, { scenario: "OPTIMISTIC", horizon: 90 });
    expect(f1.result.closing! - base.result.closing!).toBe(total);
    expect(f1.result.opening).toBe(base.result.opening);

    await recordPayment(inv.id, { amount: 40_000, method: "CASH" }, admin);
    const f2 = await cashForecast(admin, { scenario: "OPTIMISTIC", horizon: 90 });
    expect(f2.result.opening! - base.result.opening!).toBe(40_000); // real money, today
    expect(f2.result.closing! - base.result.closing!).toBe(total); // not 40 000 more
    expect(f2.result.items.find((i) => i.id === inv.id)!.amount).toBe(total - 40_000);

    await recordPayment(inv.id, { amount: total - 40_000, method: "TRANSFER" }, admin);
    const f3 = await cashForecast(admin, { scenario: "OPTIMISTIC", horizon: 90 });
    expect(f3.result.opening! - base.result.opening!).toBe(total);
    expect(f3.result.closing! - base.result.closing!).toBe(total);
    expect(f3.result.items.some((i) => i.id === inv.id)).toBe(false);
  });

  it("supplier invoice, expense due date and warranty refund: paying moves money from 'expected' to 'real', the end balance does not move", async () => {
    const admin = (await makeUser("ADMIN")) as { id: string; name: string; email: string; role: "ADMIN" };
    const supplier = await prisma.supplier.create({ data: { name: "Fournisseur trésorerie" } });
    const base = await cashForecast(admin, { scenario: "NORMAL", horizon: 90 });

    const sInv = await prisma.supplierInvoice.create({ data: { number: `FT-${Date.now()}`, supplierId: supplier.id, issuedAt: new Date(), dueDate: new Date(Date.now() + 10 * 86_400_000), totalHt: 500_000, totalTax: 95_000, totalTtc: 595_000 } });
    const e = await createExpense(admin, { label: "Loyer trésorerie", category: "RENT", amount: 800_000, frequency: "ONCE", firstDueDate: addDaysToDay(today(), 5) });
    const { wo } = await makeWorkOrder();
    const w = await createWarranty(admin, wo.id, { kind: "PART", label: "Turbo", months: 12, supplierId: supplier.id });
    const claim = await openClaim(admin, w.id, "Turbo HS");
    await setClaimAmounts(admin, claim.id, { costParts: 300_000, costLabor: 0, amountClaimed: 300_000 });
    await moveClaim(admin, claim.id, "SUBMITTED");
    await moveClaim(admin, claim.id, "ACCEPTED");

    const f1 = await cashForecast(admin, { scenario: "NORMAL", horizon: 90 });
    // −595 000 supplier, −800 000 rent, +300 000 refund (normal: 100 % at decision + 30 days).
    expect(f1.result.closing! - base.result.closing!).toBe(-595_000 - 800_000 + 300_000);
    // Prudent: the refund is not counted at all.
    const p1 = await cashForecast(admin, { scenario: "PRUDENT", horizon: 90 });
    expect(p1.result.items.find((i) => i.id === claim.id)).toMatchObject({ amount: 0 });

    await paySupplierInvoice(sInv.id, { amount: 200_000, method: "CHECK" }, admin);
    const occ = await prisma.expenseOccurrence.findFirstOrThrow({ where: { expenseId: e.id } });
    await payOccurrence(admin, occ.id, { paidDay: today(), paidAmount: 800_000, method: "TRANSFER" });
    await addRefund(admin, claim.id, { amount: 300_000, receivedDay: today(), method: "TRANSFER" });

    const f2 = await cashForecast(admin, { scenario: "NORMAL", horizon: 90 });
    expect(f2.result.opening! - f1.result.opening!).toBe(-200_000 - 800_000 + 300_000);
    expect(f2.result.closing).toBe(f1.result.closing);
    expect(f2.result.items.find((i) => i.id === sInv.id)!.amount).toBe(395_000);
    expect(f2.result.items.some((i) => i.id === occ.id || i.id === claim.id)).toBe(false);
  });

  it("money already spent on a repair (direct expense) is not forecast", async () => {
    const admin = await makeUser("ADMIN");
    const before = await cashForecast(admin, { scenario: "NORMAL", horizon: 90 });
    const { wo } = await makeWorkOrder();
    await prisma.workOrderExpense.create({ data: { workOrderId: wo.id, description: "Remorquage", amount: 90_000 } });
    const after = await cashForecast(admin, { scenario: "NORMAL", horizon: 90 });
    expect(after.result.closing).toBe(before.result.closing);
  });
});

describe("Alerte de trésorerie (cashLow)", () => {
  it("only administrator and manager get it; reception cannot act on it", async () => {
    const admin = await makeUser("ADMIN");
    const manager = await makeUser("MANAGER");
    const reception = await makeUser("RECEPTION");
    await setAlert(2_000_000_000, "NORMAL"); // far above any test balance
    try {
      const forAdmin = (await listAlerts(new Date(), "ADMIN")).open.filter((a) => a.type === "cashLow");
      expect(forAdmin).toHaveLength(1);
      expect(forAdmin[0]!.key).toMatch(/^cashLow:NORMAL:\d{4}-\d{2}-\d{2}$/);
      expect(forAdmin[0]!.cash).toMatchObject({ scenario: "NORMAL", threshold: 2_000_000_000 });
      expect((await listAlerts(new Date(), "MANAGER")).open.some((a) => a.type === "cashLow")).toBe(true);
      for (const role of ["RECEPTION", "MECHANIC"] as const) {
        expect((await listAlerts(new Date(), role)).open.some((a) => a.type === "cashLow")).toBe(false);
      }
      expect((await listAlerts()).open.some((a) => a.type === "cashLow")).toBe(false);
      await expect(updateAlert(reception, forAdmin[0]!.key, { handled: true })).rejects.toMatchObject({ code: "forbidden" });
      await updateAlert(manager, forAdmin[0]!.key, { handled: true });
      expect((await listAlerts(new Date(), "ADMIN")).quiet.some((a) => a.key === forAdmin[0]!.key)).toBe(true);
      const f = await cashForecast(admin, { scenario: "OPTIMISTIC", horizon: 30 });
      expect(f.alert).toMatchObject({ scenario: "NORMAL", threshold: 2_000_000_000 });
      expect(f.alert.breach).not.toBeNull();
    } finally {
      await setAlert(0);
    }
    expect(await cashLowAlert()).toBeNull();
  });
});
