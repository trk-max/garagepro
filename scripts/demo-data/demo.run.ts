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
import { createInvoice, issueCreditNote, recordPayment, reversePayment } from "@/server/invoices";
import { deflateSync } from "node:zlib";
import { signIntake } from "@/server/signatures";
import { recordHandover } from "@/server/handover";
import { updateIntake } from "@/server/repair-order";
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
import { linkComeback } from "@/server/comebacks";
import { completeInspection, convertResultToLine, saveResult, startInspection } from "@/server/inspections";
import { createFeedback } from "@/server/claims";
import { queueSatisfactionSurveys } from "@/server/reminders";

/** V16 Lot 4 — a real PNG « signature » (scribble) drawn here, like the tablet canvas would send it (data URL). */
function signaturePng(seedValue: number): string {
  const w = 300, h = 110;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w + 1) * h, 255);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  for (let x = 10; x < w - 10; x++) {
    const y0 = Math.round(h / 2 + Math.sin(x / (14 + seedValue)) * 28 + Math.sin(x / 5) * 6);
    for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) if (y0 + d > 0 && y0 + d < h) raw[(y0 + d) * (w + 1) + 1 + x + e] = 20;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

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
    const wo = await step("ordre historique", async () => createWorkOrder({ customerId: c.id, vehicleId: v.id, complaint: pick(["Bruit au freinage", "Entretien", "Voyant moteur allumé", "Batterie faible", "Suspension qui cogne"]), priority: "NORMAL", mileageIn: Math.max(60_000 + i * 300, ((await prisma.vehicle.findUnique({ where: { id: v.id }, select: { mileage: true } }))?.mileage ?? 0) + 120), mechanicId: pick(mechs).id }, S.accueil!));
    if (!wo) continue;
    // History = orders of before V16 (non-retroactive rules: delivered even when unpaid, as before; no handover).
    await prisma.workOrder.update({ where: { id: wo.id }, data: { workflowV16: false, workflowLot4: false } });
    if (i % 3 === 0 && pkg) await step("forfait", () => applyPackage(wo.id, pkg.id, S.chef!));
    else for (const l of pick(lineSets)) await step("ligne", () => addLine(wo.id, l.type === "PART" ? { type: "PART", partId: P[(l as { sku: string }).sku]!.id, quantityX100: Q(l.q) } : { type: "LABOR", description: (l as { d: string }).d, quantityX100: Q(l.q), unitPrice: DT((l as { p: number }).p) }, S.chef!));
    for (const s of ["IN_PROGRESS", "QUALITY_CONTROL"] as WorkOrderStatus[]) await step("statut", () => changeStatus(wo.id, s, S.chef!));
    await step("qc", () => saveQualityCheck(S.chef!, wo.id, { roadTest: "DONE", roadTestKm: 6, fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true }));
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
      // V16 Lot 4: an issued invoice / a payment never changes (triggers); the demo back-dates its history like the
      // hub sync writes (garagepro.sync = 'on'), on this throw-away database only.
      await prisma.$transaction([
        prisma.$queryRawUnsafe(`SELECT set_config('garagepro.sync', 'on', true)`),
        prisma.invoice.update({ where: { id: inv.id }, data: { issuedAt: new Date(at.getTime() + 2 * DAY), dueDate: new Date(at.getTime() + 17 * DAY) } }),
        prisma.payment.updateMany({ where: { invoiceId: inv.id }, data: { paidAt: new Date(at.getTime() + 2 * DAY) } }),
      ]);
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
    // V16 Lot 4 — signed intake (frozen document), storage fee due, signed handover then delivered, credit note,
    // cancelled payment.
    ["INTAKE_SIGNED", []],
    ["READY_STORAGE", ["QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL"]],
    ["HANDED_OVER", ["QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL"]],
    ["CREDITED", ["QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL"]],
    ["REVERSED", ["QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL"]],
  ];
  for (const [n, [label, path]] of stages.entries()) {
    const c = customers[n]!;
    const v = c.vehicles[0]!;
    const wo = await createWorkOrder({ customerId: c.id, vehicleId: v.id, complaint: `Démo — ${label}`, priority: n % 4 === 0 ? "URGENT" : "NORMAL", mileageIn: Math.max(120_000 + n * 1000, ((await prisma.vehicle.findUnique({ where: { id: v.id }, select: { mileage: true } }))?.mileage ?? 0) + 150), mechanicId: mechs[n % 3]!.id, promisedAt: new Date(Date.now() + (n - 5) * 6 * 3_600_000), diagnosticFee: label === "REFUSED_SAFETY" }, S.accueil!);
    // V16 Lot 2: priority and part condition shown to the customer on the quote.
    if (label !== "RECEIVED" && label !== "INTAKE_SIGNED") for (const l of lineSets[n % lineSets.length]!) await step("ligne", () => addLine(wo.id, l.type === "PART" ? { type: "PART", partId: P[(l as { sku: string }).sku]!.id, quantityX100: Q(l.q), priority: /^(PLQ|AMO)/.test((l as { sku: string }).sku) ? "SAFETY" : "RECOMMENDED", partCondition: "NEW" } : { type: "LABOR", description: (l as { d: string }).d, quantityX100: Q(l.q), unitPrice: DT((l as { p: number }).p) }, S.chef!));
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
    if (["WASHING", "READY", "READY_INVOICED", "READY_BALANCE", "READY_STORAGE", "HANDED_OVER", "CREDITED", "REVERSED"].includes(label)) {
      await step("qc", () => saveQualityCheck(S.chef!, wo.id, { roadTest: "DONE", roadTestKm: 6, fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true }));
      await step("qc ok", () => approveQualityCheck(S.chef!, wo.id));
      await step("statut", () => changeStatus(wo.id, label === "WASHING" ? "WASHING" : "READY", S.chef!));
    }
    if (label === "QUALITY_CONTROL") await step("qc partiel", () => saveQualityCheck(S.karim!, wo.id, { roadTest: "DONE", roadTestKm: 6, fluidsOk: true, warningsOk: false, toolsRemoved: true, workVerified: true, billingVerified: false }));
    if (label === "READY_INVOICED" || label === "READY_BALANCE") await step("facture", () => createInvoice(wo.id, admin));
    if (label === "READY_BALANCE") {
      const inv = await prisma.invoice.findUnique({ where: { workOrderId: wo.id } });
      if (inv) await step("acompte partiel", () => recordPayment(inv.id, { amount: Math.round(inv.totalTtc / 3), method: "CASH" }, S.accueil!));
    }
    // ── V16 Lot 4 ──
    if (label === "INTAKE_SIGNED") {
      await step("réception détaillée", () =>
        updateIntake(wo.id, { fuelLevel: 2, bodyChecklist: ["FRONT_BUMPER", "LEFT_SIDE"], bodyDamageNotes: "Rayure pare-chocs AV", warningLights: ["ENGINE", "ABS"], itemsLeft: "Siège enfant, GPS", keyCount: 2, authorizationCeiling: DT(250) }, S.accueil!),
      );
      const cust = await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { name: true } });
      await step("réception signée", () => signIntake(wo.id, { signerName: cust.name, image: signaturePng(1), ip: "192.168.1.20", userAgent: "Démo tablette" }, S.accueil!));
    }
    if (label === "READY_STORAGE") {
      // Ready and told 6 days ago (message sent), 48 h grace → 4 days of storage due.
      const ago = new Date(Date.now() - 6 * DAY);
      await prisma.workOrder.update({ where: { id: wo.id }, data: { readyAt: ago } });
      await prisma.workOrderEvent.updateMany({ where: { workOrderId: wo.id, type: "STATUS_CHANGED", data: { path: ["to"], equals: "READY" } }, data: { createdAt: ago } });
      await prisma.notification.create({ data: { kind: "READY", channel: "SMS", dedupeKey: `ready:${wo.id}:demo`, workOrderId: wo.id, customerId: c.id, body: "Votre véhicule est prêt", status: "SENT", sentAt: ago } });
    }
    if (label === "HANDED_OVER" || label === "CREDITED" || label === "REVERSED") {
      const inv = await step("facture", () => createInvoice(wo.id, S.accueil!));
      const full = inv ? (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).totalTtc : 0;
      const pay = inv ? await step("paiement", () => recordPayment(inv.id, { amount: full, method: label === "REVERSED" ? "CHECK" : "CARD", reference: label === "REVERSED" ? "CHQ 004512" : undefined, paidAt: new Date(Date.now() - DAY) }, S.accueil!)) : null;
      if (label === "HANDED_OVER") {
        const cust = await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { name: true } });
        await step("restitution signée", async () =>
          recordHandover(wo.id, { mileageOut: ((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id }, select: { mileageIn: true } })).mileageIn ?? 0) + 12, fuelLevelOut: 2, checklist: { workExplained: true, oldParts: "RETURNED", keysReturned: true, clean: true }, notes: "Démo : pièces usagées remises dans un sac", signerName: cust.name, image: signaturePng(3), ip: "192.168.1.20", userAgent: "Démo tablette" }, S.accueil!),
        );
        await step("livré", () => changeStatus(wo.id, "DELIVERED", S.accueil!));
      }
      if (label === "CREDITED" && inv) {
        await step("avoir", () => issueCreditNote(inv.id, "Démo : facture établie au nom du mauvais client", admin));
        if (pay) await step("remboursement", () => reversePayment(pay.id, "Démo : remboursement du trop-perçu (avoir)", admin));
      }
      if (label === "REVERSED" && pay) await step("chèque refusé", () => reversePayment(pay.id, "Démo : chèque refusé par la banque", S.chef!));
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
  const fleetWo = await createWorkOrder({ customerId: company.id, vehicleId: fleet[0]!.id, complaint: "Révision flotte", priority: "NORMAL", mileageIn: Math.max(95_000, ((await prisma.vehicle.findUnique({ where: { id: fleet[0]!.id }, select: { mileage: true } }))?.mileage ?? 0) + 150), mechanicId: S.karim!.id }, S.accueil!);
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

  // ── V16 Lot 5 — qualité, suivi et pilotage ──
  // Quality points set in the settings (on top of the 6 fixed points).
  await prisma.setting.update({ where: { id: "garage" }, data: { qualityPoints: [{ key: "pression-des-pneus", label: "Pression des pneus contrôlée" }, { key: "niveau-lave-glace", label: "Niveau lave-glace complété" }] } });
  const lot5: Record<string, { id: string; plate: string; pin: string | null }> = {};
  const keep = async (label: string, id: string) => {
    const f = await prisma.workOrder.findUniqueOrThrow({ where: { id }, include: { vehicle: true } });
    lot5[label] = { id, plate: f.vehicle.plate, pin: f.trackingPin };
  };
  const newWo = (k: number, complaint: string) => {
    const c = customers[40 + k]!;
    return step(`ordre lot5 ${k}`, async () =>
      createWorkOrder({ customerId: c.id, vehicleId: c.vehicles[0]!.id, complaint, priority: "NORMAL", mileageIn: Math.max(140_000 + k * 1000, ((await prisma.vehicle.findUnique({ where: { id: c.vehicles[0]!.id }, select: { mileage: true } }))?.mileage ?? 0) + 150), mechanicId: mechs[k % 3]!.id }, S.accueil!),
    );
  };
  // 1) Red / orange / green inspection: red and orange points turned into quote lines, the quote sent (portal).
  const insp = await newWo(0, "Démo — inspection complète avant voyage");
  if (insp) {
    await step("diagnostic", () => changeStatus(insp.id, "DIAGNOSIS", S.chef!));
    const inspId = await step("inspection", () => startInspection(S.karim!, insp.id, "inspection-standard"));
    if (inspId) {
      const res = await prisma.inspectionResult.findMany({ where: { inspectionId: inspId }, orderBy: { position: "asc" } });
      for (const [i, r] of res.entries()) {
        const color = r.pointKey === "brakes-front" ? "RED" : r.pointKey === "wipers" || r.pointKey === "tires-rear" ? "ORANGE" : "GREEN";
        const note = color === "RED" ? "Plaquettes usées à 2 mm" : color === "ORANGE" ? (r.pointKey === "wipers" ? "Balais qui laissent des traces" : "Usure 4 mm, à prévoir") : null;
        await step(`point ${i}`, () => saveResult(S.karim!, r.id, { color: color as never, note }));
      }
      const red = res.find((r) => r.pointKey === "brakes-front");
      if (red) await step("point rouge → devis", () => convertResultToLine(S.accueil!, red.id, { type: "LABOR", description: "Remplacement plaquettes AV (inspection)", quantityX100: Q(1), unitPrice: DT(45) }));
      const wip = res.find((r) => r.pointKey === "wipers");
      if (wip) await step("point orange → devis", () => convertResultToLine(S.accueil!, wip.id, { type: "LABOR", description: "Balais d'essuie-glace", quantityX100: Q(0.5), unitPrice: DT(30) }));
      await step("inspection terminée", () => completeInspection(S.karim!, inspId));
      await step("devis inspection", () => changeStatus(insp.id, "QUOTE_SENT", S.chef!));
    }
    await keep("INSPECTION", insp.id);
  }
  // 2) Comeback: previous order of the same vehicle delivered 9 days ago → suggestion on a new order (not linked);
  //    and a second pair already linked, with rework labour at 0 DT.
  for (const [k, linkIt] of [[1, false], [2, true]] as const) {
    const prev = await newWo(k, "Démo — bruit au freinage");
    if (!prev) continue;
    await step("ligne", () => addLine(prev.id, { type: "LABOR", description: "Remplacement plaquettes AV", quantityX100: Q(1), unitPrice: DT(40) }, S.chef!));
    await prisma.workOrder.update({ where: { id: prev.id }, data: { status: "DELIVERED", deliveredAt: new Date(Date.now() - 9 * DAY), createdAt: new Date(Date.now() - 10 * DAY) } });
    const back = await newWo(k, "Démo — le bruit au freinage est revenu");
    if (!back) continue;
    if (linkIt) {
      await step("retour atelier", () => linkComeback(S.accueil!, back.id, prev.id, "WORKMANSHIP"));
      await step("reprise", () => addLine(back.id, { type: "LABOR", description: "Reprise montage plaquettes (non facturée)", quantityX100: Q(1), unitPrice: DT(40) }, S.chef!));
    }
    await keep(linkIt ? "COMEBACK_LINKED" : "COMEBACK_SUGGESTED", back.id);
  }
  // 3) Rework after the quality check (cause + counter), then back in QUALITY_CONTROL.
  const rw = await newWo(3, "Démo — reprise après contrôle qualité");
  if (rw) {
    await step("ligne", () => addLine(rw.id, { type: "LABOR", description: "Remplacement silent-blocs", quantityX100: Q(2), unitPrice: DT(35) }, S.chef!));
    await step("devis", () => changeStatus(rw.id, "QUOTE_SENT", S.chef!));
    const pend = await prisma.workOrderLine.findMany({ where: { workOrderId: rw.id, approvalStatus: "PENDING" }, select: { id: true } });
    await step("accord", () => recordStaffDecision(rw.id, { approvedLineIds: pend.map((l) => l.id), approverName: "Client démo", channel: "IN_PERSON" }, S.accueil!));
    await step("cq", () => changeStatus(rw.id, "QUALITY_CONTROL", S.chef!));
    await step("reprise", () => changeStatus(rw.id, "IN_PROGRESS", S.chef!, { reason: "Claquement à l’essai routier", reworkCause: "ROAD_TEST" }));
    await step("cq 2", () => changeStatus(rw.id, "QUALITY_CONTROL", S.chef!));
    await keep("REWORK", rw.id);
  }
  // 4) Delivered 4 days ago → satisfaction survey queued (no SMS / e-mail on the demo: « not sent » + reason, never a
  //    fake send); a rating of 2 → internal alert « Avis clients à traiter ».
  const sv = await newWo(4, "Démo — vidange (enquête J+3)");
  if (sv) {
    await prisma.workOrder.update({ where: { id: sv.id }, data: { status: "DELIVERED", deliveredAt: new Date(Date.now() - 4 * DAY) } });
    await step("enquête", () => queueSatisfactionSurveys(new Date()));
    await keep("SURVEY", sv.id);
  }
  const low = await newWo(5, "Démo — climatisation");
  if (low) {
    await prisma.workOrder.update({ where: { id: low.id }, data: { status: "DELIVERED", deliveredAt: new Date(Date.now() - 2 * DAY) } });
    await step("note basse", () => createFeedback({ rating: 2, comment: "La clim ne refroidit toujours pas bien." }, { ip: "127.0.0.1", workOrderId: low.id }));
  }
  // 5) Time clocked (chronometers) on the orders delivered this month, with a kind: technician efficiency in Rapports.
  const recent = await prisma.workOrder.findMany({ where: { id: { in: history }, deliveredAt: { gte: new Date(Date.now() - 28 * DAY) } }, select: { id: true, mechanicId: true, deliveredAt: true, lines: { where: { type: "LABOR" }, select: { quantityX100: true } } } });
  for (const [i, w] of recent.entries()) {
    if (!w.mechanicId) continue;
    const hours = Math.max(0.5, w.lines.reduce((s, l) => s + l.quantityX100, 0) / 100) * (0.8 + (i % 4) * 0.15);
    const start = new Date(w.deliveredAt!.getTime() - DAY);
    await step("pointage", () => addLaborEntry(S.chef!, { workOrderId: w.id, userId: w.mechanicId!, startedAt: start, endedAt: new Date(start.getTime() + Math.min(hours, 9) * 3_600_000), kind: "WORK" }));
  }

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
  // V16 Lot 5 — past appointments of the month (honoured / no-show / cancelled): no-show rate in Rapports.
  for (const [d, st] of [[-3, "CHECKED_IN"], [-5, "CHECKED_IN"], [-6, "NO_SHOW"], [-8, "CHECKED_IN"], [-12, "CANCELLED"], [-15, "CHECKED_IN"], [-20, "NO_SHOW"]] as const) {
    await prisma.appointment.create({ data: { reference: `RDV-DEMO-P${ref++}`, serviceId: service.id, startAt: slot(d, 10), endAt: slot(d, 11), status: st, firstName: "Client", lastName: "Passé", phone: "98123456", plate: nextPlate() } });
  }
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
    lot5,
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
