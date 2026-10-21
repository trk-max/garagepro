import Link from "next/link";
import { FileText, Plus, Wrench } from "lucide-react";
import type { CustomerCard } from "@/server/dashboard-v10-customers";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { OpenDialog } from "@/components/ui/redesign/dialog";
import { Panel, PillLink, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Quick actions" (reference "Quick transfer"): the 5 most recent customers as
 * avatars (selected = orange ring), a dashed "+ New" opening the create form, and
 * the selected customer's panel: create a repair order, or open the unpaid
 * invoice to send it (disabled with a hint when there is none — nothing is sent from here).
 */
export function QuickActions({
  t,
  recent,
  selected,
  hrefFor,
  createDialogId,
  canCreateOrder,
  unpaid,
  canSeeInvoices,
}: {
  t: Dictionary;
  recent: CustomerCard[];
  selected: CustomerCard | null;
  hrefFor: (id: string) => string;
  createDialogId: string;
  canCreateOrder: boolean;
  unpaid: { id: string; number: string } | null;
  canSeeInvoices: boolean;
}) {
  const p = t.v10.pages.customers;
  return (
    <Surface className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]" aria-labelledby="cu-quick">
      <div className="min-w-0">
        <SurfaceHeader id="cu-quick" title={p.quick} hint={p.quickHint} />
        <ul className="gp-scroll-x flex gap-3 overflow-x-auto pb-1">
          {recent.map((c) => {
            const on = selected?.id === c.id;
            return (
              <li key={c.id} className="shrink-0">
                <Link
                  href={hrefFor(c.id)}
                  scroll={false}
                  aria-current={on ? "true" : undefined}
                  className={cn("gp-pill-t flex w-24 flex-col items-center gap-2 rounded-[18px] p-2 text-center", on ? "bg-gp-panel" : "hover:bg-gp-hover")}
                >
                  <span className={cn("rounded-full p-[3px]", on ? "ring-2 ring-gp-accent" : "")}>
                    <CustomerAvatar name={c.name} size={52} />
                  </span>
                  <span className="line-clamp-2 text-xs font-medium break-words">{c.name}</span>
                </Link>
              </li>
            );
          })}
          <li className="shrink-0">
            <OpenDialog target={createDialogId} label={p.add} className="flex w-24 flex-col items-center gap-2 rounded-[18px] p-2 text-center hover:bg-gp-hover">
              <span className="grid size-[58px] place-items-center rounded-full border-2 border-dashed border-gp-muted/50 text-gp-muted">
                <Plus className="size-5" aria-hidden />
              </span>
              <span className="text-xs text-gp-muted">{p.newShort}</span>
            </OpenDialog>
          </li>
        </ul>
        {recent.length === 0 && <p className="mt-2 text-[13px] text-gp-muted">{p.noRecent}</p>}
      </div>
      {selected && (
        <Panel className="flex flex-col gap-3" aria-label={p.selected}>
          <div className="flex items-center gap-3">
            <CustomerAvatar name={selected.name} size={40} />
            <div className="min-w-0">
              <p className="text-xs text-gp-muted">{p.selected}</p>
              <Link href={`/garage/customers/${selected.id}`} className="block truncate font-semibold hover:underline">{selected.name}</Link>
            </div>
          </div>
          <p className="rounded-full bg-gp-card px-4 py-2.5 text-sm" dir="ltr">{selected.phone}</p>
          {canCreateOrder && (
            <PillLink href={`/garage/work-orders/new?customerId=${selected.id}`} icon={Wrench} className="w-full">
              {p.newOrder}
            </PillLink>
          )}
          {canSeeInvoices &&
            (unpaid ? (
              <>
                <PillLink href={`/garage/invoices/${unpaid.id}`} variant="outline" icon={FileText} className="w-full">
                  {p.sendInvoice}
                </PillLink>
                <p className="px-2 text-xs text-gp-muted">{fmt(p.unpaidHint, { number: unpaid.number })}</p>
              </>
            ) : (
              <>
                <button type="button" disabled aria-describedby="cu-no-unpaid" className="inline-flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-gp-line text-sm font-medium text-gp-muted">
                  <FileText className="size-4" aria-hidden /> {p.sendInvoice}
                </button>
                <p id="cu-no-unpaid" className="px-2 text-xs text-gp-muted">{p.noUnpaid}</p>
              </>
            ))}
        </Panel>
      )}
    </Surface>
  );
}
