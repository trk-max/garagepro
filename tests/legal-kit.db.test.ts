/**
 * V10.6 — kit juridique: repair order details (prise en charge), editable clauses with the lawyer's
 * validation, frozen legal mentions on NEW invoices, CDI v2 template. Real PostgreSQL: npm run test:db
 */
import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { createInvoice } from "@/server/invoices";
import { saveRepairTerms, setRepairTermsReview, updateIntake } from "@/server/repair-order";
import { addLine, createWorkOrder } from "@/server/work-orders";
import { ensureTemplates } from "@/server/contracts";
import { snapshotLegal } from "@/lib/invoice-snapshot";
import { DEFAULT_REPAIR_CLAUSES } from "@/lib/repair-order";
import { agreeAll, makeUser, makeWorkOrder, prisma } from "./helpers/db";

const code = (p: Promise<unknown>) => p.then(() => "NO ERROR", (e: { code?: string }) => e.code ?? String(e));
const resetTerms = () =>
  prisma.setting.upsert({
    where: { id: "garage" },
    update: { repairClauses: Prisma.DbNull, storageFeePerDay: 20_000, storageGraceHours: 48, abandonmentDays: 30, repairClausesReviewedAt: null, repairClausesReviewedById: null, invoicePaymentTerms: null, invoicePenaltyText: null, legalName: null, registryNumber: null, registryCity: null },
    create: { id: "garage" },
  });
afterAll(resetTerms);

describe("prise en charge", () => {
  it("check-in stores fuel, body, parts origin, estimate, deposit and the new customer's CIN", async () => {
    const reception = await makeUser("RECEPTION");
    const wo = await createWorkOrder(
      {
        newCustomer: { name: "Sami Client", phone: "20123456" },
        newVehicle: { plate: `LK${Date.now().toString(36).toUpperCase()}`, make: "Kia", model: "Rio" },
        complaint: "Bruit au freinage",
        priority: "NORMAL",
        mileageIn: 120_000,
        intake: { fuelLevel: 2, partsOrigin: "ORIGINE", bodyChecklist: ["FRONT_BUMPER"], bodyDamageNotes: "Rayure", estimateTtc: 350_000, depositAmount: 100_000, depositMethod: "CARD", customerNationalId: "09876543" },
      },
      reception,
    );
    const row = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id }, include: { customer: true } });
    expect(row).toMatchObject({ fuelLevel: 2, partsOrigin: "ORIGINE", bodyChecklist: ["FRONT_BUMPER"], bodyDamageNotes: "Rayure", estimateTtc: 350_000, depositAmount: 100_000, depositMethod: "CARD" });
    expect(row.customer.nationalId).toBe("09876543");
  });

  it("updated from the work order page (audited), customer CIN cleared on request, refused once final", async () => {
    const reception = await makeUser("RECEPTION");
    const { wo, customer } = await makeWorkOrder();
    await prisma.customer.update({ where: { id: customer.id }, data: { nationalId: "11111111" } });
    await updateIntake(wo.id, { fuelLevel: 4, bodyChecklist: ["ROOF", "WHEELS"], depositAmount: 50_000, customerNationalId: null }, reception);
    const row = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id }, include: { customer: true } });
    expect(row).toMatchObject({ fuelLevel: 4, bodyChecklist: ["ROOF", "WHEELS"], depositAmount: 50_000, depositMethod: "CASH", partsOrigin: null });
    expect(row.customer.nationalId).toBeNull();
    expect(await prisma.auditLog.count({ where: { entity: "WorkOrder", entityId: wo.id, action: "workOrder.intake", actorId: reception.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entity: "Customer", entityId: customer.id, action: "customer.update" } })).toBe(1);
    // CIN absent from the form: unchanged.
    await prisma.customer.update({ where: { id: customer.id }, data: { nationalId: "22222222" } });
    await updateIntake(wo.id, { bodyChecklist: [] }, reception);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).nationalId).toBe("22222222");
    await prisma.workOrder.update({ where: { id: wo.id }, data: { status: "DELIVERED" } });
    expect(await code(updateIntake(wo.id, { bodyChecklist: [] }, reception))).toBe("final");
  });
});

describe("conditions de l'ordre de réparation", () => {
  it("saved by manageSettings; lawyer validation by an administrator only; any change clears it (audited)", async () => {
    await resetTerms();
    const admin = await makeUser("ADMIN");
    const manager = await makeUser("MANAGER");
    const terms = { clauses: DEFAULT_REPAIR_CLAUSES.map((c) => ({ ...c })), storageFeePerDay: 20_000, storageGraceHours: 48, abandonmentDays: 30 };
    expect(await code(saveRepairTerms(manager, terms))).toBe("forbidden");
    expect(await code(setRepairTermsReview(manager, true))).toBe("forbidden");
    // A per-user GRANT of manageSettings does not open the lawyer validation.
    expect(await code(setRepairTermsReview({ ...manager, perms: { grant: ["manageSettings"], deny: [] } } as never, true))).toBe("forbidden");
    await saveRepairTerms(admin, terms);
    await setRepairTermsReview(admin, true);
    let s = await prisma.setting.findUniqueOrThrow({ where: { id: "garage" } });
    expect(s.repairClausesReviewedById).toBe(admin.id);
    expect(s.repairClausesReviewedAt).not.toBeNull();
    // Same texts and amounts, only invoice mentions: the validation stays.
    await saveRepairTerms(admin, { ...terms, invoicePaymentTerms: "Virement" });
    expect((await prisma.setting.findUniqueOrThrow({ where: { id: "garage" } })).repairClausesReviewedAt).not.toBeNull();
    // New amount: back to "to be validated by a lawyer".
    await saveRepairTerms(admin, { ...terms, storageFeePerDay: 15_000, invoicePaymentTerms: "Virement" });
    s = await prisma.setting.findUniqueOrThrow({ where: { id: "garage" } });
    expect(s).toMatchObject({ storageFeePerDay: 15_000, repairClausesReviewedAt: null, repairClausesReviewedById: null });
    const logs = await prisma.auditLog.findMany({ where: { entity: "Setting", action: { startsWith: "settings.repairTerms" } }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["settings.repairTerms", "settings.repairTermsReviewed", "settings.repairTerms", "settings.repairTerms"]);
    expect(await code(saveRepairTerms(admin, { ...terms, clauses: [] }))).toBe("invalid");
  });
});

describe("facture : mentions légales figées sur les NOUVELLES factures", () => {
  it("raison sociale, RC, CIN, conditions et pénalités copiées à l'émission ; plus jamais relues ensuite", async () => {
    await resetTerms();
    await prisma.setting.update({ where: { id: "garage" }, data: { legalName: "SARL Garage Test", registryNumber: "B0123", registryCity: "Tunis", invoicePaymentTerms: "Chèque ou virement", invoicePenaltyText: null } });
    const admin = await makeUser("ADMIN");
    const { wo, customer } = await makeWorkOrder();
    await prisma.customer.update({ where: { id: customer.id }, data: { nationalId: "01234567" } });
    await addLine(wo.id, { type: "LABOR", description: "Main-d'œuvre", quantityX100: 100, unitPrice: 100_000 }, admin);
    await agreeAll(wo.id, admin); // V16 Lot 2: the customer's agreement before invoicing
    const inv = await createInvoice(wo.id, admin);
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    // Legal numbering unchanged: F<year>-<4 digits>, continuous per year.
    expect(row.number).toMatch(/^F\d{4}-\d{4}$/);
    expect(snapshotLegal(row.snapshot)).toEqual({ garageLegalName: "SARL Garage Test", garageRegistry: "B0123 (Tunis)", customerNationalId: "01234567", paymentTerms: "Chèque ou virement", penaltyText: null });
    // Settings changed afterwards: the issued invoice keeps its mentions.
    await prisma.setting.update({ where: { id: "garage" }, data: { invoicePaymentTerms: "Autre" } });
    expect(snapshotLegal((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).snapshot).paymentTerms).toBe("Chèque ou virement");
  });
});

describe("modèle de CDI v2", () => {
  it("both versions in the database; v2 starts 'to be validated by a lawyer'", async () => {
    await ensureTemplates();
    const rows = await prisma.contractTemplate.findMany({ where: { code: "EMPLOYMENT_MECHANIC" }, orderBy: { version: "asc" } });
    expect(rows.map((r) => [r.version, r.reviewStatus, r.active])).toEqual([
      [1, "NEEDS_LEGAL_REVIEW", true],
      [2, "NEEDS_LEGAL_REVIEW", true],
    ]);
  });
});
