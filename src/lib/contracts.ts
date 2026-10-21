import type { Role } from "@prisma/client";
import { addDaysToDay, addMonthsToDay } from "@/lib/warranty";
import type { PermSubject } from "@/lib/permissions";

/**
 * Contracts (V9.0, Prompt 5/5) — pure rules, unit-tested in tests/contracts.test.ts.
 * Tunisia only. Dates are garage days "YYYY-MM-DD" (Africa/Tunis), the last day included.
 *
 * What the software never does:
 * - an electronic signature (Law 2000-83 needs an ANCE-certified provider): the contract is
 *   printed, signed and stamped by hand, then the signed scan is archived;
 * - an automatic renewal: a renewal is a NEW contract, linked to the previous one, with its
 *   legal basis written down;
 * - say "compliant": a template version is "to be validated by a lawyer" until an
 *   administrator records that a lawyer reviewed it (who / when, audited).
 */

export const CONTRACT_CATEGORIES = ["REPAIR", "FLEET", "EMPLOYMENT", "SUPPLIER", "BLANK"] as const;
export type ContractCategory = (typeof CONTRACT_CATEGORIES)[number];
export const isContractCategory = (c: unknown): c is ContractCategory => typeof c === "string" && (CONTRACT_CATEGORIES as readonly string[]).includes(c);

export const CONTRACT_STATUSES = ["DRAFT", "VALIDATION", "LEGAL_REVIEW", "APPROVED", "PENDING_SIGNATURE", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED", "ARCHIVED"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const isContractStatus = (s: unknown): s is ContractStatus => typeof s === "string" && (CONTRACT_STATUSES as readonly string[]).includes(s);

export const REVIEW_STATUSES = ["NEEDS_LEGAL_REVIEW", "REVIEWED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Date of the legal research behind every template (docs/PLAN-CONTRATS-SHOWROOM.md §2). */
export const LEGAL_VERIFIED_DAY = "2026-10-21";

// ── Who sees / manages / approves what (checked on the SERVER) ───────────────

/**
 * Per category:
 * - view: list, open, PDF, signed scan;
 * - manage: create, edit the draft, submit, send for signature, upload the signed scan, renew;
 * - approve: VALIDATION / LEGAL_REVIEW → APPROVED, terminate, archive.
 * Employment contracts (salary, ID number): administrator + HR ONLY — the manager does not see
 * them (decision documented in docs/CONTRATS.md). The page permission is viewContracts.
 */
export const CONTRACT_ACCESS: Record<ContractCategory, { view: readonly Role[]; manage: readonly Role[]; approve: readonly Role[] }> = {
  REPAIR: { view: ["ADMIN", "MANAGER", "RECEPTION", "ACCOUNTANT"], manage: ["ADMIN", "MANAGER", "RECEPTION"], approve: ["ADMIN", "MANAGER"] },
  FLEET: { view: ["ADMIN", "MANAGER", "RECEPTION", "ACCOUNTANT"], manage: ["ADMIN", "MANAGER", "RECEPTION"], approve: ["ADMIN", "MANAGER"] },
  EMPLOYMENT: { view: ["ADMIN", "HR"], manage: ["ADMIN", "HR"], approve: ["ADMIN", "HR"] },
  SUPPLIER: { view: ["ADMIN", "MANAGER", "ACCOUNTANT"], manage: ["ADMIN", "MANAGER"], approve: ["ADMIN", "MANAGER"] },
  BLANK: { view: ["ADMIN", "MANAGER", "ACCOUNTANT"], manage: ["ADMIN", "MANAGER"], approve: ["ADMIN"] },
};

type Access = "view" | "manage" | "approve";
/**
 * V10.3 — per-employee overrides (see src/lib/permissions.ts) map onto contracts like this:
 * - DENY viewContracts: no contract at all, whatever the category;
 * - GRANT viewContracts (role without it): READ the non-employment categories
 *   (repair, fleet, supplier, blank). Managing / approving and employment contracts stay role-based
 *   (salaries and ID numbers are never opened by an override).
 * A bare role keeps the historic role-only answer.
 */
export function canContract(subject: PermSubject, category: string, access: Access): boolean {
  if (!subject || !isContractCategory(category)) return false;
  const role = typeof subject === "string" ? subject : subject.role;
  const perms = typeof subject === "string" ? null : subject.perms;
  if (perms?.deny.includes("viewContracts")) return false;
  if ((CONTRACT_ACCESS[category][access] as readonly Role[]).includes(role)) return true;
  return !!perms?.grant.includes("viewContracts") && access === "view" && category !== "EMPLOYMENT";
}
export function contractCategoriesFor(subject: PermSubject, access: Access): ContractCategory[] {
  return CONTRACT_CATEGORIES.filter((c) => canContract(subject, c, access));
}

// ── Status machine ───────────────────────────────────────────────────────────

/**
 * DRAFT → VALIDATION → (LEGAL_REVIEW →) APPROVED → PENDING_SIGNATURE → SIGNED → ACTIVE → EXPIRED | TERMINATED → ARCHIVED.
 * - SIGNED is reached ONLY by uploading the signed scan (never by a button);
 * - back to DRAFT from the steps before signature (correction);
 * - EXPIRED only once the end date has passed; TERMINATED needs a reason;
 * - a draft can be abandoned (ARCHIVED). ARCHIVED is final.
 */
export const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  DRAFT: ["VALIDATION", "ARCHIVED"],
  VALIDATION: ["DRAFT", "LEGAL_REVIEW", "APPROVED"],
  LEGAL_REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: ["DRAFT", "PENDING_SIGNATURE"],
  PENDING_SIGNATURE: ["DRAFT", "SIGNED"],
  SIGNED: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["EXPIRED", "TERMINATED"],
  EXPIRED: ["ARCHIVED"],
  TERMINATED: ["ARCHIVED"],
  ARCHIVED: [],
};

/** Which access each target status needs. */
export function accessForMove(to: ContractStatus): Access {
  return to === "APPROVED" || to === "TERMINATED" || to === "ARCHIVED" ? "approve" : "manage";
}

export type MoveContext = {
  /** Template not reviewed by a lawyer, CDD, risk of disguised employment… (see contractFlags). */
  needsLegalReview: boolean;
  hasScan: boolean;
  /** Last day of the contract, null = no end (CDI, repair). */
  endDay: string | null;
  today: string;
  /** Required fields still empty (checked when the draft is submitted). */
  missing: string[];
  reason?: string | null;
};

export type MoveError = "contractTransition" | "contractLegalReview" | "contractScanMissing" | "contractNotEnded" | "contractMissingFields" | "reasonRequired";

/** null = allowed; otherwise the error code (dictionary key) explaining why not. */
export function checkMove(from: string, to: string, ctx: MoveContext): MoveError | null {
  if (!isContractStatus(from) || !isContractStatus(to) || !CONTRACT_TRANSITIONS[from].includes(to)) return "contractTransition";
  if (from === "DRAFT" && to === "VALIDATION" && ctx.missing.length > 0) return "contractMissingFields";
  if (from === "VALIDATION" && to === "APPROVED" && ctx.needsLegalReview) return "contractLegalReview";
  if (to === "SIGNED" && !ctx.hasScan) return "contractScanMissing";
  if (to === "EXPIRED" && (ctx.endDay === null || ctx.today <= ctx.endDay)) return "contractNotEnded";
  if (to === "TERMINATED" && (ctx.reason ?? "").trim().length < 3) return "reasonRequired";
  return null;
}

/** Only a draft can be edited (fields, dates, parties). */
export const isEditable = (status: string) => status === "DRAFT";

// ── Dates ────────────────────────────────────────────────────────────────────

/** Last day of a contract of N months starting on startDay: 2026-10-21 + 12 months → 2027-10-20. */
export function endDayAfterMonths(startDay: string, months: number): string {
  return addDaysToDay(addMonthsToDay(startDay, months), -1);
}

export type DatesInput = { startDay: string; endDay?: string | null; durationMonths?: number | null; indefinite?: boolean };
export type Dates = { startDay: string; endDay: string | null; durationMonths: number | null; indefinite: boolean };

/**
 * Contract dates. Indefinite (CDI) = no end date at all, never a fictitious expiry.
 * A duration in months gives the end date unless an explicit end date is typed (it wins).
 * Returns "contractDates" when the end is before the start, or an indefinite contract has an end.
 */
export function computeDates(d: DatesInput): Dates | "contractDates" | "contractCdiEnd" {
  if (d.indefinite) {
    if (d.endDay || d.durationMonths) return "contractCdiEnd";
    return { startDay: d.startDay, endDay: null, durationMonths: null, indefinite: true };
  }
  const months = d.durationMonths && d.durationMonths > 0 ? Math.trunc(d.durationMonths) : null;
  const endDay = d.endDay || (months ? endDayAfterMonths(d.startDay, months) : null);
  if (endDay !== null && endDay < d.startDay) return "contractDates";
  return { startDay: d.startDay, endDay, durationMonths: months, indefinite: false };
}

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

export type Expiry = { state: "NONE" | "OK" | "SOON" | "PAST"; daysLeft: number | null };

/**
 * Expiry of a running contract (SIGNED / ACTIVE): SOON when the last day is within `windowDays`
 * (today included), PAST when it has passed while the contract is still marked running.
 * No end date, or a contract not running → NONE.
 */
export function expiryOf(c: { status: string; endDay: string | null }, today: string, windowDays: number): Expiry {
  if (c.endDay === null || (c.status !== "SIGNED" && c.status !== "ACTIVE")) return { state: "NONE", daysLeft: null };
  const daysLeft = dayNumber(c.endDay) - dayNumber(today);
  if (daysLeft < 0) return { state: "PAST", daysLeft };
  return { state: daysLeft <= Math.max(0, windowDays) ? "SOON" : "OK", daysLeft };
}

export const CONTRACT_ALERT_LIMITS = { min: 1, max: 365 } as const;

// ── Template fields ──────────────────────────────────────────────────────────

export type FieldType = "text" | "textarea" | "money" | "number" | "date" | "select";
export type TemplateField = {
  key: string;
  type: FieldType;
  required: boolean;
  options?: readonly string[];
  /** Pre-filled value (French text of the document). */
  default?: string;
  /** Only asked (and only required) when another field has this value. */
  showIf?: { key: string; equals: string };
  min?: number;
  max?: number;
};
export type TemplateClause = { key: string; title: string; body: string; required: boolean; showIf?: { key: string; equals: string } };

export const fieldShown = (f: { showIf?: { key: string; equals: string } }, data: Record<string, string>) => !f.showIf || (data[f.showIf.key] ?? "") === f.showIf.equals;

const MONEY = /^\d{1,9}([.,]\d{1,3})?$/;
const DAY = /^(20\d\d|2100)-\d{2}-\d{2}$/;

/**
 * Keeps only the template's fields, as trimmed strings (4000 characters max). Values that do not
 * match their type are dropped (an empty required field is then reported by missingFields).
 */
export function cleanData(fields: readonly TemplateField[], raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (typeof v !== "string") continue;
    const s = v.trim().slice(0, 4000);
    if (s === "") continue;
    if (f.type === "money" && !MONEY.test(s.replace(/\s/g, ""))) continue;
    if (f.type === "date" && !DAY.test(s)) continue;
    if (f.type === "number") {
      const n = Number(s.replace(",", "."));
      if (!Number.isInteger(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) continue;
    }
    if (f.type === "select" && f.options && !f.options.includes(s)) continue;
    out[f.key] = f.type === "money" ? s.replace(/\s/g, "").replace(",", ".") : s;
  }
  return out;
}

/** Required fields (shown ones only) still empty. */
export function missingFields(fields: readonly TemplateField[], data: Record<string, string>): string[] {
  return fields.filter((f) => f.required && fieldShown(f, data) && !(data[f.key] ?? "").trim()).map((f) => f.key);
}

/** Template defaults merged under what was typed (typed values win). */
export function withDefaults(fields: readonly TemplateField[], data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) if (f.default !== undefined) out[f.key] = f.default;
  return { ...out, ...data };
}

/** Clauses printed: those that apply (showIf), required ones always, optional ones unless excluded. */
export function includedClauses(clauses: readonly TemplateClause[], excluded: readonly string[], data: Record<string, string> = {}): TemplateClause[] {
  return clauses.filter((c) => fieldShown(c, data) && (c.required || !excluded.includes(c.key)));
}

/** "{{salary}}" → value; unknown or empty placeholders become "……" (to fill by hand, never invented). */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (values[k] ?? "").trim() || "……");
}

// ── Employment (Labour Code as amended by Law 2025-9) ────────────────────────

export const CDD_REASONS = ["SURCROIT", "REMPLACEMENT", "SAISONNIER"] as const;
export type CddReason = (typeof CDD_REASONS)[number];
export const PROBATION_MAX_MONTHS = 6;

export type EmploymentInput = {
  employmentType?: string;
  cddReason?: string;
  replacedEmployee?: string;
  probationMonths?: string;
  probationRenewable?: string;
  endDay: string | null;
  durationMonths: number | null;
};

export type EmploymentError =
  | "contractCddReason"
  | "contractCddEnd"
  | "contractCddProbation"
  | "contractCdiEnd"
  | "contractProbation"
  | "contractReplaced";

/**
 * Art. 6-2: CDI by default (missing type → CDI). Art. 6-4: CDD ONLY for one of the three reasons,
 * written, with an end date, and without probation. Art. 6-3: probation at most 6 months,
 * renewable once (CDI only). A CDI has no end date — never a fictitious 1-year expiry.
 */
export function employmentErrors(e: EmploymentInput): EmploymentError[] {
  const type = e.employmentType === "CDD" ? "CDD" : "CDI";
  const errors: EmploymentError[] = [];
  const probation = e.probationMonths ? Number(e.probationMonths) : 0;
  if (type === "CDI") {
    if (e.endDay || e.durationMonths) errors.push("contractCdiEnd");
    if (!Number.isInteger(probation) || probation < 0 || probation > PROBATION_MAX_MONTHS) errors.push("contractProbation");
    if (e.probationRenewable && e.probationRenewable !== "YES" && e.probationRenewable !== "NO") errors.push("contractProbation");
    if (e.probationRenewable === "YES" && probation === 0) errors.push("contractProbation");
  } else {
    if (!(CDD_REASONS as readonly string[]).includes(e.cddReason ?? "")) errors.push("contractCddReason");
    if (e.cddReason === "REMPLACEMENT" && !(e.replacedEmployee ?? "").trim()) errors.push("contractReplaced");
    if (!e.endDay) errors.push("contractCddEnd");
    if (probation !== 0 || e.probationRenewable === "YES") errors.push("contractCddProbation");
  }
  return errors;
}

// ── Supplier / partner: disguised employment (Labour Code art. 28-30) ────────

/** Supplier kinds where the partner WORKS for the garage (not just delivers goods). */
export const SERVICE_SUBTYPES = ["SPECIALIZED_GARAGE", "BODYWORK_PAINT", "SERVICE_PROVIDER", "OTHER"] as const;

export type DisguisedSign = "subordination" | "coreActivity" | "noExpertise" | "exclusiveFullTime";

/**
 * Labour subcontracting is banned; a service contract is acceptable only for specialised expertise,
 * outside the garage's main activity, without subordination. Each answer pointing the other way is
 * returned: one sign is enough to show the warning and require a legal review.
 */
export function disguisedEmploymentSigns(subtype: string | null | undefined, data: Record<string, string>): DisguisedSign[] {
  if (!subtype || !(SERVICE_SUBTYPES as readonly string[]).includes(subtype)) return [];
  const signs: DisguisedSign[] = [];
  if (data.subordination === "YES") signs.push("subordination");
  if (data.coreActivity === "YES") signs.push("coreActivity");
  if (data.specializedExpertise === "NO") signs.push("noExpertise");
  if (data.exclusiveFullTime === "YES") signs.push("exclusiveFullTime");
  return signs;
}

// ── Flags → legal review ─────────────────────────────────────────────────────

export type ContractFlag = "TEMPLATE_NOT_REVIEWED" | "CDD" | "DISGUISED_EMPLOYMENT_RISK" | "RENEWAL";

/**
 * Reasons why a lawyer / HR must look at the contract before approval. Anything not verified is
 * flagged: every template stays NEEDS_LEGAL_REVIEW until an administrator records a review.
 */
export function contractFlags(c: { category: string; subtype?: string | null; templateReviewStatus: string; data: Record<string, string>; isRenewal?: boolean }): ContractFlag[] {
  const flags: ContractFlag[] = [];
  if (c.templateReviewStatus !== "REVIEWED") flags.push("TEMPLATE_NOT_REVIEWED");
  if (c.category === "EMPLOYMENT" && c.data.employmentType === "CDD") flags.push("CDD");
  if (c.category === "SUPPLIER" && disguisedEmploymentSigns(c.subtype, c.data).length > 0) flags.push("DISGUISED_EMPLOYMENT_RISK");
  if (c.isRenewal) flags.push("RENEWAL");
  return flags;
}

// ── Numbering & files ────────────────────────────────────────────────────────

export const contractNumber = (year: number, seq: number) => `CTR-${year}-${String(seq).padStart(4, "0")}`;

/** Deterministic template id: the same row on the garage PC and online (hub sync). */
export const templateId = (code: string, version: number) => `tpl-${code.toLowerCase().replace(/_/g, "-")}-v${version}`;
export const TEMPLATE_ID = /^tpl-[a-z0-9-]{2,60}-v\d{1,4}$/;

export const MAX_SCAN_BYTES = 10 * 1024 * 1024;

/** Signed scan: PDF, JPEG or PNG, recognised by its first bytes (never by the browser's MIME type). */
export function sniffScan(buf: Uint8Array): { contentType: string; ext: string } | null {
  if (buf.length < 8) return null;
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) return { contentType: "application/pdf", ext: "pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => buf[i] === b)) return { contentType: "image/png", ext: "png" };
  return null;
}
