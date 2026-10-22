/**
 * V16 Lot 4 — pure rules: storage fee (gardiennage, never during a garage-caused parts wait), aged balance,
 * graduated reminders, payment date, invoice balance after a credit note, deposit counted once, mileage, ceiling,
 * signature image check, handover requirement, permissions and translations.
 */
import { describe, expect, it } from "vitest";
import { agedBalance, agedBucket, creditNoteNumber, depositOutstanding, invoiceBalance, paymentDateAllowed, refundDue, reminderLevel, statusFromPaid } from "@/lib/billing";
import { cleanWarningLights, mileageLowerThanKnown, readChecklist, withinCeiling } from "@/lib/handover";
import { computeStorageFee, type StatusMove } from "@/lib/storage-fee";
import { can, rolesFor, PERMISSION_GROUPS, type Permission } from "@/lib/permissions";
import { balanceDue, handoverMissing, workWithoutQuoteBlocked } from "@/server/workflow";
import { parseSignaturePng } from "@/server/signatures";
import { v16Lot4Fr } from "@/lib/i18n/v16-lot4-fr";
import { v16Lot4Ar } from "@/lib/i18n/v16-lot4-ar";
import { v16Lot4En } from "@/lib/i18n/v16-lot4-en";
import { fr } from "@/lib/i18n/fr";
import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";

const D = (day: number, hour = 9) => new Date(Date.UTC(2026, 9, 1 + day, hour));
const FEE = 20_000;

describe("gardiennage (lib/storage-fee)", () => {
  const ready: StatusMove[] = [
    { at: D(0, 8), to: "RECEIVED" },
    { at: D(0, 10), to: "IN_PROGRESS" },
    { at: D(1), to: "READY" },
  ];

  it("starts at the READY notice + grace, every started day counts", () => {
    const f = computeStorageFee({ moves: ready, notices: [D(1)], partsDecisions: [], graceHours: 48, feePerDay: FEE, end: D(5, 10) });
    // From D3 9:00 to D5 10:00 = 2 days 1 hour → 3 started days.
    expect(f).toMatchObject({ reason: "due", days: 3, amount: 3 * FEE });
  });

  it("no notice (customer never told) → nothing; within the grace → nothing", () => {
    expect(computeStorageFee({ moves: ready, notices: [], partsDecisions: [], graceHours: 48, feePerDay: FEE, end: D(9) }).reason).toBe("notNotified");
    expect(computeStorageFee({ moves: ready, notices: [D(1)], partsDecisions: [], graceHours: 48, feePerDay: FEE, end: D(2, 20) })).toMatchObject({ reason: "inGrace", days: 0, amount: 0 });
    expect(computeStorageFee({ moves: ready.slice(0, 2), notices: [D(0, 11)], partsDecisions: [], graceHours: 0, feePerDay: FEE, end: D(9) }).reason).toBe("notReady");
  });

  it("is NOT counted during a parts wait caused by the garage (Lot 3 decision, or no decision = garage-caused by default)", () => {
    const moves: StatusMove[] = [...ready, { at: D(1, 12), to: "IN_PROGRESS" }, { at: D(1, 13), to: "WAITING_PARTS" }, { at: D(11), to: "READY" }];
    const base = { moves, notices: [D(1)], graceHours: 48, feePerDay: FEE, end: D(12) };
    // Garage-caused wait (explicit) and no decision at all: only the last READY day counts.
    expect(computeStorageFee({ ...base, partsDecisions: [{ at: D(2), decision: "KEEP_VEHICLE", garageCaused: true }] }).days).toBe(1);
    expect(computeStorageFee({ ...base, partsDecisions: [] }).days).toBe(1);
    // Car handed back while waiting: nothing during the wait either.
    expect(computeStorageFee({ ...base, partsDecisions: [{ at: D(2), decision: "RETURN_LATER", garageCaused: false }] }).days).toBe(1);
    // Customer-caused wait with the car kept at the garage: counted after the grace (D3 9:00 → D11 9:00) + last day.
    expect(computeStorageFee({ ...base, partsDecisions: [{ at: D(2), decision: "KEEP_VEHICLE", garageCaused: false }] }).days).toBe(9);
  });

  it("a rework (back to the workshop) is never storage", () => {
    const moves: StatusMove[] = [...ready, { at: D(4), to: "IN_PROGRESS" }, { at: D(8), to: "READY" }];
    // READY D1→D4 (after grace: D3→D4 = 1 day) + D8→D9 = 1 day.
    expect(computeStorageFee({ moves, notices: [D(1)], partsDecisions: [], graceHours: 48, feePerDay: FEE, end: D(9) }).days).toBe(2);
  });
});

describe("factures, avoirs, paiements (lib/billing)", () => {
  it("a credited invoice owes nothing; what was paid is owed back", () => {
    expect(invoiceBalance({ totalTtc: 500_000, paidAmount: 100_000, status: "PARTIAL" })).toBe(400_000);
    expect(invoiceBalance({ totalTtc: 500_000, paidAmount: 100_000, status: "CREDITED" })).toBe(0);
    expect(refundDue({ totalTtc: 500_000, paidAmount: 100_000, status: "CREDITED" })).toBe(100_000);
    expect(balanceDue({ totalTtc: 500_000, paidAmount: 0, status: "CREDITED" }, 50_000)).toBe(0);
  });

  it("the deposit of a Lot 4 order is a payment: never deducted twice", () => {
    expect(depositOutstanding({ workflowLot4: true, depositAmount: 100_000 })).toBe(0);
    expect(depositOutstanding({ workflowLot4: false, depositAmount: 100_000 })).toBe(100_000);
    // Invoice 420, deposit 100 already in paidAmount → 320 owed (not 220).
    expect(balanceDue({ totalTtc: 420_000, paidAmount: 100_000 }, depositOutstanding({ workflowLot4: true, depositAmount: 100_000 }))).toBe(320_000);
  });

  it("status from what was paid (a reversal can bring it back to ISSUED)", () => {
    expect(statusFromPaid(100, 0, "PAID")).toBe("ISSUED");
    expect(statusFromPaid(100, 40, "ISSUED")).toBe("PARTIAL");
    expect(statusFromPaid(100, 100, "PARTIAL")).toBe("PAID");
    expect(statusFromPaid(100, 0, "CREDITED")).toBe("CREDITED");
  });

  it("aged balance: 0–30 / 31–60 / 61–90 / > 90 days since the invoice date, credited ones excluded", () => {
    const now = D(200);
    expect(agedBucket(D(170), now)).toBe("d0_30");
    expect(agedBucket(D(169), now)).toBe("d31_60");
    expect(agedBucket(D(139), now)).toBe("d61_90");
    expect(agedBucket(D(109), now)).toBe("d90_plus");
    const a = agedBalance(
      [
        { issuedAt: D(195), totalTtc: 100, paidAmount: 0, status: "ISSUED" },
        { issuedAt: D(150), totalTtc: 300, paidAmount: 100, status: "PARTIAL" },
        { issuedAt: D(10), totalTtc: 900, paidAmount: 0, status: "ISSUED" },
        { issuedAt: D(10), totalTtc: 900, paidAmount: 0, status: "CREDITED" },
      ],
      now,
    );
    expect(a).toMatchObject({ d0_30: { count: 1, amount: 100 }, d31_60: { count: 1, amount: 200 }, d61_90: { count: 0, amount: 0 }, d90_plus: { count: 1, amount: 900 }, total: 1200 });
  });

  it("graduated reminders: J+7, J+15, J+30", () => {
    expect([0, 6, 7, 14, 15, 29, 30, 90].map(reminderLevel)).toEqual([null, null, 7, 7, 15, 15, 30, 30]);
  });

  it("payment date: in the past yes, in the future no, not more than a year before the invoice", () => {
    const now = D(30);
    expect(paymentDateAllowed(D(29), D(20), now)).toBe(true);
    expect(paymentDateAllowed(D(31), D(20), now)).toBe(false);
    expect(paymentDateAllowed(new Date(D(20).getTime() - 400 * 86_400_000), D(20), now)).toBe(false);
  });

  it("credit note number « AV-2026-0001 »", () => {
    expect(creditNoteNumber(2026, 1)).toBe("AV-2026-0001");
    expect(creditNoteNumber(2026, 12)).toBe("AV-2026-0012");
  });
});

describe("réception et restitution (lib/handover)", () => {
  it("mileage lower than the last reading is detected", () => {
    expect(mileageLowerThanKnown(9_000, 10_000)).toBe(true);
    expect(mileageLowerThanKnown(10_000, 10_000)).toBe(false);
    expect(mileageLowerThanKnown(9_000, null)).toBe(false);
  });

  it("ceiling: only once the intake is signed, total under it", () => {
    expect(withinCeiling({ ceiling: 200_000, intakeSigned: true, totalTtc: 150_000 })).toBe(true);
    expect(withinCeiling({ ceiling: 200_000, intakeSigned: false, totalTtc: 150_000 })).toBe(false);
    expect(withinCeiling({ ceiling: 200_000, intakeSigned: true, totalTtc: 250_000 })).toBe(false);
    expect(workWithoutQuoteBlocked("RECEIVED", "IN_PROGRESS", { workflowV16: true, allowWorkWithoutQuote: false, withinCeiling: true })).toBe(false);
    expect(workWithoutQuoteBlocked("RECEIVED", "IN_PROGRESS", { workflowV16: true, allowWorkWithoutQuote: false })).toBe(true);
  });

  it("warning lights and checklist read safely", () => {
    expect(cleanWarningLights(["ABS", "nope", "ENGINE", "ABS"])).toEqual(["ENGINE", "ABS"]);
    expect(readChecklist({ workExplained: true, oldParts: "x" })).toEqual({ workExplained: true, oldParts: "NONE", keysReturned: false, clean: false });
  });

  it("signed handover required for Lot 4 orders only, setting on", () => {
    expect(handoverMissing({ requireSignedHandover: true, workflowLot4: true, handoverDone: false })).toBe(true);
    expect(handoverMissing({ requireSignedHandover: true, workflowLot4: true, handoverDone: true })).toBe(false);
    expect(handoverMissing({ requireSignedHandover: false, workflowLot4: true, handoverDone: false })).toBe(false);
    expect(handoverMissing({ requireSignedHandover: true, workflowLot4: false, handoverDone: false })).toBe(false);
  });

  it("signature image: a real PNG under 300 KB only", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
    expect(parseSignaturePng(`data:image/png;base64,${png.toString("base64")}`).length).toBe(208);
    expect(() => parseSignaturePng("data:image/png;base64,AAAA")).toThrow();
    expect(() => parseSignaturePng(`data:image/jpeg;base64,${png.toString("base64")}`)).toThrow();
    const big = Buffer.concat([png, Buffer.alloc(400 * 1024)]);
    expect(() => parseSignaturePng(`data:image/png;base64,${big.toString("base64")}`)).toThrow(/signatureTooLarge/);
  });
});

describe("droits et traductions du Lot 4", () => {
  const LOT4: Permission[] = ["signIntake", "recordHandover", "issueCreditNote", "reversePayment", "waiveStorageFee"];
  it("never the mechanic by default; credit notes / reversals / waivers for managers or accounting only", () => {
    for (const p of LOT4) expect(can({ role: "MECHANIC" }, p)).toBe(false);
    expect(rolesFor("issueCreditNote")).toEqual(["ADMIN", "ACCOUNTANT"]);
    expect(can({ role: "RECEPTION" }, "reversePayment")).toBe(false);
    expect(can({ role: "RECEPTION" }, "recordHandover")).toBe(true);
    const grouped = Object.values(PERMISSION_GROUPS).flat() as Permission[];
    for (const p of LOT4) expect(grouped.filter((x) => x === p)).toHaveLength(1);
  });

  it("every Lot 4 text exists in fr, ar and en", () => {
    const keys = (o: unknown, prefix = ""): string[] =>
      o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`)) : [prefix];
    expect(keys(v16Lot4Ar)).toEqual(keys(v16Lot4Fr));
    expect(keys(v16Lot4En)).toEqual(keys(v16Lot4Fr));
    for (const d of [fr, ar, en]) {
      expect(d.invoiceStatus.CREDITED).toBeTruthy();
      expect(d.errors.handoverRequired).toBeTruthy();
      expect(d.v16.lot4.handover.title).toBeTruthy();
    }
  });
});
