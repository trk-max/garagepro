/**
 * V16 Lot 5 — pure rules: quality points (settings, results), road-test km, rework causes and counter, comeback
 * candidate (< 30 days) and rework labour not billed by default, inspection colour → quote priority, survey and
 * refused-work reminder windows, steering KPIs (real data only, « — » when not enough), permissions and translations.
 */
import { describe, expect, it } from "vitest";
import {
  buildKpis,
  comebackCandidate,
  extraPointsComplete,
  isReworkMove,
  parseQualityPoints,
  pointsFromLines,
  priorityForColor,
  rate,
  refusedReminderLevel,
  reworkCount,
  reworkLine,
  roadTestKmMissing,
  surveyDue,
} from "@/lib/lot5";
import { buildReport } from "@/lib/report";
import { can, rolesFor, PERMISSION_GROUPS, type Permission } from "@/lib/permissions";
import { v16Lot5Fr } from "@/lib/i18n/v16-lot5-fr";
import { v16Lot5Ar } from "@/lib/i18n/v16-lot5-ar";
import { v16Lot5En } from "@/lib/i18n/v16-lot5-en";
import { fr } from "@/lib/i18n/fr";
import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";
import { customerEventData } from "@/server/portal";

const DAY = 86_400_000;
const NOW = new Date(Date.UTC(2026, 9, 20, 10));
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe("contrôle qualité : points réglés, km de l'essai", () => {
  it("settings: one point per line, stable keys, duplicates numbered, bad rows dropped", () => {
    const pts = pointsFromLines("Pression des pneus\n\n  Niveau lave-glace \nPression des pneus");
    expect(pts).toEqual([
      { key: "pression-des-pneus", label: "Pression des pneus" },
      { key: "niveau-lave-glace", label: "Niveau lave-glace" },
      { key: "pression-des-pneus-2", label: "Pression des pneus" },
    ]);
    expect(parseQualityPoints([{ key: "ok", label: "Ok" }, { key: "BAD KEY", label: "x" }, { key: "ok", label: "dup" }, null, "x"])).toEqual([{ key: "ok", label: "Ok" }]);
    expect(parseQualityPoints({})).toEqual([]);
  });

  it("every configured point ticked; the 6 fixed points stay separate (no point = complete)", () => {
    const pts = [{ key: "a", label: "A" }, { key: "b", label: "B" }];
    expect(extraPointsComplete(pts, { a: { label: "A", ok: true }, b: { label: "B", ok: true } })).toBe(true);
    expect(extraPointsComplete(pts, { a: { label: "A", ok: true } })).toBe(false);
    expect(extraPointsComplete([], {})).toBe(true);
  });

  it("road-test km mandatory when the test was done, new orders only", () => {
    expect(roadTestKmMissing({ workflowLot5: true, roadTest: "DONE", roadTestKm: null })).toBe(true);
    expect(roadTestKmMissing({ workflowLot5: true, roadTest: "DONE", roadTestKm: 0 })).toBe(true);
    expect(roadTestKmMissing({ workflowLot5: true, roadTest: "DONE", roadTestKm: 501 })).toBe(true);
    expect(roadTestKmMissing({ workflowLot5: true, roadTest: "DONE", roadTestKm: 8 })).toBe(false);
    expect(roadTestKmMissing({ workflowLot5: true, roadTest: "NOT_NEEDED", roadTestKm: null })).toBe(false);
    expect(roadTestKmMissing({ workflowLot5: false, roadTest: "DONE", roadTestKm: null })).toBe(false);
  });

  it("rework = quality check / ready car back to the workshop; counter from the status events", () => {
    expect(isReworkMove("QUALITY_CONTROL", "IN_PROGRESS")).toBe(true);
    expect(isReworkMove("READY", "IN_PROGRESS")).toBe(true);
    expect(isReworkMove("WAITING_PARTS", "IN_PROGRESS")).toBe(false);
    const events = [
      { type: "STATUS_CHANGED", data: { from: "IN_PROGRESS", to: "QUALITY_CONTROL" } },
      { type: "STATUS_CHANGED", data: { from: "QUALITY_CONTROL", to: "IN_PROGRESS", reworkCause: "WORKMANSHIP" } },
      { type: "NOTE", data: { from: "QUALITY_CONTROL", to: "IN_PROGRESS" } },
      { type: "STATUS_CHANGED", data: { from: "READY", to: "IN_PROGRESS" } },
    ];
    expect(reworkCount(events)).toBe(2);
    // Internal: never sent to the customer portal.
    expect(customerEventData({ from: "QUALITY_CONTROL", to: "IN_PROGRESS", reworkCause: "WORKMANSHIP", rework: 1, reason: "x" })).toEqual({ from: "QUALITY_CONTROL", to: "IN_PROGRESS" });
  });
});

describe("retour atelier", () => {
  const order = { id: "new", createdAt: NOW };
  it("suggests the latest order of the vehicle delivered less than 30 days before", () => {
    const prev = [
      { id: "old", deliveredAt: ago(40) },
      { id: "p1", deliveredAt: ago(20) },
      { id: "p2", deliveredAt: ago(5) },
      { id: "open", deliveredAt: null },
      { id: "new", deliveredAt: ago(1) },
    ];
    expect(comebackCandidate(order, prev)?.id).toBe("p2");
    expect(comebackCandidate(order, [{ id: "old", deliveredAt: ago(30) }])).toBeNull();
    expect(comebackCandidate(order, [{ id: "late", deliveredAt: new Date(NOW.getTime() + DAY) }])).toBeNull();
  });

  it("rework labour of a comeback is NOT billed by default; parts and normal orders unchanged", () => {
    expect(reworkLine({ comeback: true, type: "LABOR", unitPrice: 35_000, bill: false })).toEqual({ unitPrice: 0, isRework: true });
    expect(reworkLine({ comeback: true, type: "LABOR", unitPrice: 35_000, bill: true })).toEqual({ unitPrice: 35_000, isRework: true });
    expect(reworkLine({ comeback: true, type: "PART", unitPrice: 12_000, bill: false })).toEqual({ unitPrice: 12_000, isRework: false });
    expect(reworkLine({ comeback: false, type: "LABOR", unitPrice: 35_000, bill: false })).toEqual({ unitPrice: 35_000, isRework: false });
  });
});

describe("inspection et suivi client", () => {
  it("red → SAFETY, orange → RECOMMENDED, green never a quote line", () => {
    expect(priorityForColor("RED")).toBe("SAFETY");
    expect(priorityForColor("ORANGE")).toBe("RECOMMENDED");
    expect(priorityForColor("GREEN")).toBeNull();
    expect(priorityForColor(null)).toBeNull();
  });

  it("survey 3 to 7 days after the delivery (the tracker closes at 7 days)", () => {
    expect(surveyDue(ago(2.9), NOW)).toBe(false);
    expect(surveyDue(ago(3), NOW)).toBe(true);
    expect(surveyDue(ago(6.9), NOW)).toBe(true);
    expect(surveyDue(ago(7), NOW)).toBe(false);
    expect(surveyDue(null, NOW)).toBe(false);
  });

  it("refused work reminded at 30 then 90 days after the delivery, nothing after 120 days", () => {
    expect(refusedReminderLevel(ago(29), NOW)).toBeNull();
    expect(refusedReminderLevel(ago(30), NOW)).toBe(30);
    expect(refusedReminderLevel(ago(89), NOW)).toBe(30);
    expect(refusedReminderLevel(ago(90), NOW)).toBe(90);
    expect(refusedReminderLevel(ago(120), NOW)).toBe(90);
    expect(refusedReminderLevel(ago(121), NOW)).toBeNull();
  });
});

describe("KPI de pilotage (données réelles, « — » sinon)", () => {
  it("computes each KPI from real rows", () => {
    const k = buildKpis(
      {
        quoteLines: [
          { approvalStatus: "APPROVED", amountHt: 300 },
          { approvalStatus: "APPROVED", amountHt: 100 },
          { approvalStatus: "REFUSED", amountHt: 600 },
          { approvalStatus: "APPROVED", amountHt: 0 },
        ],
        opened: [{ comeback: true }, { comeback: false }, { comeback: false }, { comeback: false }],
        soldHours: [
          { mechanicId: "m1", name: "Karim", hours: 6 },
          { mechanicId: "m1", name: "Karim", hours: 2 },
          { mechanicId: "m2", name: "Ali", hours: 3 },
          { mechanicId: null, name: null, hours: 1 },
        ],
        clocked: [
          { userId: "m1", name: "Karim", hours: 10 },
          { userId: "m2", name: "Ali", hours: 2 },
        ],
      },
      { invoicedHt: 900_000, invoices: 3 },
      { total: 10, noShow: 2, cancelled: 2 },
    );
    expect(k.lineApproval).toEqual({ rate: 75, decided: 4, approved: 3, amountRate: 40 });
    expect(k.aro).toBe(300_000);
    expect(k.comeback).toEqual({ rate: 25, count: 1, opened: 4 });
    expect(k.efficiency.rate).toBe(100); // 12 h sold / 12 h clocked
    expect(k.efficiency.technicians).toEqual([
      { userId: "m1", name: "Karim", clocked: 10, sold: 8, efficiency: 80 },
      { userId: "m2", name: "Ali", clocked: 2, sold: 3, efficiency: 150 },
    ]);
    expect(k.noShow).toEqual({ rate: 25, count: 2, base: 8 });
  });

  it("« — » (null) when there is nothing to compute — never a made-up 0 %", () => {
    const k = buildKpis({ quoteLines: [], opened: [], soldHours: [], clocked: [] }, { invoicedHt: 0, invoices: 0 }, { total: 0, noShow: 0, cancelled: 0 });
    expect([k.lineApproval.rate, k.aro, k.comeback.rate, k.efficiency.rate, k.noShow.rate]).toEqual([null, null, null, null, null]);
    expect(rate(0, 0)).toBeNull();
    expect(rate(1, 3)).toBe(33.3);
  });

  it("report: comeback rate from linked orders; the former heuristic is kept as « revisites »", () => {
    const base = { complaint: "x", customerId: "c", vehicleId: "v", make: "R", model: "C", customerSince: ago(400) };
    const rows = {
      invoices: [],
      payments: [],
      created: [
        { ...base, id: "a", createdAt: ago(1), previousVisitAt: ago(10), comeback: false },
        { ...base, id: "b", createdAt: ago(1), previousVisitAt: ago(8), comeback: true },
        { ...base, id: "c", createdAt: ago(1), previousVisitAt: null },
      ],
      delivered: [],
      cancelled: 0,
      inShopNow: 0,
      lines: [],
      supplierInvoicesTtc: 0,
      supplierPaid: 0,
      outstandingNow: 0,
      overdueNow: 0,
      lowStockNow: 0,
      appointments: [],
      newCustomers: 0,
      claims: [],
      openClaimsNow: 0,
      feedback: [],
      kpi: { quoteLines: [], soldHours: [], clocked: [] },
    };
    const r = buildReport(rows, { invoices: [], payments: [], received: 0 }, { start: ago(7), days: 7, timeZone: "Africa/Tunis" });
    expect(r.cars.revisits).toBe(2);
    expect(r.cars.comebacks).toBe(1);
    expect(r.kpis?.comeback).toEqual({ rate: 33.3, count: 1, opened: 3 });
    // No KPI rows → no block (older callers).
    const { kpi: _k, ...noKpi } = rows;
    void _k;
    expect(buildReport(noKpi, { invoices: [], payments: [], received: 0 }, { start: ago(7), days: 7, timeZone: "Africa/Tunis" }).kpis).toBeNull();
  });
});

describe("droits et traductions du Lot 5", () => {
  const LOT5: Permission[] = ["manageComebacks", "performInspection", "manageInspections"];
  it("the mechanic inspects but neither links comebacks nor sets the templates", () => {
    expect(can({ role: "MECHANIC" }, "performInspection")).toBe(true);
    expect(can({ role: "MECHANIC" }, "manageComebacks")).toBe(false);
    expect(can({ role: "MECHANIC" }, "manageInspections")).toBe(false);
    expect(rolesFor("manageInspections")).toEqual(["ADMIN", "MANAGER"]);
    const grouped = Object.values(PERMISSION_GROUPS).flat() as Permission[];
    for (const p of LOT5) expect(grouped.filter((x) => x === p)).toHaveLength(1);
  });

  it("every Lot 5 text exists in fr, ar and en", () => {
    const keys = (o: unknown, prefix = ""): string[] => (o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`)) : [prefix]);
    expect(keys(v16Lot5Ar)).toEqual(keys(v16Lot5Fr));
    expect(keys(v16Lot5En)).toEqual(keys(v16Lot5Fr));
    for (const d of [fr, ar, en]) {
      for (const k of ["roadTestKmRequired", "reworkCauseRequired", "comebackInvalid", "inspectionNotRed", "inspectionAlreadyQuoted"] as const) expect(d.errors[k]).toBeTruthy();
      expect(d.v16.lot5.inspection.title).toBeTruthy();
    }
  });
});
