/**
 * V10.2 — "Véhicules" page data on the real database: search by plate (any spacing),
 * owner, make / VIN, the "in the workshop" repair and the cursor pagination. Run: npm run test:db
 */
import { describe, expect, it } from "vitest";
import { vehicleCards } from "@/server/vehicle-list";
import { makeWorkOrder, prisma } from "./helpers/db";

let n = 0;
const tag = () => `vl${Date.now().toString(36)}${(n++).toString(36)}`;

describe("V10.2 — vehicle cards", () => {
  it("finds a vehicle by plate typed with spaces, and by its owner's name (any case)", async () => {
    const owner = await prisma.customer.create({ data: { name: `Zied ${tag()} Owner`, phone: "20333444" } });
    const digits = String(Date.now() % 1000).padStart(3, "0");
    const plate = `${digits}TU${String(n).padStart(4, "7")}`;
    const v = await prisma.vehicle.create({ data: { plate, make: "Renault", model: "Clio", vin: `VF1${tag().toUpperCase()}`, customerId: owner.id } });

    const byPlate = await vehicleCards({ q: `${digits} tu ${plate.slice(5)}`, take: 100 });
    expect(byPlate.items.map((c) => c.id)).toContain(v.id);

    const byOwner = await vehicleCards({ q: owner.name.toUpperCase(), take: 100 });
    expect(byOwner.items.map((c) => c.id)).toEqual([v.id]);
    expect(byOwner.items[0]).toMatchObject({ plate, make: "Renault", model: "Clio", owner: { id: owner.id, name: owner.name }, lastVisit: null, inShop: null });

    const byVin = await vehicleCards({ q: v.vin!.toLowerCase(), take: 100 });
    expect(byVin.items.map((c) => c.id)).toEqual([v.id]);

    const none = await vehicleCards({ q: `nothing-${tag()}` });
    expect(none).toEqual({ items: [], nextCursor: null });
  });

  it("inShop: the latest repair while it is open, nothing once delivered or cancelled", async () => {
    const { wo, vehicle } = await makeWorkOrder({ status: "IN_PROGRESS" });
    const open = (await vehicleCards({ q: vehicle.plate, take: 100 })).items.find((c) => c.id === vehicle.id);
    expect(open?.inShop).toEqual({ id: wo.id, number: wo.number });
    expect(open?.lastVisit).toEqual(wo.createdAt);

    await prisma.workOrder.update({ where: { id: wo.id }, data: { status: "DELIVERED" } });
    const done = (await vehicleCards({ q: vehicle.plate, take: 100 })).items.find((c) => c.id === vehicle.id);
    expect(done?.inShop).toBeNull();
    expect(done?.lastVisit).toEqual(wo.createdAt);

    const cancelled = await makeWorkOrder({ status: "CANCELLED" });
    const c = (await vehicleCards({ q: cancelled.vehicle.plate, take: 100 })).items.find((x) => x.id === cancelled.vehicle.id);
    expect(c?.inShop).toBeNull();
  });

  it("pages with a cursor: every vehicle once, newest change first", async () => {
    const owner = await prisma.customer.create({ data: { name: `Paging ${tag()}`, phone: "20555666" } });
    for (let i = 0; i < 5; i++) await prisma.vehicle.create({ data: { plate: `P${tag()}`.toUpperCase(), make: "Kia", model: "Picanto", customerId: owner.id } });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof vehicleCards>> = await vehicleCards({ q: owner.name, take: 2, cursor });
      seen.push(...page.items.map((c) => c.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });
});
