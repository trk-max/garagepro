/**
 * V16 — données de démonstration réalistes (base JETABLE uniquement, voir vitest.config.ts à côté).
 * Tout passe par les fonctions serveur de l'application (mêmes règles, mêmes numéros, même journal).
 * Mot de passe des comptes : variable DEMO_PASSWORD (jamais écrit dans le dépôt).
 * Résultat : la liste des comptes, des plaques et des PIN est écrite dans DEMO_OUT (fichier JSON) si fourni.
 */
import { writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { it } from "vitest";
import type { Role, WorkOrderStatus } from "@prisma/client";
import type { StaffUser } from "@/lib/session";
import { prisma } from "../../tests/helpers/test-prisma";
import { addLine, applyPackage, changeStatus, createWorkOrder, removeLine, updateMeta } from "@/server/work-orders";
import { createInvoice, recordPayment } from "@/server/invoices";
import { recordStaffDecision } from "@/server/quotes";
import { createPart } from "@/server/parts";
import { approveQualityCheck, saveQualityCheck } from "@/server/quality";
import { addPartNeed, updatePartNeed } from "@/server/follow-up";
import { startLabor, addLaborEntry } from "@/server/labor";
import { createPurchaseOrder, createReceipt, createSupplier, createSupplierInvoice, paySupplierInvoice } from "@/server/purchasing";
import { requestLeave } from "@/server/leaves";
import { issueCertificate } from "@/server/certificates";
import { createExpense, payOccurrence, ensureOccurrences } from "@/server/expenses";
import { recordCashBalance } from "@/server/cash";
import { createCompanyUser } from "@/server/company-portal";
import { createStarterCatalogue, recomputeForecasts } from "@/server/agenda";
import { createListing, setListingStatus } from "@/server/showroom";
import { createTicket, listReasons } from "@/server/accueil";
import { createPlan } from "@/server/maintenance";
import { createPackage, addPackageLine } from "@/server/admin";

const DT = (v: number) => Math.round(v * 1000);
const Q = (v: number) => Math.round(v * 100);
const DAY = 86_400_000;
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const errors: string[] = [];
/** V16: the reason the workshop flow asks for (internal, never shown to the customer). */
const REASON: Partial<Record<WorkOrderStatus, string>> = {
  IN_PROGRESS: "Démo : accord du client par téléphone",
  CANCELLED: "Démo : le client reprend son véhicule",
  QUOTE_REFUSED: "Démo : le client trouve le devis trop cher",
};
async function step<T>(label: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    errors.push(`${label}: ${(e as Error).message}`);
    return null;
  }
}

it("demo data", async () => {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10) throw new Error("DEMO_PASSWORD (10 caractères minimum) manquant.");
  const hash = await bcrypt.hash(password, 10);

  await prisma.setting.upsert({
    where: { id: "garage" },
    update: {},
    create: {
      id: "garage", garageName: "Garage Atlas (démo)", address: "Zone industrielle, Ben Arous", city: "Ben Arous", phone: "+216 71 000 000",
      taxId: "1234567/A/M/000", laborRate: DT(35), stampDuty: DT(1), warrantyMonths: 6, warrantyKm: 10_000, laborCostPerHour: DT(12),
      monthlyRevenueTarget: DT(40_000), cashAlertThreshold: DT(5_000), legalName: "Garage Atlas SARL", legalRepName: "Malek Atlas", legalRepTitle: "Gérant",
      // V16 Lot 3: diagnostic fee proposed at reception.
      diagnosticFee: DT(30),
    },
  });

  // ── Équipe : un compte par rôle (+ 3 mécaniciens) ──
  const staffDef: [string, string, Role, string][] = [
    ["admin", "Malek Admin", "ADMIN", "Gérant"],
    ["chef", "Nadia Responsable", "MANAGER", "Chef d'atelier"],
    ["accueil", "Sonia Accueil", "RECEPTION", "Réceptionniste"],
    ["karim", "Karim Ben Salah", "MECHANIC", "Mécanicien confirmé"],
    ["hedi", "Hédi Trabelsi", "MECHANIC", "Mécanicien"],
    ["yassine", "Yassine Jaziri", "MECHANIC", "Apprenti"],
    ["stock", "Ali Magasinier", "STOREKEEPER", "Magasinier"],
    ["rh", "Leila RH", "HR", "Ressources humaines"],
    ["compta", "Rim Comptable", "ACCOUNTANT", "Comptable"],
    ["vendeur", "Omar Vendeur", "SELLER", "Vendeur showroom"],
    ["showroom", "Ines Showroom", "SHOWROOM_MANAGER", "Responsable showroom"],
  ];
  const S: Record<string, StaffUser> = {};
  for (const [k, name, role, job] of staffDef) {
    const u = await prisma.user.create({
      data: { email: `${k}@demo.tn`, name, role, passwordHash: hash, jobTitle: job, hireDate: new Date(Date.now() - 900 * DAY), nationalId: `0${Math.floor(1e6 + rnd() * 8e6)}`, phone: `2${Math.floor(1e6 + rnd() * 8e6)}` },
    });
    S[k] = { id: u.id, name: u.name, email: u.email, role: u.role };
  }
  const admin = S.admin!;

  // ── Pièces, fournisseurs, forfait ──
  const partsData = [
    ["HUI-5W30-5L", "Huile moteur 5W30 5L", 62, 85, 12, 4],
    ["FLT-HUI", "Filtre à huile", 9, 16, 20, 5],
    ["FLT-AIR", "Filtre à air", 14, 24, 8, 3],
    ["FLT-HAB", "Filtre habitacle", 12, 22, 2, 3],
    ["PLQ-AV", "Plaquettes de frein AV", 70, 115, 6, 2],
    ["DSQ-AV", "Disques de frein AV", 150, 230, 2, 2],
    ["BAT-70AH", "Batterie 70Ah", 260, 340, 3, 1],
    ["BOU-X4", "Bougies d'allumage (x4)", 40, 64, 0, 2],
    ["LIQ-REF", "Liquide de refroidissement 5L", 28, 42, 5, 2],
    ["KIT-DIS", "Kit distribution", 320, 450, 1, 1],
    ["AMO-AV", "Amortisseur AV", 110, 165, 4, 2],
    ["EMB-KIT", "Kit embrayage", 380, 520, 1, 1],
  ] as const;
  const P: Record<string, { id: string }> = {};
  for (const [sku, name, cost, sale, stock, min] of partsData) {
    P[sku] = await createPart({ sku, name, unit: "pce", costPrice: DT(cost), salePrice: DT(sale), stock: Q(stock), minStock: Q(min) } as never, S.stock!);
  }
  const sup1 = await createSupplier({ name: "Auto Pièces Tunis", phone: "71 222 333", email: "contact@autopieces.tn" });
  const sup2 = await createSupplier({ name: "Lubrifiants du Sahel", phone: "73 444 555" });
  const pkg = await step("forfait", async () => {
    const p = await createPackage({ name: "Vidange complète", description: "Huile + filtre à huile + main-d'œuvre" }, admin);
    await addPackageLine(p.id, { type: "PART", partId: P["HUI-5W30-5L"]!.id, quantityX100: 100 } as never, admin);
    await addPackageLine(p.id, { type: "PART", partId: P["FLT-HUI"]!.id, quantityX100: 100 } as never, admin);
    await addPackageLine(p.id, { type: "LABOR", description: "Main-d'œuvre vidange", quantityX100: 50, unitPrice: DT(35) } as never, admin);
    return p;
  });

  // ── Clients, véhicules, entreprise cliente ──
  const firsts = ["Sami", "Amira", "Hatem", "Olfa", "Mehdi", "Rania", "Bilel", "Salma", "Anis", "Mouna", "Walid", "Nour", "Fethi", "Asma", "Riadh", "Hela", "Kais", "Sarra", "Lotfi", "Imen"];
  const lasts = ["Ben Ali", "Trabelsi", "Gharbi", "Jaziri", "Mansour", "Hammami", "Ayari", "Chebbi", "Bouazizi", "Mejri"];
  const models = [["Peugeot", "208"], ["Renault", "Clio"], ["Volkswagen", "Golf"], ["Kia", "Rio"], ["Hyundai", "i20"], ["Toyota", "Yaris"], ["Citroën", "C3"], ["Fiat", "Tipo"], ["Dacia", "Logan"], ["Seat", "Ibiza"]] as const;
  let plateN = 1200;
  const nextPlate = () => `${180 + Math.floor(rnd() * 60)}TU${plateN++}`;
  const customers: { id: string; vehicles: { id: string; plate: string }[] }[] = [];
  for (let i = 0; i < 60; i++) {
    const c = await prisma.customer.create({ data: { name: `${pick(firsts)} ${pick(lasts)}`, phone: `${pick(["2", "5", "9"])}${Math.floor(1e6 + rnd() * 8.9e6)}`, email: i % 3 === 0 ? `client${i}@exemple.tn` : null } });
    const vs = [];
    for (let k = 0; k < (i % 7 === 0 ? 2 : 1); k++) {
      const [make, model] = pick(models);
      const v = await prisma.vehicle.create({ data: { plate: nextPlate(), make, model, year: 2012 + Math.floor(rnd() * 12), fuel: pick(["ESSENCE", "DIESEL"] as const), color: pick(["Blanc", "Gris", "Noir", "Bleu"]), vin: `VF3${Math.floor(1e13 + rnd() * 8e13)}`, mileage: 40_000 + Math.floor(rnd() * 150_000), customerId: c.id } });
      vs.push({ id: v.id, plate: v.plate });
    }
    customers.push({ id: c.id, vehicles: vs });
  }
  const company = await prisma.customer.create({ data: { name: "Société Transports Medina SARL", phone: "71 555 666", email: "flotte@medina.tn", isCompany: true, taxId: "7654321/B/M/000" } as never });
  const fleet: { id: string; plate: string }[] = [];
  for (let k = 0; k < 4; k++) {
    const v = await prisma.vehicle.create({ data: { plate: nextPlate(), make: "Renault", model: "Kangoo", year: 2019, fuel: "DIESEL", color: "Blanc", vin: `VF1KW${Math.floor(1e11 + rnd() * 8e11)}`, mileage: 90_000 + k * 20_000, customerId: company.id } });
    fleet.push({ id: v.id, plate: v.plate });
  }
  customers.push({ id: company.id, vehicles: fleet });
  await step("compte entreprise", () => createCompanyUser(admin, company.id, { email: "flotte@medina.tn", name: "Responsable flotte Medina", role: "MANAGER" as never, password }));

  // ── Ordres : historique livré/facturé/payé (≈ 8 mois) puis un ordre à chaque étape ──
  const mechs = [S.karim!, S.hedi!, S.yassine!];
  const lineSets = [
    [{ type: "PART", sku: "PLQ-AV", q: 1 }, { type: "LABOR", d: "Remplacement plaquettes AV", q: 1, p: 35 }],
    [{ type: "PART", sku: "BAT-70AH", q: 1 }, { type: "LABOR", d: "Pose batterie", q: 0.5, p: 35 }],
    [{ type: "PART", sku: "FLT-AIR", q: 1 }, { type: "PART", sku: "FLT-HAB", q: 1 }, { type: "LABOR", d: "Entretien filtres", q: 0.5, p: 35 }],
    [{ type: "PART", sku: "AMO-AV", q: 2 }, { type: "LABOR", d: "Remplacement amortisseurs", q: 2, p: 35 }],
    [{ type: "LABOR", d: "Diagnostic électronique", q: 1, p: 45 }],
  ] as const;
  // History: stock refilled first so the history does not drain the shelves.
  await prisma.part.updateMany({ data: { stockX100: { increment: Q(400) } } });
  let historyCount = 0;
  const history: string[] = [];
  for (let i = 0; i < 160; i++) {
    const c = pick(customers.slice(0, 60));
    const v = pick(c.vehicles);
    const at = new Date(Date.now() - (240 - i * 1.4) * DAY);
    const wo = await step("ordre historique", () => createWorkOrder({ customerId: c.id, vehicleId: v.id, complaint: pick(["Bruit au freinage", "Entretien", "Voyant moteur allumé", "Batterie faible", "Suspension qui cogne"]), priority: "NORMAL", mileageIn: 60_000 + i * 300, mechanicId: pick(mechs).id }, S.accueil!));
    if (!wo) continue;
    // History = orders of before V16 (non-retroactive rules: delivered even when unpaid, as before).
    await prisma.workOrder.update({ where: { id: wo.id }, data: { workflowV16: false } });
    if (i % 3 === 0 && pkg) await step("forfait", () => applyPackage(wo.id, pkg.id, S.chef!));
    else for (const l of pick(lineSets)) await step("ligne", () => addLine(wo.id, l.type === "PART" ? { type: "PART", partId: P[(l as { sku: string }).sku]!.id, quantityX100: Q(l.q) } : { type: "LABOR", description: (l as { d: string }).d, quantityX100: Q(l.q), unitPrice: DT((l as { p: number }).p) }, S.chef!));
    for (const s of ["IN_PROGRESS", "QUALITY_CONTROL"] as WorkOrderStatus[]) await step("statut", () => changeStatus(wo.id, s, S.chef!));
    await step("qc", () => saveQualityCheck(S.chef!, wo.id, { roadTest: "DONE", fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true }));
    await step("qc ok", () => approveQualityCheck(S.chef!, wo.id));
    await step("prêt", () => changeStatus(wo.id, "READY", S.chef!));
    const inv = await step("facture", () => createInvoice(wo.id, admin));
    if (inv && i % 9 !== 0) {
      const full = (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).totalTtc;
      await step("paiement", () => recordPayment(inv.id, { amount: i % 11 === 0 ? Math.round(full / 2) : full, method: pick(["CASH", "CARD", "CHECK", "TRANSFER"] as const) }, S.accueil!));
    }
    await step("livré", () => changeStatus(wo.id, "DELIVERED", S.accueil!));
    // Back-date to spread the history over the months (dates only).
    // V16 Lot 3: first promise kept 2 times out of 3 (KPI « livré à la date promise initiale »); some promises moved.
    const firstPromise = new Date(at.getTime() + (i % 3 === 0 ? 1.5 : 2.5) * DAY);
    await prisma.workOrder.update({ where: { id: wo.id }, data: { createdAt: at, deliveredAt: new Date(at.getTime() + 2 * DAY), promisedAtInitial: firstPromise, promisedAt: i % 3 === 0 ? new Date(at.getTime() + 2.5 * DAY) : firstPromise } as never });
    if (inv) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { issuedAt: new Date(at.getTime() + 2 * DAY), dueDate: new Date(at.getTime() + 17 * DAY) } });
      await prisma.payment.updateMany({ where: { invoiceId: inv.id }, data: { paidAt: new Date(at.getTime() + 2 * DAY) } });
    }
    historyCount++;
    history.push(wo.id);
  }
  await prisma.part.updateMany({ where: { stockX100: { gt: Q(400) } }, data: { stockX100: { decrement: Q(400) } } });

  // One order per step (current work).
  const current: Record<string, { id: string; plate: string; pin: string | null }> = {};
  const stages: [string, WorkOrderStatus[]][] = [
    ["RECEIVED", []],
    ["DIAGNOSIS", ["DIAGNOSIS"]],
    ["QUOTE_SENT", ["DIAGNOSIS", "QUOTE_SENT"]],
    ["WAITING_INSURANCE", ["WAITING_INSURANCE"]],
    ["WAITING_PARTS", ["DIAGNOSIS", "WAITING_PARTS"]],
    ["IN_PROGRESS", ["QUOTE_SENT", "IN_PROGRESS"]],
    ["QUALITY_CONTROL", ["QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL"]],
    ["WASHING", ["QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL"]],
    ["READY", ["QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL"]],
    ["READY_INVOICED", ["QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL"]],
    ["CANCELLED", ["CANCELLED"]],
    // V16 — new statuses, a voided line, a delivery with a balance due (override).
    ["WAITING_CUSTOMER", ["DIAGNOSIS", "QUOTE_SENT", "WAITING_CUSTOMER"]],
    ["QUOTE_REFUSED", ["DIAGNOSIS", "QUOTE_SENT", "QUOTE_REFUSED"]],
    ["VOIDED_LINE", ["QUOTE_SENT", "IN_PROGRESS"]],
    ["READY_BALANCE", ["QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL"]],
    // V16 Lot 2 — partial agreement (last line refused), and a supplement waiting for the customer.
    ["PARTIAL", ["DIAGNOSIS", "QUOTE_SENT", "IN_PROGRESS"]],
    ["SUPPLEMENT", ["QUOTE_SENT", "IN_PROGRESS"]],
    // V16 Lot 3 — refused quote with an announced diagnostic fee and a refused SAFETY line; promised date moved.
    ["REFUSED_SAFETY", ["DIAGNOSIS", "QUOTE_SENT"]],
    ["DATE_MOVED", ["QUOTE_SENT", "IN_PROGRESS"]],
  ];
  for (const [n, [label, path]] of stages.entries()) {
    const c = customers[n]!;
    const v = c.vehicles[0]!;
    const wo = await createWorkOrder({ customerId: c.id, vehicleId: v.id, complaint: `Démo — ${label}`, priority: n % 4 === 0 ? "URGENT" : "NORMAL", mileageIn: 120_000 + n * 1000, mechanicId: mechs[n % 3]!.id, promisedAt: new Date(Date.now() + (n - 5) * 6 * 3_600_000), diagnosticFee: label === "REFUSED_SAFETY" }, S.accueil!);
    // V16 Lot 2: priority and part condition shown to the customer on the quote.
    if (label !== "RECEIVED") for (const l of lineSets[n % lineSets.length]!) await step("ligne", () => addLine(wo.id, l.type === "PART" ? { type: "PART", partId: P[(l as { sku: string }).sku]!.id, quantityX100: Q(l.q), priority: /^(PLQ|AMO)/.test((l as { sku: string }).sku) ? "SAFETY" : "RECOMMENDED", partCondition: "NEW" } : { type: "LABOR", description: (l as { d: string }).d, quantityX100: Q(l.q), unitPrice: DT((l as { p: number }).p) }, S.chef!));
    if (label === "REFUSED_SAFETY") await step("ligne sécurité", () => addLine(wo.id, { type: "LABOR", description: "Remplacement plaquettes AV (usées à 90 %)", quantityX100: Q(1), unitPrice: DT(35), priority: "SAFETY" }, S.chef!));
    if (label === "PARTIAL") await step("ligne conseillée", () => addLine(wo.id, { type: "LABOR", description: "Nettoyage injecteurs (conseillé)", quantityX100: Q(1), unitPrice: DT(60), priority: "WATCH" }, S.chef!));
    for (const s of path) {
      // V16 Lot 2: work starts on the customer's RECORDED agreement (phone, reception) — the order then moves to IN_PROGRESS.
      if (s === "IN_PROGRESS") {
        await step(`accord ${label}`, async () => {
          const pending = await prisma.workOrderLine.findMany({ where: { workOrderId: wo.id, approvalStatus: "PENDING", voidedAt: null }, orderBy: { position: "asc" }, select: { id: true } });
          const ids = pending.map((l) => l.id);
          const cust = await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { name: true, phone: true } });
          return recordStaffDecision(wo.id, { approvedLineIds: label === "PARTIAL" ? ids.slice(0, -1) : ids, approverName: cust.name, approverContact: cust.phone, channel: "PHONE", note: "Démo : accord par téléphone" }, S.accueil!);
        });
      } else await step(`statut ${label}`, () => changeStatus(wo.id, s, S.chef!, { reason: REASON[s] }));
    }
    // V16 Lot 3: the customer refuses everything by phone (a SAFETY line among them) — only the announced fee stays billable.
    if (label === "REFUSED_SAFETY") {
      const cust = await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { name: true, phone: true } });
      await step("refus total", () => recordStaffDecision(wo.id, { approvedLineIds: [], approverName: cust.name, approverContact: cust.phone, channel: "PHONE", note: "Démo : trop cher pour le moment" }, S.accueil!));
    }
    if (label === "DATE_MOVED") {
      const fresh = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id }, select: { promisedAt: true } });
      await step("date décalée", () => updateMeta(wo.id, { promisedAt: new Date((fresh.promisedAt ?? new Date()).getTime() + 2 * DAY), promiseReason: "PARTS", promiseNote: "Démo : fournisseur en rupture (note interne)" }, S.accueil!));
    }
    if (label === "SUPPLEMENT") {
      await step("découverte", () => addLine(wo.id, { type: "LABOR", description: "Remplacement flexible de frein (découvert au démontage)", quantityX100: Q(1), unitPrice: DT(55), priority: "SAFETY" }, S.chef!));
      await step("supplément envoyé", () => changeStatus(wo.id, "QUOTE_SENT", S.chef!));
    }
    if (label === "VOIDED_LINE") {
      const first = await prisma.workOrderLine.findFirst({ where: { workOrderId: wo.id }, orderBy: { position: "asc" } });
      if (first) await step("ligne annulée", () => removeLine(first.id, S.chef!, "Démo : pièce fournie par le client"));
    }
    if (["WASHING", "READY", "READY_INVOICED", "READY_BALANCE"].includes(label)) {
      await step("qc", () => saveQualityCheck(S.chef!, wo.id, { roadTest: "DONE", fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true }));
      await step("qc ok", () => approveQualityCheck(S.chef!, wo.id));
      await step("statut", () => changeStatus(wo.id, label === "WASHING" ? "WASHING" : "READY", S.chef!));
    }
    if (label === "QUALITY_CONTROL") await step("qc partiel", () => saveQualityCheck(S.karim!, wo.id, { roadTest: "DONE", fluidsOk: true, warningsOk: false, toolsRemoved: true, workVerified: true, billingVerified: false }));
    if (label === "READY_INVOICED" || label === "READY_BALANCE") await step("facture", () => createInvoice(wo.id, admin));
    if (label === "READY_BALANCE") {
      const inv = await prisma.invoice.findUnique({ where: { workOrderId: wo.id } });
      if (inv) await step("acompte partiel", () => recordPayment(inv.id, { amount: Math.round(inv.totalTtc / 3), method: "CASH" }, S.accueil!));
    }
    if (label === "IN_PROGRESS") await step("chrono", () => startLabor(mechs[n % 3]!, wo.id));
    if (label === "IN_PROGRESS") await step("temps", () => addLaborEntry(S.chef!, { workOrderId: wo.id, userId: S.hedi!.id, startedAt: new Date(Date.now() - 3 * 3_600_000), endedAt: new Date(Date.now() - 2 * 3_600_000) }));
    if (label === "WAITING_PARTS") {
      // V16 Lot 3: tied to the order line, expected date given (customer told, shown on the portal).
      const line = await prisma.workOrderLine.findFirst({ where: { workOrderId: wo.id }, orderBy: { position: "asc" }, select: { id: true } });
      const need = await step("pièce manquante", () => addPartNeed(S.karim!, wo.id, { partId: P["KIT-DIS"]!.id, description: "Kit distribution", quantityX100: Q(1), workOrderLineId: line?.id ?? null } as never));
      if (need) await step("besoin commandé", () => updatePartNeed(S.chef!, (need as { id: string }).id, { status: "ORDERED", expectedAt: new Date(Date.now() + 3 * DAY), dateReason: "PARTS" } as never));
    }
    const fresh = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id }, include: { vehicle: true } });
    current[label] = { id: wo.id, plate: fresh.vehicle.plate, pin: fresh.trackingPin };
  }
  // Fleet order for the company portal.
  const fleetWo = await createWorkOrder({ customerId: company.id, vehicleId: fleet[0]!.id, complaint: "Révision flotte", priority: "NORMAL", mileageIn: 95_000, mechanicId: S.karim!.id }, S.accueil!);
  if (pkg) await step("forfait flotte", () => applyPackage(fleetWo.id, pkg.id, S.chef!));

  // ── Achats : demande (magasinier) → BC approuvé → BR → facture fournisseur → paiement ──
  await step("BC en attente", () => createPurchaseOrder({ supplierId: sup1.id, lines: [{ partId: P["BOU-X4"]!.id, quantityX100: Q(4), unitCost: DT(40) }] }, S.stock!));
  const po = await step("BC approuvé", () => createPurchaseOrder({ supplierId: sup1.id, lines: [{ partId: P["KIT-DIS"]!.id, quantityX100: Q(2), unitCost: DT(320) }, { partId: P["FLT-HAB"]!.id, quantityX100: Q(10), unitCost: DT(12) }] }, admin));
  if (po) {
    await step("BR", () => createReceipt({ supplierId: sup1.id, purchaseOrderId: po.id, deliveryNoteRef: "BL-8841", lines: [{ partId: P["KIT-DIS"]!.id, quantityX100: Q(2) }, { partId: P["FLT-HAB"]!.id, quantityX100: Q(10) }] }, S.stock!));
    const si = await step("facture fournisseur", () => createSupplierInvoice({ supplierId: sup1.id, purchaseOrderId: po.id, number: "FA-2026-311", issuedAt: new Date(), dueDate: new Date(Date.now() + 30 * DAY), totalHt: DT(760), totalTax: DT(144.4) }, admin));
    if (si) await step("paiement fournisseur", () => paySupplierInvoice(si.id, { amount: DT(400), method: "TRANSFER" }, admin));
  }
  await step("facture fournisseur 2", () => createSupplierInvoice({ supplierId: sup2.id, number: "LS-0091", issuedAt: new Date(Date.now() - 40 * DAY), dueDate: new Date(Date.now() - 10 * DAY), totalHt: DT(500), totalTax: DT(95) }, admin));

  // ── RH : pointages, congés, attestation ──
  for (const k of ["karim", "hedi", "yassine", "accueil", "stock", "chef"]) {
    for (let d = 1; d <= 10; d++) {
      const day = new Date(Date.now() - d * DAY);
      day.setUTCHours(7, Math.floor(rnd() * 20), 0, 0);
      await prisma.clockEvent.create({ data: { userId: S[k]!.id, kind: "IN", at: day, method: "CORRECTION", reason: "démo", createdById: S.chef!.id } });
      await prisma.clockEvent.create({ data: { userId: S[k]!.id, kind: "OUT", at: new Date(day.getTime() + (8.5 + rnd()) * 3_600_000), method: "CORRECTION", reason: "démo", createdById: S.chef!.id } });
    }
    const today = new Date();
    today.setUTCHours(7, 5, 0, 0);
    if (k !== "yassine") await prisma.clockEvent.create({ data: { userId: S[k]!.id, kind: "IN", at: today, method: "CORRECTION", reason: "démo", createdById: S.chef!.id } });
  }
  await step("congé en attente", () => requestLeave(S.hedi!, { type: "PAID_LEAVE" as never, startAt: new Date(Date.now() + 10 * DAY), endAt: new Date(Date.now() + 14 * DAY), allDay: true, reason: "Mariage" }));
  await step("congé approuvé", () => requestLeave(S.rh!, { userId: S.yassine!.id, type: "SICK" as never, startAt: new Date(Date.now() - 20 * DAY), endAt: new Date(Date.now() - 18 * DAY), allDay: true }));
  await step("attestation", () => issueCertificate(S.rh!, S.karim!.id, { purpose: "Dossier bancaire" }));

  // ── Argent : charges fixes, solde de caisse ──
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const loyer = await step("charge loyer", () => createExpense(admin, { label: "Loyer atelier", category: "RENT", amount: DT(1800), frequency: "MONTHLY", firstDueDate: iso(new Date(Date.now() - 60 * DAY)) }));
  await step("charge électricité", () => createExpense(admin, { label: "STEG électricité", category: "UTILITIES", amount: DT(450), frequency: "MONTHLY", firstDueDate: iso(new Date(Date.now() - 20 * DAY)) }));
  await step("échéances", () => ensureOccurrences(iso(new Date(Date.now() + 90 * DAY))));
  if (loyer) {
    const occ = await prisma.expenseOccurrence.findFirst({ where: { expenseId: (loyer as { id: string }).id }, orderBy: { dueDate: "asc" } as never });
    if (occ) await step("échéance payée", () => payOccurrence(admin, occ.id, { paidDay: iso(new Date(Date.now() - 55 * DAY)), paidAmount: DT(1800), method: "TRANSFER" }));
  }
  await step("solde", () => recordCashBalance(admin, { amount: DT(12_500), asOf: iso(new Date(Date.now() - DAY)), note: "Caisse + banque (démo)" }));

  // ── Rendez-vous (aujourd'hui et demain), service réservable ──
  const service = await prisma.bookableService.create({ data: { name: "Vidange", nameAr: "تغيير الزيت", durationMin: 60, priceFrom: DT(120) } });
  const slot = (d: number, h: number) => { const x = new Date(Date.now() + d * DAY); x.setUTCHours(h, 0, 0, 0); return x; };
  const rdvPlate = nextPlate();
  const appts = [
    [0, 9, "Mehdi", "Mansour", rdvPlate, null],
    [0, 13, customers[20]!.vehicles[0]!.plate.slice(0, 0) || "Rania", "Hammami", customers[20]!.vehicles[0]!.plate, customers[20]!.id],
    [1, 8, "Anis", "Chebbi", nextPlate(), null],
  ] as const;
  let ref = 1;
  for (const [d, h, fn, ln, plate, customerId] of appts) {
    await prisma.appointment.create({ data: { reference: `RDV-DEMO-${ref++}`, serviceId: service.id, startAt: slot(d, h), endAt: slot(d, h + 1), firstName: fn, lastName: ln, phone: "98123456", plate, customerId, vehicleId: customerId ? customers[20]!.vehicles[0]!.id : null } });
  }

  // ── Garantie / réclamation / avis ──
  const lastDelivered = history.at(-1);
  if (lastDelivered) {
    await prisma.customerClaim.create({ data: { category: "QUALITY" as never, name: "Sami Ben Ali", phone: "20123456", plate: "", message: "Bruit revenu après la réparation des freins.", workOrderId: lastDelivered } });
    await prisma.customerFeedback.create({ data: { rating: 4, comment: "Travail propre, un peu d'attente.", workOrderId: history.at(-2) ?? null } });
  }

  // ── Agenda d'entretien (V12) + plan V7.6 ──
  await step("catalogue agenda", () => createStarterCatalogue(admin));
  await step("prévisions", () => recomputeForecasts(null));
  await step("plan entretien", () => createPlan(admin, customers[1]!.vehicles[0]!.id, { kind: "OIL", intervalKm: 10_000, intervalDays: 365, lastDoneAt: new Date(Date.now() - 300 * DAY), lastDoneKm: 100_000 }));

  // ── Showroom ──
  const listing = await step("annonce", () => createListing(S.vendeur!, { make: "Peugeot", model: "3008", year: 2020, mileage: 68_000, fuel: "DIESEL", price: DT(78_000), description: "Première main, carnet complet.", equipment: [], specs: [], historyPublic: false } as never));
  if (listing) await step("publication", () => setListingStatus(S.showroom!, (listing as { id: string }).id, "PUBLISHED"));

  // ── Accueil (V15) : deux tickets en attente ──
  const reasons = await step("motifs", () => listReasons());
  if (reasons?.[0]) {
    await step("ticket 1", () => createTicket({ reasonId: reasons[0]!.id, plate: rdvPlate, source: "DESK", actor: S.accueil! }));
    await step("ticket 2", () => createTicket({ reasonId: (reasons[3] ?? reasons[0])!.id, source: "DESK", actor: S.accueil! }));
  }

  const out = {
    accounts: staffDef.map(([k, , role]) => ({ email: `${k}@demo.tn`, role })),
    company: "flotte@medina.tn",
    current,
    rdvPlate,
    history: historyCount,
    counts: {
      workOrders: await prisma.workOrder.count(), invoices: await prisma.invoice.count(), payments: await prisma.payment.count(), customers: await prisma.customer.count(), vehicles: await prisma.vehicle.count(), parts: await prisma.part.count(),
    },
    errors,
  };
  if (process.env.DEMO_OUT) writeFileSync(process.env.DEMO_OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, current: Object.keys(current) }, null, 2));
});
