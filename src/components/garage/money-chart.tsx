"use client";

import { useState } from "react";
import type { MonthPoint } from "@/lib/dashboard-series";
import { formatMoney, type Lang } from "@/lib/format";

/**
 * Invoiced (TTC) vs collected, per month: grouped bars on one money axis, legend,
 * hover tooltip, and the same numbers as a table (colour is never the only cue).
 */
export function MoneyChart({
  points,
  lang,
  labels,
}: {
  points: MonthPoint[];
  lang: Lang;
  labels: { invoiced: string; collected: string; table: string; month: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.flatMap((p) => [p.invoiced, p.collected]));
  const monthName = (key: string) => {
    const [y, m] = key.split("-").map(Number) as [number, number];
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
  };
  const active = hover === null ? null : points[hover];

  return (
    <div className="money-chart">
      <style>{`
        .money-chart { --series-1: #2a78d6; --series-2: #1baf7a; }
        .dark .money-chart { --series-1: #3987e5; --series-2: #199e70; }
      `}</style>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-[var(--series-1)]" aria-hidden /> {labels.invoiced}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-[var(--series-2)]" aria-hidden /> {labels.collected}
        </span>
      </div>
      <div className="relative" dir="ltr">
        <div className="flex h-40 items-end gap-3 border-b border-border" role="img" aria-label={`${labels.invoiced} / ${labels.collected}`}>
          {points.map((p, i) => (
            <div
              key={p.month}
              className="flex h-full flex-1 items-end justify-center gap-0.5 rounded-sm px-1 hover:bg-accent/40"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="w-1/2 max-w-6 rounded-t bg-[var(--series-1)]" style={{ height: `${(p.invoiced / max) * 100}%` }} />
              <div className="w-1/2 max-w-6 rounded-t bg-[var(--series-2)]" style={{ height: `${(p.collected / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-3 text-[0.6875rem] text-muted-foreground">
          {points.map((p) => (
            <span key={p.month} className="flex-1 text-center">
              {monthName(p.month)}
            </span>
          ))}
        </div>
        {active && (
          <div className="pointer-events-none absolute top-0 start-0 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
            <p className="font-medium">{monthName(active.month)}</p>
            <p className="tabular-nums">
              {labels.invoiced} : {formatMoney(active.invoiced, lang)}
            </p>
            <p className="tabular-nums">
              {labels.collected} : {formatMoney(active.collected, lang)}
            </p>
          </div>
        )}
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">{labels.table}</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-start font-normal">{labels.month}</th>
              <th className="text-end font-normal">{labels.invoiced}</th>
              <th className="text-end font-normal">{labels.collected}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="border-t">
                <td className="py-1">{monthName(p.month)}</td>
                <td className="py-1 text-end" dir="ltr">{formatMoney(p.invoiced, lang)}</td>
                <td className="py-1 text-end" dir="ltr">{formatMoney(p.collected, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
