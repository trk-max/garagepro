"use client";

import { useState } from "react";
import { formatMoney, type Lang } from "@/lib/format";

const dayLabel = (iso: string, locale: string) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const localeOf = (lang: string) => (lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR");

/** One series per day as tall bars with a soft gradient; hover shows the exact value. */
export function DailyBars({ days, values, lang, format }: { days: string[]; values: number[]; lang: string; format: "money" | "count" }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const show = (v: number) => (format === "money" ? formatMoney(v, lang as Lang) : String(v));
  return (
    <div className="week-chart" dir="ltr">
      <style>{`
        .week-chart { --bar-top: var(--gp-accent, #e2603a); --bar-bottom: var(--gp-accent-tint, #fbe9e2); }
      `}</style>
      <div className="relative flex h-56 items-end gap-3" role="img" aria-label={values.map((v, i) => `${dayLabel(days[i]!, localeOf(lang))} ${show(v)}`).join(", ")}>
        {values.map((v, i) => (
          <div key={days[i]} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div
              className="gp-grow-y w-full rounded-[8px] transition-opacity"
              style={{ height: `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%`, background: "linear-gradient(to bottom, var(--bar-top), var(--bar-bottom))", opacity: hover === null || hover === i ? 1 : 0.55 }}
            />
            {hover === i && (
              <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-2xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                <span className="text-muted-foreground">{dayLabel(days[i]!, localeOf(lang))}</span> <span className="ms-2 font-mono font-semibold tabular-nums">{show(v)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
        {days.map((d) => (
          <span key={d} className="flex-1 text-center capitalize">
            {dayLabel(d, localeOf(lang))}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Two counts per day as step lines (same scale), with a legend and a hover readout. */
export function StepLines({ days, a, b, labels, lang }: { days: string[]; a: number[]; b: number[]; labels: [string, string]; lang: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 220;
  const pad = 8;
  const max = Math.max(1, ...a, ...b);
  const x = (i: number) => (i / days.length) * W;
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)} L${x(i + 1)},${y(v)}`).join(" ");
  return (
    <div className="step-chart" dir="ltr">
      <style>{`
        .step-chart { --s1: var(--gp-primary, #0b0b0c); --s2: var(--gp-accent, #e2603a); }
      `}</style>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-[var(--s1)]" aria-hidden /> {labels[0]}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-[var(--s2)]" aria-hidden /> {labels[1]}
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" preserveAspectRatio="none" role="img" aria-label={`${labels[0]} / ${labels[1]}`}>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={path(a)} fill="none" stroke="var(--s1)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <path d={path(b)} fill="none" stroke="var(--s2)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {hover !== null && <rect x={x(hover)} y={0} width={W / days.length} height={H} className="fill-foreground/5" />}
        </svg>
        <div className="absolute inset-0 flex">
          {days.map((d, i) => (
            <div key={d} className="flex-1" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </div>
        {hover !== null && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-2xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md" style={{ left: `${Math.min(70, (hover / days.length) * 100)}%` }}>
            <p className="capitalize text-muted-foreground">{dayLabel(days[hover]!, localeOf(lang))}</p>
            <p className="tabular-nums">
              {labels[0]} : <b>{a[hover]}</b>
            </p>
            <p className="tabular-nums">
              {labels[1]} : <b>{b[hover]}</b>
            </p>
          </div>
        )}
      </div>
      <div className="mt-2 flex text-xs text-muted-foreground">
        {days.map((d) => (
          <span key={d} className="flex-1 text-center capitalize">
            {dayLabel(d, localeOf(lang))}
          </span>
        ))}
      </div>
    </div>
  );
}
