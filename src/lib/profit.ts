/**
 * Real profit of one repair (pure, amounts in millimes, all excl. VAT).
 *
 *   Revenue (CA HT)    = the invoice's total excl. VAT (stamp duty and VAT are taxes, not revenue).
 *                        Not invoiced yet → the work order lines, flagged "not invoiced".
 *   Direct costs       = parts used (purchase cost) + expenses tied to the repair.
 *   Gross margin       = revenue − direct costs.
 *   Labour cost        = hours really worked by each mechanic (person-hours, from the
 *                        chronometers) × that person's hourly cost — NEVER the billed hours.
 *   Overhead           = configured share (% of revenue, or an amount per person-hour).
 *   Estimated profit   = gross margin − labour cost − overhead.
 *
 * No double counting: a part is counted once, from the work order line that
 * consumed it (stock movements are not added on top; a removed line is gone).
 * Collections (payments, by payer) are cash, shown apart, never added to revenue.
 * Every guess is listed in `flags`, so an estimated figure is never shown as exact.
 */
export type ProfitFlag =
  | "notInvoiced" // revenue taken from the lines, no invoice yet
  | "partCostEstimated" // a part line has no cost snapshot: today's purchase price used
  | "partCostUnknown" // a part line without stock part and without cost: counted 0
  | "laborRateMissing" // someone worked on it but no hourly cost is configured
  | "laborRunning" // a chronometer is still running: time counted up to now
  | "noLaborRecorded"; // labour lines billed but no time recorded

export type ProfitLine = { type: "LABOR" | "PART"; quantityX100: number; unitPrice: number; unitCost: number | null; currentPartCost: number | null; hasPart: boolean };
export type ProfitLabor = { userId: string; minutes: number; hourlyCost: number | null; running: boolean };
export type OverheadMode = "NONE" | "PERCENT_REVENUE" | "PER_LABOR_HOUR";

export type ProfitInput = {
  invoiceTotalHt: number | null;
  lines: ProfitLine[];
  expenses: number[];
  labor: ProfitLabor[];
  garageHourlyCost: number;
  overhead: { mode: OverheadMode; value: number };
  payments: { amount: number; payer: string }[];
};

export type Profit = {
  revenue: number;
  partsCost: number;
  expenses: number;
  directCosts: number;
  grossMargin: number;
  laborMinutes: number;
  laborCost: number;
  overhead: number;
  profit: number;
  /** Profit ÷ revenue, in basis points; null when there is no revenue. */
  marginBp: number | null;
  collected: { customer: number; insurance: number; total: number };
  flags: ProfitFlag[];
};

const lineAmount = (qtyX100: number, unit: number) => Math.round((qtyX100 * unit) / 100);

export function computeProfit(input: ProfitInput): Profit {
  const flags = new Set<ProfitFlag>();

  const linesRevenue = input.lines.reduce((s, l) => s + lineAmount(l.quantityX100, l.unitPrice), 0);
  let revenue = linesRevenue;
  if (input.invoiceTotalHt !== null) revenue = input.invoiceTotalHt;
  else if (input.lines.length > 0) flags.add("notInvoiced");

  let partsCost = 0;
  for (const l of input.lines) {
    if (l.type !== "PART") continue;
    if (l.unitCost !== null) partsCost += lineAmount(l.quantityX100, l.unitCost);
    else if (l.hasPart && l.currentPartCost !== null) {
      partsCost += lineAmount(l.quantityX100, l.currentPartCost);
      flags.add("partCostEstimated");
    } else flags.add("partCostUnknown");
  }

  const expenses = input.expenses.reduce((s, a) => s + a, 0);
  const directCosts = partsCost + expenses;

  let laborMinutes = 0;
  let laborCost = 0;
  for (const e of input.labor) {
    if (e.minutes <= 0) continue;
    laborMinutes += e.minutes;
    if (e.running) flags.add("laborRunning");
    const rate = e.hourlyCost ?? (input.garageHourlyCost > 0 ? input.garageHourlyCost : null);
    if (rate === null) flags.add("laborRateMissing");
    else laborCost += Math.round((e.minutes * rate) / 60);
  }
  if (laborMinutes === 0 && input.lines.some((l) => l.type === "LABOR")) flags.add("noLaborRecorded");

  let overhead = 0;
  if (input.overhead.mode === "PERCENT_REVENUE") overhead = Math.round((revenue * Math.max(0, input.overhead.value)) / 10_000);
  else if (input.overhead.mode === "PER_LABOR_HOUR") overhead = Math.round((laborMinutes * Math.max(0, input.overhead.value)) / 60);

  const grossMargin = revenue - directCosts;
  const profit = grossMargin - laborCost - overhead;

  const customer = input.payments.filter((p) => p.payer !== "INSURANCE").reduce((s, p) => s + p.amount, 0);
  const insurance = input.payments.filter((p) => p.payer === "INSURANCE").reduce((s, p) => s + p.amount, 0);

  return {
    revenue,
    partsCost,
    expenses,
    directCosts,
    grossMargin,
    laborMinutes,
    laborCost,
    overhead,
    profit,
    marginBp: revenue > 0 ? Math.round((profit * 10_000) / revenue) : null,
    collected: { customer, insurance, total: customer + insurance },
    flags: [...flags],
  };
}

/** Adds several repairs together (profit by vehicle, customer, type, period). Flags are merged. */
export function sumProfits(items: Profit[]): Profit & { count: number } {
  const flags = new Set<ProfitFlag>();
  const t = { revenue: 0, partsCost: 0, expenses: 0, directCosts: 0, grossMargin: 0, laborMinutes: 0, laborCost: 0, overhead: 0, profit: 0, customer: 0, insurance: 0 };
  for (const p of items) {
    t.revenue += p.revenue;
    t.partsCost += p.partsCost;
    t.expenses += p.expenses;
    t.directCosts += p.directCosts;
    t.grossMargin += p.grossMargin;
    t.laborMinutes += p.laborMinutes;
    t.laborCost += p.laborCost;
    t.overhead += p.overhead;
    t.profit += p.profit;
    t.customer += p.collected.customer;
    t.insurance += p.collected.insurance;
    p.flags.forEach((f) => flags.add(f));
  }
  return {
    count: items.length,
    revenue: t.revenue,
    partsCost: t.partsCost,
    expenses: t.expenses,
    directCosts: t.directCosts,
    grossMargin: t.grossMargin,
    laborMinutes: t.laborMinutes,
    laborCost: t.laborCost,
    overhead: t.overhead,
    profit: t.profit,
    marginBp: t.revenue > 0 ? Math.round((t.profit * 10_000) / t.revenue) : null,
    collected: { customer: t.customer, insurance: t.insurance, total: t.customer + t.insurance },
    flags: [...flags],
  };
}
