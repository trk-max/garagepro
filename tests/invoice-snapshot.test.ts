import { describe, expect, it } from "vitest";
import { completeSnapshot, type LiveInvoiceData } from "@/lib/invoice-snapshot";

const live: LiveInvoiceData = {
  garage: { name: "Garage Live", address: null, phone: null, email: null, taxId: null, footer: null },
  customer: { name: "Client Live", phone: "20000000", address: null, taxId: null },
  vehicle: { plate: "123TU4567", make: "Peugeot", model: "208", mileage: 1000 },
  workOrderNumber: 42,
  lines: [{ type: "LABOR", description: "Vidange", quantityX100: 100, unitPrice: 50_000, taxRateBp: 1900 }],
  stampDuty: 1_000,
};

describe("invoice snapshot fallback (old invoices)", () => {
  it("a complete snapshot is used as is", () => {
    const snap = {
      garage: { ...live.garage, name: "Garage Figé" },
      customer: { ...live.customer, name: "Client Figé" },
      vehicle: { ...live.vehicle, plate: "1TU1" },
      workOrderNumber: 7,
      lines: [{ type: "PART", description: "Filtre", quantityX100: 200, unitPrice: 10_000, taxRateBp: 1900, totalHt: 20_000 }],
      taxByRate: [{ rateBp: 1900, base: 20_000, tax: 3_800 }],
    };
    const doc = completeSnapshot(snap, live);
    expect(doc.incomplete).toBe(false);
    expect(doc.garage.name).toBe("Garage Figé");
    expect(doc.customer.name).toBe("Client Figé");
    expect(doc.workOrderNumber).toBe(7);
    expect(doc.lines[0]!.description).toBe("Filtre");
  });

  it("missing parts come from live data, flagged incomplete, never a crash", () => {
    const doc = completeSnapshot({ customer: { name: "Client Figé", phone: "1" } }, live);
    expect(doc.incomplete).toBe(true);
    expect(doc.customer.name).toBe("Client Figé");
    expect(doc.garage.name).toBe("Garage Live");
    expect(doc.vehicle.plate).toBe("123TU4567");
    expect(doc.workOrderNumber).toBe(42);
    expect(doc.lines).toEqual([expect.objectContaining({ description: "Vidange", totalHt: 50_000 })]);
    expect(doc.taxByRate).toEqual([expect.objectContaining({ rateBp: 1900, tax: 9_500 })]);
  });

  it("null or garbage snapshot", () => {
    for (const bad of [null, "x", 3, []]) {
      const doc = completeSnapshot(bad, live);
      expect(doc.incomplete).toBe(true);
      expect(doc.customer.name).toBe("Client Live");
    }
  });
});
