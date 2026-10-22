import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { dayKey } from "@/lib/dashboard-series";
import { fmt, formatDay, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { listReasons, reportStats } from "@/server/accueil";
import { getSettings } from "@/server/settings";

type Props = { searchParams: Promise<{ from?: string; to?: string }> };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** V15 — reception reports: real waiting time by reason / hour / day, peak hours, absence rate, CSV. */
export default async function ReceptionReportsPage({ searchParams }: Props) {
  await requirePageAccess("viewReceptionReports");
  const sp = await searchParams;
  const [{ t, lang }, settings, reasons] = await Promise.all([getI18n(), getSettings(), listReasons(true)]);
  const today = dayKey(new Date(), settings.timezone);
  const monthAgo = dayKey(new Date(Date.now() - 29 * 86_400_000), settings.timezone);
  const from = sp.from && DAY.test(sp.from) ? sp.from : monthAgo;
  const to = sp.to && DAY.test(sp.to) ? sp.to : today;
  const { stats } = await reportStats(from, to);
  const v = t.v15;
  const name = (id: string) => {
    const r = reasons.find((x) => x.id === id);
    return r ? (lang === "ar" ? r.nameAr || r.nameFr : lang === "en" ? r.nameEn || r.nameFr : r.nameFr) : "—";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={v.reports.title} subtitle={v.reports.subtitle}>
        <Link href="/garage/accueil" className="inline-flex h-10 items-center rounded-full border px-4 text-sm hover:bg-muted">
          {v.desk.title}
        </Link>
      </PageHeader>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label={v.reports.from}>
            <Input type="date" name="from" defaultValue={from} className="h-9" />
          </Field>
          <Field label={v.reports.to}>
            <Input type="date" name="to" defaultValue={to} className="h-9" />
          </Field>
          <Button type="submit">{v.reports.show}</Button>
          <a href={`/api/accueil/export?from=${from}&to=${to}`} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted" data-testid="csv">
            <Download className="size-4" aria-hidden /> {v.reports.csv}
          </a>
        </form>
      </Card>

      {stats.total.count === 0 ? (
        <p className="text-sm text-muted-foreground">{v.stats.none}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile label={v.stats.tickets} value={String(stats.total.count)} />
            <Tile label={v.stats.avgWait} value={mins(t, stats.total.avgWait)} />
            <Tile label={v.stats.maxWait} value={mins(t, stats.total.maxWait)} />
            <Tile label={v.stats.absentRate} value={stats.absentRate === null ? "—" : `${stats.absentRate} %`} />
            <Tile label={v.stats.peak} value={stats.peakHours.map((h) => fmt(v.stats.hour, { h })).join(", ") || "—"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle>{v.stats.byReason}</CardTitle>
              <StatTable t={t} rows={[...stats.byReason].map(([id, s]) => ({ key: id, label: name(id), s }))} />
            </Card>
            <Card>
              <CardTitle>{v.stats.byHour}</CardTitle>
              <StatTable t={t} rows={stats.byHour.map((h) => ({ key: String(h.hour), label: fmt(v.stats.hour, { h: h.hour }), s: h.stat }))} bars />
            </Card>
          </div>
          <Card>
            <CardTitle>{v.stats.byDay}</CardTitle>
            <StatTable t={t} rows={stats.byDay.map((d) => ({ key: d.day, label: formatDay(d.day, lang as Lang, { weekday: "short", day: "numeric", month: "short" }), s: d.stat }))} bars />
          </Card>
        </>
      )}
    </div>
  );
}

const mins = (t: Dictionary, n: number | null) => (n === null ? t.v15.noEstimate : fmt(t.v15.minutes, { n }));

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

type Row = { key: string; label: string; s: { count: number; avgWait: number | null; maxWait: number | null; absent: number } };

function StatTable({ t, rows, bars = false }: { t: Dictionary; rows: Row[]; bars?: boolean }) {
  const v = t.v15.stats;
  const max = Math.max(1, ...rows.map((r) => r.s.count));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="py-1 text-start font-medium" />
          <th className="py-1 text-end font-medium">{v.tickets}</th>
          <th className="py-1 text-end font-medium">{v.avgWait}</th>
          <th className="py-1 text-end font-medium">{v.maxWait}</th>
          <th className="py-1 text-end font-medium">{v.absent}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t">
            <td className="py-1.5">
              {r.label}
              {bars && <span className="mt-1 block h-1.5 rounded-full bg-brand-500/70" style={{ width: `${(r.s.count / max) * 100}%` }} aria-hidden />}
            </td>
            <td className="py-1.5 text-end tabular-nums">{r.s.count}</td>
            <td className="py-1.5 text-end tabular-nums">{mins(t, r.s.avgWait)}</td>
            <td className="py-1.5 text-end tabular-nums">{mins(t, r.s.maxWait)}</td>
            <td className="py-1.5 text-end tabular-nums">{r.s.absent}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
