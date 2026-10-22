/**
 * V16 Lot 3 — pure rules (no database): promised-date revisions, KPI « livré à la date promise initiale », safety
 * waiver, delivery with nothing to bill, announced fees on the quote snapshot, new permissions, translations.
 */
import { describe, expect, it } from "vitest";
import { linesNeedingWaiver, notifyAllowed, promiseKpi, promiseRevisionNeeded, sameMinute, waiverLineIds, PROMISE_REASONS } from "@/lib/delays";
import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { can, rolesFor } from "@/lib/permissions";
import { buildQuoteSnapshot, snapshotHash } from "@/lib/quote";
import { asksReassembly, deliveryBlock } from "@/server/workflow";

const d = (s: string) => new Date(s);

describe("date promise : révision", () => {
  it("même minute = même promesse ; la première date n'est pas un changement ; changer ou effacer en est un", () => {
    expect(sameMinute(d("2026-11-02T15:00:00Z"), d("2026-11-02T15:00:42Z"))).toBe(true);
    expect(sameMinute(d("2026-11-02T15:00:00Z"), d("2026-11-02T15:01:00Z"))).toBe(false);
    expect(sameMinute(null, undefined)).toBe(true);
    expect(promiseRevisionNeeded(null, d("2026-11-02T15:00:00Z"))).toBe(false);
    expect(promiseRevisionNeeded(d("2026-11-02T15:00:00Z"), d("2026-11-02T15:00:30Z"))).toBe(false);
    expect(promiseRevisionNeeded(d("2026-11-02T15:00:00Z"), d("2026-11-03T15:00:00Z"))).toBe(true);
    expect(promiseRevisionNeeded(d("2026-11-02T15:00:00Z"), null)).toBe(true);
  });

  it("message au client : jamais à un client qui refuse les messages", () => {
    expect(notifyAllowed({ reminderOptOut: false })).toBe(true);
    expect(notifyAllowed({ reminderOptOut: true })).toBe(false);
  });
});

describe("KPI « livré à la date promise initiale »", () => {
  it("compte seulement les ordres avec une promesse ; compare à la première et à la date actuelle", () => {
    const k = promiseKpi([
      { deliveredAt: d("2026-10-10T10:00:00Z"), promisedAtInitial: d("2026-10-10T15:00:00Z"), promisedAt: d("2026-10-10T15:00:00Z") },
      { deliveredAt: d("2026-10-12T10:00:00Z"), promisedAtInitial: d("2026-10-11T15:00:00Z"), promisedAt: d("2026-10-12T15:00:00Z") },
      { deliveredAt: d("2026-10-12T10:00:00Z"), promisedAtInitial: d("2026-10-12T10:00:00Z"), promisedAt: d("2026-10-12T10:00:00Z") }, // exactly on time
      { deliveredAt: d("2026-10-15T10:00:00Z"), promisedAtInitial: null, promisedAt: null },
    ]);
    expect(k).toEqual({ withPromise: 3, onTimeInitial: 2, pctInitial: 66.7, withCurrent: 3, onTimeCurrent: 3, pctCurrent: 100 });
    expect(promiseKpi([])).toMatchObject({ withPromise: 0, pctInitial: null, pctCurrent: null });
  });
});

describe("décharge de sécurité", () => {
  const line = (id: string, priority: "SAFETY" | "RECOMMENDED" | null, approvalStatus: "PENDING" | "APPROVED" | "REFUSED", voidedAt: Date | null = null) => ({ id, priority, approvalStatus, voidedAt });
  it("seules les lignes « Sécurité » refusées non encore couvertes par une décharge", () => {
    const lines = [line("a", "SAFETY", "REFUSED"), line("b", "SAFETY", "APPROVED"), line("c", "RECOMMENDED", "REFUSED"), line("d", "SAFETY", "REFUSED", new Date())];
    expect(linesNeedingWaiver(lines, [])).toEqual(["a"]);
    expect(linesNeedingWaiver(lines, waiverLineIds([{ data: { safetyWaiver: true, lineIds: ["a"] } }, { data: { quoteSent: true } }, { data: null }]))).toEqual([]);
  });
});

describe("livraison et remontage", () => {
  const base = { requirePaidBeforeDelivery: true, workflowV16: true, invoice: null, depositAmount: null };
  it("rien à facturer (devis refusé sans frais annoncés) → pas de facture exigée", () => {
    expect(deliveryBlock({ ...base, billable: false })).toBeNull();
    expect(deliveryBlock({ ...base, billable: true })).toBe("noInvoice");
    expect(deliveryBlock(base)).toBe("noInvoice"); // unknown = as before
  });
  it("la case « véhicule remonté » est demandée seulement de « Devis refusé » à « Prêt »", () => {
    expect(asksReassembly("QUOTE_REFUSED", "READY")).toBe(true);
    expect(asksReassembly("QUALITY_CONTROL", "READY")).toBe(false);
  });
});

describe("devis : frais annoncés à la réception", () => {
  const base = {
    number: "D2026-0001",
    version: 1,
    kind: "INITIAL" as const,
    workOrderNumber: 12,
    sentAt: d("2026-10-22T10:00:00Z"),
    validUntil: d("2026-11-06T10:00:00Z"),
    customer: { name: "Sami", phone: "20111222" },
    vehicle: { plate: "100TU1000", make: "Kia", model: "Picanto" },
    lines: [{ id: "l1", type: "LABOR" as const, description: "Plaquettes", quantityX100: 100, unitPrice: 100_000, taxRateBp: 1900, priority: "SAFETY" as const, partCondition: null }],
    approvedLines: [],
    stampDuty: 1000,
  };
  it("TTC des frais annoncés dans la copie figée ; sans frais, la copie (et son empreinte) ne change pas", () => {
    const withFee = buildQuoteSnapshot({ ...base, announcedLines: [{ quantityX100: 100, unitPrice: 30_000, taxRateBp: 1900 }] });
    expect(withFee.announcedTtc).toBe(35_700);
    const without = buildQuoteSnapshot({ ...base, announcedLines: [] });
    expect("announcedTtc" in without).toBe(false);
    expect(snapshotHash(without)).toBe(snapshotHash(buildQuoteSnapshot(base)));
  });
});

describe("droits et traductions du Lot 3", () => {
  it("décharge : accueil et responsables, jamais le mécanicien ; pièces manquantes : aussi le magasinier", () => {
    expect(rolesFor("recordSafetyWaiver").sort()).toEqual(["ADMIN", "MANAGER", "RECEPTION"]);
    expect(can("MECHANIC", "recordSafetyWaiver")).toBe(false);
    expect(can("STOREKEEPER", "managePartNeeds")).toBe(true);
    expect(can("MECHANIC", "managePartNeeds")).toBe(false);
  });
  it("chaque motif a un libellé interne et un libellé client en fr / ar / en", () => {
    for (const dict of [fr, ar, en]) {
      for (const r of PROMISE_REASONS) {
        expect(dict.v16.lot3.reasons[r]).toBeTruthy();
        expect(dict.v16.lot3.customerReasons[r]).toBeTruthy();
      }
      expect(dict.errors.promiseReasonRequired).toBeTruthy();
      expect(dict.errors.safetyWaiverRequired).toBeTruthy();
      expect(dict.v103.access.perms.recordSafetyWaiver).toBeTruthy();
      expect(dict.v103.access.perms.managePartNeeds).toBeTruthy();
    }
    expect(ar.v16.lot3.refusal.waiverTitle).not.toBe(fr.v16.lot3.refusal.waiverTitle);
  });
});
