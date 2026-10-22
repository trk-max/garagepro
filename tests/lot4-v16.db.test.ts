/**
 * V16 Lot 4 — signed intake, handover, invoice and payments, on a real (throw-away) PostgreSQL:
 * issued invoice frozen against direct SQL (trigger), credit note (own gapless number, invoice kept, closing,
 * reports), delivery refused without a signed handover (setting), storage fee never counted during a garage-caused
 * parts wait, deposit → real payment counted once, dated payment, double click, payment reversal (append-only,
 * reopening), signed intake (frozen document + SHA-256, locks), mileage lower than known, signed ceiling, quote
 * signature, graduated invoice reminders, aged balance in the reports.
 * Run: npm run test:db
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordHandover } from "@/server/handover";
import { createInvoice, issueCreditNote, recordPayment, reversePayment } from "@/server/invoices";
import { cashForecast, recordCashBalance } from "@/server/cash";
import { addMedia, removeMedia } from "@/server/media";
import { approveQualityCheck, saveQualityCheck } from "@/server/quality";
import { recordStaffDecision } from "@/server/quotes";
import { queueInvoiceReminders } from "@/server/reminders";
import { updateIntake } from "@/server/repair-order";
import { getReport } from "@/server/reports";
import { signIntake } from "@/server/signatures";
import { waiveStorageFee } from "@/server/storage-fees";
import { addLine, changeStatus, createWorkOrder, updateMeta } from "@/server/work-orders";
import { agreeAll, makeUser, makeWorkOrder, prisma } from "./helpers/db";

const QC_OK = { roadTest: "DONE" as const, roadTestKm: 5, fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true };
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string; message?: string }) => e.code ?? String(e.message ?? e));
const status = async (id: string) => (await prisma.workOrder.findUniqueOrThrow({ where: { id } })).status;
type Actor = Awaited<ReturnType<typeof makeUser>>;
const DAY = 86_400_000;
const STAMP = 1000;
// A real (tiny) PNG: magic bytes + content (the server checks the bytes, not the browser's type).
const PNG = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 7)]).toString("base64")}`;
const sign = (name = "Client signataire") => ({ signerName: name, image: PNG, ip: "10.0.0.1", userAgent: "vitest" });
const handover = (km: number) => ({ ...sign(), mileageOut: km, fuelLevelOut: 2, checklist: { workExplained: true, oldParts: "RETURNED" as const, keysReturned: true, clean: true }, notes: null });

let admin: Actor, manager: Actor, rec: Actor, mech: Actor, accountant: Actor;
beforeAll(async () => {
  await prisma.setting.upsert({
    where: { id: "garage" },
    update: { stampDuty: STAMP, allowWorkWithoutQuote: false, requirePaidBeforeDelivery: true, requireSignedHandover: true, autoStorageFee: true, autoInvoiceReminders: true, storageFeePerDay: 20_000, storageGraceHours: 48, diagnosticFee: null, warrantyMonths: 0 },
    create: { id: "garage", stampDuty: STAMP },
  });
  [admin, manager, rec, mech, accountant] = await Promise.all([makeUser("ADMIN"), makeUser("MANAGER"), makeUser("RECEPTION"), makeUser("MECHANIC"), makeUser("ACCOUNTANT")]);
});
afterAll(() => prisma.setting.update({ where: { id: "garage" }, data: { requireSignedHandover: true, autoStorageFee: true, autoInvoiceReminders: true } }));

let n = 0;
async function receptionOrder(opts: { deposit?: number; mileageIn?: number; ceiling?: number } = {}) {
  const customer = await prisma.customer.create({ data: { name: `Client L4 ${n++}`, phone: "20111222" } });
  const wo = await createWorkOrder(
    {
      customerId: customer.id,
      newVehicle: { plate: `L4${Date.now()}${n++}`, make: "Peugeot", model: "208", mileage: opts.mileageIn },
      complaint: "Révision",
      priority: "NORMAL",
      mileageIn: opts.mileageIn,
      intake: { bodyChecklist: [], depositAmount: opts.deposit, depositMethod: opts.deposit ? "CASH" : undefined, authorizationCeiling: opts.ceiling, warningLights: ["ENGINE"], itemsLeft: "Siège enfant", keyCount: 2 },
    },
    rec as never,
  );
  return prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
}

/** New order taken to READY through the real flow: lines, quote, recorded agreement, quality check. */
async function readyOrder(opts: { deposit?: number; amount?: number } = {}) {
  const wo = await receptionOrder({ deposit: opts.deposit, mileageIn: 50_000 });
  await addLine(wo.id, { type: "LABOR", description: "Vidange", quantityX100: 100, unitPrice: opts.amount ?? 100_000 }, rec as never);
  await changeStatus(wo.id, "QUOTE_SENT", rec as never);
  await agreeAll(wo.id, rec as never);
  await changeStatus(wo.id, "QUALITY_CONTROL", mech as never);
  await saveQualityCheck(manager as never, wo.id, QC_OK);
  await approveQualityCheck(manager as never, wo.id);
  await changeStatus(wo.id, "READY", mech as never);
  return prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
}

describe("Lot 4 — facture émise figée (trigger SQL)", () => {
  it("an issued invoice cannot be modified nor deleted by direct SQL; only paidAmount / status move; the hub sync passes", async () => {
    const wo = await readyOrder();
    const inv = await createInvoice(wo.id, rec as never);
    await expect(prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "totalTtc" = 1 WHERE id = '${inv.id}'`)).rejects.toThrow(/cannot be modified/);
    await expect(prisma.$executeRawUnsafe(`UPDATE "Invoice" SET snapshot = '{}' WHERE id = '${inv.id}'`)).rejects.toThrow(/cannot be modified/);
    await expect(prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "issuedAt" = now() - interval '1 year' WHERE id = '${inv.id}'`)).rejects.toThrow(/cannot be modified/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "Invoice" WHERE id = '${inv.id}'`)).rejects.toThrow(/cannot be deleted/);
    // Allowed columns (payments, credit note).
    expect(await prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "paidAmount" = "paidAmount", status = status WHERE id = '${inv.id}'`)).toBe(1);
    // The hub synchronisation writes whole rows with garagepro.sync = 'on'.
    const [, count] = await prisma.$transaction([prisma.$queryRawUnsafe(`SELECT set_config('garagepro.sync', 'on', true)`), prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "dueDate" = "dueDate" + interval '1 day' WHERE id = '${inv.id}'`)]);
    expect(count).toBe(1);
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    // Fingerprint of the frozen copy, with the nature of the part per line.
    expect(row.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Lot 4 — avoir (table CreditNote)", () => {
  it("cancels an invoice without deleting it, own gapless number, journal, order closed, revenue net in the reports", async () => {
    const year = new Date().getFullYear();
    const before = (await prisma.sequence.findUnique({ where: { key: `credit-${year}` } }))?.value ?? 0;
    const a = await readyOrder({ amount: 200_000 });
    const invA = await createInvoice(a.id, rec as never);
    const b = await readyOrder({ amount: 50_000 });
    const invB = await createInvoice(b.id, rec as never);
    const frozenA = await prisma.invoice.findUniqueOrThrow({ where: { id: invA.id } });

    // Reception / mechanic: no credit notes; reason mandatory.
    expect(await code(issueCreditNote(invA.id, "Erreur client", rec as never))).toBe("forbidden");
    expect(await code(issueCreditNote(invA.id, "", accountant as never))).toBe("reasonRequired");
    const reportBefore = await getReport("day");
    const c1 = await issueCreditNote(invA.id, "Facture établie au mauvais client", accountant as never);
    const c2 = await issueCreditNote(invB.id, "Geste commercial total", admin as never);
    expect(c1.number).toBe(`AV-${year}-${String(before + 1).padStart(4, "0")}`);
    expect(c2.number).toBe(`AV-${year}-${String(before + 2).padStart(4, "0")}`);
    // Never twice for the same invoice.
    expect(await code(issueCreditNote(invA.id, "Encore", admin as never))).toBe("alreadyCredited");
    // The invoice is still there, unchanged except its status.
    const afterA = await prisma.invoice.findUniqueOrThrow({ where: { id: invA.id } });
    expect({ ...afterA, status: frozenA.status }).toEqual(frozenA);
    expect(afterA.status).toBe("CREDITED");
    const note = await prisma.creditNote.findUniqueOrThrow({ where: { id: c1.id } });
    expect(note).toMatchObject({ creditOfInvoiceId: invA.id, totalTtc: frozenA.totalTtc, reason: "Facture établie au mauvais client", workOrderId: a.id });
    expect(await prisma.auditLog.count({ where: { action: "creditNote.create", entityId: c1.id } })).toBe(1);
    // Append-only.
    await expect(prisma.$executeRawUnsafe(`UPDATE "CreditNote" SET reason = 'x' WHERE id = '${c1.id}'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "CreditNote" WHERE id = '${c1.id}'`)).rejects.toThrow(/append-only/);
    // No more payments on a credited invoice.
    expect(await code(recordPayment(invA.id, { amount: 1000, method: "CASH" }, rec as never))).toBe("invoiceCredited");
    // Reports: revenue of the day = invoices − credit notes (never twice).
    const reportAfter = await getReport("day");
    expect(reportAfter.money.invoicedTtc).toBe(reportBefore.money.invoicedTtc - frozenA.totalTtc - afterA.totalTtc * 0 - (await prisma.invoice.findUniqueOrThrow({ where: { id: invB.id } })).totalTtc);
    expect(reportAfter.money.credits.count).toBe(reportBefore.money.credits.count + 2);
  });

  it("a delivered order whose invoice is credited is settled → closed", async () => {
    const wo = await readyOrder();
    const inv = await createInvoice(wo.id, rec as never);
    await recordHandover(wo.id, handover(50_100), rec as never);
    await changeStatus(wo.id, "DELIVERED", manager as never, { override: true, reason: "Client pressé, paiement à venir" });
    expect(await status(wo.id)).toBe("DELIVERED");
    await issueCreditNote(inv.id, "Travaux sous garantie", admin as never);
    expect(await status(wo.id)).toBe("CLOSED");
  });
});

describe("Lot 4 — restitution signée exigée avant la livraison", () => {
  it("cannot deliver without a signed handover (setting on); the handover is append-only; then delivered and closed", async () => {
    const wo = await readyOrder();
    const inv = await createInvoice(wo.id, rec as never);
    await recordPayment(inv.id, { amount: (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).totalTtc, method: "CASH" }, rec as never);
    expect(await code(changeStatus(wo.id, "DELIVERED", rec as never))).toBe("handoverRequired");
    // Not even with the manager's override (it covers the balance, not the handover).
    expect(await code(changeStatus(wo.id, "DELIVERED", manager as never, { override: true, reason: "Je force" }))).toBe("handoverRequired");
    // Mechanic cannot record it; mileage out lower than in is refused.
    expect(await code(recordHandover(wo.id, handover(50_100), mech as never))).toBe("forbidden");
    expect(await code(recordHandover(wo.id, handover(49_000), rec as never))).toBe("mileageOutLower");
    expect(await code(recordHandover(wo.id, { ...handover(50_100), image: "data:image/png;base64,AAAA" }, rec as never))).toBe("signatureRequired");
    const h = await recordHandover(wo.id, handover(50_100), rec as never);
    const row = await prisma.vehicleHandover.findUniqueOrThrow({ where: { id: h.id } });
    const sig = await prisma.signature.findUniqueOrThrow({ where: { id: h.signatureId } });
    expect(row).toMatchObject({ mileageOut: 50_100, fuelLevelOut: 2, signatureId: sig.id });
    expect(sig).toMatchObject({ kind: "DELIVERY", refId: h.id, signerName: "Client signataire", ip: "10.0.0.1" });
    // Frozen handover document stored + its SHA-256.
    const doc = await readFile(path.join(process.cwd(), "storage", sig.documentKey!));
    expect(createHash("sha256").update(doc).digest("hex")).toBe(sig.documentHash);
    await expect(prisma.$executeRawUnsafe(`UPDATE "VehicleHandover" SET "mileageOut" = 1 WHERE id = '${h.id}'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "Signature" WHERE id = '${sig.id}'`)).rejects.toThrow(/append-only/);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: wo.vehicleId } })).mileage).toBe(50_100);
    await changeStatus(wo.id, "DELIVERED", rec as never);
    expect(await status(wo.id)).toBe("CLOSED");
  });

  it("setting off, or an order opened before Lot 4: no handover needed", async () => {
    const old = await readyOrder();
    await prisma.workOrder.update({ where: { id: old.id }, data: { workflowLot4: false } });
    const inv = await createInvoice(old.id, rec as never);
    await recordPayment(inv.id, { amount: (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).totalTtc, method: "CASH" }, rec as never);
    await changeStatus(old.id, "DELIVERED", rec as never);
    expect(await status(old.id)).toBe("CLOSED");

    const wo = await readyOrder();
    const inv2 = await createInvoice(wo.id, rec as never);
    await recordPayment(inv2.id, { amount: (await prisma.invoice.findUniqueOrThrow({ where: { id: inv2.id } })).totalTtc, method: "CASH" }, rec as never);
    await prisma.setting.update({ where: { id: "garage" }, data: { requireSignedHandover: false } });
    try {
      await changeStatus(wo.id, "DELIVERED", rec as never);
      expect(await status(wo.id)).toBe("CLOSED");
    } finally {
      await prisma.setting.update({ where: { id: "garage" }, data: { requireSignedHandover: true } });
    }
  });
});

describe("Lot 4 — gardiennage", () => {
  /** READY order (no flow), with a synthetic timeline: ready + told 14 days ago, back to the workshop, parts wait, ready again 3 days ago. */
  async function timeline(garageCaused: boolean | null) {
    const { wo } = await makeWorkOrder({ status: "READY" });
    const now = Date.now();
    const at = (daysAgo: number) => new Date(now - daysAgo * DAY);
    await prisma.workOrder.update({ where: { id: wo.id }, data: { createdAt: at(20), readyAt: at(2.5), workflowV16: true, workflowLot4: true } });
    await prisma.workOrderLine.create({ data: { workOrderId: wo.id, type: "LABOR", description: "Embrayage", quantityX100: 100, unitPrice: 300_000, approvalStatus: "APPROVED" } });
    const ev = (daysAgo: number, to: string) => prisma.workOrderEvent.create({ data: { workOrderId: wo.id, type: "STATUS_CHANGED", data: { to }, createdAt: at(daysAgo) } });
    await ev(15, "IN_PROGRESS");
    await ev(14.5, "READY");
    await prisma.notification.create({ data: { kind: "READY", channel: "SMS", dedupeKey: `ready:${wo.id}:t`, workOrderId: wo.id, body: "prêt", status: "SENT", sentAt: at(14.5) } });
    await ev(13.5, "IN_PROGRESS");
    await ev(13.4, "WAITING_PARTS");
    if (garageCaused !== null) await prisma.workOrderEvent.create({ data: { workOrderId: wo.id, type: "NOTE", data: { partsWait: "KEEP_VEHICLE", garageCaused }, createdAt: at(13) } });
    await ev(2.5, "READY");
    return wo;
  }
  const storageLine = (workOrderId: string) => prisma.workOrderLine.findFirst({ where: { workOrderId, isStorageFee: true } });

  it("is NOT counted during a parts wait caused by the garage (decision, or none = garage-caused): only the last ready days", async () => {
    for (const caused of [true, null]) {
      const wo = await timeline(caused);
      await createInvoice(wo.id, rec as never);
      // Ready again 2.5 days ago → 3 started days × 20 DT (the first ready day is inside the 48 h grace).
      expect(await storageLine(wo.id)).toMatchObject({ quantityX100: 300, unitPrice: 20_000, approvalStatus: "APPROVED", type: "LABOR" });
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { workOrderId: wo.id } });
      expect(inv.totalHt).toBe(300_000 + 60_000);
      expect(await prisma.auditLog.count({ where: { action: "workOrder.storageFee" } })).toBeGreaterThan(0);
    }
  });

  it("counted during a parts wait caused by the customer with the car kept; waived with a reason = not invoiced", async () => {
    const wo = await timeline(false);
    await createInvoice(wo.id, rec as never);
    // From the end of the grace (12.5 days ago) to 2.5 days ago (waiting, customer-caused) + 2.5 ready days = 12.5 → 13 days.
    expect((await storageLine(wo.id))?.quantityX100).toBe(1300);

    const w2 = await timeline(false);
    expect(await code(waiveStorageFee(w2.id, "Client fidèle", rec as never))).toBe("forbidden");
    expect(await code(waiveStorageFee(w2.id, "", manager as never))).toBe("reasonRequired");
    await waiveStorageFee(w2.id, "Client fidèle", manager as never);
    await createInvoice(w2.id, rec as never);
    expect(await storageLine(w2.id)).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "workOrder.storageWaived" } })).toBeGreaterThan(0);
  });
});

describe("Lot 4 — paiements", () => {
  it("A-28 (regression) deposit of a new order → a real payment dated at reception, counted once (balance, closing)", async () => {
    const wo = await readyOrder({ deposit: 50_000, amount: 100_000 });
    expect(wo.depositReceivedAt).not.toBeNull();
    const inv = await createInvoice(wo.id, rec as never);
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
    expect(row.payments).toHaveLength(1);
    expect(row.payments[0]).toMatchObject({ amount: 50_000, isDeposit: true, method: "CASH" });
    expect(row.payments[0]!.paidAt.getTime()).toBe(wo.depositReceivedAt!.getTime());
    expect(row).toMatchObject({ paidAmount: 50_000, status: "PARTIAL" });
    // The rest is exactly total − deposit (not total − 2 × deposit): the 1 millime short is refused at delivery.
    await recordHandover(wo.id, handover(50_200), rec as never);
    await recordPayment(inv.id, { amount: row.totalTtc - 50_000 - 1, method: "CARD" }, rec as never);
    expect(await code(changeStatus(wo.id, "DELIVERED", rec as never))).toBe("deliveryBalanceDue");
    await recordPayment(inv.id, { amount: 1, method: "CASH" }, rec as never);
    await changeStatus(wo.id, "DELIVERED", rec as never);
    expect(await status(wo.id)).toBe("CLOSED");
  });

  it("A-20 / A-27 (regression) dated payment (yesterday yes, tomorrow no) and server-side anti double click (same key → one payment)", async () => {
    const wo = await readyOrder({ amount: 300_000 });
    const inv = await createInvoice(wo.id, rec as never);
    const yesterday = new Date(Date.now() - DAY);
    await recordPayment(inv.id, { amount: 10_000, method: "CASH", paidAt: yesterday }, rec as never);
    expect(await code(recordPayment(inv.id, { amount: 10_000, method: "CASH", paidAt: new Date(Date.now() + 2 * DAY) }, rec as never))).toBe("paymentDate");
    const key = `k${Date.now()}abcdef`;
    const [r1, r2] = await Promise.all([
      recordPayment(inv.id, { amount: 20_000, method: "CASH", requestKey: key }, rec as never),
      recordPayment(inv.id, { amount: 20_000, method: "CASH", requestKey: key }, rec as never),
    ]);
    expect(r1.id).toBe(r2.id);
    expect([r1.duplicate, r2.duplicate].filter(Boolean)).toHaveLength(1);
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
    expect(row.payments).toHaveLength(2);
    expect(row.paidAmount).toBe(30_000);
    expect(row.payments.find((p) => p.amount === 10_000)!.paidAt.getTime()).toBe(yesterday.getTime());
  });

  it("reversal: negative row tied to the original, reason, permission, never twice, closed order reopened; payments append-only", async () => {
    const wo = await readyOrder();
    const inv = await createInvoice(wo.id, rec as never);
    const total = (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).totalTtc;
    const p = await recordPayment(inv.id, { amount: total, method: "CHECK", reference: "CHQ 123" }, rec as never);
    await recordHandover(wo.id, handover(50_300), rec as never);
    await changeStatus(wo.id, "DELIVERED", rec as never);
    expect(await status(wo.id)).toBe("CLOSED");

    expect(await code(reversePayment(p.id, "Chèque refusé", rec as never))).toBe("forbidden");
    expect(await code(reversePayment(p.id, "", manager as never))).toBe("reasonRequired");
    const r = await reversePayment(p.id, "Chèque refusé par la banque", manager as never);
    const rev = await prisma.payment.findUniqueOrThrow({ where: { id: r.id } });
    expect(rev).toMatchObject({ amount: -total, reversalOfId: p.id, reason: "Chèque refusé par la banque", method: "CHECK" });
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ paidAmount: 0, status: "ISSUED" });
    expect(await status(wo.id)).toBe("DELIVERED");
    expect(await code(reversePayment(p.id, "Encore", manager as never))).toBe("alreadyReversed");
    expect(await code(reversePayment(r.id, "Annuler l'annulation", manager as never))).toBe("cannotReverse");
    expect(await prisma.auditLog.count({ where: { action: "payment.reverse", entityId: r.id } })).toBe(1);
    await expect(prisma.$executeRawUnsafe(`UPDATE "Payment" SET amount = 1 WHERE id = '${p.id}'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "Payment" WHERE id = '${p.id}'`)).rejects.toThrow(/append-only/);
    // Paid again → closed again.
    await recordPayment(inv.id, { amount: total, method: "CASH" }, rec as never);
    expect(await status(wo.id)).toBe("CLOSED");
  });
});

describe("Lot 4 — corrections de l'audit (tests inversés)", () => {
  it("A-03 (regression) warranty at the invoice for a new order, not at a delivery without invoice", async () => {
    await prisma.setting.update({ where: { id: "garage" }, data: { warrantyMonths: 6 } });
    try {
      const invoicedNotDelivered = await readyOrder();
      await createInvoice(invoicedNotDelivered.id, rec as never);
      expect(await prisma.warranty.count({ where: { workOrderId: invoicedNotDelivered.id } })).toBe(1);
      const deliveredWithoutInvoice = await readyOrder();
      await recordHandover(deliveredWithoutInvoice.id, handover(50_400), rec as never);
      await changeStatus(deliveredWithoutInvoice.id, "DELIVERED", manager as never, { override: true, reason: "Dérogation : facture plus tard" });
      expect(await prisma.warranty.count({ where: { workOrderId: deliveredWithoutInvoice.id } })).toBe(0);
    } finally {
      await prisma.setting.update({ where: { id: "garage" }, data: { warrantyMonths: 0 } });
    }
  });

  it("A-27 (regression) a payment received yesterday, entered today with its real date: the treasury does not count it twice", async () => {
    await prisma.cashBalance.deleteMany();
    const yesterday = new Date(Date.now() - DAY);
    await recordCashBalance(admin as never, { amount: 1_000_000, asOf: yesterday.toISOString().slice(0, 10), note: "inclut l'espèce reçue hier" });
    const before = (await cashForecast(admin as never, { scenario: "NORMAL", horizon: 30 })).result.opening;
    const wo = await readyOrder({ amount: 300_000 });
    const inv = await createInvoice(wo.id, rec as never);
    await recordPayment(inv.id, { amount: 200_000, method: "CASH", paidAt: new Date(yesterday.getTime() - 3_600_000) }, rec as never);
    const after = (await cashForecast(admin as never, { scenario: "NORMAL", horizon: 30 })).result.opening;
    expect(after).toBe(before);
  });
});

describe("Lot 4 — réception signée", () => {
  it("signature: frozen document + SHA-256, then intake, mileage and INTAKE photos locked (hidden only)", async () => {
    const wo = await receptionOrder({ mileageIn: 30_000 });
    const photo = await addMedia(wo.id, { bytes: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 1)]), caption: "Rayure aile", visibleToCustomer: true }, rec as never);
    expect((await prisma.workOrderMedia.findUniqueOrThrow({ where: { id: photo.id } })).stage).toBe("INTAKE");
    expect(await code(signIntake(wo.id, sign(), mech as never))).toBe("forbidden");
    expect(await code(signIntake(wo.id, { ...sign(), signerName: " " }, rec as never))).toBe("signerNameRequired");
    const s = await signIntake(wo.id, sign("Sami Ben Ali"), rec as never);
    const sig = await prisma.signature.findUniqueOrThrow({ where: { id: s.id } });
    expect(sig).toMatchObject({ kind: "INTAKE", signerName: "Sami Ben Ali", userAgent: "vitest" });
    const doc = await readFile(path.join(process.cwd(), "storage", sig.documentKey!), "utf8");
    expect(createHash("sha256").update(doc, "utf8").digest("hex")).toBe(sig.documentHash);
    // The frozen document holds the intake (warning light, item left, keys, photo) and the signer.
    for (const text of ["Moteur / dépollution", "Siège enfant", "Sami Ben Ali", "Rayure aile", "30000 km"]) expect(doc).toContain(text);
    expect(await code(signIntake(wo.id, sign(), rec as never))).toBe("intakeAlreadySigned");
    expect(await code(updateIntake(wo.id, { bodyChecklist: [], keyCount: 1 }, rec as never))).toBe("intakeLocked");
    expect(await code(updateMeta(wo.id, { mileageIn: 31_000 }, rec as never))).toBe("intakeLocked");
    expect(await code(removeMedia(photo.id, rec as never))).toBe("intakePhotoLocked");
    // A photo added afterwards is a WORK photo (not in the signed document) and can be removed.
    const later = await addMedia(wo.id, { bytes: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 2)]), visibleToCustomer: true, stage: "INTAKE" }, rec as never);
    expect((await prisma.workOrderMedia.findUniqueOrThrow({ where: { id: later.id } })).stage).toBe("WORK");
    await removeMedia(later.id, rec as never);
  });

  it("check-in mileage lower than the vehicle's last reading: refused without confirmation, never lowered silently", async () => {
    const first = await receptionOrder({ mileageIn: 80_000 });
    const vehicleId = first.vehicleId;
    const input = { customerId: first.customerId, vehicleId, complaint: "Contrôle", priority: "NORMAL" as const, mileageIn: 70_000 };
    expect(await code(createWorkOrder(input, rec as never))).toBe("mileageLower");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).mileage).toBe(80_000);
    await createWorkOrder({ ...input, confirmLowerMileage: true }, rec as never);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).mileage).toBe(70_000);
    expect(await prisma.auditLog.count({ where: { action: "vehicle.mileageLowered", entityId: vehicleId } })).toBe(1);
  });

  it("signed authorization ceiling: work may start without a quote under it (lines pre-authorised, journalised)", async () => {
    const wo = await receptionOrder({ ceiling: 200_000 });
    await addLine(wo.id, { type: "LABOR", description: "Diagnostic + réparation", quantityX100: 100, unitPrice: 100_000 }, rec as never);
    // Not signed yet: refused like any work without a quote.
    expect(await code(changeStatus(wo.id, "IN_PROGRESS", mech as never))).toBe("workWithoutQuote");
    await signIntake(wo.id, sign(), rec as never);
    await changeStatus(wo.id, "IN_PROGRESS", mech as never);
    expect(await status(wo.id)).toBe("IN_PROGRESS");
    expect((await prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: wo.id } })).approvalStatus).toBe("APPROVED");
    expect(await prisma.auditLog.count({ where: { action: "workOrder.preAuthorized" } })).toBeGreaterThan(0);
    // Over the ceiling: refused.
    const over = await receptionOrder({ ceiling: 50_000 });
    await addLine(over.id, { type: "LABOR", description: "Gros travaux", quantityX100: 100, unitPrice: 100_000 }, rec as never);
    await signIntake(over.id, sign(), rec as never);
    expect(await code(changeStatus(over.id, "IN_PROGRESS", mech as never))).toBe("workWithoutQuote");
  });

  it("quote agreement recorded with a tablet signature: Signature QUOTE + QuoteApproval.signatureKey", async () => {
    const wo = await receptionOrder();
    await addLine(wo.id, { type: "LABOR", description: "Freins", quantityX100: 100, unitPrice: 90_000 }, rec as never);
    await changeStatus(wo.id, "QUOTE_SENT", rec as never);
    const line = await prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: wo.id } });
    const r = await recordStaffDecision(wo.id, { approvedLineIds: [line.id], approverName: "Mme Client", channel: "IN_PERSON", signatureImage: PNG }, rec as never);
    const approval = await prisma.quoteApproval.findUniqueOrThrow({ where: { id: r.approvalId } });
    const sig = await prisma.signature.findFirstOrThrow({ where: { workOrderId: wo.id, kind: "QUOTE" } });
    expect(approval.signatureKey).toBe(sig.imageKey);
    expect(sig).toMatchObject({ refId: r.approvalId, signerName: "Mme Client" });
  });
});

describe("Lot 4 — relances graduées et balance âgée", () => {
  it("J+7 / J+15 / J+30 after the due date: highest level reached, once, InvoiceReminder with its level; old orders untouched", async () => {
    const smsSender = { channels: () => ["SMS" as const], sms: async () => ({ ok: true }), email: async () => ({ ok: true as const, id: "x" }) };
    const wo = await readyOrder();
    const inv = await createInvoice(wo.id, rec as never);
    // Due 16 days ago (sync on: test set-up of an old invoice, the app never changes an issued invoice).
    await prisma.$transaction([prisma.$queryRawUnsafe(`SELECT set_config('garagepro.sync', 'on', true)`), prisma.$executeRaw`UPDATE "Invoice" SET "dueDate" = ${new Date(Date.now() - 16 * DAY)}, "issuedAt" = ${new Date(Date.now() - 31 * DAY - 3_600_000)} WHERE id = ${inv.id}`]);
    const old = await readyOrder();
    const oldInv = await createInvoice(old.id, rec as never);
    await prisma.workOrder.update({ where: { id: old.id }, data: { workflowLot4: false } });
    await prisma.$transaction([prisma.$queryRawUnsafe(`SELECT set_config('garagepro.sync', 'on', true)`), prisma.$executeRaw`UPDATE "Invoice" SET "dueDate" = ${new Date(Date.now() - 40 * DAY)} WHERE id = ${oldInv.id}`]);

    await queueInvoiceReminders(new Date(), smsSender as never);
    await queueInvoiceReminders(new Date(), smsSender as never);
    expect(await prisma.notification.count({ where: { dedupeKey: `invoice-remind:${inv.id}:15` } })).toBe(1);
    expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: `invoice-remind:${inv.id}:` } } })).toBe(1);
    expect(await prisma.invoiceReminder.findMany({ where: { invoiceId: inv.id }, select: { level: true, channel: true } })).toEqual([{ level: 15, channel: "SMS" }]);
    expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: `invoice-remind:${oldInv.id}:` } } })).toBe(0);
    // Aged balance in the reports: this 31-day-old invoice is in « 31–60 ».
    const report = await getReport("day");
    expect(report.money.aged?.d31_60.count).toBeGreaterThan(0);
  });
});
