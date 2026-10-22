/**
 * Prompt 4/5 — warranties on repairs and parts: automatic warranty at delivery (idempotent),
 * claims, decisions, refunds, and who may see the money. Real PostgreSQL. Run: npm run test:db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addRefund, createAutoRepairWarranty, createWarranty, getClaim, getWarranty, listWarranties, moveClaim, openClaim, setClaimAmounts, voidRefund, voidWarranty } from "@/server/warranties";
import { changeStatus } from "@/server/work-orders";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

const setWarrantySettings = (warrantyMonths: number, warrantyKm: number) =>
  prisma.setting.upsert({ where: { id: "garage" }, update: { warrantyMonths, warrantyKm }, create: { id: "garage", warrantyMonths, warrantyKm } });

beforeAll(() => setWarrantySettings(0, 0));
afterAll(() => setWarrantySettings(0, 0));

describe("Garantie automatique à la livraison", () => {
  it("off by default: delivering creates no warranty", async () => {
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder({ status: "READY" });
    await changeStatus(wo.id, "DELIVERED", admin, { override: true, reason: "Test : livraison sans facture (dérogation V16)" });
    expect(await prisma.warranty.count({ where: { workOrderId: wo.id } })).toBe(0);
  });

  it("with 6 months / 10 000 km: created once at delivery, never twice", async () => {
    await setWarrantySettings(6, 10_000);
    try {
      const admin = await makeUser("ADMIN");
      const { wo } = await makeWorkOrder({ status: "READY" });
      await prisma.workOrder.update({ where: { id: wo.id }, data: { mileageIn: 80_000 } });
      await changeStatus(wo.id, "DELIVERED", admin, { override: true, reason: "Test : livraison sans facture (dérogation V16)" });
      const rows = await prisma.warranty.findMany({ where: { workOrderId: wo.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: "REPAIR", startKm: 80_000, endKm: 90_000, autoWorkOrderId: wo.id });
      expect(rows[0]!.endsAt).not.toBeNull();
      // A second run (retry, replay) does nothing.
      const delivered = (await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).deliveredAt!;
      await prisma.$transaction((tx) => createAutoRepairWarranty(tx, admin, wo.id, delivered));
      expect(await prisma.warranty.count({ where: { workOrderId: wo.id } })).toBe(1);
      // Delivered twice is refused by the status machine anyway.
      await expect(changeStatus(wo.id, "DELIVERED", admin)).rejects.toMatchObject({ code: "transition" });
      expect(await prisma.auditLog.count({ where: { entity: "Warranty", entityId: rows[0]!.id, action: "warranty.auto" } })).toBe(1);
    } finally {
      await setWarrantySettings(0, 0);
    }
  });

  it("km only and no known mileage: created without km limit (validity 'to check'), nothing invented", async () => {
    await setWarrantySettings(0, 5_000);
    try {
      const admin = await makeUser("ADMIN");
      const { wo } = await makeWorkOrder({ status: "READY" });
      await changeStatus(wo.id, "DELIVERED", admin, { override: true, reason: "Test : livraison sans facture (dérogation V16)" });
      const [w] = await listWarranties(admin, { workOrderId: wo.id });
      expect(w).toMatchObject({ endKm: null, endsAt: null });
      expect(w!.validity.status).toBe("UNKNOWN");
    } finally {
      await setWarrantySettings(0, 0);
    }
  });
});

describe("Garanties saisies à la main et réclamations", () => {
  it("part warranty needs a supplier and a limit; km needs a known starting mileage", async () => {
    const mech = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder();
    await expect(createWarranty(mech, wo.id, { kind: "PART", label: "Alternateur", months: 12 })).rejects.toMatchObject({ code: "warrantySupplier" });
    await expect(createWarranty(mech, wo.id, { kind: "REPAIR", label: "Freins" })).rejects.toMatchObject({ code: "warrantyLimit" });
    await expect(createWarranty(mech, wo.id, { kind: "REPAIR", label: "Freins", km: 5000 })).rejects.toMatchObject({ code: "warrantyNoKm" });
    const storekeeper = await makeUser("STOREKEEPER");
    await expect(createWarranty(storekeeper, wo.id, { kind: "REPAIR", label: "Freins", months: 3 })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("full claim: mechanic opens it and never sees amounts; manager decides; refunds capped; journaled", async () => {
    const mech = await makeUser("MECHANIC");
    const manager = await makeUser("MANAGER");
    const supplier = await prisma.supplier.create({ data: { name: "Fournisseur garantie" } });
    const { wo } = await makeWorkOrder();
    const w = await createWarranty(mech, wo.id, { kind: "PART", label: "Alternateur", months: 12, supplierId: supplier.id });

    const claim = await openClaim(mech, w.id, "L'alternateur ne charge plus");
    // Mechanic: no money at all, even if he calls the server directly.
    await expect(setClaimAmounts(mech, claim.id, { costParts: 1, costLabor: 1, amountClaimed: 1 })).rejects.toMatchObject({ code: "forbidden" });
    await expect(moveClaim(mech, claim.id, "SUBMITTED")).rejects.toMatchObject({ code: "forbidden" });

    await setClaimAmounts(manager, claim.id, { costParts: 250_000, costLabor: 60_000, amountClaimed: 250_000 });
    await expect(moveClaim(manager, claim.id, "ACCEPTED")).rejects.toMatchObject({ code: "claimTransition" });
    await moveClaim(manager, claim.id, "SUBMITTED");
    await expect(moveClaim(manager, claim.id, "PARTIAL", {})).rejects.toMatchObject({ code: "claimAmount" });
    // Typo guard: never more than claimed (it would inflate the expected refunds of the forecast).
    await expect(moveClaim(manager, claim.id, "PARTIAL", { amountAccepted: 2_500_000 })).rejects.toMatchObject({ code: "claimAmountTooHigh" });
    await moveClaim(manager, claim.id, "PARTIAL", { amountAccepted: 200_000, decision: "Pièce reprise, main-d'œuvre refusée" });

    await expect(addRefund(manager, claim.id, { amount: 250_000, receivedDay: "2026-10-20", method: "TRANSFER" })).rejects.toMatchObject({ code: "refundTooHigh" });
    const r1 = await addRefund(manager, claim.id, { amount: 150_000, receivedDay: "2026-10-20", method: "TRANSFER" });
    await expect(addRefund(manager, claim.id, { amount: 60_000, receivedDay: "2026-10-21", method: "CASH" })).rejects.toMatchObject({ code: "refundTooHigh" });
    await voidRefund(manager, r1.id, "doublon de saisie");
    await addRefund(manager, claim.id, { amount: 200_000, receivedDay: "2026-10-21", method: "TRANSFER" });

    const seenByManager = await getClaim(manager, claim.id);
    expect(seenByManager?.money).toMatchObject({ amountClaimed: 250_000, amountAccepted: 200_000, received: 200_000, expected: 0 });
    const seenByMechanic = await getClaim(mech, claim.id);
    expect(seenByMechanic).toMatchObject({ status: "PARTIAL", money: null, refunds: null, decision: null });
    expect(JSON.stringify(seenByMechanic)).not.toMatch(/250000|200000|amountClaimed|costParts/);
    const warrantyForMechanic = await getWarranty(mech, w.id);
    expect(warrantyForMechanic?.claims[0]?.money).toBeNull();

    await moveClaim(manager, claim.id, "CLOSED");
    await expect(addRefund(manager, claim.id, { amount: 1, receivedDay: "2026-10-21", method: "CASH" })).rejects.toMatchObject({ code: "refundNotAccepted" });

    const actions = (await prisma.auditLog.findMany({ where: { OR: [{ entityId: claim.id }, { entityId: w.id }, { entity: "WarrantyRefund", actorId: manager.id }] }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(actions).toEqual([
      "warranty.create",
      "warrantyClaim.open",
      "warrantyClaim.amounts",
      "warrantyClaim.status",
      "warrantyClaim.status",
      "warrantyRefund.add",
      "warrantyRefund.void",
      "warrantyRefund.add",
      "warrantyClaim.status",
    ]);
  });

  it("no claim on an expired or cancelled warranty; only money roles can cancel", async () => {
    const mech = await makeUser("MECHANIC");
    const admin = await makeUser("ADMIN");
    const { wo } = await makeWorkOrder();
    const w = await createWarranty(mech, wo.id, { kind: "REPAIR", label: "Embrayage", endDate: "2099-12-31" });
    await expect(openClaim(mech, w.id, "Bruit", new Date("2100-03-01T10:00:00Z"))).rejects.toMatchObject({ code: "warrantyExpired" });
    await expect(voidWarranty(mech, w.id, "erreur")).rejects.toMatchObject({ code: "forbidden" });
    await voidWarranty(admin, w.id, "saisie en double");
    await expect(voidWarranty(admin, w.id, "encore")).rejects.toMatchObject({ code: "alreadyVoided" });
    await expect(openClaim(mech, w.id, "Bruit")).rejects.toMatchObject({ code: "warrantyVoided" });
    expect(await prisma.warranty.count({ where: { id: w.id } })).toBe(1);
  });
});
