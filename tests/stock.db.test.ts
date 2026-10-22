/**
 * Prompt 2/5, step B — reservations, supplier returns and corrections on a real
 * PostgreSQL test database (real concurrency, real constraints).
 * Run: npm run test:db   (see vitest.db.config.ts)
 */
import { describe, expect, it } from "vitest";
import { correctMovement, createPart, moveStock, releaseReservation, reservePart } from "@/server/parts";
import { createSupplier } from "@/server/purchasing";
import { addLine, changeStatus } from "@/server/work-orders";
import { agreeAll, makeUser, makeWorkOrder, prisma } from "./helpers/db";

const sku = () => `S${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const code = (p: Promise<unknown>) => p.then(() => "NO ERROR", (e: { code?: string }) => e.code ?? String(e));
const part = (id: string) => prisma.part.findUniqueOrThrow({ where: { id }, select: { stockX100: true, reservedX100: true } });

describe("réservations de pièces", () => {
  it("two simultaneous reservations of the last free unit: exactly one succeeds", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: sku(), name: "Batterie", unit: "pcs", salePrice: 300_000, stock: 100 }, admin);
    const { wo: a } = await makeWorkOrder();
    const { wo: b } = await makeWorkOrder();
    const results = await Promise.allSettled([reservePart(admin, a.id, p.id, 100), reservePart(admin, b.id, p.id, 100)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await part(p.id)).toEqual({ stockX100: 100, reservedX100: 100 });
    expect(await prisma.stockReservation.count({ where: { partId: p.id, status: "ACTIVE" } })).toBe(1);
  });

  it("a manual exit cannot take reserved units; using the part on the repair consumes its reservation (no double count)", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: sku(), name: "Huile 5W30", unit: "L", salePrice: 25_000, stock: 500 }, admin);
    const { wo } = await makeWorkOrder();
    await reservePart(admin, wo.id, p.id, 400); // 4 L put aside
    expect(await code(moveStock(p.id, { delta: -200, reason: "ADJUSTMENT" }, admin))).toBe("insufficientStock");
    await moveStock(p.id, { delta: -100, reason: "ADJUSTMENT" }, admin); // the 1 free litre
    expect(await part(p.id)).toEqual({ stockX100: 400, reservedX100: 400 });

    await addLine(wo.id, { type: "PART", partId: p.id, quantityX100: 300 }, admin); // 3 of the 4 reserved litres proposed
    // V16 Lot 2: on the quote the part is only put aside (nothing free to add: the manual reservation covers it).
    expect(await part(p.id)).toEqual({ stockX100: 400, reservedX100: 400 });
    await agreeAll(wo.id, admin); // accepted → 3 litres leave the stock, taken from the reservation
    expect(await part(p.id)).toEqual({ stockX100: 100, reservedX100: 100 });
    const r = await prisma.stockReservation.findFirstOrThrow({ where: { workOrderId: wo.id } });
    expect(r).toMatchObject({ status: "ACTIVE", quantityX100: 100 });
  });

  it("cancelling the repair releases what is still reserved; a released reservation cannot be released twice", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: sku(), name: "Courroie", unit: "pcs", salePrice: 90_000, stock: 300 }, admin);
    const { wo } = await makeWorkOrder({ status: "DIAGNOSIS" });
    const r1 = await reservePart(admin, wo.id, p.id, 100);
    await reservePart(admin, wo.id, p.id, 100);
    await releaseReservation(admin, r1.id, "plus nécessaire");
    expect(await code(releaseReservation(admin, r1.id, "encore"))).toBe("reservationClosed");
    await changeStatus(wo.id, "CANCELLED", admin, { reason: "Client renonce" }); // V16: reason mandatory
    expect(await part(p.id)).toEqual({ stockX100: 300, reservedX100: 0 });
    expect(await prisma.stockReservation.count({ where: { workOrderId: wo.id, status: "ACTIVE" } })).toBe(0);
    expect(await code(reservePart(admin, wo.id, p.id, 100))).toBe("final");
  });

  it("the database itself refuses a negative reserved counter", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: sku(), name: "Bougie", unit: "pcs", salePrice: 12_000, stock: 100 }, admin);
    await expect(prisma.part.update({ where: { id: p.id }, data: { reservedX100: -1 } })).rejects.toThrow();
  });
});

describe("retours fournisseur et corrections", () => {
  it("return to supplier: out of stock, supplier recorded, journal line", async () => {
    const admin = await makeUser("ADMIN");
    const supplier = await createSupplier({ name: `Fournisseur ${Date.now()}` });
    const p = await createPart({ sku: sku(), name: "Amortisseur", unit: "pcs", salePrice: 150_000, stock: 400 }, admin);
    await moveStock(p.id, { delta: -100, reason: "SUPPLIER_RETURN", supplierId: supplier.id, note: "défectueux" }, admin);
    expect((await part(p.id)).stockX100).toBe(300);
    const m = await prisma.stockMovement.findFirstOrThrow({ where: { partId: p.id, reason: "SUPPLIER_RETURN" } });
    expect(m.supplierId).toBe(supplier.id);
    expect(await prisma.auditLog.count({ where: { entityId: m.id, action: "stock.supplierReturn" } })).toBe(1);
  });

  it("a wrong entry is corrected by an opposite movement linked to it; the original stays; only once, even at the same time", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: sku(), name: "Filtre à air", unit: "pcs", salePrice: 20_000 }, admin);
    await moveStock(p.id, { delta: 1_000, reason: "PURCHASE", note: "10 au lieu de 1" }, admin);
    const wrong = await prisma.stockMovement.findFirstOrThrow({ where: { partId: p.id, reason: "PURCHASE" } });
    const results = await Promise.allSettled([correctMovement(admin, wrong.id, "erreur de saisie"), correctMovement(admin, wrong.id, "erreur de saisie")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "alreadyCorrected" });
    expect((await part(p.id)).stockX100).toBe(0);
    const corr = await prisma.stockMovement.findFirstOrThrow({ where: { correctsId: wrong.id } });
    expect(corr).toMatchObject({ reason: "CORRECTION", deltaX100: -1_000, note: "erreur de saisie" });
    expect(await prisma.stockMovement.count({ where: { id: wrong.id } })).toBe(1); // original kept
  });

  it("repair and goods-receipt movements are not corrected from the stock page", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: sku(), name: "Ampoule", unit: "pcs", salePrice: 3_000, stock: 500 }, admin);
    const { wo } = await makeWorkOrder();
    await addLine(wo.id, { type: "PART", partId: p.id, quantityX100: 100 }, admin);
    await agreeAll(wo.id, admin); // V16 Lot 2: the part leaves the stock when the customer accepts the line
    const used = await prisma.stockMovement.findFirstOrThrow({ where: { partId: p.id, reason: "WORK_ORDER" } });
    expect(await code(correctMovement(admin, used.id, "test"))).toBe("notCorrectable");
  });

  it("correcting an entry whose units are now reserved is refused (no negative free stock)", async () => {
    const admin = await makeUser("ADMIN");
    const p = await createPart({ sku: sku(), name: "Disque", unit: "pcs", salePrice: 70_000 }, admin);
    await moveStock(p.id, { delta: 200, reason: "PURCHASE" }, admin);
    const entry = await prisma.stockMovement.findFirstOrThrow({ where: { partId: p.id, reason: "PURCHASE" } });
    const { wo } = await makeWorkOrder();
    await reservePart(admin, wo.id, p.id, 200);
    expect(await code(correctMovement(admin, entry.id, "erreur"))).toBe("insufficientStock");
    expect(await part(p.id)).toEqual({ stockX100: 200, reservedX100: 200 });
  });
});
