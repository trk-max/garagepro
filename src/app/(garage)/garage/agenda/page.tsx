import Link from "next/link";
import { CalendarCheck2, Settings2 } from "lucide-react";
import { AgendaSelection } from "@/components/agenda/agenda-toolbar";
import { ConfidenceChip, DueText, nameOf, priceText, RangeText, StatusChip } from "@/components/agenda/agenda-ui";
import { ForecastExplain } from "@/components/agenda/forecast-explain";
import { PageHeader } from "@/components/ui/redesign/page-header";
import { EmptyState, PillLink, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import { CONFIDENCE_RANK, DAY_MS, FORECAST_STATUSES, type Confidence, type ForecastStatus } from "@/lib/agenda";
import { displayPlate, fmt, formatDate, formatKm, formatQty } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { listAgenda, listItems, modelSignals, partsToOrder } from "@/server/agenda";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/server/settings";

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** V12 — every vehicle's upcoming repairs (estimates), filters, sorted by due date, bulk actions. */
export default async function AgendaPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewAgenda");
  const sp = await searchParams;
  const now = new Date();
  const canManage = can(staff, "manageAgenda");
  const seePrice = can(staff, "viewFinance") || can(staff, "printQuote");
  // "to" = a date, or a number of days from today (links from "À traiter" and the dashboard: ?to=30).
  const to = isDay(sp.to) ? new Date(`${sp.to}T23:59:59Z`) : sp.to && /^\d{1,3}$/.test(sp.to) ? new Date(now.getTime() + Number(sp.to) * DAY_MS) : null;
  const from = isDay(sp.from) ? new Date(`${sp.from}T00:00:00Z`) : null;
  const confidence = sp.confidence && (sp.confidence === "IMPOSSIBLE" || sp.confidence in CONFIDENCE_RANK) ? (sp.confidence as Confidence | "IMPOSSIBLE") : null;
  const status = sp.status && (FORECAST_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as ForecastStatus) : null;

  const [{ t, lang }, settings, items, companies, rows, signals, parts] = await Promise.all([
    getI18n(),
    getSettings(),
    listItems(),
    prisma.customer.findMany({ where: { isCompany: true }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 300 }),
    listAgenda({ from, to, confidence, status, itemId: sp.item || null, companyId: sp.company || null, q: sp.q?.trim() || null }),
    getSettings().then((s) => modelSignals(s.agendaMinCases)),
    canManage || can(staff, "requestPurchase") ? partsToOrder(now) : Promise.resolve(null),
  ]);
  const v = t.v12;
  const toValue = isDay(sp.to) ? sp.to : to ? to.toISOString().slice(0, 10) : "";

  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5">
      <PageHeader title={v.title} subtitle={v.intro}>
        {can(staff, "configureAgenda") && (
          <PillLink href="/garage/agenda/reglages" variant="outline" icon={Settings2}>
            {v.settingsLink}
          </PillLink>
        )}
      </PageHeader>

      {items.length === 0 && (
        <p className="mb-4 rounded-[18px] border border-dashed border-gp-line p-4 text-sm">
          {v.emptyCatalogue}{" "}
          {can(staff, "configureAgenda") && (
            <Link href="/garage/agenda/reglages" className="font-medium underline underline-offset-4">
              {v.settingsLink}
            </Link>
          )}
        </p>
      )}

      <form method="get" className="mb-4 grid grid-cols-2 gap-2 rounded-[20px] border border-gp-line bg-gp-card p-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
        <label className="grid gap-1">
          <span className="text-xs text-gp-muted">{v.filters.from}</span>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="h-10 rounded-md border bg-background px-2" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-gp-muted">{v.filters.to}</span>
          <input type="date" name="to" defaultValue={toValue} className="h-10 rounded-md border bg-background px-2" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-gp-muted">{v.filters.item}</span>
          <select name="item" defaultValue={sp.item ?? ""} className="h-10 rounded-md border bg-background px-2">
            <option value="">{v.filters.all}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {nameOf(i, lang)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-gp-muted">{v.filters.confidence}</span>
          <select name="confidence" defaultValue={sp.confidence ?? ""} className="h-10 rounded-md border bg-background px-2">
            <option value="">{v.filters.all}</option>
            {(["GOOD", "MEDIUM", "LOW"] as const).map((c) => (
              <option key={c} value={c}>
                {v.confidence[c]}
              </option>
            ))}
            <option value="IMPOSSIBLE">{v.filters.impossible}</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-gp-muted">{v.filters.status}</span>
          <select name="status" defaultValue={sp.status ?? ""} className="h-10 rounded-md border bg-background px-2">
            <option value="">{v.filters.open}</option>
            {FORECAST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {v.status[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-gp-muted">{v.filters.company}</span>
          <select name="company" defaultValue={sp.company ?? ""} className="h-10 rounded-md border bg-background px-2">
            <option value="">{v.filters.all}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 grid gap-1 sm:col-span-1">
          <span className="text-xs text-gp-muted">{v.filters.customer}</span>
          <input name="q" defaultValue={sp.q ?? ""} className="h-10 rounded-md border bg-background px-2" />
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button type="submit" className="h-10 flex-1 rounded-full bg-gp-primary px-4 font-medium text-gp-primary-ink">
            {v.filters.apply}
          </button>
          <Link href="/garage/agenda" className="grid h-10 place-items-center rounded-full border px-3 text-xs">
            {v.filters.reset}
          </Link>
        </div>
      </form>

      <AgendaSelection canManage={canManage}>
        {rows.length === 0 ? (
          <EmptyState icon={CalendarCheck2} title={v.empty} />
        ) : (
          <ul className="grid gap-2" data-testid="agenda-rows">
            {rows.map((f) => (
              <li key={f.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-[18px] border border-gp-line bg-gp-card p-3 shadow-gp">
                {canManage && <input type="checkbox" name="forecast" value={f.id} className="mt-1 size-4" aria-label={`${nameOf(f.item, lang)} ${displayPlate(f.vehicle.plate)}`} />}
                <div className="min-w-40 flex-1">
                  <Link href={`/garage/vehicules/${f.vehicle.id}/entretien`} className="font-medium underline-offset-4 hover:underline">
                    <span className="font-mono text-xs" dir="ltr">
                      {displayPlate(f.vehicle.plate)}
                    </span>{" "}
                    {f.vehicle.make} {f.vehicle.model}
                  </Link>
                  <p className="text-xs text-gp-muted">
                    {f.vehicle.customer.name}
                    {f.vehicle.mileage !== null && <span dir="ltr"> · {formatKm(f.vehicle.mileage, lang)}</span>}
                  </p>
                </div>
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{nameOf(f.item, lang)}</p>
                  <p className="text-sm">
                    <DueText f={f} t={t} lang={lang} />
                  </p>
                  <p className="text-xs text-gp-muted">
                    <RangeText f={f} t={t} lang={lang} />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ConfidenceChip value={f.confidence} t={t} />
                  <span className="text-xs text-gp-muted">
                    {v.method[f.method as keyof typeof v.method]} · {fmt(v.cases, { n: f.cases })}
                  </span>
                  <StatusChip value={f.status} t={t} />
                  {f.warrantyUntil && <span className="text-xs text-gp-success-ink">{fmt(v.warranty, { date: formatDate(f.warrantyUntil, lang) })}</span>}
                  {f.vehicle.customer.reminderOptOut && <span className="text-xs text-gp-danger-ink">{v.messages.optOut}</span>}
                </div>
                {seePrice && (
                  <div className="min-w-28 text-end text-sm" dir="ltr">
                    {priceText(f.priceTtc, lang, t)}
                  </div>
                )}
                <ForecastExplain f={f} t={t} lang={lang} seePrice={seePrice} />
              </li>
            ))}
          </ul>
        )}
      </AgendaSelection>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Surface aria-labelledby="ag-signals">
          <SurfaceHeader id="ag-signals" title={v.signals.title} hint={v.signals.hint} />
          {signals.length === 0 ? (
            <p className="text-sm text-gp-muted">—</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {signals.slice(0, 12).map((s) => (
                <li key={`${s.make}${s.model}${s.itemId}`}>{fmt(v.signals.line, { item: nameOf(s.item, lang), km: formatKm(s.aroundKm, lang), model: `${s.make} ${s.model}`, n: s.cases })}</li>
              ))}
            </ul>
          )}
        </Surface>
        {parts && (
          <Surface aria-labelledby="pieces" id="pieces">
            <SurfaceHeader id="ag-parts" title={v.parts.title} hint={v.parts.hint}>
              {can(staff, "requestPurchase") && parts.length > 0 && (
                <PillLink href="/garage/purchase-orders/new" variant="outline" className="h-10">
                  {v.parts.order}
                </PillLink>
              )}
            </SurfaceHeader>
            {parts.length === 0 ? (
              <p className="text-sm text-gp-muted">{v.parts.none}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {parts.map((p) => (
                  <li key={p.id} className="flex gap-2">
                    <span className="font-mono text-xs text-gp-muted">{p.sku}</span>
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs tabular-nums" dir="ltr">
                      {fmt(v.parts.line, { need: formatQty(p.neededX100, lang), available: formatQty(p.availableX100, lang) })} {p.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        )}
      </div>
      <p className="mt-4 text-xs text-gp-muted">{fmt(v.settings.confidenceDoc, { good: settings.agendaGoodCases, min: settings.agendaMinCases })}</p>
    </div>
  );
}
