import type { ComebackCategory, InspectionColor, LaborKind, LinePriority, WorkOrderStatus } from "@prisma/client";

/**
 * V16 Lot 5 — qualité, suivi et pilotage: pure rules (unit-tested in tests/lot5-v16.test.ts), used by
 * server/quality.ts, server/comebacks.ts, server/inspections.ts, server/reminders.ts and lib/report.ts.
 */

const DAY = 86_400_000;

// ── Quality check ─────────────────────────────────────────────────────────────

/** A point added in Paramètres › Parcours atelier, on top of the 6 fixed points (columns of QualityCheck). */
export type QualityPoint = { key: string; label: string };
/** Results of those points, with the label copied at the time of the check. */
export type ExtraResults = Record<string, { label: string; ok: boolean }>;

export const MAX_QUALITY_POINTS = 40;

/** Keeps only well-formed points (setting is Json): unique keys, trimmed labels, at most 40. */
export function parseQualityPoints(raw: unknown): QualityPoint[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: QualityPoint[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const key = String((p as { key?: unknown }).key ?? "").trim();
    const label = String((p as { label?: unknown }).label ?? "").trim().slice(0, 120);
    if (!/^[a-z0-9-]{1,40}$/.test(key) || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label });
    if (out.length >= MAX_QUALITY_POINTS) break;
  }
  return out;
}

/** Settings form: one label per line → points with stable keys (same label = same key, so results survive). */
export function pointsFromLines(text: string): QualityPoint[] {
  const labels = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const used = new Set<string>();
  const points: QualityPoint[] = [];
  for (const label of labels) {
    let key = slug(label) || "point";
    for (let i = 2; used.has(key); i++) key = `${slug(label) || "point"}-${i}`;
    used.add(key);
    points.push({ key, label: label.slice(0, 120) });
    if (points.length >= MAX_QUALITY_POINTS) break;
  }
  return points;
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

export function parseExtraResults(raw: unknown): ExtraResults {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ExtraResults = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === "object") out[k] = { label: String((v as { label?: unknown }).label ?? k), ok: (v as { ok?: unknown }).ok === true };
  }
  return out;
}

/** Every configured point ticked (orders of Lot 5 on; older orders: never required). */
export function extraPointsComplete(points: QualityPoint[], results: ExtraResults): boolean {
  return points.every((p) => results[p.key]?.ok === true);
}

export const ROAD_TEST_KM_MAX = 500;

/** Lot 5 orders: the road test done → its distance (1–500 km) is mandatory. */
export function roadTestKmMissing(input: { workflowLot5: boolean; roadTest: string | null; roadTestKm: number | null | undefined }): boolean {
  if (!input.workflowLot5 || input.roadTest !== "DONE") return false;
  return !input.roadTestKm || input.roadTestKm < 1 || input.roadTestKm > ROAD_TEST_KM_MAX;
}

// ── Back to the workshop after the quality check (reprise) ───────────────────

export const REWORK_CAUSES = ["INCOMPLETE", "WORKMANSHIP", "PART_DEFECT", "ROAD_TEST", "CLEANLINESS", "OTHER"] as const;
export type ReworkCause = (typeof REWORK_CAUSES)[number];
export const isReworkCause = (v: unknown): v is ReworkCause => typeof v === "string" && (REWORK_CAUSES as readonly string[]).includes(v);

/** Quality check (or ready car) sent back to the workshop: a rework. */
export function isReworkMove(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return to === "IN_PROGRESS" && (from === "QUALITY_CONTROL" || from === "WASHING" || from === "READY");
}

/**
 * Rework counter, computed from the status events (append-only): no shared counter column that a « latest change
 * wins » synchronisation could overwrite.
 */
export function reworkCount(events: { type: string; data: unknown }[]): number {
  return events.filter((e) => {
    if (e.type !== "STATUS_CHANGED" || !e.data || typeof e.data !== "object") return false;
    const d = e.data as { from?: WorkOrderStatus; to?: WorkOrderStatus };
    return !!d.from && !!d.to && isReworkMove(d.from, d.to);
  }).length;
}

// ── Comeback (retour atelier) ────────────────────────────────────────────────

export const COMEBACK_WINDOW_DAYS = 30;
export const COMEBACK_CATEGORIES: ComebackCategory[] = ["SAME_FAULT", "WORKMANSHIP", "PART_FAILURE", "OTHER"];

/**
 * The previous order of the same vehicle this new order may redo: the latest one delivered less than 30 days
 * before the new order was opened (never the order itself, never a cancelled one).
 */
export function comebackCandidate<T extends { id: string; deliveredAt: Date | null }>(order: { id: string; createdAt: Date }, previous: T[]): T | null {
  const cands = previous
    .filter((p) => p.id !== order.id && p.deliveredAt && p.deliveredAt <= order.createdAt && order.createdAt.getTime() - p.deliveredAt.getTime() < COMEBACK_WINDOW_DAYS * DAY)
    .sort((a, b) => b.deliveredAt!.getTime() - a.deliveredAt!.getTime());
  return cands[0] ?? null;
}

/**
 * Labour added to an order linked as a comeback is rework: not billed by default (0 DT), billed only when someone
 * allowed to ticks « facturer cette main-d'œuvre ». Parts are always billed as usual.
 */
export function reworkLine(input: { comeback: boolean; type: "LABOR" | "PART"; unitPrice: number; bill: boolean }): { unitPrice: number; isRework: boolean } {
  if (!input.comeback || input.type !== "LABOR") return { unitPrice: input.unitPrice, isRework: false };
  return { unitPrice: input.bill ? input.unitPrice : 0, isRework: true };
}

// ── Inspection ───────────────────────────────────────────────────────────────

/** A red point is a safety matter, an orange one is recommended; a green one is never turned into a quote line. */
export function priorityForColor(color: InspectionColor | null): LinePriority | null {
  if (color === "RED") return "SAFETY";
  if (color === "ORANGE") return "RECOMMENDED";
  return null;
}

export type TemplatePoint = QualityPoint;
export const parseTemplatePoints = parseQualityPoints;

// ── Customer follow-up ───────────────────────────────────────────────────────

export const SURVEY_AFTER_DAYS = 3;
/** The tracker (where the rating form is) stays open 7 days after the delivery: no survey after that. */
export const SURVEY_UNTIL_DAYS = 7;
export const LOW_RATING = 3;

/** Satisfaction survey due: delivered 3 to 7 days ago. */
export function surveyDue(deliveredAt: Date | null, now: Date): boolean {
  if (!deliveredAt) return false;
  const age = now.getTime() - deliveredAt.getTime();
  return age >= SURVEY_AFTER_DAYS * DAY && age < SURVEY_UNTIL_DAYS * DAY;
}

export const isLowRating = (rating: number) => rating <= LOW_RATING;

/** Refused lines reminder level from the delivery: 30 days, then 90 days; nothing after 120 days (too late). */
export function refusedReminderLevel(deliveredAt: Date | null, now: Date): 30 | 90 | null {
  if (!deliveredAt) return null;
  const days = Math.floor((now.getTime() - deliveredAt.getTime()) / DAY);
  if (days >= 90 && days <= 120) return 90;
  if (days >= 30 && days < 90) return 30;
  return null;
}

// ── Labour entries ───────────────────────────────────────────────────────────

export const LABOR_KINDS: LaborKind[] = ["DIAGNOSIS", "WORK", "REWORK", "WARRANTY"];
export const isLaborKind = (v: unknown): v is LaborKind => typeof v === "string" && (LABOR_KINDS as string[]).includes(v);

// ── KPIs (pilotage) ──────────────────────────────────────────────────────────

/** Share in % (one decimal), or null when there is nothing to compute (« — » on the page). */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export type KpiRows = {
  /** Decided lines (APPROVED / REFUSED) of the quotes sent in the period, without announced fees. */
  quoteLines: { approvalStatus: "APPROVED" | "REFUSED"; amountHt: number }[];
  /** Work orders opened in the period: linked as a comeback or not. */
  opened: { comeback: boolean }[];
  /** Labour hours sold (invoiced in the period) per mechanic id (null = no mechanic). */
  soldHours: { mechanicId: string | null; name: string | null; hours: number }[];
  /** Hours clocked on repairs (chronometers) in the period per user. */
  clocked: { userId: string; name: string; hours: number }[];
};

export function buildKpis(rows: KpiRows, money: { invoicedHt: number; invoices: number }, appts: { total: number; noShow: number; cancelled: number }) {
  const approved = rows.quoteLines.filter((l) => l.approvalStatus === "APPROVED");
  const amountAll = rows.quoteLines.reduce((s, l) => s + l.amountHt, 0);
  const amountApproved = approved.reduce((s, l) => s + l.amountHt, 0);
  const comebacks = rows.opened.filter((o) => o.comeback).length;
  // Efficiency per technician: hours sold / hours clocked (only people who clocked time).
  const sold = new Map<string, number>();
  for (const s of rows.soldHours) if (s.mechanicId) sold.set(s.mechanicId, (sold.get(s.mechanicId) ?? 0) + s.hours);
  const technicians = rows.clocked
    .map((c) => ({ userId: c.userId, name: c.name, clocked: round1(c.hours), sold: round1(sold.get(c.userId) ?? 0), efficiency: c.hours > 0 ? rate(sold.get(c.userId) ?? 0, c.hours) : null }))
    .sort((a, b) => b.clocked - a.clocked);
  const soldTotal = rows.soldHours.reduce((s, r) => s + r.hours, 0);
  const clockedTotal = rows.clocked.reduce((s, r) => s + r.hours, 0);
  const noShowBase = appts.total - appts.cancelled;
  return {
    lineApproval: { rate: rate(approved.length, rows.quoteLines.length), decided: rows.quoteLines.length, approved: approved.length, amountRate: rate(amountApproved, amountAll) },
    // ARO (average repair order): revenue HT net of credit notes / invoices of the period.
    aro: money.invoices > 0 ? Math.round(money.invoicedHt / money.invoices) : null,
    comeback: { rate: rate(comebacks, rows.opened.length), count: comebacks, opened: rows.opened.length },
    efficiency: { rate: clockedTotal > 0 ? rate(soldTotal, clockedTotal) : null, sold: round1(soldTotal), clocked: round1(clockedTotal), technicians },
    // No-show: appointments of the period not honoured / appointments that were kept on the agenda (not cancelled).
    noShow: { rate: rate(appts.noShow, noShowBase), count: appts.noShow, base: Math.max(0, noShowBase) },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
