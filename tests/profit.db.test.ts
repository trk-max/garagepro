/**
 * Prompt 2/5, step A — real profit per repair, on a real PostgreSQL test database.
 * Run: npm run test:db   (see vitest.db.config.ts)
 */
import { beforeAll, describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import { createInvoice, recordPayment } from "@/server/invoices";
import { createPart, updatePart } from "@/server/parts";
import { addExpense, profitReport, voidExpense, workOrderProfit } from "@/server/profit";
import { addLine, removeLine } from "@/server/work-orders";
import { agreeAll, makeUser, makeWorkOrder, prisma } from "./helpers/db";

beforeAll(async () => {
  await prisma.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
  // 10 DT / hour labour cost, no overhead.
  await prisma.setting.update({ where: { id: "garage" }, data: { laborCostPerHour: 10_000, overheadMode: "NONE", overheadValue: 0 } });
});

const sku = () => `P${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

describe("bénéfice réel par réparation", () => {
  it("part cost is saved when the part is used; a later price change does not rewrite it", async () => {
    const admin = await makeUser("ADMIN");
    const part = await createPart({ sku: sku(), name: "Plaquettes", unit: "jeu", costPrice: 30_000, salePrice: 55_000, stock: 1_000 }, admin);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 200 }, admin);
    const line = await prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: wo.id } });
    expect(line.unitCost).toBe(30_000);

    await updatePart(part.id, { costPrice: 45_000 }, admin); // supplier raised the price later
    const p = await workOrderProfit(wo.id);
    expect(p!.partsCost).toBe(60_000); // 2 × 30 DT, not 2 × 45 DT
    expect(p!.flags).not.toContain("partCostEstimated");
  });

  it("a removed part line is not counted (no double counting with the stock return)", async () => {
    const admin = await makeUser("ADMIN");
    const part = await createPart({ sku: sku(), name: "Filtre", unit: "pcs", costPrice: 8_000, salePrice: 15_000, stock: 1_000 }, admin);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 100 }, admin);
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 100 }, admin);
    const first = await prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: wo.id } });
    await removeLine(first.id, admin);
    expect((await workOrderProfit(wo.id))!.partsCost).toBe(8_000);
  });

  it("full repair: revenue from the invoice, expenses (cancelled one excluded), labour from real hours, payments by payer", async () => {
    const admin = await makeUser("ADMIN");
    const mech = await makeUser("MECHANIC", { hourlyCost: 12_000 });
    const part = await createPart({ sku: sku(), name: "Disque", unit: "pcs", costPrice: 40_000, salePrice: 70_000, stock: 1_000 }, admin);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 100 }, admin); // 70 DT
    await addLine(wo.id, { type: "LABOR", description: "Pose", quantityX100: 100, unitPrice: 50_000 }, admin); // 1 h billed, 50 DT
    const start = new Date(Date.now() - 3 * 3_600_000);
    // 2 people worked 1 h 30 each → 3 person-hours of cost, 1 h billed.
    await prisma.laborEntry.createMany({
      data: [
        { workOrderId: wo.id, userId: mech.id, startedAt: start, endedAt: new Date(start.getTime() + 90 * 60_000) },
        { workOrderId: wo.id, userId: admin.id, startedAt: start, endedAt: new Date(start.getTime() + 90 * 60_000) },
      ],
    });
    await addExpense(admin, wo.id, { description: "Remorquage", amount: 20_000 });
    const wrong = await addExpense(admin, wo.id, { description: "Erreur de saisie", amount: 99_000 });
    await voidExpense(admin, wrong.id, "saisie en double");
    expect((await voidExpense(admin, wrong.id, "encore").catch((e: { code: string }) => e.code))).toBe("alreadyVoided");

    const before = (await workOrderProfit(wo.id))!;
    expect(before.flags).toContain("notInvoiced");

    await agreeAll(wo.id, admin); // V16 Lot 2: the customer's agreement before invoicing
    const invoice = await createInvoice(wo.id, admin);
    await recordPayment(invoice.id, { amount: 50_000, method: "TRANSFER", payer: "INSURANCE" }, admin);
    const p = (await workOrderProfit(wo.id))!;
    expect(p.revenue).toBe(120_000);
    expect(p.partsCost).toBe(40_000);
    expect(p.expenses).toBe(20_000); // the cancelled 99 DT is not counted
    expect(p.grossMargin).toBe(60_000);
    expect(p.laborMinutes).toBe(180);
    expect(p.laborCost).toBe(18_000 + 15_000); // mechanic 1.5 h × 12 DT + admin 1.5 h × garage 10 DT
    expect(p.profit).toBe(27_000);
    expect(p.collected).toEqual({ customer: 0, insurance: 50_000, total: 50_000 });
    expect(p.flags).toEqual([]);

    const journal = await prisma.auditLog.findMany({ where: { entityId: wrong.id }, orderBy: { createdAt: "asc" } });
    expect(journal.map((j) => j.action)).toEqual(["expense.add", "expense.void"]);
    expect(await prisma.workOrderExpense.count({ where: { id: wrong.id } })).toBe(1); // never deleted
  });

  it("period report: by invoice date, grouped, totals equal the sum of the lines", async () => {
    const admin = await makeUser("ADMIN");
    const { wo: a, customer } = await makeWorkOrder();
    const { wo: b } = await makeWorkOrder({ customerId: customer.id });
    for (const wo of [a, b]) {
      await addLine(wo.id, { type: "LABOR", description: "Diagnostic", quantityX100: 100, unitPrice: 40_000 }, admin);
      await agreeAll(wo.id, admin); // V16 Lot 2: the customer's agreement before invoicing
      await createInvoice(wo.id, admin);
    }
    const from = new Date(Date.now() - 60_000);
    const to = new Date(Date.now() + 60_000);
    const byCustomer = await profitReport(from, to, "customer", "Africa/Tunis");
    const mine = byCustomer.lines.find((l) => l.key === customer.id)!;
    expect(mine.count).toBe(2);
    expect(mine.revenue).toBe(80_000);
    expect(byCustomer.total.revenue).toBe(byCustomer.lines.reduce((s, l) => s + l.revenue, 0));
    const empty = await profitReport(new Date("2000-01-01"), new Date("2000-02-01"), "repair", "Africa/Tunis");
    expect(empty.lines).toEqual([]);
  });

  it("permissions: profit is administrator-only; expenses for administrator and manager", () => {
    expect(["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER"].filter((r) => can(r as never, "viewProfit"))).toEqual(["ADMIN"]);
    expect(["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER"].filter((r) => can(r as never, "manageExpenses"))).toEqual(["ADMIN", "MANAGER"]);
  });
});
