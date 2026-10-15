import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Server rules: vehicle file completeness at check-in, one rating per work order. */
const db = vi.hoisted(() => ({
  vehicle: { customerId: "c1", vin: null as string | null, year: 2015 as number | null, fuel: "DIESEL" as string | null, color: "Gris" as string | null },
  vehicleUpdates: [] as Record<string, unknown>[],
  createdOrders: 0,
  feedbackFor: new Set<string>(),
  attempts: 0,
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    customer: { create: async () => ({ id: "c-new" }) },
    vehicle: {
      findUnique: async () => db.vehicle,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        db.vehicleUpdates.push(data);
        Object.assign(db.vehicle, data);
        return {};
      },
      create: async () => ({ id: "v-new" }),
    },
    workOrder: { create: async () => (db.createdOrders++, { id: "wo-new" }) },
    workOrderEvent: { create: async () => ({}) },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      workOrder: { findUnique: async () => ({ id: "wo1", customerId: "c1" }) },
      vehicle: { findUnique: async () => null },
      customer: { findFirst: async () => null },
      customerFeedback: {
        create: async ({ data }: { data: { workOrderId: string | null } }) => {
          if (data.workOrderId && db.feedbackFor.has(data.workOrderId)) {
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" });
          }
          if (data.workOrderId) db.feedbackFor.add(data.workOrderId);
          return { id: "f1" };
        },
      },
    },
  };
});
vi.mock("@/server/rate-limit", () => ({ reserveAttempt: async () => (db.attempts++ < 5 ? ["a"] : null) }));
vi.mock("@/server/settings", () => ({ getSettings: async () => ({}) }));

const { createWorkOrder } = await import("@/server/work-orders");
const { createFeedback } = await import("@/server/claims");
const actor = { id: "u1", name: "Sonia", email: "s@g.tn", role: "RECEPTION" as const };
const base = { customerId: "c1", vehicleId: "v1", complaint: "Bruit", priority: "NORMAL" as const, requireCompleteVehicle: true };

beforeEach(() => {
  db.vehicle = { customerId: "c1", vin: null, year: 2015, fuel: "DIESEL", color: "Gris" };
  db.vehicleUpdates = [];
  db.createdOrders = 0;
  db.feedbackFor.clear();
  db.attempts = 0;
});

describe("check-in of a known car", () => {
  it("refuses to open the order while the VIN is missing", async () => {
    await expect(createWorkOrder({ ...base, mileageIn: 120000 }, actor)).rejects.toMatchObject({ code: "vehicleIncomplete" });
    expect(db.createdOrders).toBe(0);
  });
  it("refuses without check-in mileage", async () => {
    await expect(createWorkOrder({ ...base, completeVehicle: { vin: "VF32A5FS9AB123456" } }, actor)).rejects.toMatchObject({ code: "vehicleIncomplete" });
  });
  it("saves the typed VIN on the car and opens the order", async () => {
    await createWorkOrder({ ...base, mileageIn: 120000, completeVehicle: { vin: "VF32A5FS9AB123456" } }, actor);
    expect(db.vehicleUpdates).toContainEqual({ vin: "VF32A5FS9AB123456" });
    expect(db.createdOrders).toBe(1);
  });
});

describe("customer rating", () => {
  it("one rating per work order", async () => {
    await createFeedback({ rating: 5 }, { ip: "1.2.3.4", workOrderId: "wo1" });
    await expect(createFeedback({ rating: 4 }, { ip: "1.2.3.4", workOrderId: "wo1" })).rejects.toMatchObject({ code: "alreadyRated" });
  });
  it("public ratings are rate-limited per IP", async () => {
    for (let i = 0; i < 5; i++) await createFeedback({ rating: 5 }, { ip: "9.9.9.9" });
    await expect(createFeedback({ rating: 5 }, { ip: "9.9.9.9" })).rejects.toMatchObject({ code: "tooMany" });
  });
});
