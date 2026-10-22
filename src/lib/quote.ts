/**
 * V16 Lot 2 — versioned quote and line-by-line customer agreement: pure rules (no database), shared by the
 * server (src/server/quotes.ts), the pages and the unit tests. The SHA-256 fingerprint uses Node's crypto:
 * never import this file from a client component.
 */
import { createHash } from "node:crypto";
import type { ApprovalDecision, LineApprovalStatus, LinePriority, LineType, PartCondition, QuoteKind, QuoteStatus } from "@prisma/client";
import { computeTotals, lineTotalHt, type Totals } from "@/lib/format";

/** Validity printed on every quote (the existing text already says « Devis valable 15 jours »). */
export const QUOTE_VALID_DAYS = 15;
export const LINE_PRIORITIES = ["SAFETY", "RECOMMENDED", "WATCH"] as const satisfies readonly LinePriority[];
export const PART_CONDITIONS = ["NEW", "USED", "EXCHANGE", "REUSED", "CUSTOMER_SUPPLIED"] as const satisfies readonly PartCondition[];
export const STAFF_CHANNELS = ["PHONE", "IN_PERSON", "SMS", "EMAIL", "WHATSAPP"] as const;

/**
 * Lines that are (or may become) part of the work: not voided, not refused by the customer. Used by the
 * totals, documents and statistics. Work actually agreed = approvalStatus APPROVED (invoice, warranties…).
 */
export const LIVE_LINE = { voidedAt: null, approvalStatus: { not: "REFUSED" } } as const satisfies { voidedAt: null; approvalStatus: { not: LineApprovalStatus } };
export const AGREED_LINE = { voidedAt: null, approvalStatus: "APPROVED" } as const satisfies { voidedAt: null; approvalStatus: LineApprovalStatus };

export type QuoteSnapshotLine = {
  id: string;
  type: LineType;
  description: string;
  quantityX100: number;
  unitPrice: number;
  taxRateBp: number;
  totalHt: number;
  priority: LinePriority | null;
  partCondition: PartCondition | null;
};

export type QuoteSnapshot = {
  v: 1;
  number: string;
  version: number;
  kind: QuoteKind;
  workOrderNumber: number;
  sentAt: string;
  validUntil: string;
  customer: { name: string; phone: string };
  vehicle: { plate: string; make: string; model: string };
  lines: QuoteSnapshotLine[];
  /** Totals of THIS quote's lines (stamp duty on the initial quote only: it is charged once per invoice). */
  totals: Totals;
  /** Supplement: total TTC already accepted before, and the new total if everything is accepted. */
  previousTtc: number | null;
  newTotalTtc: number | null;
};

type SnapLineInput = Omit<QuoteSnapshotLine, "totalHt">;

/** Builds the frozen copy of a quote (amounts in millimes). */
export function buildQuoteSnapshot(input: {
  number: string;
  version: number;
  kind: QuoteKind;
  workOrderNumber: number;
  sentAt: Date;
  validUntil: Date;
  customer: { name: string; phone: string };
  vehicle: { plate: string; make: string; model: string };
  lines: SnapLineInput[];
  /** Lines already accepted before this quote (supplement): old total and new total. */
  approvedLines: { quantityX100: number; unitPrice: number; taxRateBp: number }[];
  stampDuty: number;
}): QuoteSnapshot {
  const lines = input.lines.map((l) => ({
    id: l.id,
    type: l.type,
    description: l.description,
    quantityX100: l.quantityX100,
    unitPrice: l.unitPrice,
    taxRateBp: l.taxRateBp,
    totalHt: lineTotalHt(l),
    priority: l.priority ?? null,
    partCondition: l.partCondition ?? null,
  }));
  const supplement = input.kind === "SUPPLEMENT";
  return {
    v: 1,
    number: input.number,
    version: input.version,
    kind: input.kind,
    workOrderNumber: input.workOrderNumber,
    sentAt: input.sentAt.toISOString(),
    validUntil: input.validUntil.toISOString(),
    customer: input.customer,
    vehicle: input.vehicle,
    lines,
    totals: computeTotals(lines, supplement ? 0 : input.stampDuty),
    previousTtc: supplement ? computeTotals(input.approvedLines, input.stampDuty).totalTtc : null,
    newTotalTtc: supplement ? computeTotals([...input.approvedLines, ...lines], input.stampDuty).totalTtc : null,
  };
}

/** JSON with keys sorted at every level: PostgreSQL (jsonb) reorders keys, the fingerprint must not depend on it. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** SHA-256 (hex) of the canonical JSON of a snapshot: same content → same fingerprint, whatever the key order. */
export function snapshotHash(snapshot: unknown): string {
  return createHash("sha256").update(canonicalJson(snapshot), "utf8").digest("hex");
}

/** The customer's decision from the accepted lines: all → APPROVED, none → REFUSED, else PARTIAL. */
export function decisionOf(total: number, approved: number): ApprovalDecision {
  if (approved <= 0) return "REFUSED";
  return approved >= total ? "APPROVED" : "PARTIAL";
}

export const quoteStatusOf = (d: ApprovalDecision): QuoteStatus => d;

/** TTC of the accepted lines of a quote (stamp duty only if the quote carried it and something is accepted). */
export function approvedAmountTtc(snapshot: Pick<QuoteSnapshot, "lines" | "totals">, approvedIds: Iterable<string>): number {
  const ids = new Set(approvedIds);
  const lines = snapshot.lines.filter((l) => ids.has(l.id));
  return computeTotals(lines, snapshot.totals.stampDuty).totalTtc;
}

/** Splits the customer's choice: accepted ids must belong to the quote; every other quote line is refused. */
export function splitDecision(quoteLineIds: string[], accepted: Iterable<string>): { approved: string[]; refused: string[] } | null {
  const all = new Set(quoteLineIds);
  const wanted = new Set(accepted);
  for (const id of wanted) if (!all.has(id)) return null;
  return { approved: quoteLineIds.filter((id) => wanted.has(id)), refused: quoteLineIds.filter((id) => !wanted.has(id)) };
}

/** A sent quote past its validity date (computed: the status stays SENT until a new version replaces it). */
export function isExpired(q: { status: QuoteStatus; validUntil: Date | null }, now = new Date()): boolean {
  return q.status === "SENT" && !!q.validUntil && q.validUntil.getTime() < now.getTime();
}

/** Quote number « D2026-0001 » (sequence quote-2026). */
export const quoteNumber = (year: number, seq: number) => `D${year}-${String(seq).padStart(4, "0")}`;
