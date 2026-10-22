import { Ticket } from "lucide-react";
import { PillLink, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";

type Summary = { total: number; waiting: number; called: number; absent: number; avgWait: number | null; longest: number | null; longWaits: number };

/** V15 — dashboard block « Accueil »: waiting now, at a counter, longest wait, real average of the day, absents. */
export function ReceptionDashCard({ t, summary, alertMin }: { t: Dictionary; summary: Summary; alertMin: number }) {
  const v = t.v15;
  const min = (n: number | null) => (n === null ? v.noEstimate : fmt(v.minutes, { n }));
  const tiles: [string, string][] = [
    [v.dash.waiting, String(summary.waiting)],
    [v.dash.called, String(summary.called)],
    [v.dash.longest, min(summary.longest)],
    [v.dash.avg, min(summary.avgWait)],
    [v.dash.absent, String(summary.absent)],
  ];
  return (
    <Surface aria-labelledby="ov-reception" data-testid="reception-block">
      <SurfaceHeader id="ov-reception" title={v.dash.title} hint={summary.longWaits ? fmt(v.dash.long, { n: summary.longWaits, m: alertMin }) : undefined}>
        <PillLink href="/garage/accueil" variant="outline" icon={Ticket} className="h-10">
          {v.dash.open}
        </PillLink>
      </SurfaceHeader>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-[18px] bg-gp-panel p-3">
            <dt className="text-xs text-gp-muted">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}
