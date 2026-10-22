"use client";

import { useMemo, useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { computeTotals, formatMoney, formatQty, lineTotalHt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type ChoiceLine = {
  id: string;
  description: string;
  quantityX100: number;
  unitPrice: number;
  taxRateBp: number;
  priority: "SAFETY" | "RECOMMENDED" | "WATCH" | null;
  partCondition: "NEW" | "USED" | "EXCHANGE" | "REUSED" | "CUSTOMER_SUPPLIED" | null;
};

/**
 * V16 Lot 2 — one Accept / Refuse choice per quote line, with the accepted total recomputed at once (TTC,
 * stamp duty when the quote carries it). Accepted lines are posted as « accept » fields; the server refuses
 * every other line of the quote. Shared by the customer portal and the staff agreement dialog.
 */
export function QuoteLineChoices({
  lines,
  stampDuty,
  labels,
  onTotal,
}: {
  lines: ChoiceLine[];
  stampDuty: number;
  labels: { accept: string; refuse: string; total: string };
  onTotal?: (accepted: number, totalTtc: number) => void;
}) {
  const { t, lang } = useI18n();
  const q = t.v16.quote;
  const [refused, setRefused] = useState<Set<string>>(new Set());
  const accepted = useMemo(() => lines.filter((l) => !refused.has(l.id)), [lines, refused]);
  const totals = computeTotals(accepted, stampDuty);

  const set = (id: string, accept: boolean) => {
    const next = new Set(refused);
    if (accept) next.delete(id);
    else next.add(id);
    setRefused(next);
    const acc = lines.filter((l) => !next.has(l.id));
    onTotal?.(acc.length, computeTotals(acc, stampDuty).totalTtc);
  };

  return (
    <div className="grid gap-3">
      <ul className="divide-y divide-gp-line rounded-[16px] border border-gp-line">
        {lines.map((l) => {
          const ok = !refused.has(l.id);
          return (
            <li key={l.id} className={cn("grid gap-2 p-3 text-sm", !ok && "bg-gp-panel")} data-line={l.id}>
              {ok && <input type="hidden" name="accept" value={l.id} />}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("font-medium", !ok && "text-gp-muted line-through")}>{l.description}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gp-muted">
                    <span>× {formatQty(l.quantityX100, lang)}</span>
                    {l.priority && (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2", l.priority === "SAFETY" ? "bg-gp-danger-bg text-gp-danger-ink" : "bg-gp-panel")}>
                        {l.priority === "SAFETY" && <ShieldAlert className="size-3" aria-hidden />}
                        {q.priority[l.priority]}
                      </span>
                    )}
                    {l.partCondition && <span>{q.condition[l.partCondition]}</span>}
                  </p>
                </div>
                <span className={cn("shrink-0 tabular-nums", !ok && "text-gp-muted line-through")} dir="ltr">
                  {formatMoney(lineTotalHt(l), lang)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={l.description}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={ok}
                  onClick={() => set(l.id, true)}
                  className={cn("inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border text-sm font-medium", ok ? "border-[#1f7a44] bg-[#1f7a44] text-white" : "border-gp-line bg-gp-card")}
                >
                  <Check className="size-4" aria-hidden /> {labels.accept}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!ok}
                  onClick={() => set(l.id, false)}
                  className={cn("inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border text-sm font-medium", !ok ? "border-gp-danger-ink bg-gp-danger-bg text-gp-danger-ink" : "border-gp-line bg-gp-card")}
                >
                  <X className="size-4" aria-hidden /> {labels.refuse}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between text-gp-muted">
          <dt>{t.invoices.totalHt}</dt>
          <dd className="tabular-nums" dir="ltr">{formatMoney(totals.totalHt, lang)}</dd>
        </div>
        {totals.stampDuty > 0 && (
          <div className="flex justify-between text-gp-muted">
            <dt>{t.invoices.stampDuty}</dt>
            <dd className="tabular-nums" dir="ltr">{formatMoney(totals.stampDuty, lang)}</dd>
          </div>
        )}
        <div className="flex justify-between text-base font-bold" aria-live="polite">
          <dt>{labels.total}</dt>
          <dd className="tabular-nums" dir="ltr" data-testid="accepted-total">{formatMoney(totals.totalTtc, lang)}</dd>
        </div>
      </dl>
    </div>
  );
}
