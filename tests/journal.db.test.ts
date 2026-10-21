/**
 * Prompt 2 — real database tests: invoices, payments and stock in the journal,
 * adjustable delay alerts.
 * Run: npm run test:db   (see vitest.db.config.ts)
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createInvoice, recordPayment, recordReminder } from "@/server/invoices";
import { createPart, moveStock, updatePart } from "@/server/parts";
import { addLine, removeLine } from "@/server/work-orders";
import { approvePurchaseOrder, createPurchaseOrder, createReceipt, createSupplier, createSupplierInvoice, paySupplierInvoice } from "@/server/purchasing";
import { delays } from "@/server/follow-up";
import { addVehicle, createCustomer, updateCustomer } from "@/server/customers";
import { createWorkOrder } from "@/server/work-orders";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";
import { paymentSchema } from "@/lib/validators";

beforeAll(async () => {
  await prisma.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
});

const lines = (entityId: string) => prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: "asc" } });

describe("journal : factures et paiements", () => {
  it("invoice, payment and reminder each leave one line, with who and before → after", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "Plaquettes", quantityX100: 100, unitPrice: 50_000 }, admin);
    const invoice = await createInvoice(wo.id, admin);

    const created = (await lines(invoice.id))[0]!;
    expect(created).toMatchObject({ action: "invoice.create", entity: "Invoice", actorId: admin.id, actorName: admin.name });
    expect(created.after).toMatchObject({ number: invoice.number, totalHt: 50_000 });

    await recordPayment(invoice.id, { amount: 20_000, method: "CASH" }, admin);
    const pay = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.record", actorId: admin.id } });
    expect(pay.before).toMatchObject({ invoice: invoice.number, paidAmount: 0, status: "ISSUED" });
    expect(pay.after).toMatchObject({ amount: 20_000, method: "CASH", paidAmount: 20_000, status: "PARTIAL" });

    await recordReminder(invoice.id, "SMS", "Rappel", admin);
    expect(await prisma.auditLog.count({ where: { action: "invoice.reminder", actorId: admin.id } })).toBe(1);
  });

  it("an overpayment is refused and leaves no line", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "Vidange", quantityX100: 100, unitPrice: 10_000 }, admin);
    const invoice = await createInvoice(wo.id, admin);
    await expect(recordPayment(invoice.id, { amount: 99_999_999, method: "CASH" }, admin)).rejects.toMatchObject({ code: "overpaid" });
    expect(await prisma.auditLog.count({ where: { action: "payment.record", actorId: admin.id } })).toBe(0);
  });
});

describe("journal : stock", () => {
  it("part creation, price change, manual exit and use on a repair are all traced", async () => {
    const store = await makeUser("STOREKEEPER");
    const part = await createPart({ sku: `FLT-${Date.now()}`, name: "Filtre à huile", unit: "pcs", salePrice: 15_000, costPrice: 9_000, stock: 1_000 }, store);
    expect((await lines(part.id)).map((l) => l.action)).toEqual(["part.create"]);

    await updatePart(part.id, { salePrice: 17_000 }, store);
    const upd = await prisma.auditLog.findFirstOrThrow({ where: { action: "part.update", entityId: part.id } });
    expect(upd.before).toMatchObject({ salePrice: 15_000 });
    expect(upd.after).toMatchObject({ salePrice: 17_000 });

    await moveStock(part.id, { delta: -200, reason: "ADJUSTMENT", note: "casse" }, store);
    const manual = await prisma.auditLog.findFirstOrThrow({ where: { action: "stock.manual", actorId: store.id } });
    expect(manual.before).toMatchObject({ stockX100: 1_000 });
    expect(manual.after).toMatchObject({ deltaX100: -200, stockX100: 800, note: "casse" });

    const mech = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 100 }, mech);
    const line = await prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: wo.id } });
    await removeLine(line.id, mech);
    const used = await prisma.auditLog.findMany({ where: { action: "stock.workOrder", actorId: mech.id }, orderBy: { createdAt: "asc" } });
    expect(used.map((u) => (u.after as { reason: string; stockX100: number }).reason)).toEqual(["WORK_ORDER", "WORK_ORDER_RETURN"]);
    expect(used.map((u) => (u.after as { stockX100: number }).stockX100)).toEqual([700, 800]);
  });

  it("purchase order → receipt → supplier invoice → payment: one line each", async () => {
    const admin = await makeUser("ADMIN");
    const supplier = await createSupplier({ name: `Fournisseur ${Date.now()}` });
    const part = await createPart({ sku: `PLQ-${Date.now()}`, name: "Plaquettes", unit: "jeu", salePrice: 60_000 }, admin);
    const po = await createPurchaseOrder({ supplierId: supplier.id, lines: [{ partId: part.id, quantityX100: 400, unitCost: 30_000 }] }, admin);
    const receipt = await createReceipt({ supplierId: supplier.id, purchaseOrderId: po.id, lines: [{ partId: part.id, quantityX100: 400 }] }, admin);
    const inv = await createSupplierInvoice({ supplierId: supplier.id, purchaseOrderId: po.id, number: `FF-${Date.now()}`, issuedAt: new Date(), totalHt: 120_000, totalTax: 22_800 }, admin);
    await paySupplierInvoice(inv.id, { amount: 142_800, method: "TRANSFER" }, admin);

    expect((await lines(po.id)).map((l) => l.action)).toEqual(["purchaseOrder.create"]); // admin: approved at once
    const rec = (await lines(receipt.id))[0]!;
    expect(rec.action).toBe("receipt.create");
    expect(rec.after).toMatchObject({ lines: [{ partId: part.id, quantityX100: 400, stockX100: 400 }] });
    expect((await lines(inv.id)).map((l) => l.action)).toEqual(["supplierInvoice.create"]);
    const pay = await prisma.auditLog.findFirstOrThrow({ where: { action: "supplierPayment.record", actorId: admin.id } });
    expect(pay.after).toMatchObject({ status: "PAID", paidAmount: 142_800 });
    await expect(approvePurchaseOrder(po.id, admin)).rejects.toMatchObject({ code: "poNotEditable" });
  });

  it("supplier payment from the page form (shared schema with « payer ») is recorded", async () => {
    const admin = await makeUser("ADMIN");
    const supplier = await createSupplier({ name: `Fournisseur form ${Date.now()}` });
    const inv = await createSupplierInvoice({ supplierId: supplier.id, number: `FF-${Date.now()}`, issuedAt: new Date(), totalHt: 100_000, totalTax: 19_000 }, admin);
    // Exactly what paySupplierInvoiceAction passes: the form parsed by paymentSchema (payer defaults to CUSTOMER).
    await paySupplierInvoice(inv.id, paymentSchema.parse({ amount: "50", method: "CASH", reference: "Chèque 12" }), admin);
    const after = await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
    expect(after).toMatchObject({ status: "PARTIAL", paidAmount: 50_000 });
    expect(after.payments).toMatchObject([{ amount: 50_000, method: "CASH", reference: "Chèque 12" }]);
  });
});

describe("journal : clients et véhicules", () => {
  it("customer created, edited (before → after), vehicle added, and the same at check-in", async () => {
    const rec = await makeUser("RECEPTION");
    const c = await createCustomer({ name: "Sami Ben Ali", phone: "20123456" }, rec);
    await updateCustomer(c.id, { phone: "20999888", email: "sami@test.tn" }, rec);
    const v = await addVehicle(c.id, { plate: `J${Date.now()}`, make: "Kia", model: "Rio" }, rec);
    const upd = await prisma.auditLog.findFirstOrThrow({ where: { entityId: c.id, action: "customer.update" } });
    expect(upd.before).toMatchObject({ phone: "20123456", email: null });
    expect(upd.after).toMatchObject({ phone: "20999888", email: "sami@test.tn" });
    expect((await lines(v.id)).map((l) => l.action)).toEqual(["vehicle.create"]);

    const wo = await createWorkOrder(
      {
        newCustomer: { name: "Nouveau client", phone: "50111222" },
        newVehicle: { plate: `K${Date.now()}`, make: "Renault", model: "Clio" },
        complaint: "Bruit",
        priority: "NORMAL",
      },
      rec,
    );
    const order = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    expect((await lines(order.customerId)).map((l) => l.action)).toEqual(["customer.create"]);
    // Check-in also gives the car its QR Code (V7.8).
    expect((await lines(order.vehicleId)).map((l) => l.action)).toEqual(["vehicle.create", "vehicle.qrIssue"]);
  });
});

describe("alertes de retard réglables", () => {
  it("the tolerances from Paramètres decide what is late", async () => {
    const { wo } = await makeWorkOrder({ status: "IN_PROGRESS" });
    await prisma.workOrder.update({ where: { id: wo.id }, data: { promisedAt: new Date(Date.now() - 3 * 3_600_000) } });
    const { wo: ins } = await makeWorkOrder({ status: "WAITING_INSURANCE" });
    await prisma.workOrder.update({ where: { id: ins.id }, data: { insurerName: "STAR", insuranceRequestedAt: new Date(Date.now() - 5 * 86_400_000) } });

    const strict = await delays(new Date(), { alertOrderLateHours: 2, alertPartLateDays: 0, alertInsuranceDays: 3 });
    expect(strict.lateOrders.map((w) => w.id)).toContain(wo.id);
    expect(strict.insuranceLate.map((w) => w.id)).toContain(ins.id);

    const lenient = await delays(new Date(), { alertOrderLateHours: 4, alertPartLateDays: 0, alertInsuranceDays: 7 });
    expect(lenient.lateOrders.map((w) => w.id)).not.toContain(wo.id);
    expect(lenient.insuranceLate.map((w) => w.id)).not.toContain(ins.id);
    expect(lenient.insurance.map((w) => w.id)).toContain(ins.id); // still listed, just not flagged late

    // Without explicit values: read from the settings row (defaults 0 h / 0 j / 3 j).
    const fromSettings = await delays();
    expect(fromSettings.cutoffs.values).toEqual({ alertOrderLateHours: 0, alertPartLateDays: 0, alertInsuranceDays: 3 });
  });
});
