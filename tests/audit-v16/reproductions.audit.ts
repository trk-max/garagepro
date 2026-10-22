/**
 * V16 — AUDIT : reproductions sur une vraie base PostgreSQL JETABLE (voir vitest.config.ts à côté).
 * Chaque test vérifie le comportement ACTUEL (fautif) : il réussit tant que le problème existe.
 * Les numéros « A-xx » renvoient à docs/AUDIT-V16.md. Aucun code de l'application n'est modifié.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import { stateAfter } from "@/lib/timeclock";
import { ipFromHeaders } from "@/lib/client-ip";
import { checkInAppointment } from "@/server/booking";
import { cashForecast, recordCashBalance } from "@/server/cash";
import { issueCertificate } from "@/server/certificates";
import { presentNow } from "@/server/dashboard";
import { createExpense, ensureOccurrences, payOccurrence } from "@/server/expenses";
import { addPartNeed, updatePartNeed } from "@/server/follow-up";
import { createInvoice, countOverdue, recordPayment } from "@/server/invoices";
import { requestLeave } from "@/server/leaves";
import { createPlan } from "@/server/maintenance";
import { createPart, reservePart } from "@/server/parts";
import { approveQuoteByCustomer } from "@/server/portal";
import { profitReport } from "@/server/profit";
import { cancelPurchaseOrder, createPurchaseOrder, createReceipt, createSupplier, createSupplierInvoice, lowStockSuggestions, paySupplierInvoice } from "@/server/purchasing";
import { approveQualityCheck, saveQualityCheck } from "@/server/quality";
import { getReport } from "@/server/reports";
import { setStaffRole } from "@/server/admin";
import { teamPresence } from "@/server/timeclock";
import { notifyVehicleReady } from "@/server/customer-notifications";
import { moveClaim, openClaim, setClaimAmounts } from "@/server/warranties";
import { addLine, changeStatus, createWorkOrder } from "@/server/work-orders";
import { makeUser, makeWorkOrder, prisma } from "../helpers/db";

const QC_OK = { roadTest: "DONE" as const, fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true };
const day = (d: Date) => d.toISOString().slice(0, 10);

beforeAll(async () => {
  await prisma.setting.upsert({
    where: { id: "garage" },
    update: { stampDuty: 1000, warrantyMonths: 6, paymentTermsDays: 15 },
    create: { id: "garage", stampDuty: 1000, warrantyMonths: 6, paymentTermsDays: 15, garageName: "Audit", city: "Tunis", legalRepName: "X", legalRepTitle: "Gérant", address: "Rue" },
  });
});

/** Order brought to READY the normal way (QC filled and approved by a manager). */
async function readyOrder(manager: Awaited<ReturnType<typeof makeUser>>, unitPrice = 100_000) {
  const { wo, customer, vehicle } = await makeWorkOrder();
  await addLine(wo.id, { type: "LABOR", description: "Main-d'œuvre", quantityX100: 100, unitPrice }, manager);
  await changeStatus(wo.id, "IN_PROGRESS", manager);
  await changeStatus(wo.id, "QUALITY_CONTROL", manager);
  await saveQualityCheck(manager, wo.id, QC_OK);
  await approveQualityCheck(manager, wo.id);
  await changeStatus(wo.id, "READY", manager);
  return { wo, customer, vehicle };
}

describe("Ordres de réparation", () => {
  it("A-01 un mécanicien peut livrer un ordre non facturé et annuler un ordre en cours (le serveur ne demande que viewWorkOrders / useWorkshop)", async () => {
    const manager = await makeUser("MANAGER");
    const mech = await makeUser("MECHANIC");
    expect(can(mech, "viewWorkOrders")).toBe(true); // garde de changeStatusAction
    expect(can(mech, "useWorkshop")).toBe(true); // garde de workshopStatusAction
    const { wo } = await readyOrder(manager);
    await changeStatus(wo.id, "DELIVERED", mech);
    const delivered = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id }, include: { invoice: true } });
    expect(delivered.status).toBe("DELIVERED");
    expect(delivered.invoice).toBeNull(); // A-02 : livré sans facture ni paiement
    const { wo: other } = await makeWorkOrder({ status: "IN_PROGRESS" });
    await changeStatus(other.id, "CANCELLED", mech);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("CANCELLED");
  });

  it("A-02/A-03 garantie : créée à la livraison même sans facture, absente si la facture est faite sans livraison", async () => {
    const manager = await makeUser("MANAGER");
    const admin = await makeUser("ADMIN");
    const { wo: deliveredNoInvoice } = await readyOrder(manager);
    await changeStatus(deliveredNoInvoice.id, "DELIVERED", manager);
    expect(await prisma.warranty.count({ where: { workOrderId: deliveredNoInvoice.id } })).toBe(1);
    const { wo: invoicedNotDelivered } = await readyOrder(manager);
    await createInvoice(invoicedNotDelivered.id, admin);
    expect(await prisma.warranty.count({ where: { workOrderId: invoicedNotDelivered.id } })).toBe(0);
  });

  it("A-04 contrôle qualité validé, puis une pièce ajoutée : passage à « Prêt » accepté sans nouveau contrôle", async () => {
    const manager = await makeUser("MANAGER");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "MO", quantityX100: 100, unitPrice: 10_000 }, manager);
    await changeStatus(wo.id, "IN_PROGRESS", manager);
    await changeStatus(wo.id, "QUALITY_CONTROL", manager);
    await saveQualityCheck(manager, wo.id, QC_OK);
    await approveQualityCheck(manager, wo.id);
    const part = await createPart({ sku: `QC-${Date.now()}`, name: "Pièce ajoutée après QC", unit: "pce", salePrice: 50_000, stock: 500 }, manager);
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 100 }, manager);
    await changeStatus(wo.id, "READY", manager);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).status).toBe("READY");
  });

  it("A-05 deux ordres ouverts en même temps pour le même véhicule", async () => {
    const rec = await makeUser("RECEPTION");
    const { wo, customer, vehicle } = await makeWorkOrder({ status: "IN_PROGRESS" });
    const second = await createWorkOrder({ customerId: customer.id, vehicleId: vehicle.id, complaint: "Autre", priority: "NORMAL" }, rec);
    const open = await prisma.workOrder.count({ where: { vehicleId: vehicle.id, status: { notIn: ["DELIVERED", "CANCELLED"] } } });
    expect(second.id).not.toBe(wo.id);
    expect(open).toBe(2);
  });

  it("A-06 accueil d'un RDV : deux clics simultanés → deux ordres pour un seul RDV", async () => {
    const rec = await makeUser("RECEPTION");
    const service = await prisma.bookableService.create({ data: { name: "Vidange", durationMin: 60 } });
    const start = new Date(Date.now() + 3_600_000);
    // Client et véhicule déjà connus (cas courant : client fidèle qui réserve en ligne).
    const customer = await prisma.customer.create({ data: { name: "Rdv Double", phone: "20111222" } });
    const vehicle = await prisma.vehicle.create({ data: { plate: `RDV${Date.now()}`, make: "Kia", model: "Rio", customerId: customer.id } });
    const appt = await prisma.appointment.create({ data: { reference: `AUD-${Date.now()}`, serviceId: service.id, startAt: start, endAt: new Date(start.getTime() + 3_600_000), firstName: "Rdv", lastName: "Double", phone: "20111222", plate: vehicle.plate } });
    const results = await Promise.allSettled([checkInAppointment(appt.id, rec), checkInAppointment(appt.id, rec)]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(2);
    const linked = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(await prisma.workOrder.count({ where: { vehicleId: vehicle.id } })).toBe(2);
    expect(await prisma.workOrder.count({ where: { vehicleId: vehicle.id, NOT: { id: linked.workOrderId ?? "" } } })).toBe(1); // un ordre de trop, sans lien avec le RDV
  });

  it("A-07 accord du devis par le client : deux clics simultanés → deux événements « devis accepté »", async () => {
    const { wo } = await makeWorkOrder({ status: "QUOTE_SENT" });
    await Promise.allSettled([approveQuoteByCustomer(wo.id), approveQuoteByCustomer(wo.id)]);
    expect(await prisma.workOrderEvent.count({ where: { workOrderId: wo.id, type: "QUOTE_APPROVED" } })).toBe(2);
  });

  it("A-08 livraison : le plan d'entretien (V7.6) n'est pas mis à jour par l'ordre livré (vidange)", async () => {
    const manager = await makeUser("MANAGER");
    const { wo, vehicle } = await readyOrder(manager);
    const plan = await createPlan(manager, vehicle.id, { kind: "OIL", intervalKm: 10_000, intervalDays: 365, lastDoneAt: new Date(Date.now() - 400 * 86_400_000), lastDoneKm: 10_000 });
    await addLine(wo.id, { type: "LABOR", description: "Vidange moteur", quantityX100: 100, unitPrice: 30_000 }, manager).catch(() => undefined);
    await changeStatus(wo.id, "DELIVERED", manager);
    const after = await prisma.vehicleMaintenance.findUniqueOrThrow({ where: { id: (plan as { id: string }).id } });
    expect(after.lastDoneAt!.getTime()).toBeLessThan(Date.now() - 300 * 86_400_000);
  });
});

describe("Notifications", () => {
  it("A-09 « véhicule prêt » : envoi direct, sans file d'attente ni trace dans l'historique des envois (perdu hors ligne)", async () => {
    const manager = await makeUser("MANAGER");
    const { wo } = await readyOrder(manager);
    const before = await prisma.notification.count();
    await notifyVehicleReady(wo.id); // ce que font changeStatusAction / workshopStatusAction après « Prêt »
    expect(await prisma.notification.count()).toBe(before);
  });
});

describe("Stock et achats", () => {
  it("A-10 un ordre consomme une pièce réservée pour un autre ordre : disponible négatif", async () => {
    const admin = await makeUser("ADMIN");
    const mech = await makeUser("MECHANIC");
    const part = await createPart({ sku: `RES-${Date.now()}`, name: "Dernière pièce", unit: "pce", salePrice: 10_000, stock: 100 }, admin);
    const { wo: a } = await makeWorkOrder({ status: "IN_PROGRESS" });
    const { wo: b } = await makeWorkOrder({ status: "IN_PROGRESS" });
    await reservePart(admin, a.id, part.id, 100);
    await addLine(b.id, { type: "PART", partId: part.id, quantityX100: 100 }, mech);
    const p = await prisma.part.findUniqueOrThrow({ where: { id: part.id } });
    const reserved = await prisma.stockReservation.aggregate({ where: { partId: part.id, status: "ACTIVE" } as never, _sum: { quantityX100: true } });
    expect(p.stockX100).toBe(0);
    expect(reserved._sum.quantityX100).toBe(100); // disponible = 0 − 1 = −1
  });

  it("A-11 deux sorties simultanées de la dernière pièce depuis deux ordres : stock négatif", async () => {
    const admin = await makeUser("ADMIN");
    const part = await createPart({ sku: `NEG-${Date.now()}`, name: "Pièce unique", unit: "pce", salePrice: 10_000, stock: 100 }, admin);
    const { wo: a } = await makeWorkOrder({ status: "IN_PROGRESS" });
    const { wo: b } = await makeWorkOrder({ status: "IN_PROGRESS" });
    await Promise.all([addLine(a.id, { type: "PART", partId: part.id, quantityX100: 100 }, admin), addLine(b.id, { type: "PART", partId: part.id, quantityX100: 100 }, admin)]);
    expect((await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).stockX100).toBe(-100);
  });

  it("A-12 bon de réception reçu : la pièce manquante de l'ordre reste « commandée », sans lien avec le bon", async () => {
    const admin = await makeUser("ADMIN");
    const supplier = await createSupplier({ name: `F-${Date.now()}` });
    const part = await createPart({ sku: `NEED-${Date.now()}`, name: "Kit distribution", unit: "kit", salePrice: 450_000, costPrice: 320_000 }, admin);
    const { wo } = await makeWorkOrder({ status: "WAITING_PARTS" });
    const need = await addPartNeed(admin, wo.id, { partId: part.id, description: "Kit distribution", quantityX100: 100 });
    await updatePartNeed(admin, need.id, { status: "ORDERED" } as never);
    const po = await createPurchaseOrder({ supplierId: supplier.id, lines: [{ partId: part.id, quantityX100: 100, unitCost: 320_000 }] }, admin);
    await createReceipt({ supplierId: supplier.id, purchaseOrderId: po.id, lines: [{ partId: part.id, quantityX100: 100 }] }, admin);
    const after = await prisma.workOrderPartNeed.findUniqueOrThrow({ where: { id: need.id } });
    expect(after.status).toBe("ORDERED");
    expect(after.purchaseOrderId).toBeNull();
    expect(await prisma.stockReservation.count({ where: { workOrderId: wo.id } })).toBe(0);
  });

  it("A-13 le magasinier peut signaler une pièce manquante mais pas la marquer commandée / reçue", () => {
    expect(can("STOREKEEPER", "reportMissingPart")).toBe(true);
    expect(can("STOREKEEPER", "manageRepairFollowUp")).toBe(false); // garde de updatePartNeedAction
  });

  it("A-14 deux réceptions simultanées du même bon : quantité reçue au double de la commande", async () => {
    const admin = await makeUser("ADMIN");
    const supplier = await createSupplier({ name: `F2-${Date.now()}` });
    const part = await createPart({ sku: `DBL-${Date.now()}`, name: "Filtre", unit: "pce", salePrice: 16_000, costPrice: 9_000 }, admin);
    const po = await createPurchaseOrder({ supplierId: supplier.id, lines: [{ partId: part.id, quantityX100: 100, unitCost: 9_000 }] }, admin);
    const r = await Promise.allSettled([1, 2].map(() => createReceipt({ supplierId: supplier.id, purchaseOrderId: po.id, lines: [{ partId: part.id, quantityX100: 100 }] }, admin)));
    const line = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const stock = (await prisma.part.findUniqueOrThrow({ where: { id: part.id } })).stockX100;
    console.log("A-14", r.map((x) => x.status), "reçu", line.receivedX100, "stock", stock);
    expect(line.receivedX100).toBe(200);
    expect(stock).toBe(200);
  });

  it("A-15 facture fournisseur rattachée au bon ANNULÉ d'un AUTRE fournisseur : acceptée", async () => {
    const admin = await makeUser("ADMIN");
    const a = await createSupplier({ name: `A-${Date.now()}` });
    const b = await createSupplier({ name: `B-${Date.now()}` });
    const part = await createPart({ sku: `X-${Date.now()}`, name: "X", unit: "pce", salePrice: 1_000 }, admin);
    const poB = await createPurchaseOrder({ supplierId: b.id, lines: [{ partId: part.id, quantityX100: 100, unitCost: 500 }] }, admin);
    await cancelPurchaseOrder(poB.id, admin);
    const inv = await createSupplierInvoice({ supplierId: a.id, purchaseOrderId: poB.id, number: `FX-${Date.now()}`, issuedAt: new Date(), totalHt: 10_000, totalTax: 1_900 }, admin);
    expect(inv.id).toBeTruthy();
  });

  it("A-16 bon partiellement reçu : impossible de le solder (annulation refusée)", async () => {
    const admin = await makeUser("ADMIN");
    const s = await createSupplier({ name: `P-${Date.now()}` });
    const part = await createPart({ sku: `PA-${Date.now()}`, name: "P", unit: "pce", salePrice: 1_000 }, admin);
    const po = await createPurchaseOrder({ supplierId: s.id, lines: [{ partId: part.id, quantityX100: 400, unitCost: 500 }] }, admin);
    await createReceipt({ supplierId: s.id, purchaseOrderId: po.id, lines: [{ partId: part.id, quantityX100: 100 }] }, admin);
    await expect(cancelPurchaseOrder(po.id, admin)).rejects.toBeTruthy();
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("PARTIAL");
  });

  it("A-17 suggestions « stock bas » : propose de recommander une pièce déjà commandée", async () => {
    const admin = await makeUser("ADMIN");
    const s = await createSupplier({ name: `L-${Date.now()}` });
    const part = await createPart({ sku: `LOW-${Date.now()}`, name: "Bougies", unit: "jeu", salePrice: 64_000, costPrice: 40_000, stock: 0, minStock: 200 }, admin);
    await createPurchaseOrder({ supplierId: s.id, lines: [{ partId: part.id, quantityX100: 400, unitCost: 40_000 }] }, admin);
    const sugg = await lowStockSuggestions();
    expect(JSON.stringify(sugg)).toContain(part.id);
  });
});

describe("Argent", () => {
  it("A-20 double clic sur « encaisser » un acompte partiel : deux paiements", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "MO", quantityX100: 100, unitPrice: 500_000 }, admin);
    const inv = await createInvoice(wo.id, admin);
    await Promise.all([recordPayment(inv.id, { amount: 100_000, method: "CASH" }, admin), recordPayment(inv.id, { amount: 100_000, method: "CASH" }, admin)]);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { payments: true } });
    expect(after.payments.length).toBe(2);
    expect(after.paidAmount).toBe(200_000);
  });

  it("A-21 réparation gratuite (0 DT) : le client est facturé 1,000 DT de timbre", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "Reprise sous garantie", quantityX100: 100, unitPrice: 0 }, admin);
    const created = await createInvoice(wo.id, admin);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(inv.totalHt).toBe(0);
    expect(inv.totalTtc).toBe(1_000);
  });

  it("A-22 facture fournisseur avec timbre (100 + 19 + 1 DT) : impossible de payer 120 DT", async () => {
    const admin = await makeUser("ADMIN");
    const s = await createSupplier({ name: `T-${Date.now()}` });
    const inv = await createSupplierInvoice({ supplierId: s.id, number: `FT-${Date.now()}`, issuedAt: new Date(), totalHt: 100_000, totalTax: 19_000 }, admin);
    await expect(paySupplierInvoice(inv.id, { amount: 120_000, method: "CASH" }, admin)).rejects.toMatchObject({ code: "overpaid" });
  });

  it("A-23 rapports et rentabilité ne donnent pas le même coût des pièces pour la même facture", async () => {
    const admin = await makeUser("ADMIN");
    const part = await createPart({ sku: `CP-${Date.now()}`, name: "Pièce coût", unit: "pce", salePrice: 30_000, costPrice: 10_000, stock: 1_000 }, admin);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 100 }, admin);
    await createInvoice(wo.id, admin);
    await prisma.part.update({ where: { id: part.id }, data: { costPrice: 15_000 } });
    // Only this order is invoiced in the window: isolate by using its own day.
    const from = new Date(Date.now() - 60_000);
    const profit = await profitReport(from, new Date(Date.now() + 60_000), "repair", "Africa/Tunis");
    const line = profit.lines.find((l) => l.key === wo.id);
    const report = await getReport("day");
    const profitCost = line?.partsCost;
    console.log("A-23 rentabilité coût pièces", profitCost, "rapports coût pièces (jour)", report.money.partsCost);
    expect(profitCost).toBe(10_000);
    expect(report.money.partsCost).toBe(15_000);
  });

  it("A-24 « solde de trésorerie » des rapports ignore une échéance payée (la page Trésorerie la compte)", async () => {
    const admin = await makeUser("ADMIN");
    const before = await getReport("day");
    const exp = await createExpense(admin, { label: "Loyer audit", category: "RENT", amount: 500_000, frequency: "ONCE", firstDueDate: day(new Date()) } as never);
    await ensureOccurrences(day(new Date(Date.now() + 86_400_000)));
    const occ = await prisma.expenseOccurrence.findFirstOrThrow({ where: { expenseId: (exp as { id: string }).id } });
    await payOccurrence(admin, occ.id, { paidDay: day(new Date()), paidAmount: 500_000, method: "CASH" });
    const after = await getReport("day");
    const cb = (r: unknown) => JSON.stringify(r).match(/"cashBalance":(-?\d+)/)?.[1];
    console.log("A-24 cashBalance avant", cb(before), "après", cb(after));
    expect(cb(after)).toBe(cb(before));
  });

  it("A-25 « en retard » : le rapport compte une facture à échéance du jour que la liste ne compte pas", async () => {
    const admin = await makeUser("ADMIN");
    await prisma.setting.update({ where: { id: "garage" }, data: { paymentTermsDays: 0 } });
    try {
      const { wo } = await makeWorkOrder();
      await addLine(wo.id, { type: "LABOR", description: "MO", quantityX100: 100, unitPrice: 10_000 }, admin);
      await prisma.invoice.updateMany({ data: { status: "PAID" } }); // only the new invoice stays unpaid
      await createInvoice(wo.id, admin);
      await new Promise((r) => setTimeout(r, 1200));
      const report = await getReport("day");
      const overdueReport = Number(JSON.stringify(report).match(/"overdueNow":(\d+)/)?.[1]);
      const overdueList = await countOverdue();
      console.log("A-25 rapport", overdueReport, "liste", overdueList);
      expect(overdueReport).toBe(1);
      expect(overdueList).toBe(0);
    } finally {
      await prisma.setting.update({ where: { id: "garage" }, data: { paymentTermsDays: 15 } });
    }
  });

  it("A-26 réclamation de garantie à 0 DT réclamé : acceptée pour 50 000 DT, sans plafond", async () => {
    const manager = await makeUser("ADMIN");
    const { wo } = await readyOrder(manager);
    await changeStatus(wo.id, "DELIVERED", manager);
    const w = await prisma.warranty.findFirstOrThrow({ where: { workOrderId: wo.id } });
    const claim = await openClaim(manager, w.id, "Bruit revenu");
    await setClaimAmounts(manager, claim.id, { costParts: 0, costLabor: 0, amountClaimed: 0 });
    await moveClaim(manager, claim.id, "SUBMITTED");
    await moveClaim(manager, claim.id, "ACCEPTED", { amountAccepted: 50_000_000 });
    expect((await prisma.warrantyClaim.findUniqueOrThrow({ where: { id: claim.id } })).amountAccepted).toBe(50_000_000);
  });

  it("A-27 paiement : la date est toujours « maintenant » → un encaissement d'hier saisi aujourd'hui s'ajoute au solde d'hier", async () => {
    const admin = await makeUser("ADMIN");
    await prisma.cashBalance.deleteMany();
    const yesterday = day(new Date(Date.now() - 86_400_000));
    await recordCashBalance(admin, { amount: 1_000_000, asOf: yesterday, note: "inclut l'espèce de 200 DT reçue hier" });
    const before = (await cashForecast(admin, { scenario: "NORMAL", horizon: 30 })).result.opening;
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "MO", quantityX100: 100, unitPrice: 300_000 }, admin);
    const inv = await createInvoice(wo.id, admin);
    await recordPayment(inv.id, { amount: 200_000, method: "CASH" }, admin);
    const after = (await cashForecast(admin, { scenario: "NORMAL", horizon: 30 })).result.opening;
    console.log("A-27 ouverture avant", before, "après", after);
    expect(after! - before!).toBe(200_000);
  });

  it("A-28 acompte saisi à l'ordre : jamais enregistré comme paiement (facture entière « à encaisser »)", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder();
    await prisma.workOrder.update({ where: { id: wo.id }, data: { depositAmount: 100_000 } as never });
    await addLine(wo.id, { type: "LABOR", description: "MO", quantityX100: 100, unitPrice: 420_000 }, admin);
    const created = await createInvoice(wo.id, admin);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(inv.paidAmount).toBe(0);
    expect(await prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(0);
  });
});

describe("Équipe / accès", () => {
  it("A-30 « présent » : l'équipe dit absent (règle des 16 h) quand le tableau de bord compte présent", async () => {
    const u = await makeUser("MECHANIC");
    await prisma.clockEvent.deleteMany({});
    await prisma.clockEvent.create({ data: { userId: u.id, kind: "IN", at: new Date(Date.now() - 20 * 3_600_000), method: "CORRECTION", reason: "audit" } });
    const team = (await teamPresence()).find((x) => x.id === u.id)!;
    const dash = await presentNow();
    console.log("A-30 équipe", team.state, "tableau de bord", dash);
    expect(team.state).not.toBe(stateAfter({ kind: "IN", at: new Date() }, new Date()));
    expect(dash.working).toBe(1);
  });

  it("A-31 les accès sur mesure restent après un changement de rôle", async () => {
    const admin = await makeUser("ADMIN");
    const u = await makeUser("MECHANIC");
    await prisma.userPermission.create({ data: { userId: u.id, permission: "viewProfit", effect: "GRANT" } as never });
    await setStaffRole(admin, u.id, "RECEPTION");
    expect(await prisma.userPermission.count({ where: { userId: u.id } })).toBe(1);
  });

  it("A-32 une personne RH peut se délivrer sa propre attestation de travail", async () => {
    const hr = await makeUser("HR", { jobTitle: "RH", hireDate: new Date("2022-01-01") });
    await prisma.setting.update({ where: { id: "garage" }, data: { city: "Tunis", legalRepName: "X", legalRepTitle: "Gérant", address: "Rue 1" } });
    const cert = await issueCertificate(hr, hr.id, { purpose: "Banque" });
    expect(cert).toBeTruthy();
  });

  it("A-33 congé enregistré (déjà approuvé) pour un employé désactivé", async () => {
    const manager = await makeUser("MANAGER");
    const gone = await makeUser("MECHANIC", { isActive: false });
    const l = await requestLeave(manager, { userId: gone.id, type: "PAID_LEAVE" as never, startAt: new Date(Date.now() + 86_400_000), endAt: new Date(Date.now() + 2 * 86_400_000), allDay: true });
    expect((l as { status: string }).status).toBe("APPROVED");
  });
});

describe("Sécurité", () => {
  it("A-40 adresse IP : sans proxy, l'en-tête X-Forwarded-For envoyé par le client est pris tel quel (limites par IP contournables)", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6" });
    expect(ipFromHeaders(h, {})).toBe("6.6.6.6");
  });
});
