import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, Star, ThumbsUp } from "lucide-react";
import { PrintButton } from "@/components/garage/print-button";
import { Card, CardTitle } from "@/components/ui/field";
import { fmt, formatDate, formatDay, formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { REPORT_PERIODS, type Insight, type ReportPeriod } from "@/lib/report";
import type { ProblemCategory } from "@/lib/report-categories";
import { cn } from "@/lib/utils";
import type { getReport } from "@/server/reports";

type Data = Awaited<ReturnType<typeof getReport>>;

/** Owner's report for a period. Pure view (also used by the print layout). */
export function ReportView({ data, t, lang }: { data: Data; t: Dictionary; lang: Lang }) {
  const r = t.reports;
  const money = (v: number) => formatMoney(v, lang);
  const days: string[] = t.bookingSettings.days;
  const insightText = (i: Insight) => {
    const vars = { ...i.vars };
    if (i.key === "topProblem") vars.problem = r.problemNames[i.vars.problem as ProblemCategory];
    if (i.key === "busiestDay") vars.day = days[Number(i.vars.day)] ?? "";
    return fmt(r.insights[i.key as keyof Dictionary["reports"]["insights"]], vars);
  };
  const maxBar = Math.max(1, ...data.series.map((s) => s.invoicedTtc));
  const maxProblem = Math.max(1, ...data.problems.map((p) => p.count));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 print:p-0">
      <header className="flex flex-wrap items-end gap-4 border-b pb-4">
        <div className="min-w-0">
          <h1 className="f-display text-xl sm:text-2xl">{r.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.garageName} · {fmt(r.from, { from: formatDate(data.start, lang, data.timeZone), to: formatDate(data.end, lang, data.timeZone) })}
          </p>
        </div>
        <nav className="ms-auto flex flex-wrap gap-1 print:hidden" aria-label={r.title}>
          {REPORT_PERIODS.map((p: ReportPeriod) => (
            <Link
              key={p}
              href={`/garage/rapports?periode=${p}`}
              aria-current={p === data.period ? "page" : undefined}
              className={cn("f-label border px-3 py-2", p === data.period ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {r.periods[p]}
            </Link>
          ))}
        </nav>
        <PrintButton />
      </header>

      {/* ── Key points ── */}
      {data.insights.length > 0 && (
        <Card>
          <CardTitle>{r.insightsTitle}</CardTitle>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {data.insights.map((i) => {
              const Icon = i.tone === "good" ? ThumbsUp : i.tone === "warn" ? AlertTriangle : Info;
              return (
                <li key={i.key} className="flex gap-2">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", i.tone === "good" ? "text-emerald-600" : i.tone === "warn" ? "text-brand-500" : "text-muted-foreground")} aria-hidden />
                  <span>{insightText(i)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ── Headline figures ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={r.invoiced} value={money(data.money.invoicedTtc)} delta={data.money.deltaInvoiced} hint={fmt(r.invoicesCount, { n: data.money.invoices })} vs={r.vsPrevious} />
        <Kpi label={r.collected} value={money(data.money.collected)} delta={data.money.deltaCollected} vs={r.vsPrevious} />
        <Kpi label={r.received} value={String(data.cars.received)} delta={data.cars.deltaReceived} hint={`${r.delivered} : ${data.cars.delivered}`} vs={r.vsPrevious} />
        <Kpi
          label={r.avgRating}
          value={data.feedback.avgRating !== null ? `${data.feedback.avgRating} / 5` : "—"}
          hint={data.feedback.count ? fmt(r.satisfied, { pct: data.feedback.satisfied }) : r.noData}
        />
      </div>

      {/* ── Daily chart ── */}
      {data.series.length > 1 && (
        <Card>
          <CardTitle>{r.chartTitle}</CardTitle>
          <div className="flex h-40 items-end gap-px" role="img" aria-label={r.chartTitle}>
            {data.series.map((s) => (
              <div key={s.date} className="group relative flex h-full min-w-0 flex-1 items-end">
                <div className="w-full bg-foreground/80 transition-colors group-hover:bg-brand-500" style={{ height: `${Math.max(1, (s.invoicedTtc / maxBar) * 100)}%` }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap border bg-popover px-2 py-1 text-xs text-popover-foreground group-hover:block">
                  {formatDay(s.date, lang, { day: "numeric", month: "short" })} · {money(s.invoicedTtc)} · {s.received} {r.received.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground" dir="ltr">
            <span>{formatDay(data.series[0]!.date, lang, { day: "numeric", month: "short" })}</span>
            <span>{formatDay(data.series.at(-1)!.date, lang, { day: "numeric", month: "short" })}</span>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Money ── */}
        <Card>
          <CardTitle>{r.money}</CardTitle>
          <Rows
            rows={[
              [r.invoicedHt, money(data.money.invoicedHt)],
              [r.avgTicket, money(data.money.avgTicket)],
              [r.labour, `${money(data.money.labourHt)} · ${fmt(r.labourHours, { n: data.money.labourHours })}`],
              [r.parts, money(data.money.partsHt)],
              [r.partsCost, money(data.money.partsCost)],
              [r.partsMargin, money(data.money.partsMargin), data.money.partsMargin < 0 ? "text-brand-500" : undefined],
              [r.supplierInvoices, money(data.money.supplierInvoicesTtc)],
              [r.supplierPaid, money(data.money.supplierPaid)],
              [r.cashBalance, money(data.money.cashBalance), data.money.cashBalance < 0 ? "text-brand-500" : "font-semibold"],
              [r.outstanding, `${money(data.money.outstandingNow)}${data.money.overdueNow ? ` · ${fmt(r.overdue, { n: data.money.overdueNow })}` : ""}`],
            ]}
          />
          {data.money.byMethod.length > 0 && (
            <>
              <p className="label-tech mt-5 mb-2">{r.byMethod}</p>
              <Rows rows={data.money.byMethod.map((m) => [t.paymentMethod[m.method as keyof Dictionary["paymentMethod"]] ?? m.method, money(m.amount)])} />
            </>
          )}
        </Card>

        {/* ── Cars ── */}
        <Card>
          <CardTitle>{r.cars}</CardTitle>
          <Rows
            rows={[
              [r.received, String(data.cars.received)],
              [r.delivered, String(data.cars.delivered)],
              [r.cancelled, String(data.cars.cancelled)],
              [r.inShop, String(data.cars.inShopNow)],
              [r.turnaround, data.cars.turnaroundHours !== null ? fmt(r.hours, { n: data.cars.turnaroundHours }) : "—"],
              [r.newCustomers, String(data.cars.newCustomers)],
              [r.returning, String(data.cars.returning)],
              [r.comebacks, String(data.cars.comebacks), data.cars.comebacks ? "text-brand-500" : undefined],
              [r.appointments, fmt(r.apptStats, data.cars.appointments)],
            ]}
          />
          {data.cars.topModels.length > 0 && (
            <>
              <p className="label-tech mt-5 mb-2">{r.topModels}</p>
              <Rows rows={data.cars.topModels.map((m) => [m.key, String(m.count)])} />
            </>
          )}
        </Card>

        {/* ── Problems ── */}
        <Card>
          <CardTitle>{r.problems}</CardTitle>
          {data.problems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{r.noData}</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {data.problems.map((p) => (
                <li key={p.key}>
                  <div className="flex justify-between gap-2">
                    <span>{r.problemNames[p.key]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {p.count} · {p.share} %
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-muted">
                    <div className="h-full bg-foreground" style={{ width: `${(p.count / maxProblem) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Parts ── */}
        <Card>
          <CardTitle>{r.topParts}</CardTitle>
          {data.topParts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{r.noData}</p>
          ) : (
            <Rows rows={data.topParts.map((p) => [p.name, `${p.qty} · ${money(p.revenue)}`])} />
          )}
          {data.lowStock.length > 0 && (
            <>
              <p className="label-tech mt-5 mb-2 text-brand-500">
                {r.lowStock} ({data.lowStockNow})
              </p>
              <ul className="text-sm text-muted-foreground">
                {data.lowStock.map((p) => (
                  <li key={p.id}>
                    <Link href={`/garage/parts?q=${encodeURIComponent(p.sku)}`} className="hover:text-foreground hover:underline">
                      <span className="font-mono text-xs">{p.sku}</span> {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* ── Mechanics ── */}
        <Card>
          <CardTitle>{r.mechanics}</CardTitle>
          {data.mechanics.length === 0 ? (
            <p className="text-sm text-muted-foreground">{r.noData}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="label-tech text-start">
                  <th className="py-1 text-start font-normal" />
                  <th className="py-1 text-end font-normal">{r.mechDelivered}</th>
                  <th className="py-1 text-end font-normal">{r.mechHours}</th>
                  <th className="py-1 text-end font-normal">{r.labour}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.mechanics.map((m) => (
                  <tr key={m.name}>
                    <td className="py-2">{m.name}</td>
                    <td className="py-2 text-end tabular-nums">{m.delivered}</td>
                    <td className="py-2 text-end tabular-nums">{m.hours}</td>
                    <td className="py-2 text-end tabular-nums">{money(m.labourHt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* ── Customers' voice ── */}
        <Card>
          <CardTitle>
            <Link href="/garage/reclamations" className="hover:underline">
              {r.claimsTitle} & {r.feedbackTitle}
            </Link>
          </CardTitle>
          <p className="text-sm">{fmt(r.claimsStats, { total: data.claims.total, open: data.claims.open })}</p>
          {data.claims.resolutionHours !== null && <p className="mt-1 text-sm text-muted-foreground">{r.resolution} : {fmt(r.hours, { n: data.claims.resolutionHours })}</p>}
          {data.claims.byCategory.length > 0 && (
            <div className="mt-3">
              <Rows rows={data.claims.byCategory.map((c) => [t.claims.categories[c.key as keyof Dictionary["claims"]["categories"]] ?? c.key, String(c.count)])} />
            </div>
          )}
          <div className="mt-5 space-y-1">
            {data.feedback.distribution.map((d) => (
              <div key={d.star} className="flex items-center gap-2 text-xs">
                <span className="inline-flex w-8 items-center gap-0.5 tabular-nums">
                  {d.star} <Star className="size-3 fill-current" aria-hidden />
                </span>
                <div className="h-1.5 flex-1 bg-muted">
                  <div className="h-full bg-brand-500" style={{ width: `${data.feedback.count ? (d.count / data.feedback.count) * 100 : 0}%` }} />
                </div>
                <span className="w-6 text-end tabular-nums text-muted-foreground">{d.count}</span>
              </div>
            ))}
          </div>
          {data.feedback.latest.some((f) => f.comment) && (
            <ul className="mt-4 space-y-2 text-sm">
              {data.feedback.latest
                .filter((f) => f.comment)
                .slice(0, 3)
                .map((f, i) => (
                  <li key={i} className="border-s-2 border-border ps-3">
                    <span className="text-muted-foreground">{"★".repeat(f.rating)} </span>
                    {f.comment}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, delta, hint, vs }: { label: string; value: string; delta?: number | null; hint?: string; vs?: string }) {
  return (
    <div className="border bg-card p-4">
      <p className="label-tech">{label}</p>
      <p className="mt-3 break-words text-xl font-semibold tabular-nums sm:text-2xl" dir="ltr">
        {value}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {delta !== undefined && delta !== null && (
          <span className={cn("inline-flex items-center gap-0.5 tabular-nums", delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-brand-500")} title={vs}>
            {delta >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
            {Math.abs(delta)} %
          </span>
        )}
        {hint}
      </p>
    </div>
  );
}

function Rows({ rows }: { rows: [string, ReactNode, string?][] }) {
  return (
    <dl className="divide-y text-sm">
      {rows.map(([k, v, tone]) => (
        <div key={k} className="flex justify-between gap-4 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className={cn("text-end tabular-nums", tone)}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
