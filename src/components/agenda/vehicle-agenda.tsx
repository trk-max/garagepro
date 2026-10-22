import { addManualEventAction, cancelEventAction, correctEventAction } from "@/actions/agenda";
import { ActionForm } from "@/components/action-form";
import { ConfidenceChip, DueText, nameOf, priceText, RangeText, StatusChip } from "@/components/agenda/agenda-ui";
import { ForecastExplain } from "@/components/agenda/forecast-explain";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDate, formatKm, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";
import type { vehicleAgenda } from "@/server/agenda";

type Data = NonNullable<Awaited<ReturnType<typeof vehicleAgenda>>>;

/** Vehicle sheet — "Prochaines réparations": forecasts (estimates), known replacements, garage signals. */
export function VehicleAgenda({ data, t, lang, canManage, seePrice }: { data: Data; t: Dictionary; lang: Lang; canManage: boolean; seePrice: boolean }) {
  const v = t.v12;
  const today = new Date().toISOString().slice(0, 10);
  const km = (n: number | null) => (n === null ? "" : ` · ${formatKm(n, lang)}`);
  return (
    <section id="agenda" className="space-y-4">
      <Card>
        <CardTitle>{v.vehicle.title}</CardTitle>
        <p className="mb-3 text-xs text-muted-foreground">{v.intro}</p>
        {data.forecasts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{v.vehicle.none}</p>
        ) : (
          <ul className="divide-y">
            {data.forecasts.map((f) => (
              <li key={f.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3" data-forecast={f.item.code}>
                <div className="min-w-48 flex-1">
                  <p className="font-semibold">
                    {nameOf(f.item, lang)} <span className="text-xs font-normal text-muted-foreground">{fmt(v.version, { n: f.version })}</span>
                  </p>
                  <p className="text-sm">
                    <DueText f={f} t={t} lang={lang} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <RangeText f={f} t={t} lang={lang} />
                  </p>
                  {f.warrantyUntil && <p className="text-xs text-gp-success-ink">{fmt(v.warranty, { date: formatDate(f.warrantyUntil, lang) })}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ConfidenceChip value={f.confidence} t={t} />
                  <span className="text-xs text-muted-foreground" title={fmt(v.methodLong[f.method as keyof typeof v.methodLong], { group: "", n: f.cases })}>
                    {v.method[f.method as keyof typeof v.method]} · {fmt(v.cases, { n: f.cases })}
                  </span>
                  <StatusChip value={f.status} t={t} />
                  {seePrice && (
                    <span className="text-sm" dir="ltr">
                      {priceText(f.priceTtc, lang, t)}
                    </span>
                  )}
                </div>
                <ForecastExplain f={f} t={t} lang={lang} seePrice={seePrice} />
              </li>
            ))}
          </ul>
        )}
        {data.signals.length > 0 && (
          <div className="mt-3 rounded-md bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">{v.vehicle.signals}</p>
            <ul className="mt-1 list-disc ps-5">
              {data.signals.map((s) => (
                <li key={s.itemId}>{fmt(v.signals.line, { item: nameOf(s.item, lang), km: formatKm(s.aroundKm, lang), model: `${s.make} ${s.model}`, n: s.cases })}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">{v.signals.hint}</p>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>{v.vehicle.events}</CardTitle>
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{v.vehicle.noEvents}</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.events.map((e) => (
              <li key={e.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 py-2", e.cancelledAt && "text-muted-foreground line-through decoration-1")}>
                <span className="font-medium">{nameOf(e.item, lang)}</span>
                <span className="text-xs">{v.vehicle.source[e.source as keyof typeof v.vehicle.source] ?? e.source}</span>
                <span className="text-xs" dir="ltr">
                  {fmt(v.vehicle.detected, { date: formatDate(e.doneAt, lang), km: km(e.km) })}
                </span>
                {(e.correctedDoneAt || e.correctedKm !== null) && (
                  <span className="text-xs text-amber-700 dark:text-amber-400" dir="ltr">
                    {fmt(v.vehicle.corrected, { date: formatDate(e.correctedDoneAt ?? e.doneAt, lang), km: km(e.correctedKm ?? e.km) })}
                  </span>
                )}
                {e.cancelledAt && <span className="text-xs no-underline">{fmt(v.vehicle.cancelled, { reason: e.cancelReason ?? "" })}</span>}
                {e.matchedText && <span className="text-xs text-muted-foreground">« {e.matchedText} »</span>}
                {canManage && !e.cancelledAt && (
                  <span className="ms-auto flex flex-wrap items-center gap-2">
                    <ActionForm action={correctEventAction.bind(null, e.id, data.vehicle.id)} reset={false} className="flex items-center gap-1">
                      <Input type="date" name="doneAt" defaultValue={(e.correctedDoneAt ?? e.doneAt).toISOString().slice(0, 10)} className="h-8 w-36" aria-label={v.vehicle.doneAt} />
                      <Input name="km" inputMode="numeric" dir="ltr" defaultValue={e.correctedKm ?? e.km ?? ""} className="h-8 w-24" aria-label={v.vehicle.km} />
                      <Button type="submit" size="sm" variant="outline">
                        {v.vehicle.correct}
                      </Button>
                    </ActionForm>
                    <ReasonButton className="h-8" question={v.vehicle.cancelReason} action={cancelEventAction.bind(null, e.id, data.vehicle.id)}>
                      {v.vehicle.cancel}
                    </ReasonButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && data.items.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="text-sm font-medium">{v.vehicle.addEvent}</p>
            <p className="mb-2 text-xs text-muted-foreground">{v.vehicle.addHint}</p>
            <ActionForm action={addManualEventAction.bind(null, data.vehicle.id)} className="grid gap-2 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
              <Field label={v.vehicle.item}>
                <NativeSelect name="itemId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {data.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {nameOf(i, lang)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={v.vehicle.doneAt}>
                <Input type="date" name="doneAt" required defaultValue={today} />
              </Field>
              <Field label={v.vehicle.km}>
                <Input name="km" inputMode="numeric" dir="ltr" defaultValue={data.vehicle.mileage ?? ""} />
              </Field>
              <Button type="submit">{t.common.add}</Button>
            </ActionForm>
          </div>
        )}
      </Card>
    </section>
  );
}
