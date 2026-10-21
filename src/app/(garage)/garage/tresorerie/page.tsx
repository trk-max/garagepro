import Link from "next/link";
import { recordCashBalanceAction } from "@/actions/cash";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { HORIZONS, SCENARIO_LIST, SCENARIOS, type Scenario } from "@/lib/cash-forecast";
import { fmt, formatDay, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { cashForecast, isScenario, listCashBalances } from "@/server/cash";
import { getSettings } from "@/server/settings";

type PageProps = { searchParams: Promise<{ s?: string; h?: string }> };

/** Days after which the typed balance is flagged as old. */
const STALE_DAYS = 14;

/** Cash forecast: typed balance + real money since + expected flows, 3 scenarios (administrator + manager). */
export default async function CashForecastPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("readCashForecast");
  const sp = await searchParams;
  const scenario: Scenario = isScenario(sp.s) ? sp.s : "NORMAL";
  const horizon = (HORIZONS as readonly number[]).includes(Number(sp.h)) ? Number(sp.h) : 30;
  const [{ t, lang }, f, balances, settings] = await Promise.all([getI18n(), cashForecast(staff, { scenario, horizon }), listCashBalances(staff), getSettings()]);
  const v = t.v7.cash;
  const r = f.result;
  const m = (n: number) => formatMoney(n, lang);
  const day = (d: string) => formatDay(d, lang, { day: "numeric", month: "short", year: "numeric" });
  const short = (d: string) => formatDay(d, lang, { day: "numeric", month: "short" });
  const rules = SCENARIOS[scenario];
  const href = (s: Scenario, h: number) => `/garage/tresorerie?s=${s}&h=${h}`;
  const showReal = r.totals.inReal > 0 || r.totals.outReal > 0;
  const tone = (n: number | null) => (n !== null && n < 0 ? "text-red-600 dark:text-red-400" : "");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader title={v.title} />
      <p className="text-sm text-muted-foreground">
        {v.intro} {v.singleGarage}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <nav className="flex flex-wrap items-center gap-1" aria-label={v.scenario}>
          <span className="me-1 text-xs text-muted-foreground">{v.scenario}</span>
          {SCENARIO_LIST.map((s) => (
            <Link key={s} href={href(s, horizon)} aria-current={s === scenario ? "page" : undefined} className={cn("f-label border px-3 py-2", s === scenario ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
              {v.scenarios[s]}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap items-center gap-1" aria-label={v.horizon}>
          <span className="me-1 text-xs text-muted-foreground">{v.horizon}</span>
          {HORIZONS.map((h) => (
            <Link key={h} href={href(scenario, h)} aria-current={h === horizon ? "page" : undefined} className={cn("f-label border px-3 py-2", h === horizon ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
              {fmt(v.days, { n: h })}
            </Link>
          ))}
        </nav>
      </div>

      {/* ── Alert and data warnings ── */}
      <div className="space-y-2 text-sm">
        {f.alert.threshold <= 0 ? (
          <p className="border px-3 py-2 text-muted-foreground">{v.alertOff}</p>
        ) : r.opening === null ? (
          <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2">{v.alertNoBalance}</p>
        ) : f.alert.breach ? (
          <p className="border border-red-600/50 bg-red-600/10 px-3 py-2 font-medium text-red-700 dark:text-red-300" role="alert">
            {fmt(v.alertBreach, { scenario: v.scenarios[f.alert.scenario], threshold: m(f.alert.threshold), date: day(f.alert.breach.day), balance: m(f.alert.breach.balance) })}
          </p>
        ) : (
          <p className="border border-emerald-600/40 bg-emerald-600/10 px-3 py-2">{fmt(v.alertOk, { scenario: v.scenarios[f.alert.scenario], threshold: m(f.alert.threshold) })}</p>
        )}
        {r.warnings.noBalance && <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2">{v.noBalance}</p>}
        {r.warnings.balanceAgeDays !== null && r.warnings.balanceAgeDays > STALE_DAYS && <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2">{fmt(v.staleBalance, { n: r.warnings.balanceAgeDays })}</p>}
        {r.warnings.balanceInFuture && <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2">{v.balanceFuture}</p>}
        {r.warnings.invoicesWithoutDueDate > 0 && <p className="text-xs text-muted-foreground">{fmt(v.noDueWarn, { n: r.warnings.invoicesWithoutDueDate })}</p>}
        {r.warnings.supplierInvoicesWithoutDueDate > 0 && <p className="text-xs text-muted-foreground">{fmt(v.noDueSupplierWarn, { n: r.warnings.supplierInvoicesWithoutDueDate })}</p>}
      </div>

      {/* ── Summary: typed balance, real money since, today, end of horizon ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-muted-foreground">{f.input.balance ? fmt(v.start, { date: day(f.input.balance.asOf) }) : v.balanceTitle}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{f.input.balance ? m(f.input.balance.amount) : "—"}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">{v.realIn}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+ {m(r.real.inAfterBalance)}</p>
          <p className="mt-2 text-xs text-muted-foreground">{v.realOut}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">− {m(r.real.outAfterBalance)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">{v.today}</p>
          <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone(r.opening))}>{r.opening === null ? "—" : m(r.opening)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">{fmt(v.endOn, { date: day(r.end) })}</p>
          <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone(r.closing))}>{r.closing === null ? "—" : m(r.closing)}</p>
          {r.lowest && <p className={cn("mt-2 text-xs", tone(r.lowest.amount))}>{fmt(v.lowest, { amount: m(r.lowest.amount), date: short(r.lowest.day) })}</p>}
        </Card>
      </div>

      <Card>
        <CardTitle>{fmt(v.compare, { n: horizon })}</CardTitle>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          {SCENARIO_LIST.map((s) => (
            <div key={s} className={cn("flex justify-between gap-3 border px-3 py-2", s === scenario && "border-foreground")}>
              <dt>{v.scenarios[s]}</dt>
              <dd className={cn("font-semibold tabular-nums", tone(f.closings[s]))}>{f.closings[s] === null ? "—" : m(f.closings[s]!)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* ── Weekly table ── */}
      <Card className="p-0 sm:p-0">
        <Table>
          <thead>
            <tr>
              <Th>{v.week}</Th>
              {showReal && <Th className="text-end">{v.cols.real}</Th>}
              <Th className="text-end">{v.cols.customers}</Th>
              <Th className="text-end">{v.cols.refunds}</Th>
              <Th className="text-end">{v.cols.suppliers}</Th>
              <Th className="text-end">{v.cols.expenses}</Th>
              <Th className="text-end">{v.cols.net}</Th>
              <Th className="text-end">{v.cols.closing}</Th>
            </tr>
          </thead>
          <tbody>
            {r.weeks.map((w) => (
              <tr key={w.from}>
                <Td className="whitespace-nowrap text-xs">
                  {short(w.from)} → {short(w.to)}
                </Td>
                {showReal && <Td className="text-end tabular-nums">{w.inReal - w.outReal ? m(w.inReal - w.outReal) : "—"}</Td>}
                <Td className="text-end tabular-nums">{w.inCustomers ? `+ ${m(w.inCustomers)}` : "—"}</Td>
                <Td className="text-end tabular-nums">{w.inRefunds ? `+ ${m(w.inRefunds)}` : "—"}</Td>
                <Td className="text-end tabular-nums">{w.outSuppliers ? `− ${m(w.outSuppliers)}` : "—"}</Td>
                <Td className="text-end tabular-nums">{w.outExpenses ? `− ${m(w.outExpenses)}` : "—"}</Td>
                <Td className={cn("text-end tabular-nums", tone(w.net))}>{m(w.net)}</Td>
                <Td className={cn("text-end font-semibold tabular-nums", tone(w.closing))}>{w.closing === null ? "—" : m(w.closing)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{fmt(v.assumptions, { name: v.scenarios[scenario] })}</CardTitle>
          <ul className="list-disc space-y-1 ps-5 text-sm">
            <li>{fmt(v.rules.collect, { n: rules.collectDelayDays })}</li>
            <li>{rules.oldOverdueDays === null ? v.rules.noOldOverdue : fmt(v.rules.oldOverdue, { days: rules.oldOverdueDays, rate: rules.oldOverdueRate })}</li>
            <li>{fmt(v.rules.refunds, { rate: rules.refundRate, n: rules.refundDelayDays })}</li>
            <li>{v.rules.outflows}</li>
            <li>{fmt(v.rules.noDue, { n: settings.paymentTermsDays })}</li>
            <li>{v.rules.notForecast}</li>
          </ul>
          {(r.notCounted.customers > 0 || r.notCounted.refunds > 0) && (
            <p className="mt-3 text-xs text-muted-foreground">{fmt(v.notCounted, { customers: m(r.notCounted.customers), refunds: m(r.notCounted.refunds) })}</p>
          )}
          {(r.beyondHorizon.in > 0 || r.beyondHorizon.out > 0) && <p className="mt-1 text-xs text-muted-foreground">{fmt(v.beyond, { in: m(r.beyondHorizon.in), out: m(r.beyondHorizon.out) })}</p>}
        </Card>

        <Card>
          <CardTitle>{v.balanceTitle}</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">{v.balanceHint}</p>
          {/* Read-only for the accountant (readCashForecast): typing the balance stays administrator + manager. */}
          {can(staff.role, "viewCashForecast") && (
            <ActionForm action={recordCashBalanceAction} className="grid gap-3 sm:grid-cols-2">
              <Field label={v.amount}>
                <Input name="amount" inputMode="decimal" required dir="ltr" />
              </Field>
              <Field label={v.asOf}>
                <Input name="asOf" type="date" required dir="ltr" defaultValue={r.today} max={r.today} />
              </Field>
              <Field label={v.note} className="sm:col-span-2">
                <Input name="note" maxLength={300} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit">{v.save}</Button>
              </div>
            </ActionForm>
          )}
          {balances.length > 0 && (
            <>
              <p className="label-tech mt-5 mb-2">{v.history}</p>
              <ul className="divide-y text-sm">
                {balances.map((b, i) => (
                  <li key={b.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5", i > 0 && "text-muted-foreground")}>
                    <span>{day(b.asOfDay)}</span>
                    {b.note && <span className="text-xs">{b.note}</span>}
                    {b.by && <span className="text-xs text-muted-foreground">{fmt(v.by, { name: b.by })}</span>}
                    <span className="ms-auto tabular-nums">{m(b.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* ── Every expected flow, with the rule applied ── */}
      <Card>
        <CardTitle>{v.details}</CardTitle>
        {r.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{v.empty}</p>
        ) : (
          <ul className="divide-y text-sm">
            {r.items.slice(0, 300).map((x) => {
              const out = x.kind === "SUPPLIER" || x.kind === "EXPENSE";
              return (
                <li key={`${x.kind}-${x.id}`} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5", x.amount === 0 && "text-muted-foreground")}>
                  <span className="w-24 shrink-0 tabular-nums">{short(x.day)}</span>
                  <span className="f-label text-[0.625rem] text-muted-foreground">{v.kinds[x.kind]}</span>
                  <span className="font-medium">{x.label}</span>
                  <span className="text-xs text-muted-foreground">{fmt(v.due, { date: short(x.dueDay) })}</span>
                  {x.overdueDays > 0 && <span className="text-xs text-red-600 dark:text-red-400">{fmt(v.lateDays, { n: x.overdueDays })}</span>}
                  {x.ratePct !== 100 && <span className="text-xs">{fmt(v.counted, { rate: x.ratePct })}</span>}
                  <span className={cn("ms-auto tabular-nums", out ? "" : "text-emerald-700 dark:text-emerald-400")}>
                    {out ? "−" : "+"} {m(x.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">{v.limits}</p>
    </div>
  );
}
