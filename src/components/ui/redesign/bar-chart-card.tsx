"use client";

import { useId, useState, type ReactNode } from "react";
import { formatMoney, type Lang } from "@/lib/format";
import { useElementWidth } from "@/components/ui/redesign/motion";
import { Surface, SurfaceHeader } from "@/components/ui/redesign/surface";

const loc = (lang: Lang) => (lang === "en" ? "en-GB" : lang === "ar" ? "ar-TN" : "fr-FR");

/** Rounds the top of the scale up to 1, 2, 2.5 or 5 × 10ⁿ. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

export type StackedPoint = { label: string; full: string; base: number; top: number };

/**
 * Stacked bars in an SVG drawn at the real pixel width (round corners stay round):
 * `base` solid (black / white in dark mode), `top` orange hatched on top of it.
 * Bars grow from the bottom; hover shows the figures; a table gives the same
 * numbers to screen readers and to anyone who prefers reading them.
 */
export function BarChartCard({
  title,
  hint,
  points,
  legend,
  lang,
  money = true,
  tableLabel,
  firstColumn,
  className,
  action,
}: {
  title: string;
  hint?: string;
  points: StackedPoint[];
  legend: { base: string; top: string };
  lang: Lang;
  money?: boolean;
  tableLabel: string;
  firstColumn: string;
  className?: string;
  action?: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const show = (v: number) => (money ? formatMoney(v, lang) : v.toLocaleString(loc(lang)));
  const compact = (v: number) => new Intl.NumberFormat(loc(lang), { notation: "compact", maximumFractionDigits: 1 }).format(money ? v / 1000 : v);

  const H = 240;
  const axis = 44;
  const bottom = 26;
  const plotH = H - bottom - 8;
  const max = niceMax(Math.max(0, ...points.map((p) => p.base + p.top)));
  const slot = (width - axis) / Math.max(1, points.length);
  const barW = Math.max(8, Math.min(36, slot * 0.62));
  const rx = Math.min(8, barW / 3);
  const y = (v: number) => (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const hp = hover === null ? null : points[hover];

  return (
    <Surface className={className} aria-labelledby={`${id}-t`}>
      <SurfaceHeader id={`${id}-t`} title={title} hint={hint}>
        {action}
      </SurfaceHeader>
      <div className="rounded-[18px] bg-gp-panel p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap justify-end gap-4 text-xs text-gp-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: "var(--gp-accent)" }} aria-hidden /> {legend.top}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-gp-primary" aria-hidden /> {legend.base}
          </span>
        </div>
        <div ref={ref} className="relative" dir="ltr" onMouseLeave={() => setHover(null)}>
          <svg width="100%" height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden className="block overflow-visible">
            <defs>
              <pattern id={`${id}-h`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="var(--gp-accent-tint)" />
                <rect width="3" height="7" fill="var(--gp-accent)" />
              </pattern>
            </defs>
            {ticks.map((tk) => (
              <g key={tk}>
                <line x1={axis} x2={width} y1={8 + plotH - y(tk)} y2={8 + plotH - y(tk)} stroke="var(--gp-line)" strokeDasharray={tk ? "3 4" : undefined} />
                <text x={0} y={8 + plotH - y(tk) + 4} fontSize="11" fill="var(--gp-muted)">
                  {compact(tk)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = axis + slot * i + slot / 2;
              const hb = y(p.base);
              const ht = y(p.top);
              const gap = hb > 0 && ht > 0 ? 3 : 0;
              const dim = hover !== null && hover !== i;
              return (
                <g key={p.full} className="gp-grow-y" style={{ animationDelay: `${i * 30}ms`, opacity: dim ? 0.45 : 1, transition: "opacity 150ms" }}>
                  {hb > 0 && <rect x={cx - barW / 2} y={8 + plotH - hb} width={barW} height={hb} rx={rx} fill="var(--gp-primary)" />}
                  {ht > 0 && (
                    <rect x={cx - barW / 2 + 0.75} y={8 + plotH - hb - gap - ht + 0.75} width={barW - 1.5} height={Math.max(0, ht - 1.5)} rx={rx} fill={`url(#${id}-h)`} stroke="var(--gp-accent)" strokeWidth="1.5" />
                  )}
                  <text x={cx} y={H - 6} fontSize="11" textAnchor="middle" fill={hover === i ? "var(--gp-ink)" : "var(--gp-muted)"}>
                    {p.label}
                  </text>
                  <rect x={axis + slot * i} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {hp && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-2xl border border-gp-line bg-gp-card px-3 py-2 text-xs text-gp-ink shadow-lg"
              style={{ left: Math.min(width - 72, Math.max(72, axis + slot * hover + slot / 2)) }}
            >
              <p className="mb-1 font-semibold capitalize">{hp.full}</p>
              <p className="flex justify-between gap-3"><span className="text-gp-muted">{legend.base}</span><b className="tabular-nums">{show(hp.base)}</b></p>
              <p className="flex justify-between gap-3"><span className="text-gp-muted">{legend.top}</span><b className="tabular-nums">{show(hp.top)}</b></p>
            </div>
          )}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer rounded-full text-[13px] text-gp-muted hover:text-gp-ink">{tableLabel}</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-start text-[13px]">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-gp-muted">
                <th scope="col" className="py-1.5 text-start font-medium">{firstColumn}</th>
                <th scope="col" className="py-1.5 text-end font-medium">{legend.base}</th>
                <th scope="col" className="py-1.5 text-end font-medium">{legend.top}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.full} className="border-t border-gp-line">
                  <th scope="row" className="py-1.5 text-start font-normal capitalize">{p.full}</th>
                  <td className="py-1.5 text-end tabular-nums" dir="ltr">{show(p.base)}</td>
                  <td className="py-1.5 text-end tabular-nums" dir="ltr">{show(p.top)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Surface>
  );
}
