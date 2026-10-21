/**
 * Cash forecast (V8.4, Prompt 4/5) — PURE function, no database: the server loads plain data,
 * this file does the arithmetic. Unit-tested in tests/cash-forecast.test.ts.
 *
 * Rules (each euro… each millime counted once):
 * - start = the cash + bank balance typed by hand at the END of day `asOf`;
 * - REAL money = payments, refunds, supplier payments, paid due dates dated AFTER `asOf`
 *   (those dated on or before `asOf` are already inside the typed balance);
 * - EXPECTED customer money = invoice total − amount already paid (never the full total),
 *   so a payment already recorded can never be counted again as "expected";
 * - EXPECTED refunds = accepted − already received, for accepted claims only;
 * - outflows = supplier invoices (total − paid) and unpaid due dates, 100 % at their due date
 *   (overdue → today) in every scenario;
 * - money already spent on a repair (WorkOrderExpense) is not forecast.
 * Days are garage days "YYYY-MM-DD".
 */

export type Scenario = "PRUDENT" | "NORMAL" | "OPTIMISTIC";
export const SCENARIO_LIST: Scenario[] = ["PRUDENT", "NORMAL", "OPTIMISTIC"];
export const HORIZONS = [30, 60, 90] as const;
export type Horizon = (typeof HORIZONS)[number];

export type ScenarioRules = {
  /** A customer pays N days after max(due date, today). */
  collectDelayDays: number;
  /** Invoices overdue by MORE than N days are counted at `oldOverdueRate` % (null = no such rule). */
  oldOverdueDays: number | null;
  oldOverdueRate: number;
  /** Share of accepted warranty refunds still expected that is counted (%). */
  refundRate: number;
  /** A refund arrives N days after max(decision date, today). */
  refundDelayDays: number;
};

/** The assumptions, shown as they are on the page. */
export const SCENARIOS: Record<Scenario, ScenarioRules> = {
  PRUDENT: { collectDelayDays: 30, oldOverdueDays: 60, oldOverdueRate: 0, refundRate: 0, refundDelayDays: 30 },
  NORMAL: { collectDelayDays: 15, oldOverdueDays: 90, oldOverdueRate: 50, refundRate: 100, refundDelayDays: 30 },
  OPTIMISTIC: { collectDelayDays: 0, oldOverdueDays: null, oldOverdueRate: 100, refundRate: 100, refundDelayDays: 0 },
};

export type MovementKind = "CUSTOMER_PAYMENT" | "WARRANTY_REFUND" | "SUPPLIER_PAYMENT" | "EXPENSE_PAID";
const INFLOW_KINDS: MovementKind[] = ["CUSTOMER_PAYMENT", "WARRANTY_REFUND"];

export type ForecastInput = {
  today: string;
  balance: { amount: number; asOf: string } | null;
  /** Real money, amounts > 0 (direction given by the kind). Any date: only those after asOf count. */
  movements: { day: string; amount: number; kind: MovementKind }[];
  customerInvoices: { id: string; label: string; totalTtc: number; paid: number; dueDay: string | null; issuedDay: string }[];
  /** Setting.paymentTermsDays: due date of an invoice without one = issue date + N days. */
  paymentTermsDays: number;
  /** Accepted claims: what is still expected (accepted − received) and the decision day. */
  refunds: { id: string; label: string; expected: number; decidedDay: string }[];
  supplierInvoices: { id: string; label: string; totalTtc: number; paid: number; dueDay: string | null; issuedDay: string }[];
  /** Unpaid due dates of fixed costs. */
  expenses: { id: string; label: string; amount: number; dueDay: string }[];
};

export type FlowKind = "CUSTOMER" | "REFUND" | "SUPPLIER" | "EXPENSE";
export type ExpectedItem = { kind: FlowKind; id: string; label: string; day: string; amount: number; dueDay: string; overdueDays: number; ratePct: number };

export type Week = {
  from: string;
  to: string;
  inReal: number;
  outReal: number;
  inCustomers: number;
  inRefunds: number;
  outSuppliers: number;
  outExpenses: number;
  net: number;
  /** Balance at the end of the week; null without a typed balance. */
  closing: number | null;
};

export type ForecastResult = {
  scenario: Scenario;
  rules: ScenarioRules;
  horizonDays: number;
  today: string;
  end: string;
  /** Typed balance + real money after it, up to and including today. null without a balance. */
  opening: number | null;
  real: { inAfterBalance: number; outAfterBalance: number };
  weeks: Week[];
  totals: { inReal: number; outReal: number; inCustomers: number; inRefunds: number; outSuppliers: number; outExpenses: number; net: number };
  closing: number | null;
  lowest: { amount: number; day: string } | null;
  /** Daily balances (end of each day), for alerts. Empty without a balance. */
  daily: { day: string; balance: number }[];
  items: ExpectedItem[];
  notCounted: { customers: number; refunds: number };
  beyondHorizon: { in: number; out: number };
  warnings: {
    noBalance: boolean;
    balanceAgeDays: number | null;
    balanceInFuture: boolean;
    invoicesWithoutDueDate: number;
    supplierInvoicesWithoutDueDate: number;
  };
};

export const dayNum = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
export const numDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => numDay(dayNum(day) + n);
const pct = (amount: number, rate: number) => Math.round((amount * rate) / 100);

export function forecastCash(input: ForecastInput, scenario: Scenario, horizonDays: number): ForecastResult {
  const rules = SCENARIOS[scenario];
  const horizon = Math.max(1, Math.trunc(horizonDays));
  const t0 = dayNum(input.today);
  const endNum = t0 + horizon - 1;
  const asOfNum = input.balance ? dayNum(input.balance.asOf) : null;

  const dailyIn = new Array<number>(horizon).fill(0);
  const weeksCount = Math.ceil(horizon / 7);
  const weeks: Week[] = Array.from({ length: weeksCount }, (_, i) => ({
    from: numDay(t0 + i * 7),
    to: numDay(Math.min(t0 + i * 7 + 6, endNum)),
    inReal: 0,
    outReal: 0,
    inCustomers: 0,
    inRefunds: 0,
    outSuppliers: 0,
    outExpenses: 0,
    net: 0,
    closing: null,
  }));
  const beyond = { in: 0, out: 0 };
  const put = (dayIndex: number, signed: number, field: keyof Pick<Week, "inReal" | "outReal" | "inCustomers" | "inRefunds" | "outSuppliers" | "outExpenses">) => {
    if (dayIndex >= horizon) {
      if (signed >= 0) beyond.in += signed;
      else beyond.out -= signed;
      return;
    }
    const i = Math.max(0, dayIndex);
    dailyIn[i]! += signed;
    weeks[Math.floor(i / 7)]![field] += Math.abs(signed);
  };

  // ── Real money after the typed balance ──
  let realIn = 0;
  let realOut = 0;
  let openingDelta = 0;
  if (asOfNum !== null) {
    for (const m of input.movements) {
      const d = dayNum(m.day);
      if (d <= asOfNum || m.amount <= 0) continue;
      const inflow = INFLOW_KINDS.includes(m.kind);
      const signed = inflow ? m.amount : -m.amount;
      if (inflow) realIn += m.amount;
      else realOut += m.amount;
      if (d <= t0) openingDelta += signed; // already happened: part of today's balance
      else put(d - t0, signed, inflow ? "inReal" : "outReal"); // recorded with a future date
    }
  }

  // ── Expected flows ──
  const items: ExpectedItem[] = [];
  const notCounted = { customers: 0, refunds: 0 };
  let invoicesWithoutDueDate = 0;
  for (const inv of input.customerInvoices) {
    const remaining = Math.max(0, inv.totalTtc - Math.max(0, inv.paid));
    if (remaining === 0) continue;
    if (!inv.dueDay) invoicesWithoutDueDate++;
    const due = inv.dueDay ?? addDays(inv.issuedDay, Math.max(0, input.paymentTermsDays));
    const overdueDays = Math.max(0, t0 - dayNum(due));
    const rate = rules.oldOverdueDays !== null && overdueDays > rules.oldOverdueDays ? rules.oldOverdueRate : 100;
    const amount = pct(remaining, rate);
    notCounted.customers += remaining - amount;
    const when = Math.max(dayNum(due), t0) + rules.collectDelayDays;
    items.push({ kind: "CUSTOMER", id: inv.id, label: inv.label, day: numDay(when), amount, dueDay: due, overdueDays, ratePct: rate });
    if (amount > 0) put(when - t0, amount, "inCustomers");
  }
  for (const r of input.refunds) {
    if (r.expected <= 0) continue;
    const amount = pct(r.expected, rules.refundRate);
    notCounted.refunds += r.expected - amount;
    const when = Math.max(dayNum(r.decidedDay), t0) + rules.refundDelayDays;
    items.push({ kind: "REFUND", id: r.id, label: r.label, day: numDay(when), amount, dueDay: r.decidedDay, overdueDays: 0, ratePct: rules.refundRate });
    if (amount > 0) put(when - t0, amount, "inRefunds");
  }
  let supplierInvoicesWithoutDueDate = 0;
  for (const s of input.supplierInvoices) {
    const remaining = Math.max(0, s.totalTtc - Math.max(0, s.paid));
    if (remaining === 0) continue;
    if (!s.dueDay) supplierInvoicesWithoutDueDate++;
    const due = s.dueDay ?? s.issuedDay; // no due date = payable on receipt
    const when = Math.max(dayNum(due), t0);
    items.push({ kind: "SUPPLIER", id: s.id, label: s.label, day: numDay(when), amount: remaining, dueDay: due, overdueDays: Math.max(0, t0 - dayNum(due)), ratePct: 100 });
    put(when - t0, -remaining, "outSuppliers");
  }
  for (const e of input.expenses) {
    if (e.amount <= 0) continue;
    const when = Math.max(dayNum(e.dueDay), t0);
    items.push({ kind: "EXPENSE", id: e.id, label: e.label, day: numDay(when), amount: e.amount, dueDay: e.dueDay, overdueDays: Math.max(0, t0 - dayNum(e.dueDay)), ratePct: 100 });
    put(when - t0, -e.amount, "outExpenses");
  }
  items.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.kind.localeCompare(b.kind)));

  // ── Balances ──
  const opening = input.balance ? input.balance.amount + openingDelta : null;
  const daily: { day: string; balance: number }[] = [];
  let lowest: { amount: number; day: string } | null = null;
  if (opening !== null) {
    let running = opening;
    for (let i = 0; i < horizon; i++) {
      running += dailyIn[i]!;
      const day = numDay(t0 + i);
      daily.push({ day, balance: running });
      if (!lowest || running < lowest.amount) lowest = { amount: running, day };
    }
  }
  let running = opening;
  for (const w of weeks) {
    w.net = w.inReal + w.inCustomers + w.inRefunds - w.outReal - w.outSuppliers - w.outExpenses;
    if (running !== null) {
      running += w.net;
      w.closing = running;
    }
  }
  const sum = (f: (w: Week) => number) => weeks.reduce((s, w) => s + f(w), 0);
  const totals = {
    inReal: sum((w) => w.inReal),
    outReal: sum((w) => w.outReal),
    inCustomers: sum((w) => w.inCustomers),
    inRefunds: sum((w) => w.inRefunds),
    outSuppliers: sum((w) => w.outSuppliers),
    outExpenses: sum((w) => w.outExpenses),
    net: sum((w) => w.net),
  };

  return {
    scenario,
    rules,
    horizonDays: horizon,
    today: input.today,
    end: numDay(endNum),
    opening,
    real: { inAfterBalance: realIn, outAfterBalance: realOut },
    weeks,
    totals,
    closing: opening === null ? null : opening + totals.net,
    lowest,
    daily,
    items,
    notCounted,
    beyondHorizon: beyond,
    warnings: {
      noBalance: input.balance === null,
      balanceAgeDays: asOfNum === null ? null : t0 - asOfNum,
      balanceInFuture: asOfNum !== null && asOfNum > t0,
      invoicesWithoutDueDate,
      supplierInvoicesWithoutDueDate,
    },
  };
}

/** First day the projected balance goes below `threshold` (threshold ≤ 0 = alert off). */
export function firstBreach(result: ForecastResult, threshold: number): { day: string; balance: number } | null {
  if (threshold <= 0 || result.opening === null) return null;
  if (result.opening < threshold) return { day: result.today, balance: result.opening };
  return result.daily.find((d) => d.balance < threshold) ?? null;
}
