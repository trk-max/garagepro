import { classifyComplaint, type ProblemCategory } from "@/lib/report-categories";
import { promiseKpi } from "@/lib/delays";
import type { AgedBalance } from "@/lib/billing";
import { buildKpis, type KpiRows } from "@/lib/lot5";

/**
 * Garage report: pure aggregation of rows loaded by server/reports.ts, so the
 * figures can be tested without a database. Money in millimes.
 */

export const REPORT_PERIODS = ["day", "week", "month", "quarter"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const PERIOD_DAYS: Record<ReportPeriod, number> = { day: 1, week: 7, month: 30, quarter: 90 };

export type ReportRows = {
  invoices: { totalHt: number; totalTtc: number; paidAmount: number; issuedAt: Date }[];
  /** V16 Lot 4 — credit notes issued in the period: deducted from the invoiced revenue (never counted twice). */
  creditNotes?: { totalHt: number; totalTtc: number; issuedAt: Date }[];
  /** V16 Lot 4 — aged balance of the invoices still owed (now). */
  aged?: AgedBalance;
  payments: { amount: number; method: string; paidAt: Date }[];
  /** Work orders created in the period. */
  created: {
    id: string;
    complaint: string;
    createdAt: Date;
    customerId: string;
    vehicleId: string;
    make: string;
    model: string;
    customerSince: Date;
    previousVisitAt: Date | null;
    /** V16 Lot 5 — linked to a previous order of the same vehicle (retour atelier). */
    comeback?: boolean;
  }[];
  /** Work orders delivered in the period. */
  delivered: { createdAt: Date; deliveredAt: Date; mechanicName: string | null; /** V16 Lot 3 */ promisedAt?: Date | null; promisedAtInitial?: Date | null }[];
  cancelled: number;
  inShopNow: number;
  /** Lines of the work orders invoiced in the period. */
  lines: { type: "LABOR" | "PART"; quantityX100: number; unitPrice: number; partId: string | null; partName: string | null; partCost: number | null; mechanicName: string | null }[];
  supplierInvoicesTtc: number;
  supplierPaid: number;
  outstandingNow: number;
  overdueNow: number;
  lowStockNow: number;
  appointments: { status: string }[];
  newCustomers: number;
  claims: { category: string; status: string; createdAt: Date; resolvedAt: Date | null }[];
  openClaimsNow: number;
  feedback: { rating: number; comment: string | null; name: string | null; plate: string | null; createdAt: Date }[];
  /** V16 Lot 5 — rows of the steering KPIs (absent = block not shown). */
  kpi?: Omit<KpiRows, "opened">;
};

const lineHt = (l: { quantityX100: number; unitPrice: number }) => Math.round((l.quantityX100 * l.unitPrice) / 100);
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

function top<K extends string>(counts: Map<K, number>, n: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function countBy<T, K extends string>(rows: T[], key: (r: T) => K | null) {
  const m = new Map<K, number>();
  for (const r of rows) {
    const k = key(r);
    if (k !== null) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Change in % against the previous period (null when there is nothing to compare). */
export function delta(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

export type Insight = { tone: "good" | "warn" | "info"; key: string; vars: Record<string, string | number> };

export function buildReport(rows: ReportRows, previous: Pick<ReportRows, "invoices" | "payments" | "creditNotes"> & { received: number }, opts: { start: Date; days: number; timeZone: string }) {
  // ── Money ──
  // V16 Lot 4: revenue = invoices of the period − credit notes of the period (an invoice and its credit note in
  // two periods: + then −; never twice).
  const credits = rows.creditNotes ?? [];
  const creditedTtc = sum(credits, (c) => c.totalTtc);
  const invoicedTtc = sum(rows.invoices, (i) => i.totalTtc) - creditedTtc;
  const invoicedHt = sum(rows.invoices, (i) => i.totalHt) - sum(credits, (c) => c.totalHt);
  const collected = sum(rows.payments, (p) => p.amount);
  const byMethod = [...countByAmount(rows.payments).entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount);
  const labourHt = sum(rows.lines.filter((l) => l.type === "LABOR"), lineHt);
  const partsHt = sum(rows.lines.filter((l) => l.type === "PART"), lineHt);
  const partsCost = sum(rows.lines.filter((l) => l.type === "PART" && l.partCost !== null), (l) => Math.round((l.quantityX100 * (l.partCost ?? 0)) / 100));
  const partsMargin = partsHt - partsCost;
  const labourHours = sum(rows.lines.filter((l) => l.type === "LABOR"), (l) => l.quantityX100) / 100;

  // Daily series (local days) for the bar chart.
  const series = Array.from({ length: opts.days }, (_, i) => {
    const day = new Date(opts.start.getTime() + i * 86_400_000);
    return { date: localDay(day, opts.timeZone), invoicedTtc: 0, received: 0 };
  });
  const index = new Map(series.map((s, i) => [s.date, i]));
  for (const inv of rows.invoices) {
    const i = index.get(localDay(inv.issuedAt, opts.timeZone));
    if (i !== undefined) series[i]!.invoicedTtc += inv.totalTtc;
  }
  for (const c of credits) {
    const i = index.get(localDay(c.issuedAt, opts.timeZone));
    if (i !== undefined) series[i]!.invoicedTtc -= c.totalTtc;
  }
  for (const wo of rows.created) {
    const i = index.get(localDay(wo.createdAt, opts.timeZone));
    if (i !== undefined) series[i]!.received += 1;
  }

  // ── Cars ──
  const received = rows.created.length;
  const delivered = rows.delivered.length;
  const turnaroundHours = delivered ? Math.round(sum(rows.delivered, (d) => d.deliveredAt.getTime() - d.createdAt.getTime()) / delivered / 3_600_000) : null;
  const returning = rows.created.filter((w) => w.previousVisitAt !== null).length;
  // Came back within 30 days of a previous visit (« revisites »: the former comeback heuristic, kept for reference).
  const revisits = rows.created.filter((w) => w.previousVisitAt && w.createdAt.getTime() - w.previousVisitAt.getTime() <= 30 * 86_400_000).length;
  // V16 Lot 5 — real comebacks: orders the team linked to a previous order of the same vehicle.
  const comebacks = rows.created.filter((w) => w.comeback).length;
  const topModels = top(countBy(rows.created, (w) => `${w.make} ${w.model}`.trim()), 6);
  const weekday = countBy(rows.created, (w) => String(localWeekday(w.createdAt, opts.timeZone)));
  const busiestDay = top(weekday, 1)[0];
  const appts = {
    total: rows.appointments.length,
    checkedIn: rows.appointments.filter((a) => a.status === "CHECKED_IN").length,
    cancelled: rows.appointments.filter((a) => a.status === "CANCELLED").length,
    noShow: rows.appointments.filter((a) => a.status === "NO_SHOW").length,
  };

  // ── Problems ──
  const problemCounts = countBy(rows.created, (w) => classifyComplaint(w.complaint));
  const problems = top(problemCounts as Map<ProblemCategory, number>, 14).map((p) => ({ ...p, share: pct(p.count, received) }));

  // ── Parts ──
  const partAgg = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const l of rows.lines) {
    if (l.type !== "PART" || !l.partId) continue;
    const a = partAgg.get(l.partId) ?? { name: l.partName ?? "?", qty: 0, revenue: 0 };
    a.qty += l.quantityX100 / 100;
    a.revenue += lineHt(l);
    partAgg.set(l.partId, a);
  }
  const topParts = [...partAgg.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);

  // ── Mechanics ──
  const mech = new Map<string, { name: string; delivered: number; hours: number; labourHt: number }>();
  const mechRow = (name: string | null) => {
    const k = name ?? "—";
    const r = mech.get(k) ?? { name: k, delivered: 0, hours: 0, labourHt: 0 };
    mech.set(k, r);
    return r;
  };
  for (const d of rows.delivered) mechRow(d.mechanicName).delivered++;
  for (const l of rows.lines.filter((x) => x.type === "LABOR")) {
    const r = mechRow(l.mechanicName);
    r.hours += l.quantityX100 / 100;
    r.labourHt += lineHt(l);
  }
  const mechanics = [...mech.values()].sort((a, b) => b.delivered - a.delivered || b.hours - a.hours);

  // ── Customers' voice ──
  const claimsByCategory = top(countBy(rows.claims, (c) => c.category), 7);
  const resolved = rows.claims.filter((c) => c.resolvedAt);
  const claimResolutionHours = resolved.length ? Math.round(sum(resolved, (c) => c.resolvedAt!.getTime() - c.createdAt.getTime()) / resolved.length / 3_600_000) : null;
  const ratings = rows.feedback.map((f) => f.rating);
  const avgRating = ratings.length ? Math.round((sum(ratings, (r) => r) / ratings.length) * 10) / 10 : null;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: ratings.filter((r) => r === star).length }));
  const satisfied = pct(ratings.filter((r) => r >= 4).length, ratings.length);

  // ── Comparison with the previous period ──
  const prevInvoiced = sum(previous.invoices, (i) => i.totalTtc) - sum(previous.creditNotes ?? [], (c) => c.totalTtc);
  const prevReceived = previous.received;
  const prevCollected = sum(previous.payments, (p) => p.amount);

  // ── Insights: what the owner should look at ──
  const insights: Insight[] = [];
  const dInv = delta(invoicedTtc, prevInvoiced);
  if (dInv !== null) insights.push({ tone: dInv >= 0 ? "good" : "warn", key: dInv >= 0 ? "revenueUp" : "revenueDown", vars: { pct: Math.abs(dInv) } });
  if (problems[0] && problems[0].count >= 2) insights.push({ tone: "info", key: "topProblem", vars: { problem: problems[0].key, share: problems[0].share } });
  if (revisits > 0) insights.push({ tone: "warn", key: "comebacks", vars: { n: revisits } });
  if (rows.overdueNow > 0) insights.push({ tone: "warn", key: "overdue", vars: { n: rows.overdueNow } });
  if (rows.lowStockNow > 0) insights.push({ tone: "warn", key: "lowStock", vars: { n: rows.lowStockNow } });
  if (rows.openClaimsNow > 0) insights.push({ tone: "warn", key: "openClaims", vars: { n: rows.openClaimsNow } });
  if (avgRating !== null) insights.push({ tone: avgRating >= 4 ? "good" : "warn", key: avgRating >= 4 ? "ratingGood" : "ratingLow", vars: { avg: avgRating } });
  if (partsHt > 0) insights.push({ tone: "info", key: "partsMargin", vars: { pct: pct(partsMargin, partsHt) } });
  if (busiestDay && received >= 5) insights.push({ tone: "info", key: "busiestDay", vars: { day: Number(busiestDay.key) } });
  if (appts.total >= 3 && appts.noShow + appts.cancelled > 0) insights.push({ tone: "info", key: "noShows", vars: { pct: pct(appts.noShow + appts.cancelled, appts.total) } });
  if (received > 0) insights.push({ tone: "info", key: "returning", vars: { pct: pct(returning, received) } });

  return {
    money: {
      invoicedTtc,
      invoicedHt,
      invoices: rows.invoices.length,
      avgTicket: rows.invoices.length ? Math.round(sum(rows.invoices, (i) => i.totalTtc) / rows.invoices.length) : 0,
      // V16 Lot 4
      credits: { count: credits.length, ttc: creditedTtc },
      aged: rows.aged ?? null,
      collected,
      byMethod,
      labourHt,
      partsHt,
      partsCost,
      partsMargin,
      labourHours,
      supplierInvoicesTtc: rows.supplierInvoicesTtc,
      supplierPaid: rows.supplierPaid,
      cashBalance: collected - rows.supplierPaid,
      outstandingNow: rows.outstandingNow,
      overdueNow: rows.overdueNow,
      deltaInvoiced: dInv,
      deltaCollected: delta(collected, prevCollected),
    },
    cars: {
      received,
      delivered,
      cancelled: rows.cancelled,
      inShopNow: rows.inShopNow,
      turnaroundHours,
      returning,
      newCustomers: rows.newCustomers,
      comebacks,
      revisits,
      topModels,
      deltaReceived: delta(received, prevReceived),
      appointments: appts,
      // V16 Lot 3 — « livré à la date promise initiale » (and, for comparison, the current promise).
      promise: promiseKpi(rows.delivered),
    },
    series,
    problems,
    topParts,
    lowStockNow: rows.lowStockNow,
    mechanics,
    claims: { total: rows.claims.length, open: rows.openClaimsNow, byCategory: claimsByCategory, resolutionHours: claimResolutionHours },
    feedback: { count: ratings.length, avgRating, distribution, satisfied, latest: rows.feedback.slice(0, 6) },
    insights,
    // V16 Lot 5 — steering KPIs (real data only; null = « — »).
    kpis: rows.kpi
      ? buildKpis({ ...rows.kpi, opened: rows.created.map((w) => ({ comeback: !!w.comeback })) }, { invoicedHt, invoices: rows.invoices.length }, appts)
      : null,
  };
}

export type Report = ReturnType<typeof buildReport>;

function countByAmount(payments: { amount: number; method: string }[]) {
  const m = new Map<string, number>();
  for (const p of payments) m.set(p.method, (m.get(p.method) ?? 0) + p.amount);
  return m;
}

/** "2026-10-15" in the garage's time zone. */
export function localDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** 0 = Sunday … 6 = Saturday, in the garage's time zone. */
export function localWeekday(d: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}
