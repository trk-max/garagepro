/**
 * V7.8 fixes — certificate model, QR at check-in, labour basis choice,
 * insurance alert stops after the answer. Real PostgreSQL test database.
 * Run: npm run test:db
 */
import { beforeAll, describe, expect, it } from "vitest";
import { certificateParagraphs } from "@/lib/certificate";
import { certificatePdf } from "@/server/certificate-pdf";
import { getCertificate, issueCertificate } from "@/server/certificates";
import { delays } from "@/server/follow-up";
import { laborSummary } from "@/server/labor";
import { createWorkOrder } from "@/server/work-orders";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

beforeAll(async () => {
  await prisma.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
});

describe("attestation de travail (modèle standard)", () => {
  it("all recorded details appear; the 'not resigning' sentence only when confirmed; optional clauses left out when empty", async () => {
    const manager = await makeUser("MANAGER");
    const m = await makeUser("MECHANIC", { jobTitle: "Mécanicien", hireDate: new Date("2022-05-02"), nationalId: "09876543", contractType: "CDI" });
    await prisma.setting.update({
      where: { id: "garage" },
      data: { legalName: "SARL Garage Atlas", address: "12 rue de Carthage, Tunis", legalAddress: "5 avenue Habib Bourguiba, 1000 Tunis", legalRepName: "Malek B.", legalRepTitle: "Gérant", city: "Tunis", legalCapital: "50 000 DT", registryNumber: "B0123452019", registryCity: null, taxId: "1234567/A/M/000" },
    });
    const confirmed = await issueCertificate(manager, m.id, { notResigning: true, recipient: { name: "Banque de Tunisie", address: "Agence Lac 2" } });
    const s1 = (await getCertificate(confirmed.id))!.snapshot;
    const text = certificateParagraphs(s1).join("\n");
    expect(text).toContain("au capital de 50 000 DT");
    expect(text).toContain("dont le siège social est situé 5 avenue Habib Bourguiba, 1000 Tunis");
    expect(text).toContain("immatriculée au Registre National des Entreprises sous le numéro B0123452019");
    expect(text).toContain("au titre d'un contrat à durée indéterminée (CDI) et n'est ni démissionnaire, ni en procédure de licenciement");
    expect(text).toContain("exerce actuellement les fonctions de Mécanicien");
    expect(text).toContain("pour servir et valoir ce que de droit");
    expect(s1.recipient).toEqual({ name: "Banque de Tunisie", address: "Agence Lac 2" });
    expect(Buffer.from((await certificatePdf(s1)).slice(0, 5)).toString()).toBe("%PDF-");

    const plain = await issueCertificate(manager, m.id, {});
    const t2 = certificateParagraphs((await getCertificate(plain.id))!.snapshot).join("\n");
    expect(t2).not.toContain("démissionnaire"); // never written without confirmation

    await prisma.setting.update({ where: { id: "garage" }, data: { legalCapital: null, registryNumber: null } });
    await prisma.user.update({ where: { id: m.id }, data: { contractType: null } });
    const minimal = certificateParagraphs((await getCertificate((await issueCertificate(manager, m.id, {})).id))!.snapshot).join("\n");
    expect(minimal).not.toContain("capital");
    expect(minimal).not.toContain("immatriculée");
    expect(minimal).not.toContain("au titre d'un contrat");
  });

  it("old certificates (before V7.8) still print", async () => {
    const pdf = await certificatePdf({
      number: "ATT-2025-0001",
      issuedAt: "2025-06-01T10:00:00.000Z",
      company: { legalName: "SARL X", address: "Tunis", taxId: null, repName: "A", repTitle: "Gérant", city: "Tunis", phone: null, email: null },
      employee: { name: "B", nationalId: null, jobTitle: "Mécanicien", hireDate: "2020-01-01", endDate: null },
      purpose: null,
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("QR Code créé à l'entrée du véhicule", () => {
  it("new car → QR created at check-in; an existing QR is never replaced", async () => {
    const rec = await makeUser("RECEPTION");
    const wo = await createWorkOrder({ newCustomer: { name: "Client QR", phone: "50000001" }, newVehicle: { plate: `Q${Date.now()}`, make: "Kia", model: "Picanto" }, complaint: "Vidange", priority: "NORMAL" }, rec);
    const v = (await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id }, select: { vehicle: { select: { id: true, qrToken: true, customerId: true } } } })).vehicle;
    expect(v.qrToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    await createWorkOrder({ customerId: v.customerId, vehicleId: v.id, complaint: "Freins", priority: "NORMAL" }, rec);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).qrToken).toBe(v.qrToken);
  });
});

describe("main-d'œuvre : choix de la base quand plusieurs mécaniciens", () => {
  it("2 mechanics together for 2 h → elapsed 2 h, person-hours 4 h, both proposed", async () => {
    const a = await makeUser("MECHANIC");
    const b = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder({ status: "IN_PROGRESS" });
    const start = new Date(Date.now() - 3 * 3_600_000);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    await prisma.laborEntry.createMany({ data: [{ workOrderId: wo.id, userId: a.id, startedAt: start, endedAt: end }, { workOrderId: wo.id, userId: b.id, startedAt: start, endedAt: end }] });
    const s = await laborSummary(wo.id);
    expect(s.mechanics).toBe(2);
    expect(s.suggestedElapsedX100).toBe(200);
    expect(s.suggestedPersonX100).toBe(400);
  });
});

describe("assurance : l'alerte s'arrête à la réponse", () => {
  it("still waiting → late alert; answer recorded (accord) → no more alert", async () => {
    const { wo } = await makeWorkOrder({ status: "WAITING_INSURANCE" });
    await prisma.workOrder.update({ where: { id: wo.id }, data: { insurerName: "STAR", insuranceRequestedAt: new Date(Date.now() - 10 * 86_400_000) } });
    expect((await delays()).insuranceLate.map((w) => w.id)).toContain(wo.id);
    await prisma.workOrder.update({ where: { id: wo.id }, data: { insuranceDecision: "APPROVED", insuranceDecidedAt: new Date() } });
    const d = await delays();
    expect(d.insuranceLate.map((w) => w.id)).not.toContain(wo.id);
    expect(d.insurance.map((w) => w.id)).toContain(wo.id); // still listed until its status changes
  });
});
