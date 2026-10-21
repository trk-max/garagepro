import { Package, Plus } from "lucide-react";
import type { PartCard as Card } from "@/server/dashboard-v10-stock";
import { StockMoveForm } from "@/components/stock/stock-move-form";
import { Chip } from "@/components/ui/redesign/chip";
import { DialogButton } from "@/components/ui/redesign/dialog";
import { ProgressRing } from "@/components/ui/redesign/progress";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt, formatQty, type Lang } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Part card (reference "goal" cards): tinted icon, supplier chip, ring = stock as % of
 * the minimum (red when low), name, "12 of 20 units", and "+ Add stock" opening the
 * existing stock movement form (manageStock only).
 */
export function PartCard({ p, t, lang, canEdit, suppliers }: { p: Card; t: Dictionary; lang: Lang; canEdit: boolean; suppliers: { id: string; name: string }[] }) {
  const s = t.v10.pages.stock;
  const pct = p.percentOfMin;
  return (
    <li className="gp-lift flex flex-col rounded-[24px] border border-gp-line bg-gp-card p-4 shadow-gp">
      <div className="flex items-start justify-between gap-2">
        <span className={cn("grid size-9 place-items-center rounded-[12px]", p.isLow ? "bg-gp-danger-bg text-gp-danger-ink" : "bg-gp-accent-tint text-gp-accent-ink")} aria-hidden>
          <Package className="size-4" />
        </span>
        {p.supplier && <Chip className="max-w-[9rem] truncate">{p.supplier}</Chip>}
      </div>
      <div className="mt-3 flex justify-center">
        <ProgressRing
          value={pct ?? 0}
          size={112}
          stroke={10}
          tone={p.isLow ? "danger" : "accent"}
          label={p.name}
          display={pct === null ? "—" : `${Math.round(pct)}%`}
          caption={pct === null ? s.noMin : s.ofMin}
        />
      </div>
      <h3 className="mt-3 line-clamp-2 text-center text-sm font-semibold break-words" title={p.name}>{p.name}</h3>
      <p className="text-center font-mono text-[11px] text-gp-muted">{p.sku}</p>
      <p className={cn("mt-1 text-center text-xs", p.isLow ? "font-medium text-gp-danger-ink" : "text-gp-muted")}>
        {fmt(s.units, { x: formatQty(p.stockX100, lang), y: formatQty(p.minStockX100, lang), unit: p.unit })}
      </p>
      {canEdit && (
        <div className="mt-auto pt-3">
          <DialogButton
            id={`add-stock-${p.id}`}
            label={s.addStock}
            title={fmt(s.addStockTitle, { name: p.name })}
            closeLabel={t.v10.shell.close}
            variant="secondary"
            icon={<Plus className="size-4" aria-hidden />}
            className="h-10 w-full"
          >
            <StockMoveForm t={t} partId={p.id} suppliers={suppliers} className="space-y-3" />
          </DialogButton>
        </div>
      )}
    </li>
  );
}
