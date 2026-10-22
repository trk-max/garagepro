/**
 * V16 Lot 2 — pure rules of the versioned quote (lib/quote.ts): frozen copy, SHA-256 fingerprint independent
 * of key order, decision from the accepted lines, accepted amount, supplement totals, expiry, permission and
 * translations. No database.
 */
import type { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { PERMISSION_GROUPS, can } from "@/lib/permissions";
import { approvedAmountTtc, buildQuoteSnapshot, canonicalJson, decisionOf, isExpired, quoteNumber, snapshotHash, splitDecision } from "@/lib/quote";

const ROLES: Role[] = ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER", "HR", "ACCOUNTANT", "SELLER", "SHOWROOM_MANAGER"];
const line = (id: string, unitPrice: number, extra: Partial<{ priority: "SAFETY" | "RECOMMENDED" | "WATCH" | null }> = {}) => ({
  id,
  type: "LABOR" as const,
  description: `Ligne ${id}`,
  quantityX100: 100,
  unitPrice,
  taxRateBp: 1900,
  priority: extra.priority ?? null,
  partCondition: null,
});
const base = {
  number: "D2026-0001",
  version: 1,
  workOrderNumber: 42,
  sentAt: new Date("2026-10-22T08:00:00Z"),
  validUntil: new Date("2026-11-06T08:00:00Z"),
  customer: { name: "Client", phone: "20111222" },
  vehicle: { plate: "123TU4567", make: "Peugeot", model: "208" },
  stampDuty: 1000,
};

describe("Lot 2 — copie figée et empreinte SHA-256", () => {
  it("same content → same fingerprint, whatever the key order (PostgreSQL jsonb reorders keys)", () => {
    const snap = buildQuoteSnapshot({ ...base, kind: "INITIAL", lines: [line("a", 100_000, { priority: "SAFETY" }), line("b", 50_000)], approvedLines: [] });
    const h = snapshotHash(snap);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshotHash(snap)).toBe(h);
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(snap).reverse())));
    expect(snapshotHash(reordered)).toBe(h);
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 1 }] })).toBe('{"a":[{"c":1,"d":2}],"b":1}');
    // Any change (one millime) changes the fingerprint.
    const changed = { ...snap, lines: [{ ...snap.lines[0]!, unitPrice: 100_001 }, snap.lines[1]!] };
    expect(snapshotHash(changed)).not.toBe(h);
  });

  it("initial quote: totals HT / VAT / stamp / TTC of its lines; supplement: no stamp, old total, new total", () => {
    const init = buildQuoteSnapshot({ ...base, kind: "INITIAL", lines: [line("a", 100_000), line("b", 50_000)], approvedLines: [] });
    expect(init.totals).toMatchObject({ totalHt: 150_000, totalTax: 28_500, stampDuty: 1000, totalTtc: 179_500 });
    expect(init.previousTtc).toBeNull();
    expect(init.lines[0]).toMatchObject({ id: "a", totalHt: 100_000, priority: null, partCondition: null });
    const sup = buildQuoteSnapshot({ ...base, kind: "SUPPLEMENT", version: 2, lines: [line("c", 30_000)], approvedLines: [line("a", 100_000)] });
    expect(sup.totals).toMatchObject({ stampDuty: 0, totalTtc: 35_700 });
    expect(sup.previousTtc).toBe(119_000 + 1000);
    expect(sup.newTotalTtc).toBe(130_000 + 24_700 + 1000);
  });
});

describe("Lot 2 — décision du client", () => {
  it("all → APPROVED, none → REFUSED, some → PARTIAL; accepted amount recomputed with the quote's stamp", () => {
    expect(decisionOf(3, 3)).toBe("APPROVED");
    expect(decisionOf(3, 0)).toBe("REFUSED");
    expect(decisionOf(3, 2)).toBe("PARTIAL");
    const snap = buildQuoteSnapshot({ ...base, kind: "INITIAL", lines: [line("a", 100_000), line("b", 50_000), line("c", 20_000)], approvedLines: [] });
    expect(approvedAmountTtc(snap, ["a", "c"])).toBe(120_000 + 22_800 + 1000);
    expect(approvedAmountTtc(snap, [])).toBe(0); // nothing accepted: no stamp either
  });
  it("accepted ids must belong to the quote; every other line is refused", () => {
    expect(splitDecision(["a", "b", "c"], ["c", "a"])).toEqual({ approved: ["a", "c"], refused: ["b"] });
    expect(splitDecision(["a", "b"], [])).toEqual({ approved: [], refused: ["a", "b"] });
    expect(splitDecision(["a", "b"], ["x"])).toBeNull();
  });
  it("a sent quote past its validity is expired; a decided one never is", () => {
    const past = new Date(Date.now() - 1000);
    expect(isExpired({ status: "SENT", validUntil: past })).toBe(true);
    expect(isExpired({ status: "SENT", validUntil: new Date(Date.now() + 60_000) })).toBe(false);
    expect(isExpired({ status: "APPROVED", validUntil: past })).toBe(false);
    expect(quoteNumber(2026, 7)).toBe("D2026-0007");
  });
});

describe("Lot 2 — droits et traductions", () => {
  it("recording an agreement: reception, workshop manager, admin — never a mechanic by default; in the access editor", () => {
    expect(ROLES.filter((r) => can(r, "recordQuoteApproval"))).toEqual(["ADMIN", "MANAGER", "RECEPTION"]);
    expect(Object.values(PERMISSION_GROUPS).flat().filter((p) => p === "recordQuoteApproval")).toHaveLength(1);
  });
  it("every Lot 2 text exists in fr / ar / en (statuses, channels, priorities, part conditions, errors, permission label)", () => {
    for (const d of [fr, ar, en]) {
      const q = d.v16.quote;
      for (const s of ["SENT", "APPROVED", "PARTIAL", "REFUSED", "EXPIRED", "SUPERSEDED"] as const) expect(q.status[s].length, s).toBeGreaterThan(2);
      for (const c of ["PORTAL", "PHONE", "IN_PERSON", "SMS", "EMAIL", "WHATSAPP"] as const) expect(q.channel[c].length, c).toBeGreaterThan(1);
      for (const p of ["SAFETY", "RECOMMENDED", "WATCH"] as const) expect(q.priority[p].length, p).toBeGreaterThan(2);
      for (const c of ["NEW", "USED", "EXCHANGE", "REUSED", "CUSTOMER_SUPPLIED"] as const) expect(q.condition[c].length, c).toBeGreaterThan(2);
      for (const k of ["approvalRequired", "noQuoteLines", "quoteHubOnly", "quoteChanged", "quoteExpired", "approverNameRequired", "pendingLines", "lineRefusedLocked", "legacyQuote"] as const) expect(d.errors[k].length, k).toBeGreaterThan(10);
      expect(d.v16.portalQuote.submit.length).toBeGreaterThan(3);
      expect(d.v103.access.perms.recordQuoteApproval.length).toBeGreaterThan(10);
    }
    expect(ar.v16.portalQuote.submit).not.toBe(fr.v16.portalQuote.submit);
  });
});
