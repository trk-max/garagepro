import type { LineType } from "@prisma/client";
import { computeTotals, lineTotalHt } from "@/lib/format";

/** Same shape as InvoiceSnapshot (server/invoices.ts), repeated here so this pure helper stays testable. */
export type SnapshotParts = {
  garage: { name: string; address: string | null; phone: string | null; email: string | null; taxId: string | null; footer: string | null };
  customer: { name: string; phone: string; address: string | null; taxId: string | null };
  vehicle: { plate: string; make: string; model: string; mileage: number | null };
  workOrderNumber: number;
  lines: { type: LineType; description: string; quantityX100: number; unitPrice: number; taxRateBp: number; totalHt: number }[];
  taxByRate: { rateBp: number; base: number; tax: number }[];
};

export type LiveInvoiceData = {
  garage: SnapshotParts["garage"];
  customer: SnapshotParts["customer"];
  vehicle: SnapshotParts["vehicle"];
  workOrderNumber: number;
  lines: { type: LineType; description: string; quantityX100: number; unitPrice: number; taxRateBp: number }[];
  stampDuty: number;
};

const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string";

/**
 * The frozen copy of an invoice, completed from today's data where an old invoice
 * lacks a part (older versions saved less). `incomplete` = at least one part came
 * from live data, so the page can say so instead of crashing.
 */
export function completeSnapshot(snapshot: unknown, live: LiveInvoiceData): SnapshotParts & { incomplete: boolean } {
  const s = obj(snapshot) ? snapshot : {};
  let incomplete = false;
  const pick = <T>(ok: boolean, value: unknown, fallback: T): T => {
    if (ok) return value as T;
    incomplete = true;
    return fallback;
  };
  const lines = pick(Array.isArray(s.lines) && s.lines.every((l) => obj(l) && str(l.description) && typeof l.unitPrice === "number"), s.lines, live.lines.map((l) => ({ ...l, totalHt: lineTotalHt(l) })));
  const garage = pick(obj(s.garage) && str(s.garage.name), s.garage, live.garage);
  const customer = pick(obj(s.customer) && str(s.customer.name), s.customer, live.customer);
  const vehicle = pick(obj(s.vehicle) && str(s.vehicle.plate), s.vehicle, live.vehicle);
  const workOrderNumber = pick(typeof s.workOrderNumber === "number", s.workOrderNumber, live.workOrderNumber);
  const taxByRate = pick(Array.isArray(s.taxByRate), s.taxByRate, computeTotals(lines, live.stampDuty).taxByRate);
  return { garage, customer, vehicle, workOrderNumber, lines, taxByRate, incomplete };
}
