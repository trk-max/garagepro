import { beforeEach, describe, expect, it, vi } from "vitest";

/** V6 fixes: ICS line breaks, receipts over the ordered quantity, complaint linking. */
const db = vi.hoisted(() => ({
  vehicleOwnerPhone: "+216 20 111 222",
  created: [] as Record<string, unknown>[],
  receipts: 0,
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    purchaseOrder: {
      findUnique: async () => ({ id: "po1", status: "APPROVED", supplierId: "s1", lines: [{ id: "pl1", partId: "p1", quantityX100: 500, receivedX100: 0, unitCost: 1000 }] }),
    },
    goodsReceipt: { create: async () => (db.receipts++, { id: "r1" }) },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      workOrder: { findUnique: async () => ({ id: "wo1", customerId: "c-tracker" }) },
      vehicle: { findUnique: async () => ({ customerId: "c-owner", customer: { phone: db.vehicleOwnerPhone } }) },
      customer: { findFirst: async () => ({ id: "c-any" }) },
      customerClaim: { create: async ({ data }: { data: Record<string, unknown> }) => (db.created.push(data), { id: "x", number: 1 }) },
    },
  };
});
vi.mock("@/server/rate-limit", () => ({ reserveAttempt: async () => ["a"] }));
vi.mock("@/server/settings", () => ({ getSettings: async () => ({}) }));

const { buildIcs } = await import("@/server/booking");
const { createReceipt } = await import("@/server/purchasing");
const { createClaim } = await import("@/server/claims");
const actor = { id: "u1", name: "Ali", email: "a@g.tn", role: "STOREKEEPER" as const };

beforeEach(() => {
  db.created = [];
  db.receipts = 0;
  db.vehicleOwnerPhone = "+216 20 111 222";
});

describe("calendar file (.ics)", () => {
  it("a carriage return in a field cannot start a new ICS property", () => {
    const ics = buildIcs(
      { reference: "RDV-1", startAt: new Date("2026-10-20T08:00:00Z"), endAt: new Date("2026-10-20T09:00:00Z"), plate: "123TU4567" },
      { garageName: "Garage\rX-INJECT:1", address: "Rue 1\r\nATTENDEE:evil", phone: null },
      "Vidange",
    );
    const lines = ics.split("\r\n");
    expect(lines.some((l) => l.startsWith("X-INJECT"))).toBe(false);
    expect(lines.some((l) => l.startsWith("ATTENDEE"))).toBe(false);
  });
});

describe("goods receipt against a purchase order", () => {
  it("two lines of the same part cannot exceed the quantity still due", async () => {
    await expect(
      createReceipt({ supplierId: "s1", purchaseOrderId: "po1", lines: [{ partId: "p1", quantityX100: 300 }, { partId: "p1", quantityX100: 300 }] }, actor),
    ).rejects.toMatchObject({ code: "overReceive" });
    expect(db.receipts).toBe(0);
  });
});

describe("public complaint: which customer file", () => {
  const claim = { name: "X", phone: "+216 20 111 222", category: "OTHER" as const, message: "Message de test assez long" };
  it("plate + matching phone → the owner's file", async () => {
    await createClaim({ ...claim, plate: "123TU4567" }, { ip: "1.1.1.1" });
    expect(db.created[0]).toMatchObject({ customerId: "c-owner", workOrderId: null });
  });
  it("plate with someone else's phone → not linked", async () => {
    await createClaim({ ...claim, phone: "+216 99 888 777", plate: "123TU4567" }, { ip: "1.1.1.1" });
    expect(db.created[0]).toMatchObject({ customerId: null });
  });
  it("from the tracker → the signed-in work order", async () => {
    await createClaim({ ...claim }, { ip: "1.1.1.1", workOrderId: "wo1" });
    expect(db.created[0]).toMatchObject({ customerId: "c-tracker", workOrderId: "wo1" });
  });
});
