import { fmt, formatDate, formatKm, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { missingText, priceText } from "@/components/agenda/agenda-ui";

type Explain = {
  group?: { label?: string } | null;
  reference?: { intervalKm: number | null; intervalMonths: number | null };
  rhythm?: { kmPerMonth: number | null; readings: number; spanDays: number; excluded: number };
  price?: { package?: string } | null;
};

export type ExplainForecast = {
  method: string;
  cases: number;
  missing: unknown;
  explain: unknown;
  lastDoneAt: Date | null;
  lastDoneKm: number | null;
  dueKm: number | null;
  dueByKmDate: Date | null;
  dueByTimeDate: Date | null;
  dueDate: Date | null;
  priceTtc: number | null;
  priceSource: string | null;
  warrantyUntil: Date | null;
};

/** "How it is computed": method, number of cases, both due rules, rhythm, source of the price. */
export function ForecastExplain({ f, t, lang, seePrice }: { f: ExplainForecast; t: Dictionary; lang: Lang; seePrice: boolean }) {
  const v = t.v12;
  const e = (f.explain ?? {}) as Explain;
  const keptKm = !!f.dueDate && !!f.dueByKmDate && f.dueDate.getTime() === f.dueByKmDate.getTime();
  const keptTime = !!f.dueDate && !!f.dueByTimeDate && f.dueDate.getTime() === f.dueByTimeDate.getTime();
  const missing = missingText(f.missing, t);
  return (
    <details className="w-full text-xs text-gp-muted">
      <summary className="cursor-pointer select-none">{v.explain}</summary>
      <ul className="mt-2 space-y-1 ps-4">
        <li>{fmt(v.methodLong[f.method as keyof typeof v.methodLong] ?? "", { group: e.group?.label ?? "—", n: f.cases })}</li>
        {f.lastDoneAt && (
          <li>
            {fmt(v.lastDone, { date: formatDate(f.lastDoneAt, lang) })}
            {f.lastDoneKm !== null && <span dir="ltr"> · {formatKm(f.lastDoneKm, lang)}</span>}
          </li>
        )}
        {f.dueKm !== null && (
          <li>
            {fmt(v.byKm, { km: formatKm(f.dueKm, lang) })}
            {f.dueByKmDate && fmt(v.byKmDate, { date: formatDate(f.dueByKmDate, lang) })}
            {keptKm && <strong> — {v.kept}</strong>}
          </li>
        )}
        {f.dueByTimeDate && (
          <li>
            {fmt(v.byTime, { date: formatDate(f.dueByTimeDate, lang) })}
            {keptTime && <strong> — {v.kept}</strong>}
          </li>
        )}
        <li>
          {e.rhythm?.kmPerMonth ? fmt(v.rhythm, { n: e.rhythm.kmPerMonth, readings: e.rhythm.readings, days: e.rhythm.spanDays }) : v.rhythmUnknown}
          {!!e.rhythm?.excluded && <> {fmt(v.excluded, { n: e.rhythm.excluded })}</>}
        </li>
        {missing && f.method !== "IMPOSSIBLE" && <li>{fmt(v.missingAlso, { missing })}</li>}
        {seePrice && f.priceTtc !== null && f.priceSource && (
          <li>
            {t.v12.cols.price} : <span dir="ltr">{priceText(f.priceTtc, lang, t)}</span> — {fmt(v.priceSource[f.priceSource as keyof typeof v.priceSource] ?? "", { name: e.price?.package ?? "" })}
          </li>
        )}
        {f.warrantyUntil && <li className="text-gp-success-ink">{fmt(v.warranty, { date: formatDate(f.warrantyUntil, lang) })}</li>}
      </ul>
    </details>
  );
}
