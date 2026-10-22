/**
 * V16 Lot 3 — refused quotes, waiting for the customer, delays, waiting for parts, on a real (throw-away)
 * PostgreSQL: announced fees (only they stay billable after a refusal), refusal by the customer or recorded by the
 * garage (lines refused and kept, reservations released, no fake customer proof), delivery with nothing to bill,
 * signed safety waiver, promised-date revisions (append-only, reason, customer message, opt-out, no channel), part
 * expected dates (revision + message + portal), automatic « attente pièces », goods receipt → missing part
 * received and reserved (regression A-12), storekeeper (A-13), keep / hand back decision, KPI in the reports.
 * Run: npm run test:db
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { QuoteSnapshot } from "@/lib/quote";
import { lastPartsWaitDecision, recordPartsWaitDecision } from "@/server/delays";
import { addPartNeed, updatePartNeed } from "@/server/follow-up";
import { createInvoice } from "@/server/invoices";
import { createPart, reservePart } from "@/server/parts";
import { getTrackingView } from "@/server/portal";
import { createPurchaseOrder, createReceipt, createSupplier } from "@/server/purchasing";
import { approveQualityCheck, saveQualityCheck } from "@/server/quality";
import { recordPortalDecision, recordStaffDecision } from "@/server/quotes";
import { getReport } from "@/server/reports";
import { addLine, changeStatus, createWorkOrder, updateMeta } from "@/server/work-orders";
import { agreeAll, makeUser, makeWorkOrder, prisma } from "./helpers/db";

const QC_OK = { roadTest: "DONE" as const, fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true };
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string; message?: string }) => e.code ?? String(e.message ?? e));
const status = async (id: string) => (await prisma.workOrder.findUniqueOrThrow({ where: { id } })).status;
const lines = (workOrderId: string) => prisma.workOrderLine.findMany({ where: { workOrderId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
const STAMP = 1000;
const FEE = 30_000;
type Actor = Awaited<ReturnType<typeof makeUser>>;
const setS = (data: { diagnosticFee?: number | null; requireSafetyWaiver?: boolean; autoWaitingParts?: boolean }) => prisma.setting.update({ where: { id: "garage" }, data });

// V16 Lot 4: the signed handover before delivery is tested in lot4-v16.db.test.ts (setting off here).
beforeAll(() => prisma.setting.upsert({ where: { id: "garage" }, update: { stampDuty: STAMP, allowWorkWithoutQuote: false, requirePaidBeforeDelivery: true, requireSignedHandover: false }, create: { id: "garage", stampDuty: STAMP } }));
afterEach(() => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM;
});
afterAll(() => prisma.setting.update({ where: { id: "garage" }, data: { diagnosticFee: null, requireSafetyWaiver: true, autoWaitingParts: true, requireSignedHandover: true } }));

/** SMS « configured » (nothing is sent: the server functions only queue; delivery happens after the commit). */
const smsOn = () => {
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "x";
  process.env.TWILIO_FROM = "+10000000000";
};

let n = 0;
/** Order opened at reception (createWorkOrder), optionally with the announced diagnostic fee and a promised date. */
async function receptionOrder(actor: Actor, opts: { diagnosticFee?: boolean; promisedAt?: Date; optOut?: boolean; phone?: string } = {}) {
  const customer = await prisma.customer.create({ data: { name: `Client L3 ${n++}`, phone: opts.phone ?? "20111222", reminderOptOut: !!opts.optOut } });
  const wo = await createWorkOrder(
    { customerId: customer.id, newVehicle: { plate: `L3${Date.now()}${n++}`, make: "Renault", model: "Clio" }, complaint: "Bruit freins", priority: "NORMAL", promisedAt: opts.promisedAt, diagnosticFee: opts.diagnosticFee },
    actor as never,
  );
  return { wo: await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } }), customer };
}

async function qcOk(manager: Actor, workOrderId: string) {
  await saveQualityCheck(manager as never, workOrderId, QC_OK);
  await approveQualityCheck(manager as never, workOrderId);
}

describe("Lot 3 — devis refusé : seuls les frais annoncés restent facturables", () => {
  it("frais de diagnostic annoncés à la réception : ligne acceptée, devis INITIAL qui les montre ; refus du client → facture = frais seulement", async () => {
    await setS({ diagnosticFee: FEE });
    const rec = await makeUser("RECEPTION");
    const { wo } = await receptionOrder(rec, { diagnosticFee: true });
    const [fee] = await lines(wo.id);
    expect(fee).toMatchObject({ type: "LABOR", unitPrice: FEE, approvalStatus: "APPROVED", isAnnouncedFee: true, description: "Frais de diagnostic" });
    expect(await prisma.auditLog.count({ where: { action: "workOrder.lineAdd", entityId: fee!.id } })).toBe(1);

    await addLine(wo.id, { type: "LABOR", description: "Plaquettes AV", quantityX100: 100, unitPrice: 120_000, priority: "SAFETY" }, rec as never);
    await addLine(wo.id, { type: "LABOR", description: "Disques AV", quantityX100: 100, unitPrice: 80_000, priority: "RECOMMENDED" }, rec as never);
    await changeStatus(wo.id, "QUOTE_SENT", rec as never);
    const quote = await prisma.quote.findFirstOrThrow({ where: { workOrderId: wo.id } });
    const snap = quote.snapshot as unknown as QuoteSnapshot;
    // The announced fee is not « work already agreed »: initial quote, fee shown apart (TTC), not in the decision.
    expect(quote.kind).toBe("INITIAL");
    expect(snap.lines.map((l) => l.description)).toEqual(["Plaquettes AV", "Disques AV"]);
    expect(snap.announcedTtc).toBe(FEE + 5_700);

    await recordPortalDecision(wo.id, { quoteId: quote.id, approvedLineIds: [], approverName: "Client L3" });
    expect(await status(wo.id)).toBe("QUOTE_REFUSED");
    expect((await lines(wo.id)).map((l) => [l.description, l.approvalStatus])).toEqual([
      ["Frais de diagnostic", "APPROVED"],
      ["Plaquettes AV", "REFUSED"],
      ["Disques AV", "REFUSED"],
    ]);
    const inv = await createInvoice(wo.id, rec as never);
    const saved = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(saved).toMatchObject({ totalHt: FEE, totalTax: 5_700, stampDuty: STAMP, totalTtc: FEE + 5_700 + STAMP });
    expect((saved.snapshot as { lines: { description: string }[] }).lines.map((l) => l.description)).toEqual(["Frais de diagnostic"]);
    // The view of the customer never shows the internal reason.
    expect(JSON.stringify(await getTrackingView(wo.id))).not.toContain("Devis refusé par le client");
    await setS({ diagnosticFee: null });
  });

  it("frais annoncé ajouté à la main : main-d'œuvre seulement, avant le devis, par l'accueil (jamais le mécanicien)", async () => {
    const rec = await makeUser("RECEPTION");
    const mech = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "Démontage annoncé", quantityX100: 100, unitPrice: 40_000, announcedFee: true }, rec as never);
    expect((await lines(wo.id))[0]).toMatchObject({ approvalStatus: "APPROVED", isAnnouncedFee: true });
    const p = await createPart({ sku: `FEE-${Date.now()}`, name: "Joint", unit: "pce", salePrice: 5_000, stock: 100 }, rec as never);
    expect(await code(addLine(wo.id, { type: "PART", partId: p.id, quantityX100: 100, announcedFee: true }, rec as never))).toBe("announcedFeeNotAllowed");
    expect(await code(addLine(wo.id, { type: "LABOR", description: "Frais", quantityX100: 100, unitPrice: 1, announcedFee: true }, mech as never))).toBe("announcedFeeNotAllowed");
    await addLine(wo.id, { type: "LABOR", description: "Réparation", quantityX100: 100, unitPrice: 90_000 }, rec as never);
    await changeStatus(wo.id, "QUOTE_SENT", rec as never);
    // After the quote: an « announced » fee would bill afterwards what the customer may refuse → refused.
    expect(await code(addLine(wo.id, { type: "LABOR", description: "Frais tardif", quantityX100: 100, unitPrice: 1, announcedFee: true }, rec as never))).toBe("announcedFeeNotAllowed");
    // The customer accepts: the work starts (the fee alone never would) and the invoice has both.
    await agreeAll(wo.id, rec);
    expect(await status(wo.id)).toBe("IN_PROGRESS");
  });

  it("refus enregistré par le garage (motif) : lignes refusées et gardées, devis fermé, réservations libérées, aucune fausse preuve client ; rien à facturer → livraison sans facture puis clôture", async () => {
    const rec = await makeUser("RECEPTION");
    const manager = await makeUser("MANAGER");
    const p = await createPart({ sku: `REF-${Date.now()}`, name: "Kit embrayage", unit: "kit", salePrice: 300_000, stock: 300 }, rec as never);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: p.id, quantityX100: 100 }, rec as never); // put aside for the quote (Lot 2)
    await reservePart(rec as never, wo.id, p.id, 100); // and one put aside by hand
    expect((await prisma.part.findUniqueOrThrow({ where: { id: p.id } })).reservedX100).toBe(200);
    await changeStatus(wo.id, "QUOTE_SENT", rec as never);
    await changeStatus(wo.id, "WAITING_CUSTOMER", rec as never);
    expect(await code(changeStatus(wo.id, "QUOTE_REFUSED", rec as never))).toBe("reasonRequired");
    await changeStatus(wo.id, "QUOTE_REFUSED", rec as never, { reason: "Pas de réponse depuis 10 jours" });

    expect((await lines(wo.id)).map((l) => l.approvalStatus)).toEqual(["REFUSED"]);
    expect((await prisma.quote.findFirstOrThrow({ where: { workOrderId: wo.id } })).status).toBe("REFUSED");
    expect(await prisma.quoteApproval.count({ where: { workOrderId: wo.id } })).toBe(0);
    expect((await prisma.part.findUniqueOrThrow({ where: { id: p.id } }))).toMatchObject({ reservedX100: 0, stockX100: 300 });
    expect(await prisma.stockReservation.count({ where: { workOrderId: wo.id, status: "ACTIVE" } })).toBe(0);
    const ev = await prisma.workOrderEvent.findFirstOrThrow({ where: { workOrderId: wo.id, type: "STATUS_CHANGED", data: { path: ["to"], equals: "QUOTE_REFUSED" } } });
    expect(ev.data).toMatchObject({ reason: "Pas de réponse depuis 10 jours", refusedLines: 1 });

    expect(await code(createInvoice(wo.id, rec as never))).toBe("noLines");
    await qcOk(manager, wo.id);
    await changeStatus(wo.id, "READY", rec as never, { reassembled: true });
    const ready = await prisma.workOrderEvent.findFirstOrThrow({ where: { workOrderId: wo.id, type: "STATUS_CHANGED", data: { path: ["to"], equals: "READY" } } });
    expect(ready.data).toMatchObject({ from: "QUOTE_REFUSED", reassembled: true });
    // Nothing billable: no invoice needed, and nothing owed → closed at delivery.
    await changeStatus(wo.id, "DELIVERED", rec as never);
    expect(await status(wo.id)).toBe("CLOSED");
  });

  it("ligne « Sécurité » refusée : décharge signée exigée avant « Prêt » (réglage), par l'accueil ou un responsable, tracée", async () => {
    const rec = await makeUser("RECEPTION");
    const manager = await makeUser("MANAGER");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "Plaquettes AR", quantityX100: 100, unitPrice: 90_000, priority: "SAFETY" }, rec as never);
    await addLine(wo.id, { type: "LABOR", description: "Vidange", quantityX100: 100, unitPrice: 60_000, priority: "RECOMMENDED" }, rec as never);
    await changeStatus(wo.id, "QUOTE_SENT", rec as never);
    const [safety, oil] = await lines(wo.id);
    await recordStaffDecision(wo.id, { approvedLineIds: [oil!.id], approverName: "Client", channel: "PHONE" }, rec as never);
    expect(await status(wo.id)).toBe("IN_PROGRESS");
    await changeStatus(wo.id, "QUALITY_CONTROL", manager as never);
    await qcOk(manager, wo.id);
    expect(await code(changeStatus(wo.id, "READY", manager as never))).toBe("safetyWaiverRequired");
    // A mechanic may make the move but not confirm the customer's signature.
    const mech = { ...(await makeUser("MECHANIC")), perms: { grant: [], deny: [] } };
    expect(await code(changeStatus(wo.id, "READY", mech as never, { safetyWaiver: true }))).toBe("forbidden");
    await changeStatus(wo.id, "READY", rec as never, { safetyWaiver: true });
    const waiver = await prisma.workOrderEvent.findFirstOrThrow({ where: { workOrderId: wo.id, type: "NOTE", data: { path: ["safetyWaiver"], equals: true } } });
    expect(waiver.data).toMatchObject({ lineIds: [safety!.id], signedOnPaper: true });
    expect(await prisma.auditLog.count({ where: { action: "workOrder.safetyWaiver", entityId: waiver.id } })).toBe(1);
    // Back to the workshop and ready again: the waiver already covers the line.
    await changeStatus(wo.id, "IN_PROGRESS", manager as never, { reason: "Reprise vidange" });
    await changeStatus(wo.id, "QUALITY_CONTROL", manager as never);
    await qcOk(manager, wo.id);
    await changeStatus(wo.id, "READY", manager as never);
    expect(await status(wo.id)).toBe("READY");

    // Setting off: no waiver asked.
    await setS({ requireSafetyWaiver: false });
    try {
      const { wo: wo2 } = await makeWorkOrder();
      await addLine(wo2.id, { type: "LABOR", description: "Rotule", quantityX100: 100, unitPrice: 50_000, priority: "SAFETY" }, rec as never);
      await changeStatus(wo2.id, "QUOTE_SENT", rec as never);
      await recordStaffDecision(wo2.id, { approvedLineIds: [], approverName: "Client", channel: "IN_PERSON" }, rec as never);
      await qcOk(manager, wo2.id);
      await changeStatus(wo2.id, "READY", rec as never);
      expect(await status(wo2.id)).toBe("READY");
    } finally {
      await setS({ requireSafetyWaiver: true });
    }
  });
});

describe("Lot 3 — retards : chaque changement de date = une révision + un message au client", () => {
  it("date promise : motif obligatoire, PromiseRevision (ajout seul), message en file, date initiale intacte ; même minute = pas de révision", async () => {
    smsOn();
    const rec = await makeUser("RECEPTION");
    const first = new Date("2026-11-10T15:00:00Z");
    const { wo } = await receptionOrder(rec, { promisedAt: first });
    const second = new Date("2026-11-12T16:30:00Z");
    expect(await code(updateMeta(wo.id, { promisedAt: second }, rec as never))).toBe("promiseReasonRequired");
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).promisedAt).toEqual(first);
    // Only the diagnosis saved (same date, to the minute): nothing to revise.
    await updateMeta(wo.id, { diagnosis: "Plaquettes usées", promisedAt: new Date(first.getTime() + 20_000) }, rec as never);
    expect(await prisma.promiseRevision.count({ where: { workOrderId: wo.id } })).toBe(0);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).promisedAt).toEqual(first);

    const r = await updateMeta(wo.id, { promisedAt: second, promiseReason: "PARTS", promiseNote: "Fournisseur en rupture (note interne)" }, rec as never);
    const revs = await prisma.promiseRevision.findMany({ where: { workOrderId: wo.id } });
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ oldDate: first, newDate: second, reason: "PARTS", notified: true, partNeedId: null, createdById: rec.id });
    expect(r.dedupeKey).toBe(revs[0]!.dedupeKey);
    const msgs = await prisma.notification.findMany({ where: { dedupeKey: revs[0]!.dedupeKey! } });
    expect(msgs.map((m) => [m.kind, m.channel, m.status, m.to])).toEqual([["PROMISE", "SMS", "PENDING", "+21620111222"]]);
    expect(msgs[0]!.body).toContain("attente de pièces");
    expect(msgs[0]!.body).not.toContain("note interne");
    const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    expect(after).toMatchObject({ promisedAt: second, promisedAtInitial: first });
    expect(await prisma.auditLog.count({ where: { action: "workOrder.promiseRevision", entityId: revs[0]!.id } })).toBe(1);

    // A second change: a second revision and a second message.
    await updateMeta(wo.id, { promisedAt: new Date("2026-11-14T10:00:00Z"), promiseReason: "EXTRA_WORK" }, rec as never);
    expect(await prisma.promiseRevision.count({ where: { workOrderId: wo.id } })).toBe(2);
    expect(await prisma.notification.count({ where: { workOrderId: wo.id, kind: "PROMISE" } })).toBe(2);
    // Cleared: still a revision (reason), no message.
    await updateMeta(wo.id, { promiseReason: "CUSTOMER_DECISION" }, rec as never);
    const last = await prisma.promiseRevision.findFirstOrThrow({ where: { workOrderId: wo.id }, orderBy: { createdAt: "desc" } });
    expect(last).toMatchObject({ newDate: null, reason: "CUSTOMER_DECISION", notified: false, dedupeKey: null });

    // Append-only (like the journal), the hub sync excepted.
    await expect(prisma.$executeRawUnsafe(`UPDATE "PromiseRevision" SET reason='OTHER' WHERE id=$1`, revs[0]!.id)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "PromiseRevision" WHERE id=$1`, revs[0]!.id)).rejects.toThrow(/append-only/);
  });

  it("client qui refuse les messages : révision « non prévenu », aucun message ; sans canal : ligne « ignoré + raison » (jamais un faux envoi)", async () => {
    const rec = await makeUser("RECEPTION");
    smsOn();
    const { wo } = await receptionOrder(rec, { promisedAt: new Date("2026-11-10T15:00:00Z"), optOut: true });
    await updateMeta(wo.id, { promisedAt: new Date("2026-11-11T15:00:00Z"), promiseReason: "WORKSHOP_LOAD" }, rec as never);
    expect(await prisma.promiseRevision.findFirstOrThrow({ where: { workOrderId: wo.id } })).toMatchObject({ notified: false, dedupeKey: null });
    expect(await prisma.notification.count({ where: { workOrderId: wo.id } })).toBe(0);

    delete process.env.TWILIO_ACCOUNT_SID;
    const { wo: wo2 } = await receptionOrder(rec, { promisedAt: new Date("2026-11-10T15:00:00Z") });
    await updateMeta(wo2.id, { promisedAt: new Date("2026-11-11T15:00:00Z"), promiseReason: "INSURANCE" }, rec as never);
    const rev = await prisma.promiseRevision.findFirstOrThrow({ where: { workOrderId: wo2.id } });
    expect(rev.notified).toBe(false);
    const row = await prisma.notification.findFirstOrThrow({ where: { dedupeKey: rev.dedupeKey! } });
    expect(row).toMatchObject({ channel: "NONE", status: "SKIPPED" });
    expect(row.error).toMatch(/Aucun canal/);
  });
});

describe("Lot 3 — attente pièces", () => {
  it("pièce liée à une ligne acceptée : passage auto en attente pièces, date prévue = révision + message, visible sur le portail (sans note interne)", async () => {
    smsOn();
    const rec = await makeUser("RECEPTION");
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "LABOR", description: "Remplacement embrayage", quantityX100: 300, unitPrice: 35_000 }, rec as never);
    await changeStatus(wo.id, "QUOTE_SENT", rec as never);
    await agreeAll(wo.id, rec);
    expect(await status(wo.id)).toBe("IN_PROGRESS");
    const [line] = await lines(wo.id);
    const d1 = new Date("2026-11-05T11:00:00Z");
    const need = await addPartNeed(rec as never, wo.id, { description: "Kit embrayage Valeo", quantityX100: 100, expectedAt: d1, workOrderLineId: line!.id });
    expect(await status(wo.id)).toBe("WAITING_PARTS");
    const auto = await prisma.workOrderEvent.findFirstOrThrow({ where: { workOrderId: wo.id, type: "STATUS_CHANGED", data: { path: ["to"], equals: "WAITING_PARTS" } } });
    expect(auto.data).toMatchObject({ from: "IN_PROGRESS", autoParts: true });
    const rev1 = await prisma.promiseRevision.findFirstOrThrow({ where: { partNeedId: need.id } });
    expect(rev1).toMatchObject({ oldDate: null, newDate: d1, reason: "PARTS", notified: true });
    expect((await prisma.notification.findFirstOrThrow({ where: { dedupeKey: rev1.dedupeKey! } })).kind).toBe("PART_DATE");

    const d2 = new Date("2026-11-09T11:00:00Z");
    await updatePartNeed(rec as never, need.id, { status: "ORDERED", expectedAt: d2, dateReason: "PARTS", dateNote: "rupture chez le grossiste" });
    await updatePartNeed(rec as never, need.id, { status: "ORDERED", expectedAt: d2 }); // same date: nothing new
    expect(await prisma.promiseRevision.count({ where: { partNeedId: need.id } })).toBe(2);
    expect(await prisma.notification.count({ where: { workOrderId: wo.id, kind: "PART_DATE" } })).toBe(2);

    const view = await getTrackingView(wo.id);
    expect(view!.partsExpected).toEqual([{ id: need.id, part: "Remplacement embrayage", expectedAt: d2 }]);
    expect(JSON.stringify(view)).not.toContain("grossiste");
  });

  it("besoin connu avant l'accord : l'accord fait passer directement en attente pièces ; réglage désactivé → en réparation", async () => {
    const rec = await makeUser("RECEPTION");
    for (const auto of [true, false]) {
      await setS({ autoWaitingParts: auto });
      const { wo } = await makeWorkOrder();
      await addLine(wo.id, { type: "LABOR", description: "Courroie", quantityX100: 200, unitPrice: 35_000 }, rec as never);
      const [line] = await lines(wo.id);
      await addPartNeed(rec as never, wo.id, { description: "Kit courroie", quantityX100: 100, workOrderLineId: line!.id });
      expect(await status(wo.id)).toBe("RECEIVED"); // the line is not accepted yet
      await changeStatus(wo.id, "QUOTE_SENT", rec as never);
      await agreeAll(wo.id, rec);
      expect(await status(wo.id)).toBe(auto ? "WAITING_PARTS" : "IN_PROGRESS");
    }
    await setS({ autoWaitingParts: true });
  });

  it("date promise modifiée : le portail montre la nouvelle date avec un libellé client (jamais la note)", async () => {
    const rec = await makeUser("RECEPTION");
    const { wo } = await receptionOrder(rec, { promisedAt: new Date("2026-11-10T15:00:00Z") });
    const nd = new Date("2026-11-13T15:00:00Z");
    await updateMeta(wo.id, { promisedAt: nd, promiseReason: "PARTS", promiseNote: "fournisseur oublié" }, rec as never);
    const view = await getTrackingView(wo.id);
    expect(view!.promiseChange).toEqual({ date: nd, reason: "PARTS" });
    expect(JSON.stringify(view)).not.toContain("oublié");
  });

  it("A-12 (corrigé) bon de réception : la pièce manquante passe « reçue », rattachée au bon, réservée pour l'ordre, signalée sur l'ordre", async () => {
    const admin = await makeUser("ADMIN");
    const supplier = await createSupplier({ name: `F-L3-${Date.now()}` });
    const part = await createPart({ sku: `NEED3-${Date.now()}`, name: "Kit distribution", unit: "kit", salePrice: 450_000, costPrice: 320_000 }, admin as never);
    const { wo } = await makeWorkOrder({ status: "WAITING_PARTS" });
    const need = await addPartNeed(admin as never, wo.id, { partId: part.id, description: "Kit distribution", quantityX100: 100 });
    await updatePartNeed(admin as never, need.id, { status: "ORDERED" });
    const po = await createPurchaseOrder({ supplierId: supplier.id, lines: [{ partId: part.id, quantityX100: 100, unitCost: 320_000 }] }, admin as never);
    await createReceipt({ supplierId: supplier.id, purchaseOrderId: po.id, lines: [{ partId: part.id, quantityX100: 100 }] }, admin as never);
    const after = await prisma.workOrderPartNeed.findUniqueOrThrow({ where: { id: need.id } });
    expect(after).toMatchObject({ status: "RECEIVED", purchaseOrderId: po.id });
    expect(after.receivedAt).not.toBeNull();
    const res = await prisma.stockReservation.findMany({ where: { workOrderId: wo.id, status: "ACTIVE" } });
    expect(res.map((r) => [r.partId, r.quantityX100])).toEqual([[part.id, 100]]);
    expect((await prisma.part.findUniqueOrThrow({ where: { id: part.id } }))).toMatchObject({ stockX100: 100, reservedX100: 100 });
    expect(await prisma.workOrderEvent.count({ where: { workOrderId: wo.id, type: "NOTE", data: { path: ["partReceived"], equals: true } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "partNeed.receive", entityId: need.id } })).toBe(1);
  });

  it("bon de réception : complète la réservation de la ligne de devis qui attendait la pièce ; quantité insuffisante → besoin inchangé", async () => {
    const admin = await makeUser("ADMIN");
    const supplier = await createSupplier({ name: `F-L3b-${Date.now()}` });
    const part = await createPart({ sku: `LINE3-${Date.now()}`, name: "Amortisseur", unit: "pce", salePrice: 150_000 }, admin as never);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: part.id, quantityX100: 200 }, admin as never); // nothing free: reserved 0
    const [line] = await lines(wo.id);
    const need = await addPartNeed(admin as never, wo.id, { partId: part.id, description: "Amortisseurs AV", quantityX100: 200, workOrderLineId: line!.id });
    await createReceipt({ supplierId: supplier.id, lines: [{ partId: part.id, quantityX100: 100, unitCost: 90_000 }] }, admin as never);
    expect((await prisma.workOrderPartNeed.findUniqueOrThrow({ where: { id: need.id } })).status).toBe("NEEDED");
    await createReceipt({ supplierId: supplier.id, lines: [{ partId: part.id, quantityX100: 200, unitCost: 90_000 }] }, admin as never);
    expect((await prisma.workOrderPartNeed.findUniqueOrThrow({ where: { id: need.id } })).status).toBe("RECEIVED");
    const res = await prisma.stockReservation.findMany({ where: { workOrderId: wo.id, status: "ACTIVE" } });
    expect(res.every((r) => r.workOrderLineId === line!.id)).toBe(true);
    expect(res.reduce((s, r) => s + r.quantityX100, 0)).toBe(200);
  });

  it("A-13 (en partie) le magasinier met à jour une pièce manquante ; le mécanicien non", async () => {
    const store = await makeUser("STOREKEEPER");
    const mech = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder({ status: "IN_PROGRESS" });
    const need = await addPartNeed(store as never, wo.id, { description: "Rotule", quantityX100: 100 });
    await updatePartNeed(store as never, need.id, { status: "ORDERED", expectedAt: new Date("2026-11-20T11:00:00Z") });
    expect((await prisma.workOrderPartNeed.findUniqueOrThrow({ where: { id: need.id } })).status).toBe("ORDERED");
    expect(await code(updatePartNeed(mech as never, need.id, { status: "RECEIVED" }))).toBe("forbidden");
  });

  it("décision « garder / restituer » pendant l'attente pièces : événement + journal, imputable au garage (pour le gardiennage du Lot 4)", async () => {
    const rec = await makeUser("RECEPTION");
    const { wo } = await makeWorkOrder({ status: "WAITING_PARTS" });
    expect(await lastPartsWaitDecision(wo.id)).toBeNull();
    await recordPartsWaitDecision(rec as never, wo.id, "KEEP_VEHICLE", true);
    await recordPartsWaitDecision(rec as never, wo.id, "RETURN_LATER", false);
    expect(await lastPartsWaitDecision(wo.id)).toMatchObject({ decision: "RETURN_LATER", garageCaused: false });
    expect(await prisma.auditLog.count({ where: { action: "workOrder.partsWaitDecision", after: { path: ["workOrderId"], equals: wo.id } } })).toBe(2);
  });
});

describe("Lot 3 — KPI « livré à la date promise initiale »", () => {
  it("calculé dans les rapports sur un jeu de test (période isolée)", async () => {
    const now = new Date("2031-03-20T12:00:00Z");
    const mk = async (delivered: string, initial: string | null, current: string | null) => {
      const { wo } = await makeWorkOrder({ status: "DELIVERED" });
      await prisma.workOrder.update({ where: { id: wo.id }, data: { deliveredAt: new Date(delivered), promisedAtInitial: initial ? new Date(initial) : null, promisedAt: current ? new Date(current) : null } });
    };
    await mk("2031-03-10T10:00:00Z", "2031-03-10T15:00:00Z", "2031-03-10T15:00:00Z"); // on time
    await mk("2031-03-12T10:00:00Z", "2031-03-11T15:00:00Z", "2031-03-12T15:00:00Z"); // late vs initial, on time vs current
    await mk("2031-03-15T10:00:00Z", "2031-03-14T15:00:00Z", "2031-03-14T15:00:00Z"); // late
    await mk("2031-03-16T10:00:00Z", null, null); // no promise: not counted
    const report = await getReport("month", now);
    expect(report.cars.promise).toEqual({ withPromise: 3, onTimeInitial: 1, pctInitial: 33.3, withCurrent: 3, onTimeCurrent: 2, pctCurrent: 66.7 });
  });
});
