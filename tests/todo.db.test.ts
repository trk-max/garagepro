/**
 * V10.4 — "À traiter" against a real database: the counts follow the data and each
 * role gets only its own items (a mechanic never sees approvals).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { todoCounts } from "@/server/todo";
import { todoDetails } from "@/server/todo-details";
import { groupTodos } from "@/lib/todo";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

let manager: Awaited<ReturnType<typeof makeUser>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
let mechanic: Awaited<ReturnType<typeof makeUser>>;
let hr: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  await prisma.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
  [manager, admin, mechanic, hr] = await Promise.all([makeUser("MANAGER"), makeUser("ADMIN"), makeUser("MECHANIC"), makeUser("HR")]);
  // One pending leave, one purchase order waiting for the administrator, one quality check filled but not approved.
  await prisma.leaveRequest.create({ data: { userId: mechanic.id, type: "PAID_LEAVE", startAt: new Date("2026-11-02T00:00:00Z"), endAt: new Date("2026-11-04T00:00:00Z") } });
  const supplier = await prisma.supplier.create({ data: { name: "Fournisseur à traiter" } });
  await prisma.purchaseOrder.create({ data: { number: `BC-TODO-${Date.now()}`, supplierId: supplier.id, status: "PENDING_APPROVAL" } });
  const { wo } = await makeWorkOrder({ status: "QUALITY_CONTROL" });
  await prisma.qualityCheck.create({
    data: { workOrderId: wo.id, roadTest: "DONE", fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true, checkedAt: new Date(), checkedById: mechanic.id },
  });
});

describe("V10.4 à traiter (DB)", () => {
  it("mechanic: incomplete repairs, never an approval", async () => {
    const c = await todoCounts(mechanic);
    // makeWorkOrder creates a vehicle without VIN / year / fuel / colour.
    expect(c.vehicleInfo).toBeGreaterThanOrEqual(1);
    for (const k of ["leaves", "purchaseOrders", "qualityChecks", "contractsToApprove", "warrantyDecisions", "overdueInvoices"]) expect(c).not.toHaveProperty(k);
    expect(groupTodos(c, "MECHANIC").approval).toEqual([]);
  });

  it("manager: leave and quality approvals (purchase orders stay with the administrator)", async () => {
    const c = await todoCounts(manager);
    expect(c.leaves).toBeGreaterThanOrEqual(1);
    expect(c.qualityChecks).toBeGreaterThanOrEqual(1);
    expect(c).not.toHaveProperty("purchaseOrders");
    const list = groupTodos(c, "MANAGER");
    expect(list.approval.map((i) => i.key)).toEqual(expect.arrayContaining(["leaves", "qualityChecks"]));
  });

  it("administrator: leave + purchase approvals; HR: leaves only", async () => {
    const a = await todoCounts(admin);
    expect(a.leaves).toBeGreaterThanOrEqual(1);
    expect(a.purchaseOrders).toBeGreaterThanOrEqual(1);
    const h = await todoCounts(hr);
    expect(h.leaves).toBeGreaterThanOrEqual(1);
    expect(h).not.toHaveProperty("purchaseOrders");
    expect(h).not.toHaveProperty("qualityChecks");
  });

  it("an approved quality check leaves the list; details agree with the counts", async () => {
    const before = (await todoCounts(manager)).qualityChecks ?? 0;
    const rows = await todoDetails(["qualityChecks", "leaves", "purchaseOrders", "vehicleInfo"], "ADMIN");
    expect(rows.qualityChecks?.length).toBe(Math.min(before, 8));
    expect(rows.purchaseOrders?.[0]?.href).toMatch(/^\/garage\/purchase-orders\//);
    expect(rows.vehicleInfo?.[0]?.missing).toContain("vin");
    await prisma.qualityCheck.updateMany({ where: { approvedAt: null }, data: { approvedAt: new Date(), approvedById: manager.id } });
    expect((await todoCounts(manager)).qualityChecks).toBe(0);
  });

  it("low stock is compared column to column by the database", async () => {
    const before = (await todoCounts(admin)).lowStock ?? 0;
    await prisma.part.create({ data: { sku: `TODO-${Date.now()}`, name: "Plaquettes", stockX100: 100, minStockX100: 200, salePrice: 1000 } });
    await prisma.part.create({ data: { sku: `TODO-OK-${Date.now()}`, name: "Filtre", stockX100: 500, minStockX100: 200, salePrice: 1000 } });
    expect((await todoCounts(admin)).lowStock).toBe(before + 1);
  });
});
