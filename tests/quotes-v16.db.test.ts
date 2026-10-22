/**
 * V16 Lot 2 — versioned quote and line-by-line traced agreement, on a real (throw-away) PostgreSQL:
 * snapshot + SHA-256 fingerprint, versions and supplements, partial / total refusal, locked accepted lines,
 * staff agreement (never a mechanic), portal decision (name, IP, browser, expiry, changed quote), append-only
 * QuoteApproval, invoice = accepted lines only, stock reserved on the quote and taken out at the agreement,
 * online-with-hub behaviour (no WorkOrder / stock write, numbering refused), re-applying lost statuses,
 * customer notices. Run: npm run test:db
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/format";
import { snapshotHash, type QuoteSnapshot } from "@/lib/quote";
import { createInvoice } from "@/server/invoices";
import { createPart } from "@/server/parts";
import { approveQuoteByCustomer, getTrackingView } from "@/server/portal";
import { recordPortalDecision, recordStaffDecision, sendQuote } from "@/server/quotes";
import { collectDue } from "@/server/reminders";
import { addLine, changeStatus, removeLine } from "@/server/work-orders";
import { agreeAll, makeUser, makeWorkOrder, prisma } from "./helpers/db";

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string; message?: string }) => e.code ?? String(e.message ?? e));
const status = async (id: string) => (await prisma.workOrder.findUniqueOrThrow({ where: { id } })).status;
const lines = (workOrderId: string) => prisma.workOrderLine.findMany({ where: { workOrderId }, orderBy: { position: "asc" } });
const part = (id: string) => prisma.part.findUniqueOrThrow({ where: { id }, select: { stockX100: true, reservedX100: true } });
const STAMP = 1000;

beforeAll(() => prisma.setting.upsert({ where: { id: "garage" }, update: { stampDuty: STAMP, allowWorkWithoutQuote: false }, create: { id: "garage", stampDuty: STAMP } }));
afterEach(() => {
  delete process.env.GARAGE_HUB;
});
afterAll(() => prisma.setting.update({ where: { id: "garage" }, data: { allowWorkWithoutQuote: false } }));

/** New order with labour lines (amounts in millimes HT), quote sent. */
async function quotedOrder(admin: Awaited<ReturnType<typeof makeUser>>, prices: number[] = [100_000, 50_000, 20_000]) {
  const { wo, customer, vehicle } = await makeWorkOrder();
  for (const [i, unitPrice] of prices.entries()) {
    await addLine(wo.id, { type: "LABOR", description: `Travail ${i + 1}`, quantityX100: 100, unitPrice, priority: i === 0 ? "SAFETY" : "RECOMMENDED" }, admin);
  }
  await changeStatus(wo.id, "QUOTE_SENT", admin);
  const quote = await prisma.quote.findFirstOrThrow({ where: { workOrderId: wo.id }, orderBy: { version: "desc" } });
  return { wo, customer, vehicle, quote, lineIds: (await lines(wo.id)).map((l) => l.id) };
}

describe("Lot 2 — devis versionné : copie figée et empreinte", () => {
  it("l'envoi crée la version 1 (numéro, lignes rattachées) ; l'empreinte SHA-256 est stable et se recalcule depuis la base", async () => {
    const admin = await makeUser("ADMIN");
    const { wo, quote, lineIds } = await quotedOrder(admin);
    expect(quote).toMatchObject({ version: 1, kind: "INITIAL", status: "SENT", sentById: admin.id, sentChannel: "PORTAL" });
    expect(quote.number).toMatch(/^D\d{4}-\d{4}$/);
    expect(quote.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    // Stored as jsonb (keys reordered by PostgreSQL): the canonical fingerprint is unchanged.
    expect(snapshotHash(quote.snapshot)).toBe(quote.snapshotHash);
    const snap = quote.snapshot as unknown as QuoteSnapshot;
    expect(snap.lines.map((l) => l.id)).toEqual(lineIds);
    expect(snap.lines[0]).toMatchObject({ priority: "SAFETY", totalHt: 100_000 });
    expect(snap.totals).toMatchObject({ totalHt: 170_000, totalTax: 32_300, stampDuty: STAMP, totalTtc: 170_000 + 32_300 + STAMP });
    expect((await lines(wo.id)).every((l) => l.quoteId === quote.id && l.approvalStatus === "PENDING")).toBe(true);
    // Sent again with the same lines: same version, no new number.
    await sendQuote(wo.id, admin);
    expect(await prisma.quote.count({ where: { workOrderId: wo.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "quote.send", entityId: quote.id } })).toBe(1);
  });

  it("une ligne ajoutée puis « renvoyer » = version 2, la 1 est remplacée ; supprimer une ligne d'un devis envoyé le remplace aussi", async () => {
    const admin = await makeUser("ADMIN");
    const { wo, quote } = await quotedOrder(admin, [80_000]);
    await addLine(wo.id, { type: "LABOR", description: "Oubli", quantityX100: 50, unitPrice: 40_000 }, admin);
    const v2 = await sendQuote(wo.id, admin);
    expect(v2).toMatchObject({ version: 2, kind: "INITIAL", status: "SENT" });
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("SUPERSEDED");
    expect((v2.snapshot as unknown as QuoteSnapshot).lines).toHaveLength(2);
    // Removing a pending line of the sent version: that version no longer matches, it is replaced.
    const oubli = (await lines(wo.id)).find((l) => l.description === "Oubli")!;
    await removeLine(oubli.id, admin);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: v2.id } })).status).toBe("SUPERSEDED");
    expect(await code(approveQuoteByCustomer(wo.id))).toBe("quoteNotPending");
  });
});

describe("Lot 2 — accord ligne par ligne", () => {
  it("accord partiel : statuts des lignes, montant accepté exact, devis PARTIEL, passage en réparation, facture = lignes acceptées", async () => {
    const rec = await makeUser("RECEPTION");
    const { wo, quote, lineIds } = await quotedOrder(rec);
    const [a, b, c] = lineIds as [string, string, string];
    const r = await recordStaffDecision(wo.id, { approvedLineIds: [a, c], approverName: "M. Ben Ali", approverContact: "20111222", channel: "PHONE", note: "Le 2e plus tard" }, rec);
    expect(r).toMatchObject({ decision: "PARTIAL", status: "IN_PROGRESS" });
    const expected = computeTotals([{ quantityX100: 100, unitPrice: 100_000, taxRateBp: 1900 }, { quantityX100: 100, unitPrice: 20_000, taxRateBp: 1900 }], STAMP).totalTtc;
    expect(r.amount).toBe(expected);
    expect((await lines(wo.id)).map((l) => l.approvalStatus)).toEqual(["APPROVED", "REFUSED", "APPROVED"]);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("PARTIAL");
    const approval = await prisma.quoteApproval.findFirstOrThrow({ where: { quoteId: quote.id } });
    expect(approval).toMatchObject({ decision: "PARTIAL", channel: "PHONE", recordedById: rec.id, approverName: "M. Ben Ali", approverContact: "20111222", amountApprovedTtc: expected, quoteHash: quote.snapshotHash });
    expect(approval.approvedLineIds).toEqual([a, c]);
    expect(approval.refusedLineIds).toEqual([b]);
    expect(await prisma.auditLog.count({ where: { action: "quote.decision", entityId: approval.id, actorId: rec.id } })).toBe(1);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).quoteApprovedAt).not.toBeNull();
    const inv = await createInvoice(wo.id, rec);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(invoice.totalTtc).toBe(expected);
    expect((invoice.snapshot as { lines: { description: string }[] }).lines.map((l) => l.description)).toEqual(["Travail 1", "Travail 3"]);
  });

  it("refus total du devis initial : lignes refusées, devis REFUSÉ, ordre en « devis refusé » (motif interne) ; rien à facturer", async () => {
    const rec = await makeUser("RECEPTION");
    const { wo } = await quotedOrder(rec, [60_000, 30_000]);
    const r = await recordStaffDecision(wo.id, { approvedLineIds: [], approverName: "Client", channel: "IN_PERSON" }, rec);
    expect(r).toMatchObject({ decision: "REFUSED", amount: 0, status: "QUOTE_REFUSED" });
    expect((await lines(wo.id)).every((l) => l.approvalStatus === "REFUSED")).toBe(true);
    const ev = await prisma.workOrderEvent.findFirstOrThrow({ where: { workOrderId: wo.id, type: "STATUS_CHANGED", data: { path: ["to"], equals: "QUOTE_REFUSED" } } });
    expect(ev.data).toMatchObject({ approval: true, reason: "Devis refusé par le client" });
    expect(await code(createInvoice(wo.id, rec))).toBe("noLines");
    // The portal never shows the internal reason.
    expect(JSON.stringify(await getTrackingView(wo.id))).not.toContain("Devis refusé par le client");
  });

  it("un mécanicien ne peut pas enregistrer d'accord ; sans accord enregistré, pas de passage en réparation", async () => {
    const admin = await makeUser("ADMIN");
    const mech = await makeUser("MECHANIC");
    const rec = await makeUser("RECEPTION");
    const { wo, lineIds } = await quotedOrder(admin, [50_000]);
    expect(await code(recordStaffDecision(wo.id, { approvedLineIds: lineIds, approverName: "Client", channel: "PHONE" }, mech))).toBe("forbidden");
    expect(await prisma.quoteApproval.count({ where: { workOrderId: wo.id } })).toBe(0);
    expect(await code(changeStatus(wo.id, "IN_PROGRESS", mech))).toBe("statusForbidden");
    expect(await code(changeStatus(wo.id, "IN_PROGRESS", rec, { reason: "Le client a dit oui" }))).toBe("approvalRequired");
    expect(await status(wo.id)).toBe("QUOTE_SENT");
  });

  it("ligne acceptée verrouillée (annulation motivée seulement), ligne refusée conservée, ligne en attente supprimable", async () => {
    const admin = await makeUser("ADMIN");
    const { wo, lineIds } = await quotedOrder(admin);
    const [a, b] = lineIds as [string, string, string];
    await recordStaffDecision(wo.id, { approvedLineIds: [a, lineIds[2]!], approverName: "Client", channel: "PHONE" }, admin);
    expect(await code(removeLine(a, admin))).toBe("reasonRequired");
    await removeLine(a, admin, "Le client apporte la pièce");
    expect(await prisma.workOrderLine.findUniqueOrThrow({ where: { id: a } })).toMatchObject({ approvalStatus: "APPROVED", voidReason: "Le client apporte la pièce" });
    expect(await code(removeLine(b, admin, "essai"))).toBe("lineRefusedLocked");
    // Added after the agreement: a pending supplement, deletable.
    await addLine(wo.id, { type: "LABOR", description: "Supplément", quantityX100: 100, unitPrice: 5_000 }, admin);
    const extra = (await lines(wo.id)).find((l) => l.description === "Supplément")!;
    expect(extra.approvalStatus).toBe("PENDING");
    await removeLine(extra.id, admin);
    expect(await prisma.workOrderLine.findUnique({ where: { id: extra.id } })).toBeNull();
  });

  it("facture = lignes ACCEPTÉES non annulées seulement ; une ligne en attente bloque la facture avec un message", async () => {
    const admin = await makeUser("ADMIN");
    const { wo, lineIds } = await quotedOrder(admin, [100_000, 50_000, 20_000]);
    const [a, b, c] = lineIds as [string, string, string];
    await recordStaffDecision(wo.id, { approvedLineIds: [a, b], approverName: "Client", channel: "PHONE" }, admin);
    await removeLine(b, admin, "Plus nécessaire"); // accepted then voided
    await addLine(wo.id, { type: "LABOR", description: "Pas encore accepté", quantityX100: 100, unitPrice: 9_000 }, admin);
    expect(await code(createInvoice(wo.id, admin))).toBe("pendingLines");
    const pending = (await lines(wo.id)).find((l) => l.description === "Pas encore accepté")!;
    await removeLine(pending.id, admin);
    const inv = await createInvoice(wo.id, admin);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect((invoice.snapshot as { lines: { description: string }[] }).lines.map((l) => l.description)).toEqual(["Travail 1"]);
    expect(invoice.totalHt).toBe(100_000);
    expect(c).toBeTruthy();
  });
});

describe("Lot 2 — supplément", () => {
  it("En réparation → Devis envoyé : devis SUPPLÉMENT avec les seules nouvelles lignes, ancien total / supplément / nouveau total", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await quotedOrder(admin, [100_000]);
    await agreeAll(wo.id, admin);
    expect(await status(wo.id)).toBe("IN_PROGRESS");
    await addLine(wo.id, { type: "LABOR", description: "Découverte : flexible", quantityX100: 100, unitPrice: 30_000 }, admin);
    await changeStatus(wo.id, "QUOTE_SENT", admin);
    const sup = await prisma.quote.findFirstOrThrow({ where: { workOrderId: wo.id, version: 2 } });
    expect(sup.kind).toBe("SUPPLEMENT");
    const snap = sup.snapshot as unknown as QuoteSnapshot;
    expect(snap.lines.map((l) => l.description)).toEqual(["Découverte : flexible"]);
    expect(snap.totals.stampDuty).toBe(0); // the stamp is charged once, on the initial quote
    expect(snap.previousTtc).toBe(100_000 + 19_000 + STAMP);
    expect(snap.totals.totalTtc).toBe(30_000 + 5_700);
    expect(snap.newTotalTtc).toBe(130_000 + 24_700 + STAMP);
    // The first agreement is untouched (new version, not a rewrite).
    expect((await prisma.quote.findFirstOrThrow({ where: { workOrderId: wo.id, version: 1 } })).status).toBe("APPROVED");
    // Supplement refused: the order goes back to the work already accepted.
    const r = await recordStaffDecision(wo.id, { approvedLineIds: [], approverName: "Client", channel: "PHONE" }, admin);
    expect(r).toMatchObject({ decision: "REFUSED", status: "IN_PROGRESS" });
  });
});

describe("Lot 2 — portail client", () => {
  it("décision ligne par ligne : nom obligatoire, IP et navigateur gardés, double envoi = une décision, devis expiré ou changé refusé", async () => {
    const admin = await makeUser("ADMIN");
    const { wo, quote, lineIds } = await quotedOrder(admin, [70_000, 10_000]);
    const view = await getTrackingView(wo.id);
    expect(view!.quoteV16).toMatchObject({ id: quote.id, number: quote.number, expired: false });
    expect(view!.quoteV16!.lines.map((l) => l.priority)).toEqual(["SAFETY", "RECOMMENDED"]);
    expect(view!.quote).toBeNull(); // the Lot 1 one-click quote is for older orders only
    expect(await code(recordPortalDecision(wo.id, { quoteId: quote.id, approvedLineIds: [lineIds[0]!], approverName: " " }))).toBe("approverNameRequired");
    expect(await code(recordPortalDecision(wo.id, { quoteId: "autre-version", approvedLineIds: [lineIds[0]!], approverName: "Sami" }))).toBe("quoteChanged");
    const both = await Promise.allSettled([
      recordPortalDecision(wo.id, { quoteId: quote.id, approvedLineIds: [lineIds[0]!], approverName: "Sami", ip: "41.3.3.3", userAgent: "Phone UA" }),
      recordPortalDecision(wo.id, { quoteId: quote.id, approvedLineIds: [lineIds[0]!], approverName: "Sami", ip: "41.3.3.3", userAgent: "Phone UA" }),
    ]);
    expect(both.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const a = await prisma.quoteApproval.findFirstOrThrow({ where: { workOrderId: wo.id } });
    expect(a).toMatchObject({ channel: "PORTAL", recordedById: null, approverName: "Sami", ip: "41.3.3.3", userAgent: "Phone UA", decision: "PARTIAL" });
    expect(await status(wo.id)).toBe("IN_PROGRESS");
    expect((await getTrackingView(wo.id))!.lastDecision).toMatchObject({ decision: "PARTIAL" });

    const { wo: late, quote: old } = await quotedOrder(admin, [10_000]);
    await prisma.quote.update({ where: { id: old.id }, data: { validUntil: new Date(Date.now() - 1000) } });
    expect(await code(approveQuoteByCustomer(late.id))).toBe("quoteExpired");
  });

  it("QuoteApproval est en ajout seul (modification et suppression refusées), sauf pour la synchronisation", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await quotedOrder(admin, [10_000]);
    await agreeAll(wo.id, admin);
    const a = await prisma.quoteApproval.findFirstOrThrow({ where: { workOrderId: wo.id } });
    await expect(prisma.$executeRawUnsafe(`UPDATE "QuoteApproval" SET "amountApprovedTtc" = 1 WHERE id = '${a.id}'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "QuoteApproval" WHERE id = '${a.id}'`)).rejects.toThrow(/append-only/);
    await prisma.$transaction([prisma.$queryRawUnsafe(`SELECT set_config('garagepro.sync', 'on', true)`), prisma.$executeRawUnsafe(`UPDATE "QuoteApproval" SET note = 'sync' WHERE id = '${a.id}'`)]);
    expect((await prisma.quoteApproval.findUniqueOrThrow({ where: { id: a.id } })).amountApprovedTtc).toBe(a.amountApprovedTtc);
  });

  it("en ligne avec un hub : l'accord du client n'écrit ni l'ordre ni le stock (le garage les applique) ; un devis ne se numérote pas en ligne", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: `HUB-${Date.now()}`, name: "Plaquettes", unit: "jeu", salePrice: 60_000, stock: 500 }, admin);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: p.id, quantityX100: 100 }, admin);
    await changeStatus(wo.id, "QUOTE_SENT", admin);
    const before = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    const quote = await prisma.quote.findFirstOrThrow({ where: { workOrderId: wo.id } });
    const lineId = (await lines(wo.id))[0]!.id;
    process.env.GARAGE_HUB = "1"; // the online copy, with a garage hub
    await recordPortalDecision(wo.id, { quoteId: quote.id, approvedLineIds: [lineId], approverName: "Client en ligne", ip: "41.9.9.9" });
    const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    expect(after.updatedAt).toEqual(before.updatedAt); // WorkOrder row untouched online
    expect(after.status).toBe("QUOTE_SENT");
    expect(await part(p.id)).toEqual({ stockX100: 500, reservedX100: 100 }); // Part row untouched online
    // Sending a quote online with a hub: refused with a clear message (numbered at the garage).
    await addLine(wo.id, { type: "LABOR", description: "Main-d'œuvre", quantityX100: 100, unitPrice: 20_000 }, admin);
    expect(await code(sendQuote(wo.id, admin))).toBe("quoteHubOnly");
    delete process.env.GARAGE_HUB;
    // At the garage: the agreement allows the work; the part leaves the stock then.
    const extra = (await lines(wo.id)).find((l) => l.description === "Main-d'œuvre")!;
    await removeLine(extra.id, admin);
    await changeStatus(wo.id, "IN_PROGRESS", admin);
    expect(await status(wo.id)).toBe("IN_PROGRESS");
    expect(await part(p.id)).toEqual({ stockX100: 400, reservedX100: 0 });
  });

  it("un statut de ligne perdu (conflit de synchronisation) est rétabli depuis l'accord enregistré", async () => {
    const admin = await makeUser("ADMIN");
    const { wo, quote } = await quotedOrder(admin, [40_000, 10_000]);
    await agreeAll(wo.id, admin);
    // Simulate the garage's older copy winning on the line rows and the quote row.
    await prisma.workOrderLine.updateMany({ where: { workOrderId: wo.id }, data: { approvalStatus: "PENDING" } });
    await prisma.quote.update({ where: { id: quote.id }, data: { status: "SENT" } });
    await changeStatus(wo.id, "QUALITY_CONTROL", admin);
    expect((await lines(wo.id)).every((l) => l.approvalStatus === "APPROVED")).toBe(true);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("APPROVED");
  });
});

describe("Lot 2 — stock : réservé au devis, sorti à l'accord", () => {
  it("ajout au devis = réservation (pas de sortie) ; accord = sortie ; refus = réservation libérée ; annulation = rendu une fois", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: `STK-${Date.now()}`, name: "Disque", unit: "pce", salePrice: 50_000, stock: 1000 }, admin);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: p.id, quantityX100: 200, partCondition: "NEW" }, admin);
    await addLine(wo.id, { type: "PART", partId: p.id, quantityX100: 100, partCondition: "USED" }, admin);
    expect(await part(p.id)).toEqual({ stockX100: 1000, reservedX100: 300 });
    expect(await prisma.stockMovement.count({ where: { workOrderId: wo.id } })).toBe(0);
    const [keep, drop] = await lines(wo.id);
    expect(keep).toMatchObject({ stockDeferred: true, partCondition: "NEW" });
    await changeStatus(wo.id, "QUOTE_SENT", admin);
    await recordStaffDecision(wo.id, { approvedLineIds: [keep!.id], approverName: "Client", channel: "PHONE" }, admin);
    expect(await part(p.id)).toEqual({ stockX100: 800, reservedX100: 0 });
    expect(await prisma.stockMovement.findMany({ where: { workOrderId: wo.id }, select: { deltaX100: true, reason: true } })).toEqual([{ deltaX100: -200, reason: "WORK_ORDER" }]);
    expect(await prisma.stockReservation.findMany({ where: { workOrderId: wo.id }, orderBy: { quantityX100: "asc" }, select: { status: true, workOrderLineId: true } })).toEqual([
      { status: "RELEASED", workOrderLineId: drop!.id },
      { status: "CONSUMED", workOrderLineId: keep!.id },
    ]);
    await changeStatus(wo.id, "CANCELLED", admin, { reason: "Client renonce" });
    expect(await part(p.id)).toEqual({ stockX100: 1000, reservedX100: 0 });
  });

  it("une pièce en attente supprimée libère sa réservation ; le stock libre insuffisant reste un avertissement", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: `STK2-${Date.now()}`, name: "Batterie", unit: "pce", salePrice: 300_000, stock: 100 }, admin);
    const { wo } = await makeWorkOrder();
    const warning = await addLine(wo.id, { type: "PART", partId: p.id, quantityX100: 300 }, admin);
    expect(warning).toMatchObject({ name: "Batterie", stockX100: -200 });
    expect(await part(p.id)).toEqual({ stockX100: 100, reservedX100: 100 });
    await removeLine((await lines(wo.id))[0]!.id, admin);
    expect(await part(p.id)).toEqual({ stockX100: 100, reservedX100: 0 });
    expect(await prisma.stockMovement.count({ where: { workOrderId: wo.id } })).toBe(0);
  });

  it("ordre d'avant la V16 : rien ne change (sortie à l'ajout, accord en un clic qui accepte les lignes)", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: `OLD-${Date.now()}`, name: "Filtre", unit: "pce", salePrice: 20_000, stock: 500 }, admin);
    const { wo } = await makeWorkOrder();
    await prisma.workOrder.update({ where: { id: wo.id }, data: { workflowV16: false, status: "QUOTE_SENT" } });
    await addLine(wo.id, { type: "PART", partId: p.id, quantityX100: 100 }, admin);
    expect(await part(p.id)).toEqual({ stockX100: 400, reservedX100: 0 });
    expect((await lines(wo.id))[0]).toMatchObject({ approvalStatus: "PENDING", stockDeferred: false });
    await changeStatus(wo.id, "IN_PROGRESS", admin); // one click, no recorded agreement needed
    expect((await lines(wo.id))[0]!.approvalStatus).toBe("APPROVED");
    expect(await prisma.quote.count({ where: { workOrderId: wo.id } })).toBe(0);
    await addLine(wo.id, { type: "LABOR", description: "MO", quantityX100: 100, unitPrice: 10_000 }, admin);
    expect((await lines(wo.id))[1]!.approvalStatus).toBe("APPROVED");
    const inv = await createInvoice(wo.id, admin);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).totalHt).toBe(30_000);
  });
});

describe("Lot 2 — messages au client (file des rappels)", () => {
  it("« devis à valider » mis en file à l'envoi ; relance unique après 3 jours sans réponse", async () => {
    const admin = await makeUser("ADMIN");
    const { wo, quote } = await quotedOrder(admin, [10_000]);
    const rows = await prisma.notification.findMany({ where: { workOrderId: wo.id, kind: "QUOTE" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dedupeKey).toBe(`quote:${quote.id}`);
    expect(rows[0]!.body).toContain("à valider");
    expect((await collectDue()).some((i) => i.kind === "QUOTE_REMINDER" && i.workOrderId === wo.id)).toBe(false);
    await prisma.quote.update({ where: { id: quote.id }, data: { sentAt: new Date(Date.now() - 4 * 86_400_000) } });
    const due = (await collectDue()).filter((i) => i.kind === "QUOTE_REMINDER" && i.workOrderId === wo.id);
    expect(due).toHaveLength(1);
    expect(due[0]!.dedupeKey).toBe(`quote-remind:${quote.id}`);
  });
});
