import Link from "next/link";
import { correctMovementAction } from "@/actions/stock";
import { ReasonButton } from "@/components/team/prompt-action";
import { Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import type { Dictionary } from "@/lib/i18n/fr";
import { formatDateTime, formatQty, woNumber, type Lang } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { recentMovements } from "@/server/parts";

type Move = Awaited<ReturnType<typeof recentMovements>>[number];

/** Latest stock movements, with the existing "correct" action (manageStock) — same content as before. */
export function MovementsCard({ t, lang, movements, canEdit }: { t: Dictionary; lang: Lang; movements: Move[]; canEdit: boolean }) {
  const v = t.v7.stock;
  return (
    <Surface aria-labelledby="st-moves">
      <SurfaceHeader id="st-moves" title={t.parts.movements} />
      <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
        {movements.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-2 rounded-[14px] px-2 py-2 text-sm hover:bg-gp-hover">
            <div className="min-w-0">
              <p className="truncate">
                <span className="font-mono text-xs text-gp-muted">{m.part.sku}</span> {m.part.name}
              </p>
              <p className="text-xs text-gp-muted">
                {t.parts.reasons[m.reason]}
                {m.workOrder && (
                  <>
                    {" · "}
                    <Link href={`/garage/work-orders/${m.workOrder.id}`} className="hover:underline">
                      {woNumber(m.workOrder.number)}
                    </Link>
                  </>
                )}
                {m.supplier && ` · ${m.supplier.name}`}
                {" · "}
                {formatDateTime(m.createdAt, lang)}
              </p>
              {m.note && <p className="text-xs text-gp-muted">{m.note}</p>}
              {m.correctedBy ? (
                <p className="text-xs text-gp-accent-ink">{v.corrected}</p>
              ) : (
                canEdit &&
                ["PURCHASE", "ADJUSTMENT", "SUPPLIER_RETURN"].includes(m.reason) && (
                  <ReasonButton className="mt-1 h-6" question={v.correctReason} action={correctMovementAction.bind(null, m.id)}>
                    {v.correct}
                  </ReasonButton>
                )
              )}
            </div>
            <span dir="ltr" className={cn("shrink-0 font-medium tabular-nums", m.deltaX100 > 0 ? "text-gp-success-ink" : "text-gp-danger-ink")}>
              {m.deltaX100 > 0 ? "+" : ""}
              {formatQty(m.deltaX100, lang)}
            </span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
