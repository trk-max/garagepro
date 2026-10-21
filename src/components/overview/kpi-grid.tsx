import type { ReactNode } from "react";
import { Boxes, CheckCheck, ClipboardList, Coins } from "lucide-react";
import type { Kpis } from "@/server/dashboard-v10";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt, type Lang } from "@/lib/format";
import { Chip, DeltaChip } from "@/components/ui/redesign/chip";
import { StatCard } from "@/components/ui/redesign/stat-card";
import { Surface } from "@/components/ui/redesign/surface";

/**
 * 2 × 2 figures: money received this month (finance roles, orange tile), open
 * repair orders, cars delivered this week, low-stock parts. Each tile is shown
 * only when the role may see it; the first one gets the orange accent.
 */
export function KpiGrid({
  t,
  lang,
  kpis,
  showOrders,
  showStockLink,
  outOfStock,
  dueToday,
}: {
  t: Dictionary;
  lang: Lang;
  kpis: Kpis;
  showOrders: boolean;
  showStockLink: boolean;
  outOfStock: number;
  dueToday: number;
}) {
  const o = t.v10.overview;
  const tiles: ReactNode[] = [];
  const accent = () => tiles.length === 0;
  if (kpis.revenue) {
    tiles.push(
      <StatCard key="rev" accent={accent()} label={o.revenueMonth} value={kpis.revenue.current} format="money" lang={lang} icon={Coins} href="/garage/invoices"
        footer={<DeltaChip onAccent change={kpis.revenue.deltaPercent} lang={lang} caption={o.vsLastMonth} noCompare={o.noCompare} />} />,
    );
  }
  if (showOrders) {
    const a = accent();
    tiles.push(
      <StatCard key="open" accent={a} label={o.openOrders} value={kpis.openOrders.current} lang={lang} icon={ClipboardList} href="/garage/work-orders"
        footer={
          kpis.openOrders.deltaPercent === null ? (
            <Chip tone={a ? "onAccent" : dueToday ? "accent" : "neutral"}>{fmt(o.dueToday, { n: dueToday })}</Chip>
          ) : (
            <DeltaChip onAccent={a} change={kpis.openOrders.deltaPercent} lang={lang} caption={o.vs7Days} noCompare={o.noCompare} />
          )
        } />,
      <StatCard key="done" label={o.completedWeek} value={kpis.completedThisWeek.current} lang={lang} icon={CheckCheck} href="/garage/work-orders?status=DELIVERED"
        footer={<DeltaChip change={kpis.completedThisWeek.deltaPercent} lang={lang} caption={o.vsLastWeek} noCompare={o.noCompare} />} />,
    );
  }
  const a = accent();
  tiles.push(
    <StatCard key="low" accent={a} label={o.lowStock} value={kpis.lowStock.current} lang={lang} icon={Boxes} href={showStockLink ? "/garage/parts?low=1" : undefined}
      footer={
        <Chip tone={a ? "onAccent" : outOfStock ? "danger" : kpis.lowStock.current ? "accent" : "success"}>
          {outOfStock ? fmt(o.outOfStock, { n: outOfStock }) : kpis.lowStock.current ? t.dashboard.lowStock : o.stockOk}
        </Chip>
      } />,
  );
  return (
    <Surface className="p-3 sm:p-3" aria-label={t.v10.overview.watch}>
      <div className="gp-stagger grid h-full grid-cols-1 gap-3 min-[420px]:grid-cols-2">{tiles}</div>
    </Surface>
  );
}
