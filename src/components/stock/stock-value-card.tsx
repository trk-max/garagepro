import type { StockCounts, StockOverview } from "@/server/dashboard-v10-stock";
import { CountUp } from "@/components/ui/redesign/count-up";
import { DeltaChip } from "@/components/ui/redesign/chip";
import { ProgressBar } from "@/components/ui/redesign/progress";
import { Surface } from "@/components/ui/redesign/surface";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt, formatMoney, type Lang } from "@/lib/format";

const loc = (lang: Lang) => (lang === "en" ? "en-GB" : lang === "ar" ? "ar-TN" : "fr-FR");

/**
 * "Stock value" (reference "Total saved"): big amount, change since the start of the
 * month (finance roles only: `overview` is null for the others, who see the counts
 * without any money), share of parts in stock; on the right the monthly purchases as
 * small bars (the current month orange hatched) — only for roles that see the suppliers.
 */
export function StockValueCard({ t, lang, overview: money, counts, purchases }: { t: Dictionary; lang: Lang; overview: StockOverview | null; counts: StockCounts; purchases: { month: string; amount: number }[] | null }) {
  const overview = money ?? counts;
  const s = t.v10.pages.stock;
  const max = Math.max(1, ...(purchases ?? []).map((p) => p.amount));
  const share = overview.totalParts ? (overview.itemsInStock / overview.totalParts) * 100 : 0;
  return (
    <Surface className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-labelledby="st-value">
      <div className="flex flex-col">
        {money ? (
          <>
            <h2 id="st-value" className="text-[15px] font-medium">{s.value}</h2>
            <p className="text-[13px] text-gp-muted">{s.valueHint}</p>
            <p className="mt-4 text-[36px] leading-none font-semibold tracking-tight sm:text-[40px]">
              <CountUp value={money.value} format="money" lang={lang} />
            </p>
            <div className="mt-3">
              <DeltaChip change={money.deltaPercent} lang={lang} caption={s.vsMonthStart} noCompare={t.v10.overview.noCompare} />
            </div>
          </>
        ) : (
          <>
            <h2 id="st-value" className="text-[15px] font-medium">{s.items}</h2>
            <p className="mt-4 text-[36px] leading-none font-semibold tracking-tight sm:text-[40px]">
              <CountUp value={counts.itemsInStock} lang={lang} />
              <span className="ms-2 text-lg font-medium text-gp-muted">/ {counts.totalParts}</span>
            </p>
          </>
        )}
        <div className="mt-auto pt-6">
          <ProgressBar value={share} label={fmt(s.inStock, { x: overview.itemsInStock, y: overview.totalParts })} />
          <p className="mt-2 text-xs text-gp-muted">{fmt(s.inStock, { x: overview.itemsInStock, y: overview.totalParts })}</p>
        </div>
      </div>
      {purchases && (
        <figure className="flex min-w-0 flex-col" aria-labelledby="st-buy">
          <figcaption id="st-buy" className="text-[13px] text-gp-muted">
            {s.purchases} <span className="sr-only">— {s.purchasesHint}</span>
          </figcaption>
          <svg width="0" height="0" className="absolute" aria-hidden>
            <defs>
              <pattern id="st-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="var(--gp-accent-tint)" />
                <rect width="3" height="7" fill="var(--gp-accent)" />
              </pattern>
            </defs>
          </svg>
          <ul className="mt-3 flex h-44 items-end gap-3" dir="ltr">
            {purchases.map((p, i) => {
              const last = i === purchases.length - 1;
              const label = new Intl.DateTimeFormat(loc(lang), { month: "short", timeZone: "UTC" }).format(new Date(`${p.month}-15T12:00:00Z`));
              return (
                <li key={p.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${label} : ${formatMoney(p.amount, lang)}`}>
                  <span className="sr-only">{`${label} : ${formatMoney(p.amount, lang)}`}</span>
                  <svg aria-hidden width="100%" height={`${Math.max(4, (p.amount / max) * 100)}%`} className="gp-grow-y block max-w-12 overflow-visible" style={{ animationDelay: `${i * 40}ms` }}>
                    <rect width="100%" height="100%" rx="10" fill={last ? "url(#st-hatch)" : "var(--gp-panel)"} stroke={last ? "var(--gp-accent)" : "none"} strokeWidth="1.5" />
                  </svg>
                  <span className="text-[11px] text-gp-muted capitalize">{label}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-gp-muted">{s.purchasesHint}</p>
        </figure>
      )}
    </Surface>
  );
}
