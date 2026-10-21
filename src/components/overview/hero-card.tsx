import { FilePlus2, Plus, Wrench } from "lucide-react";
import type { Compared } from "@/lib/dashboard-v10";
import type { MechanicNow } from "@/server/dashboard-v10";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt, type Lang } from "@/lib/format";
import { Chip, DeltaChip } from "@/components/ui/redesign/chip";
import { CountUp } from "@/components/ui/redesign/count-up";
import { IconBubble, Panel, PillLink, Surface } from "@/components/ui/redesign/surface";

/**
 * First card of the overview: today's takings (finance roles) or the cars in the
 * workshop, the two main actions, and the mechanics panel (jobs in progress,
 * presence from the time clock — presence only for roles that manage the team).
 */
export function HeroCard({
  t,
  lang,
  today,
  inShop,
  dueToday,
  canNewOrder,
  canInvoice,
  mechanics,
  showPresence,
}: {
  t: Dictionary;
  lang: Lang;
  today: Compared | null;
  inShop: number | null;
  dueToday: number;
  canNewOrder: boolean;
  canInvoice: boolean;
  mechanics: MechanicNow[] | null;
  showPresence: boolean;
}) {
  const o = t.v10.overview;
  return (
    <Surface className="flex flex-col" aria-labelledby="ov-hero">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="ov-hero" className="text-[15px] font-medium">{today ? o.todayRevenue : o.inShop}</h2>
          <p className="text-[13px] text-gp-muted">{today ? o.todayHint : o.inShopHint}</p>
        </div>
        <IconBubble icon={Wrench} />
      </div>
      <p className="mt-4 text-[34px] leading-none font-semibold tracking-tight sm:text-[40px]">
        <CountUp value={today ? today.current : (inShop ?? 0)} format={today ? "money" : "int"} lang={lang} />
      </p>
      <div className="mt-3">
        {today ? (
          <DeltaChip change={today.deltaPercent} lang={lang} caption={o.vsLastMonth} noCompare={o.noCompare} />
        ) : (
          <Chip tone={dueToday ? "accent" : "neutral"}>{fmt(o.dueToday, { n: dueToday })}</Chip>
        )}
      </div>
      {(canNewOrder || canInvoice) && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          {canNewOrder && (
            <PillLink href="/garage/work-orders/new" icon={Plus} className={canInvoice ? undefined : "col-span-2"}>
              {t.workOrders.new}
            </PillLink>
          )}
          {/* Invoices are made from a finished repair order: open the cars ready to invoice. */}
          {canInvoice && (
            <PillLink href="/garage/work-orders?status=READY" variant="secondary" icon={FilePlus2} className={canNewOrder ? undefined : "col-span-2"}>
              {o.newInvoice}
            </PillLink>
          )}
        </div>
      )}
      {mechanics && (
        <Panel className="mt-5 flex-1 p-3">
          <h3 className="px-1 pb-2 text-[13px] font-medium">
            {o.mechanics} <span className="text-gp-muted">· {mechanics.length}</span>
          </h3>
          {mechanics.length === 0 ? (
            <p className="px-1 py-3 text-[13px] text-gp-muted">{o.noMechanics}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mechanics.slice(0, 3).map((m) => (
                <li key={m.id} className="min-w-0 rounded-[14px] bg-gp-card p-3">
                  <p className="truncate text-[13px] font-semibold" title={m.name}>{m.name}</p>
                  <p className="mt-1 text-xs text-gp-muted">{fmt(o.jobs, { n: m.activeOrders })}</p>
                  {showPresence && (
                    <p
                      className={`mt-2 text-xs font-medium ${m.presence === "ACTIVE" ? "text-gp-success-ink" : m.presence === "ON_BREAK" ? "text-gp-accent-ink" : "text-gp-danger-ink"}`}
                    >
                      {m.presence === "ACTIVE" ? o.active : m.presence === "ON_BREAK" ? o.onBreak : o.off}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </Surface>
  );
}
