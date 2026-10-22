/**
 * V16 Lot 1 — workshop flow on a real (throw-away) PostgreSQL: permission per move, mandatory reasons,
 * delivery check and override, automatic closing, voided lines, audit journal of every change, portal.
 * Includes the regression tests of the V16 audit problems fixed by this lot (A-01, A-02, A-04, A-07, A-09,
 * moved here from tests/audit-v16 and inverted: they now assert the CORRECT behaviour).
 * Run: npm run test:db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInvoice, recordPayment } from "@/server/invoices";
import { addPackageLine, createPackage } from "@/server/admin";
import { notifyVehicleReady } from "@/server/customer-notifications";
import { removeMedia, setMediaVisibility } from "@/server/media";
import { createPart } from "@/server/parts";
import { approveQuoteByCustomer, customerMessage, getTrackingView } from "@/server/portal";
import { approveQualityCheck, saveQualityCheck } from "@/server/quality";
import type { Sender } from "@/server/reminders";
import { addLine, applyPackage, changeStatus, createWorkOrder, removeLine, updateMeta } from "@/server/work-orders";
import { agreeAll, makeUser, makeWorkOrder, prisma } from "./helpers/db";

const QC_OK = { roadTest: "DONE" as const, fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true };
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));
const status = async (id: string) => (await prisma.workOrder.findUniqueOrThrow({ where: { id } })).status;
const setFlow = (data: { allowWorkWithoutQuote?: boolean; requirePaidBeforeDelivery?: boolean; stampDuty?: number; requireSignedHandover?: boolean }) =>
  prisma.setting.upsert({ where: { id: "garage" }, update: data, create: { id: "garage", ...data } });

// V16 Lot 4: the signed handover (bon de restitution) is tested in lot4-v16.db.test.ts; here the Lot 1 delivery rules.
beforeAll(() => setFlow({ allowWorkWithoutQuote: false, requirePaidBeforeDelivery: true, stampDuty: 1000, requireSignedHandover: false }));
afterAll(() => setFlow({ allowWorkWithoutQuote: false, requirePaidBeforeDelivery: true, requireSignedHandover: true }));

/** New (V16) order brought to READY the normal way: quote → recorded agreement (Lot 2) → work → QC. */
async function readyOrder(manager: Awaited<ReturnType<typeof makeUser>>, unitPrice = 100_000) {
  const { wo, customer, vehicle } = await makeWorkOrder();
  await addLine(wo.id, { type: "LABOR", description: "Main-d'œuvre", quantityX100: 100, unitPrice }, manager);
  await changeStatus(wo.id, "QUOTE_SENT", manager);
  await agreeAll(wo.id, manager); // the customer's agreement, recorded → the work starts (IN_PROGRESS)
  await changeStatus(wo.id, "QUALITY_CONTROL", manager);
  await saveQualityCheck(manager, wo.id, QC_OK);
  await approveQualityCheck(manager, wo.id);
  await changeStatus(wo.id, "READY", manager);
  return { wo, customer, vehicle };
}

describe("V16 — droits par transition (régression A-01)", () => {
  it("A-01 un mécanicien ne peut ni livrer ni annuler (même un ordre d'avant la V16), ni décider d'un devis", async () => {
    const manager = await makeUser("MANAGER");
    const mech = await makeUser("MECHANIC");
    const { wo } = await readyOrder(manager);
    expect(await code(changeStatus(wo.id, "DELIVERED", mech))).toBe("statusForbidden");
    const { wo: other } = await makeWorkOrder({ status: "IN_PROGRESS" });
    expect(await code(changeStatus(other.id, "CANCELLED", mech, { reason: "Essai mécanicien" }))).toBe("statusForbidden");
    const { wo: legacy } = await makeWorkOrder({ status: "READY" });
    await prisma.workOrder.update({ where: { id: legacy.id }, data: { workflowV16: false, workflowLot4: false } });
    expect(await code(changeStatus(legacy.id, "DELIVERED", mech))).toBe("statusForbidden");
    const { wo: quote } = await makeWorkOrder({ status: "QUOTE_SENT" });
    expect(await code(changeStatus(quote.id, "IN_PROGRESS", mech, { reason: "je commence" }))).toBe("statusForbidden");
    expect(await status(wo.id)).toBe("READY");
    expect(await status(other.id)).toBe("IN_PROGRESS");
    // The technical steps stay his.
    const { wo: diag } = await makeWorkOrder();
    await changeStatus(diag.id, "DIAGNOSIS", mech);
    expect(await status(diag.id)).toBe("DIAGNOSIS");
  });

  it("annuler sans motif renvoie une erreur lisible ; avec motif : événement + journal (motif interne)", async () => {
    const manager = await makeUser("MANAGER");
    const { wo } = await makeWorkOrder({ status: "DIAGNOSIS" });
    expect(await code(changeStatus(wo.id, "CANCELLED", manager))).toBe("reasonRequired");
    expect(await code(changeStatus(wo.id, "CANCELLED", manager, { reason: "  a " }))).toBe("reasonRequired");
    await changeStatus(wo.id, "CANCELLED", manager, { reason: "Le client reprend son véhicule" });
    expect(await status(wo.id)).toBe("CANCELLED");
    const ev = await prisma.workOrderEvent.findFirstOrThrow({ where: { workOrderId: wo.id, type: "STATUS_CHANGED" } });
    expect(ev.data).toMatchObject({ from: "DIAGNOSIS", to: "CANCELLED", reason: "Le client reprend son véhicule" });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "WorkOrder", entityId: wo.id, action: "workOrder.status" } });
    expect(log.after).toMatchObject({ status: "CANCELLED", reason: "Le client reprend son véhicule" });
  });

  it("devis refusé : motif obligatoire, puis « Prêt » seulement après le contrôle qualité complet", async () => {
    const manager = await makeUser("MANAGER");
    const rec = await makeUser("RECEPTION");
    const { wo } = await makeWorkOrder({ status: "QUOTE_SENT" });
    await changeStatus(wo.id, "WAITING_CUSTOMER", rec);
    expect(await code(changeStatus(wo.id, "QUOTE_REFUSED", rec))).toBe("reasonRequired");
    await changeStatus(wo.id, "QUOTE_REFUSED", rec, { reason: "Trop cher, le client réfléchit" });
    expect(await code(changeStatus(wo.id, "READY", rec))).toBe("qcNotApproved");
    await saveQualityCheck(manager, wo.id, QC_OK);
    await approveQualityCheck(manager, wo.id);
    await changeStatus(wo.id, "READY", rec);
    expect(await status(wo.id)).toBe("READY");
  });

  it("retour en atelier après le contrôle qualité : motif obligatoire, y compris pour le mécanicien", async () => {
    const mech = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder({ status: "QUALITY_CONTROL" });
    expect(await code(changeStatus(wo.id, "IN_PROGRESS", mech))).toBe("reasonRequired");
    await changeStatus(wo.id, "IN_PROGRESS", mech, { reason: "Fuite constatée à l'essai" });
    expect(await status(wo.id)).toBe("IN_PROGRESS");
  });
});

describe("V16 — devis et non-rétroactivité", () => {
  it("nouvel ordre : Réceptionné → En réparation refusé (sans devis), sauf réglage ; ancien ordre : inchangé", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder();
    expect(await code(changeStatus(wo.id, "IN_PROGRESS", admin))).toBe("workWithoutQuote");
    await setFlow({ allowWorkWithoutQuote: true });
    try {
      await changeStatus(wo.id, "IN_PROGRESS", admin);
      expect(await status(wo.id)).toBe("IN_PROGRESS");
    } finally {
      await setFlow({ allowWorkWithoutQuote: false });
    }
    const { wo: legacy } = await makeWorkOrder();
    await prisma.workOrder.update({ where: { id: legacy.id }, data: { workflowV16: false, workflowLot4: false } });
    await changeStatus(legacy.id, "IN_PROGRESS", admin);
    expect(await status(legacy.id)).toBe("IN_PROGRESS");
  });

  it("Devis envoyé → En réparation : refusé sans accord ENREGISTRÉ (Lot 2, plus de simple motif), puis accord daté", async () => {
    const rec = await makeUser("RECEPTION");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "Main-d'œuvre", quantityX100: 100, unitPrice: 30_000 }, rec);
    await changeStatus(wo.id, "QUOTE_SENT", rec);
    expect(await code(changeStatus(wo.id, "IN_PROGRESS", rec))).toBe("approvalRequired");
    expect(await code(changeStatus(wo.id, "IN_PROGRESS", rec, { reason: "Accord au comptoir" }))).toBe("approvalRequired");
    await agreeAll(wo.id, rec);
    const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    expect(after.status).toBe("IN_PROGRESS");
    expect(after.quoteApprovedAt).not.toBeNull();
    const ev = await prisma.workOrderEvent.findFirstOrThrow({ where: { workOrderId: wo.id, type: "STATUS_CHANGED", data: { path: ["to"], equals: "IN_PROGRESS" } } });
    expect(ev.data).toMatchObject({ from: "QUOTE_SENT", approval: true });
  });

  it("un ordre créé avant la migration se termine normalement jusqu'à Livré (sans facture)", async () => {
    const rec = await makeUser("RECEPTION");
    const manager = await makeUser("MANAGER");
    const { wo } = await makeWorkOrder();
    await prisma.workOrder.update({ where: { id: wo.id }, data: { workflowV16: false, workflowLot4: false } });
    await changeStatus(wo.id, "DIAGNOSIS", rec);
    await changeStatus(wo.id, "QUOTE_SENT", rec);
    await changeStatus(wo.id, "IN_PROGRESS", rec); // no reason for an old order
    await changeStatus(wo.id, "QUALITY_CONTROL", rec);
    await saveQualityCheck(manager, wo.id, QC_OK);
    await approveQualityCheck(manager, wo.id);
    await changeStatus(wo.id, "READY", rec);
    await changeStatus(wo.id, "DELIVERED", rec);
    expect(await status(wo.id)).toBe("DELIVERED");
  });

  it("date promise initiale : remplie à la création, jamais modifiée ensuite ; changements journalisés", async () => {
    const rec = await makeUser("RECEPTION");
    const customer = await prisma.customer.create({ data: { name: "Promesse", phone: "20333444" } });
    const first = new Date("2026-11-02T15:00:00Z");
    const wo = await createWorkOrder(
      { newCustomer: undefined, customerId: customer.id, newVehicle: { plate: `PR${Date.now()}`, make: "Kia", model: "Picanto" }, complaint: "Vidange", priority: "NORMAL", promisedAt: first },
      rec,
    );
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).promisedAtInitial).toEqual(first);
    // V16 Lot 3: changing an existing promised date needs a reason (PromiseRevision, see delays-v16.db.test.ts).
    await updateMeta(wo.id, { promisedAt: new Date("2026-11-04T15:00:00Z"), priority: "URGENT", promiseReason: "PARTS" }, rec);
    const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    expect(after.promisedAtInitial).toEqual(first);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "workOrder.update", entityId: wo.id } });
    expect(log.before).toMatchObject({ promisedAt: first.toISOString(), priority: "NORMAL" });
    expect(log.after).toMatchObject({ promisedAt: "2026-11-04T15:00:00.000Z", priority: "URGENT" });
  });
});

describe("V16 — livraison, dérogation, clôture (régression A-02)", () => {
  it("A-02 sans facture : livraison refusée (et donc pas de garantie sans facture)", async () => {
    const manager = await makeUser("MANAGER");
    await prisma.setting.update({ where: { id: "garage" }, data: { warrantyMonths: 6 } });
    try {
      const { wo } = await readyOrder(manager);
      expect(await code(changeStatus(wo.id, "DELIVERED", manager))).toBe("deliveryNoInvoice");
      expect(await status(wo.id)).toBe("READY");
      expect(await prisma.warranty.count({ where: { workOrderId: wo.id } })).toBe(0);
    } finally {
      await prisma.setting.update({ where: { id: "garage" }, data: { warrantyMonths: 0 } });
    }
  });

  it("solde dû : refusée ; la réception ne peut pas déroger ; dérogation d'un responsable = motif + trace ; paiement → clôture automatique", async () => {
    const manager = await makeUser("MANAGER");
    const rec = await makeUser("RECEPTION");
    const { wo } = await readyOrder(manager, 100_000);
    const inv = await createInvoice(wo.id, rec); // V16: reception invoices
    const total = (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).totalTtc;
    await recordPayment(inv.id, { amount: 50_000, method: "CASH" }, rec);
    expect(await code(changeStatus(wo.id, "DELIVERED", rec))).toBe("deliveryBalanceDue");
    expect(await code(changeStatus(wo.id, "DELIVERED", rec, { override: true, reason: "Client connu" }))).toBe("statusForbidden");
    expect(await code(changeStatus(wo.id, "DELIVERED", manager, { override: true }))).toBe("reasonRequired");
    await changeStatus(wo.id, "DELIVERED", manager, { override: true, reason: "Client fidèle, paiera vendredi" });
    expect(await status(wo.id)).toBe("DELIVERED");
    const ev = await prisma.workOrderEvent.findFirstOrThrow({ where: { workOrderId: wo.id, type: "STATUS_CHANGED", data: { path: ["to"], equals: "DELIVERED" } } });
    expect(ev.data).toMatchObject({ override: "deliverWithBalance", block: "balanceDue", balanceDue: total - 50_000, reason: "Client fidèle, paiera vendredi" });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: wo.id, action: "workOrder.status", after: { path: ["status"], equals: "DELIVERED" } } });
    expect(log.after).toMatchObject({ override: "deliverWithBalance", reason: "Client fidèle, paiera vendredi" });
    // Closing by hand is refused while the invoice is not settled…
    expect(await code(changeStatus(wo.id, "CLOSED", manager))).toBe("notSettled");
    // …and automatic as soon as it is.
    await recordPayment(inv.id, { amount: total - 50_000, method: "CARD" }, rec);
    expect(await status(wo.id)).toBe("CLOSED");
    expect(await prisma.workOrderEvent.count({ where: { workOrderId: wo.id, type: "STATUS_CHANGED", data: { path: ["auto"], equals: true } } })).toBe(1);
  });

  it("déjà payé (acompte de la réception déduit) : livré puis clôturé tout de suite", async () => {
    const manager = await makeUser("MANAGER");
    const { wo } = await readyOrder(manager, 100_000);
    const inv = await createInvoice(wo.id, manager);
    const total = (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).totalTtc;
    // Deposit NOT turned into a payment (order opened before Lot 4: Lot 1 rule; Lot 4 → lot4-v16.db.test.ts).
    await prisma.workOrder.update({ where: { id: wo.id }, data: { depositAmount: 20_000, workflowLot4: false } });
    await recordPayment(inv.id, { amount: total - 20_000, method: "CASH" }, manager);
    await changeStatus(wo.id, "DELIVERED", manager);
    expect(await status(wo.id)).toBe("CLOSED");
  });

  it("réglage « payé avant livraison » désactivé : livraison sans facture acceptée", async () => {
    const manager = await makeUser("MANAGER");
    await setFlow({ requirePaidBeforeDelivery: false });
    try {
      const { wo } = await readyOrder(manager);
      await changeStatus(wo.id, "DELIVERED", manager);
      expect(await status(wo.id)).toBe("DELIVERED");
    } finally {
      await setFlow({ requirePaidBeforeDelivery: true });
    }
  });

  it("annulation refusée quand une facture existe (règle conservée)", async () => {
    const manager = await makeUser("MANAGER");
    const { wo } = await readyOrder(manager);
    await createInvoice(wo.id, manager);
    expect(await code(changeStatus(wo.id, "CANCELLED", manager, { reason: "Erreur de saisie" }))).toBe("transition");
  });
});

describe("V16 — lignes annulées au lieu de supprimées", () => {
  it("ligne présente à l'accord : annulée (motif), exclue des totaux et de la facture, stock rendu une seule fois ; ligne ajoutée après : supprimée", async () => {
    const admin = await makeUser("ADMIN");
    const part = await createPart({ sku: `V16-${Date.now()}`, name: "Filtre à huile", unit: "pce", salePrice: 30_000, stock: 1000 }, admin);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 200 }, admin);
    await addLine(wo.id, { type: "LABOR", description: "Vidange", quantityX100: 100, unitPrice: 40_000 }, admin);
    await changeStatus(wo.id, "QUOTE_SENT", admin);
    await approveQuoteByCustomer(wo.id, { ip: "41.226.1.2", userAgent: "Mozilla/5.0 test" });
    const extra = await addLine(wo.id, { type: "LABOR", description: "Ajout après accord", quantityX100: 100, unitPrice: 10_000 }, admin).then(() =>
      prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: wo.id, description: "Ajout après accord" } }),
    );
    const partLine = await prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: wo.id, partId: part.id } });
    expect(await code(removeLine(partLine.id, admin))).toBe("reasonRequired");
    await removeLine(partLine.id, admin, "Pièce fournie par le client");
    const kept = await prisma.workOrderLine.findUniqueOrThrow({ where: { id: partLine.id } });
    expect(kept.voidedAt).not.toBeNull();
    expect(kept).toMatchObject({ voidReason: "Pièce fournie par le client", voidedById: admin.id });
    expect((await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).stockX100).toBe(1000);
    expect(await code(removeLine(partLine.id, admin, "deux fois"))).toBe("invalid");
    // Added after the agreement: really deleted.
    await removeLine(extra.id, admin);
    expect(await prisma.workOrderLine.findUnique({ where: { id: extra.id } })).toBeNull();
    // Invoice = live lines only (labour 40 000 + VAT 19 % + stamp 1 000).
    await changeStatus(wo.id, "QUALITY_CONTROL", admin);
    const inv = await createInvoice(wo.id, admin);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(invoice.totalHt).toBe(40_000);
    expect(invoice.totalTtc).toBe(40_000 + 7_600 + 1_000);
    expect((invoice.snapshot as { lines: unknown[] }).lines).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "workOrder.lineVoid", entityId: partLine.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "workOrder.lineRemove", entityId: extra.id } })).toBe(1);
  });

  it("annuler l'ordre après une ligne annulée : la pièce n'est pas rendue une seconde fois ; le portail ne montre pas la ligne", async () => {
    const admin = await makeUser("ADMIN");
    const part = await createPart({ sku: `V16B-${Date.now()}`, name: "Bougie", unit: "pce", salePrice: 15_000, stock: 1000 }, admin);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 400 }, admin);
    await addLine(wo.id, { type: "LABOR", description: "Allumage", quantityX100: 100, unitPrice: 20_000 }, admin);
    await changeStatus(wo.id, "QUOTE_SENT", admin);
    await agreeAll(wo.id, admin); // Lot 2: recorded agreement (the parts leave the stock now)
    expect((await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).stockX100).toBe(600);
    const partLine = await prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: wo.id, partId: part.id } });
    await removeLine(partLine.id, admin, "Bougies en bon état");
    const view = await getTrackingView(wo.id);
    expect(view!.lines.map((l) => l.description)).toEqual(["Allumage"]);
    await changeStatus(wo.id, "CANCELLED", admin, { reason: "Client renonce" });
    expect((await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).stockX100).toBe(1000);
  });
});

describe("V16 — journal d'audit et portail", () => {
  it("A-04 contrôle qualité validé, puis une ligne ajoutée : « Prêt » refusé tant que le contrôle n'est pas revalidé", async () => {
    const manager = await makeUser("MANAGER");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "MO", quantityX100: 100, unitPrice: 10_000 }, manager);
    await changeStatus(wo.id, "QUOTE_SENT", manager);
    await agreeAll(wo.id, manager);
    await changeStatus(wo.id, "QUALITY_CONTROL", manager);
    await saveQualityCheck(manager, wo.id, QC_OK);
    await approveQualityCheck(manager, wo.id);
    await addLine(wo.id, { type: "LABOR", description: "Ajout après contrôle", quantityX100: 50, unitPrice: 10_000 }, manager);
    expect(await code(changeStatus(wo.id, "READY", manager))).toBe("qcNotApproved");
    await approveQualityCheck(manager, wo.id);
    await changeStatus(wo.id, "READY", manager);
    expect(await status(wo.id)).toBe("READY");
  });

  it("A-07 accord du devis par le client : deux clics simultanés → un seul accord ; IP et navigateur journalisés", async () => {
    // Order opened before V16: the one-click agreement of Lot 1.
    const { wo } = await makeWorkOrder({ status: "QUOTE_SENT" });
    await prisma.workOrder.update({ where: { id: wo.id }, data: { workflowV16: false, workflowLot4: false } });
    const results = await Promise.allSettled([approveQuoteByCustomer(wo.id, { ip: "41.1.1.1", userAgent: "UA-1" }), approveQuoteByCustomer(wo.id, { ip: "41.1.1.1", userAgent: "UA-1" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.workOrderEvent.count({ where: { workOrderId: wo.id, type: "QUOTE_APPROVED" } })).toBe(1);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "workOrder.quoteApprovedByCustomer", entityId: wo.id } });
    expect(log).toMatchObject({ ip: "41.1.1.1", actorId: null });
    expect(log.after).toMatchObject({ channel: "PORTAL", userAgent: "UA-1" });
    // New order (Lot 2): « accept all » goes through the traced line-by-line path, still one decision.
    const admin = await makeUser("ADMIN");
    const { wo: v16 } = await makeWorkOrder();
    await addLine(v16.id, { type: "LABOR", description: "MO", quantityX100: 100, unitPrice: 10_000 }, admin);
    await changeStatus(v16.id, "QUOTE_SENT", admin);
    const both = await Promise.allSettled([approveQuoteByCustomer(v16.id, { ip: "41.1.1.2", userAgent: "UA-2" }), approveQuoteByCustomer(v16.id, { ip: "41.1.1.2", userAgent: "UA-2" })]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.quoteApproval.count({ where: { workOrderId: v16.id } })).toBe(1);
    const decision = await prisma.auditLog.findFirstOrThrow({ where: { action: "quote.decision", after: { path: ["workOrderId"], equals: v16.id } } });
    expect(decision).toMatchObject({ ip: "41.1.1.2", actorId: null });
    expect(decision.after).toMatchObject({ channel: "PORTAL", decision: "APPROVED", userAgent: "UA-2" });
  });

  it("A-09 « véhicule prêt » : mis en file (Notification READY, statut et erreur), envoyé, journalisé ; pas deux fois", async () => {
    const manager = await makeUser("MANAGER");
    const { wo, customer } = await readyOrder(manager);
    await prisma.customer.update({ where: { id: customer.id }, data: { phone: "20111222" } });
    const sent: string[] = [];
    const sender: Sender = { channels: () => ["SMS"], sms: async (to) => (sent.push(to), { ok: true }), email: async () => ({ ok: false, error: "off" }) };
    const r = await notifyVehicleReady(wo.id, manager, sender);
    expect(r.queued).toBe(1);
    const rows = await prisma.notification.findMany({ where: { workOrderId: wo.id, kind: "READY" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "SMS", status: "SENT", error: null });
    expect(sent).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "notification.ready", entityId: wo.id } })).toBe(1);
    // Same READY moment again (double click): nothing more.
    expect((await notifyVehicleReady(wo.id, manager, sender)).queued).toBe(0);
    // A failure is recorded with its error, for a retry.
    const { wo: other } = await readyOrder(manager);
    const failing: Sender = { channels: () => ["SMS"], sms: async () => ({ ok: false, error: "Réseau coupé" }), email: async () => ({ ok: false, error: "off" }) };
    await notifyVehicleReady(other.id, manager, failing);
    expect(await prisma.notification.findFirstOrThrow({ where: { workOrderId: other.id, kind: "READY" } })).toMatchObject({ status: "FAILED", error: "Réseau coupé" });
  });

  it("chaque action écrit une ligne de journal : lignes, forfait, photos, message client", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "Contrôle", quantityX100: 100, unitPrice: 10_000 }, admin);
    expect(await prisma.auditLog.count({ where: { action: "workOrder.lineAdd", after: { path: ["workOrderId"], equals: wo.id } } })).toBe(1);
    const pkg = await createPackage({ name: `Forfait ${Date.now()}` }, admin);
    await addPackageLine(pkg.id, { type: "LABOR", description: "Forfait MO", quantityX100: 100, unitPrice: 20_000 }, admin);
    await applyPackage(wo.id, pkg.id, admin);
    expect(await prisma.auditLog.count({ where: { action: "workOrder.packageApply", entityId: wo.id } })).toBe(1);
    const media = await prisma.workOrderMedia.create({ data: { workOrderId: wo.id, kind: "PHOTO", storageKey: `work-orders/${wo.id}/test${Date.now()}.jpg`, contentType: "image/jpeg", size: 10, visibleToCustomer: false } });
    await setMediaVisibility(media.id, true, admin);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { action: "media.visibility", entityId: media.id } })).toMatchObject({ actorId: admin.id });
    await removeMedia(media.id, admin);
    expect(await prisma.auditLog.count({ where: { action: "media.remove", entityId: media.id } })).toBe(1);
    await customerMessage(wo.id, "Bonjour, à quelle heure ?", { ip: "41.2.2.2" });
    expect(await prisma.auditLog.findFirstOrThrow({ where: { action: "workOrder.customerMessage", after: { path: ["workOrderId"], equals: wo.id } } })).toMatchObject({ ip: "41.2.2.2" });
  });

  it("le portail client ne montre jamais le motif d'un changement de statut", async () => {
    const manager = await makeUser("MANAGER");
    const { wo } = await makeWorkOrder({ status: "QUOTE_SENT" });
    await changeStatus(wo.id, "QUOTE_REFUSED", manager, { reason: "Client radin (note interne)" });
    const view = await getTrackingView(wo.id);
    expect(JSON.stringify(view)).not.toContain("radin");
    expect(view!.events.find((e) => e.type === "STATUS_CHANGED")!.data).toEqual({ from: "QUOTE_SENT", to: "QUOTE_REFUSED" });
  });
});
