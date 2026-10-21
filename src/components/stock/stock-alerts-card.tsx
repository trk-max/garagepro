import Link from "next/link";
import { BellRing, ChevronRight } from "lucide-react";
import { Chip } from "@/components/ui/redesign/chip";
import { Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt } from "@/lib/format";

/**
 * "Alerts" (reference "Auto-save"): the only stock alert that exists is the
 * always-on low-stock one — shown as an information row, never as a fake switch.
 */
export function StockAlertsCard({ t, lowCount, canFollowUp }: { t: Dictionary; lowCount: number; canFollowUp: boolean }) {
  const s = t.v10.pages.stock;
  const row = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gp-panel" aria-hidden>
        <BellRing className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{s.lowAlert}</span>
        <span className="block text-xs text-gp-muted">{s.lowAlertHint}</span>
        <span className={`mt-1 block text-xs font-medium ${lowCount ? "text-gp-danger-ink" : "text-gp-success-ink"}`}>{fmt(s.lowCount, { n: lowCount })}</span>
      </span>
      {canFollowUp && <ChevronRight className="size-4 shrink-0 text-gp-muted rtl:rotate-180" aria-hidden />}
    </>
  );
  return (
    <Surface aria-labelledby="st-alerts">
      <SurfaceHeader id="st-alerts" title={s.alerts}>
        <Chip tone="success">{fmt(s.active, { n: 1 })}</Chip>
      </SurfaceHeader>
      {canFollowUp ? (
        <Link href="/garage/suivi" className="flex items-center gap-3 rounded-[18px] p-2 hover:bg-gp-hover" aria-label={`${s.lowAlert} — ${s.followUp}`}>
          {row}
        </Link>
      ) : (
        <div className="flex items-center gap-3 p-2">{row}</div>
      )}
      <Link href="/garage/parts?low=1" className="mt-3 flex h-10 items-center justify-center rounded-full bg-gp-panel text-sm font-medium hover:bg-gp-hover">
        {t.parts.lowOnly}
      </Link>
    </Surface>
  );
}
