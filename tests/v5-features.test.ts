import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import { buildReport, localDay, type ReportRows } from "@/lib/report";
import { classifyComplaint } from "@/lib/report-categories";
import { checkInVehicleSchema, claimSchema, createWorkOrderSchema, feedbackSchema, vehicleCompletionSchema } from "@/lib/validators";
import { isValidVin, missingVehicleInfo, normalizeVin } from "@/lib/vehicle-info";

const VIN = "VF3 2A5FS-9AB123456"; // spaces/dashes typed by staff
const VIN_CLEAN = "VF32A5FS9AB123456";

describe("VIN and mandatory vehicle info", () => {
  it("normalises and validates a VIN (17 chars, no I/O/Q)", () => {
    expect(normalizeVin(VIN)).toBe(VIN_CLEAN);
    expect(isValidVin(VIN)).toBe(true);
    expect(isValidVin("VF32A5FS9AB12345")).toBe(false); // 16
    expect(isValidVin("VF32A5FS9AB12345O")).toBe(false); // letter O
    expect(isValidVin("")).toBe(false);
  });
  it("lists what is missing on a vehicle file", () => {
    expect(missingVehicleInfo({ vin: VIN_CLEAN, year: 2018, fuel: "DIESEL", color: "Gris" })).toEqual([]);
    expect(missingVehicleInfo({ vin: null, year: null, fuel: null, color: "" })).toEqual(["vin", "year", "fuel", "color"]);
    expect(missingVehicleInfo({ vin: "123", year: 2018, fuel: "DIESEL", color: "Gris" })).toEqual(["vin"]);
  });
  it("new car at check-in: every field is mandatory", () => {
    const ok = { plate: "123 TU 4567", make: "Peugeot", model: "208", year: "2018", fuel: "DIESEL", color: "Gris", vin: VIN };
    expect(checkInVehicleSchema.parse(ok).vin).toBe(VIN_CLEAN);
    for (const field of ["vin", "year", "fuel", "color", "make", "model", "plate"] as const) {
      expect(checkInVehicleSchema.safeParse({ ...ok, [field]: "" }).success, field).toBe(false);
    }
    expect(checkInVehicleSchema.safeParse({ ...ok, vin: "ABC" }).success).toBe(false);
  });
  it("check-in mileage is mandatory", () => {
    const base = { complaint: "Bruit au freinage", priority: "NORMAL" };
    expect(createWorkOrderSchema.safeParse(base).success).toBe(false);
    expect(createWorkOrderSchema.safeParse({ ...base, mileageIn: "" }).success).toBe(false);
    expect(createWorkOrderSchema.parse({ ...base, mileageIn: "125000" }).mileageIn).toBe(125000);
  });
  it("known car: only the typed missing pieces, each validated", () => {
    expect(vehicleCompletionSchema.parse({ vin: VIN, year: "", fuel: "", color: "" })).toEqual({ vin: VIN_CLEAN });
    expect(vehicleCompletionSchema.safeParse({ vin: "short" }).success).toBe(false);
  });
});

describe("complaints and reviews (customer site)", () => {
  const claim = { name: "Sami", phone: "+216 20 111 222", category: "DELAY", message: "La voiture devait être prête hier." };
  it("accepts a normal complaint and normalises the plate", () => {
    expect(claimSchema.parse({ ...claim, plate: "123 tu 4567" }).plate).toBe("123TU4567");
  });
  it("refuses short messages, fake phones, unknown categories and bots", () => {
    expect(claimSchema.safeParse({ ...claim, message: "nul" }).success).toBe(false);
    expect(claimSchema.safeParse({ ...claim, phone: "--------" }).success).toBe(false);
    expect(claimSchema.safeParse({ ...claim, category: "HACK" }).success).toBe(false);
    expect(claimSchema.safeParse({ ...claim, website: "http://spam" }).success).toBe(false);
  });
  it("rating must be 1 to 5", () => {
    expect(feedbackSchema.parse({ rating: "5" }).rating).toBe(5);
    expect(feedbackSchema.safeParse({ rating: "0" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ rating: "6" }).success).toBe(false);
    expect(feedbackSchema.safeParse({}).success).toBe(false);
  });
});

describe("who sees what", () => {
  it("reports are for the owner (admin) only", () => {
    expect(can("ADMIN", "viewReports")).toBe(true);
    for (const r of ["RECEPTION", "MECHANIC", "STOREKEEPER"] as const) expect(can(r, "viewReports")).toBe(false);
  });
  it("complaints are handled by admin and reception", () => {
    expect(can("ADMIN", "manageClaims") && can("RECEPTION", "manageClaims")).toBe(true);
    expect(can("MECHANIC", "manageClaims") || can("STOREKEEPER", "manageClaims")).toBe(false);
  });
  it("everyone allowed to add photos may delete them", () => {
    for (const r of ["ADMIN", "RECEPTION", "MECHANIC"] as const) expect(can(r, "uploadMedia")).toBe(true);
  });
});

describe("problem families", () => {
  it.each([
    ["Bruit au freinage, plaquettes ?", "brakes"],
    ["La voiture chauffe en ville", "cooling"],
    ["Clim ne refroidit plus", "ac"],
    ["Ne démarre pas le matin, batterie ?", "electrical"],
    ["Embrayage qui patine", "transmission"],
    ["Vidange + filtres", "service"],
    ["Voyant moteur allumé", "diagnostic"],
    ["مشكلة في الفرامل", "brakes"],
    ["Fuite d'huile sous la voiture", "leak"],
    ["Rayure portière", "body"],
    ["Contrôle général", "other"],
  ])("%s → %s", (text, cat) => {
    expect(classifyComplaint(text)).toBe(cat);
  });
});

describe("report figures", () => {
  const tz = "Africa/Tunis";
  const start = new Date("2026-10-09T23:00:00Z"); // 10 Oct 00:00 local
  const at = (iso: string) => new Date(iso);
  const rows: ReportRows = {
    invoices: [
      { totalHt: 100_000, totalTtc: 120_000, paidAmount: 120_000, issuedAt: at("2026-10-10T09:00:00Z") },
      { totalHt: 200_000, totalTtc: 240_000, paidAmount: 0, issuedAt: at("2026-10-12T09:00:00Z") },
    ],
    payments: [
      { amount: 120_000, method: "CASH", paidAt: at("2026-10-10T10:00:00Z") },
      { amount: 50_000, method: "CARD", paidAt: at("2026-10-12T10:00:00Z") },
    ],
    created: [
      { id: "w1", complaint: "Freins qui grincent", createdAt: at("2026-10-10T08:00:00Z"), customerId: "c1", vehicleId: "v1", make: "Peugeot", model: "208", customerSince: at("2025-01-01"), previousVisitAt: at("2026-09-25T08:00:00Z") },
      { id: "w2", complaint: "Plaquettes avant", createdAt: at("2026-10-11T08:00:00Z"), customerId: "c2", vehicleId: "v2", make: "Peugeot", model: "208", customerSince: at("2026-10-11"), previousVisitAt: null },
      { id: "w3", complaint: "Vidange", createdAt: at("2026-10-12T08:00:00Z"), customerId: "c3", vehicleId: "v3", make: "Kia", model: "Picanto", customerSince: at("2024-01-01"), previousVisitAt: at("2026-01-01") },
    ],
    delivered: [{ createdAt: at("2026-10-10T08:00:00Z"), deliveredAt: at("2026-10-10T18:00:00Z"), mechanicName: "Karim" }],
    cancelled: 0,
    inShopNow: 2,
    lines: [
      { type: "LABOR", quantityX100: 150, unitPrice: 40_000, partId: null, partName: null, partCost: null, mechanicName: "Karim" },
      { type: "PART", quantityX100: 200, unitPrice: 50_000, partId: "p1", partName: "Plaquettes", partCost: 30_000, mechanicName: "Karim" },
    ],
    supplierInvoicesTtc: 90_000,
    supplierPaid: 60_000,
    outstandingNow: 240_000,
    overdueNow: 1,
    lowStockNow: 2,
    appointments: [{ status: "CHECKED_IN" }, { status: "NO_SHOW" }, { status: "CANCELLED" }],
    newCustomers: 1,
    claims: [{ category: "DELAY", status: "RESOLVED", createdAt: at("2026-10-10T08:00:00Z"), resolvedAt: at("2026-10-10T12:00:00Z") }],
    openClaimsNow: 0,
    feedback: [
      { rating: 5, comment: "Top", name: null, plate: null, createdAt: at("2026-10-11T08:00:00Z") },
      { rating: 3, comment: null, name: null, plate: null, createdAt: at("2026-10-12T08:00:00Z") },
    ],
  };
  const report = buildReport(rows, { invoices: [{ totalHt: 0, totalTtc: 300_000, paidAmount: 0, issuedAt: at("2026-10-01") }], payments: [], received: 2 }, { start, days: 7, timeZone: tz });

  it("money", () => {
    expect(report.money.invoicedTtc).toBe(360_000);
    expect(report.money.avgTicket).toBe(180_000);
    expect(report.money.collected).toBe(170_000);
    expect(report.money.labourHt).toBe(60_000); // 1.5 h × 40 DT
    expect(report.money.partsHt).toBe(100_000);
    expect(report.money.partsMargin).toBe(40_000);
    expect(report.money.cashBalance).toBe(110_000);
    expect(report.money.deltaInvoiced).toBe(20);
    expect(report.money.byMethod[0]).toEqual({ method: "CASH", amount: 120_000 });
  });
  it("cars and problems", () => {
    expect(report.cars.received).toBe(3);
    expect(report.cars.returning).toBe(2);
    expect(report.cars.revisits).toBe(1); // w1: 15 days after its last visit (V16 Lot 5: « revisites »)
    expect(report.cars.comebacks).toBe(0); // V16 Lot 5: only orders linked as a comeback count
    expect(report.cars.turnaroundHours).toBe(10);
    expect(report.cars.topModels[0]).toEqual({ key: "Peugeot 208", count: 2 });
    expect(report.problems[0]).toMatchObject({ key: "brakes", count: 2 });
  });
  it("daily series in the garage's time zone", () => {
    expect(report.series).toHaveLength(7);
    expect(report.series[0]!.date).toBe(localDay(start, tz));
    expect(report.series[0]!.invoicedTtc).toBe(120_000);
    expect(report.series[2]!.invoicedTtc).toBe(240_000);
  });
  it("customers' voice and insights", () => {
    expect(report.feedback.avgRating).toBe(4);
    expect(report.feedback.satisfied).toBe(50);
    expect(report.claims.resolutionHours).toBe(4);
    const keys = report.insights.map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["revenueUp", "topProblem", "comebacks", "overdue", "lowStock", "ratingGood"]));
  });
});
