import Link from "next/link";
import { Download } from "lucide-react";
import { ProfitFlags, pct } from "@/components/garage/profit-panel";
import { Button } from "@/components/ui/button";
import { Card, Field, NativeSelect, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addDays, zonedToUtc } from "@/lib/booking";
import { fmt, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { isIsoDay, monthRange, yearRange } from "@/lib/periods";
import { requirePageAccess } from "@/lib/session";
import { profitReport, type ProfitGroup } from "@/server/profit";
import { getSettings } from "@/server/settings";

const GROUPS: ProfitGroup[] = ["repair", "vehicle", "customer", "type", "month"];
type PageProps = { searchParams: Promise<{ from?: string; to?: string; group?: string }> };

/** Administrator: profitability by repair, vehicle, customer, type of repair or month. */
export default async function ProfitabilityPage({ searchParams }: PageProps) {
  await requirePageAccess("viewProfit");
  const [sp, settings, { t, lang }] = await Promise.all([searchParams, getSettings(), getI18n()]);
  const tz = settings.timezone;
  const month = monthRange(tz);
  const fromDay = isIsoDay(sp.from) ? sp.from : month.from;
  const toDay = isIsoDay(sp.to) && sp.to >= fromDay ? sp.to : month.to;
  const group = (GROUPS as string[]).includes(sp.group ?? "") ? (sp.group as ProfitGroup) : "repair";
  const report = await profitReport(zonedToUtc(fromDay, "00:00", tz), zonedToUtc(addDays(toDay, 1), "00:00", tz), group, tz);
  const v = t.v7.profit;
  const m = (n: number) => formatMoney(n, lang);
  const q = (over: Record<string, string>) => new URLSearchParams({ from: fromDay, to: toDay, group, ...over }).toString();
  const year = yearRange(tz);
  const last = monthRange(tz, -1);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader title={v.reportTitle} />
      <p className="text-sm text-muted-foreground">{v.reportIntro}</p>

      <Card className="print:hidden">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <Field label={t.v7.leave.from}>
            <Input type="date" name="from" defaultValue={fromDay} />
          </Field>
          <Field label={t.v7.leave.to}>
            <Input type="date" name="to" defaultValue={toDay} />
          </Field>
          <Field label={v.groupBy}>
            <NativeSelect name="group" defaultValue={group}>
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {v.groups[g]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Button type="submit" variant="outline">
            {t.v7.team.show}
          </Button>
          <nav className="flex flex-wrap gap-1 text-sm">
            {[
              [t.v7.team.thisMonth, month],
              [t.v7.team.lastMonth, last],
              [t.v7.team.thisYear, year],
            ].map(([label, r]) => (
              <Link key={label as string} href={`?${q({ from: (r as { from: string }).from, to: (r as { to: string }).to })}`} className="f-label border px-2 py-1.5 text-[0.625rem] hover:border-foreground">
                {label as string}
              </Link>
            ))}
          </nav>
          <a href={`/api/rentabilite?${q({})}`} className="ms-auto inline-flex h-9 items-center gap-2 border px-3 text-sm hover:border-foreground">
            <Download className="size-4" aria-hidden /> {t.v7.team.exportXlsx}
          </a>
        </form>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [v.revenue, m(report.total.revenue)],
          [v.grossMargin, m(report.total.grossMargin)],
          [v.profit, m(report.total.profit)],
          [v.margin, pct(report.total.marginBp, lang)],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="label-tech">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {fmt(v.countInvoiced, { n: report.total.count })} · {v.collected} : {m(report.total.collected.total)} — {v.collectedHint}
        {report.notInvoiced > 0 && ` · ${fmt(v.notInvoicedCount, { n: report.notInvoiced })}`}
      </p>
      {report.config.garageHourlyCost === 0 && <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{v.noHourlyCost}</p>}
      <ProfitFlags p={report.total} t={t} />

      <Card className="p-0 sm:p-0">
        {report.lines.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{v.none}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{v.groups[group]}</Th>
                {group !== "repair" && <Th className="text-end">{v.repairs}</Th>}
                <Th className="text-end">{v.revenue}</Th>
                <Th className="text-end">{v.directCosts}</Th>
                <Th className="text-end">{v.grossMargin}</Th>
                <Th className="text-end">{v.laborCost}</Th>
                <Th className="text-end">{v.overhead}</Th>
                <Th className="text-end">{v.profit}</Th>
                <Th className="text-end">{v.margin}</Th>
              </tr>
            </thead>
            <tbody>
              {report.lines.map((l) => (
                <tr key={l.key}>
                  <Td>
                    {l.workOrderId ? (
                      <Link href={`/garage/work-orders/${l.workOrderId}`} className="underline-offset-4 hover:underline">
                        {l.label}
                      </Link>
                    ) : l.category ? (
                      t.reports.problemNames[l.category]
                    ) : (
                      l.label
                    )}
                    {l.flags.length > 0 && (
                      <span className="ms-1 text-amber-600" title={l.flags.map((f) => v.flags[f]).join("\n")}>
                        *
                      </span>
                    )}
                  </Td>
                  {group !== "repair" && <Td className="text-end tabular-nums">{l.count}</Td>}
                  <Td className="text-end tabular-nums">{m(l.revenue)}</Td>
                  <Td className="text-end tabular-nums">{m(l.directCosts)}</Td>
                  <Td className="text-end tabular-nums">{m(l.grossMargin)}</Td>
                  <Td className="text-end tabular-nums">{m(l.laborCost)}</Td>
                  <Td className="text-end tabular-nums">{m(l.overhead)}</Td>
                  <Td className={`text-end font-semibold tabular-nums ${l.profit < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{m(l.profit)}</Td>
                  <Td className="text-end tabular-nums">{pct(l.marginBp, lang)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">{v.legend}</p>
    </div>
  );
}
