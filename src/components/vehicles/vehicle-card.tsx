import Link from "next/link";
import { CarFront, ClipboardPlus, Gauge, QrCode, UserRound, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PlateChip } from "@/components/garage/badges";
import { Chip } from "@/components/ui/redesign/chip";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt, formatDate, formatKm, woNumber, type Lang } from "@/lib/format";
import type { VehicleCard as Card } from "@/server/vehicle-list";

export type VehicleCardRights = { newOrder: boolean; qr: boolean; obd: boolean; maintenance: boolean };

/**
 * Vehicle card: plate, make / model / year, fuel and mileage, owner (link to the
 * customer file, on the vehicle), last visit, "in the workshop" chip when a
 * repair is open, then the vehicle's actions the role may use.
 */
export function VehicleCard({ v, t, lang, rights }: { v: Card; t: Dictionary; lang: Lang; rights: VehicleCardRights }) {
  const p = t.v10.pages.vehicles;
  const c = t.v10.pages.customers;
  const facts = [v.fuel ? t.fuel[v.fuel] : null, v.mileage != null ? formatKm(v.mileage, lang) : null].filter(Boolean).join(" · ");
  const actions: { href: string; label: string; icon: LucideIcon; show: boolean }[] = [
    { href: `/garage/work-orders/new?customerId=${v.owner.id}&vehicleId=${v.id}`, label: p.newOrder, icon: ClipboardPlus, show: rights.newOrder },
    { href: `/garage/vehicules/${v.id}/qr`, label: p.qr, icon: QrCode, show: rights.qr },
    { href: `/garage/vehicules/${v.id}/obd`, label: p.obd, icon: Gauge, show: rights.obd },
    { href: `/garage/vehicules/${v.id}/entretien`, label: p.maintenance, icon: Wrench, show: rights.maintenance },
  ].filter((a) => a.show);
  return (
    <li className="flex flex-col rounded-[24px] border border-gp-line bg-gp-card p-5 shadow-gp">
      <div className="flex items-start justify-between gap-2">
        <PlateChip plate={v.plate} />
        <CarFront className="size-5 shrink-0 text-gp-muted" aria-hidden />
      </div>
      <h3 className="mt-3 line-clamp-2 text-[15px] font-semibold break-words">
        {v.make} {v.model}
        {v.year ? <span className="font-normal text-gp-muted"> · {v.year}</span> : null}
      </h3>
      {facts && <p className="mt-0.5 text-[13px] text-gp-muted">{facts}</p>}
      <Link
        href={`/garage/customers/${v.owner.id}#vehicule-${v.id}`}
        aria-label={fmt(p.owner, { name: v.owner.name })}
        className="mt-3 flex min-h-11 items-center gap-2 rounded-full text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-gp-accent focus-visible:outline-none"
      >
        <UserRound className="size-4 shrink-0 text-gp-muted" aria-hidden />
        <span className="truncate">{v.owner.name}</span>
      </Link>
      <p className="text-xs text-gp-muted">{v.lastVisit ? fmt(c.lastVisit, { date: formatDate(v.lastVisit, lang) }) : c.never}</p>
      {v.inShop && (
        <Link href={`/garage/work-orders/${v.inShop.id}`} className="mt-3 self-start rounded-full focus-visible:ring-2 focus-visible:ring-gp-accent focus-visible:outline-none">
          <Chip tone="accent">{fmt(p.inShop, { number: woNumber(v.inShop.number) })}</Chip>
        </Link>
      )}
      {actions.length > 0 && <div className="min-h-4 flex-1" aria-hidden />}
      {actions.length > 0 && (
        <nav aria-label={fmt(p.actions, { plate: v.plate })} className="flex flex-wrap gap-2 border-t border-gp-line pt-3">
          {actions.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="gp-pill-t inline-flex h-11 items-center gap-1.5 rounded-full bg-gp-panel px-3.5 text-xs font-medium text-gp-ink hover:bg-gp-hover focus-visible:ring-2 focus-visible:ring-gp-accent focus-visible:outline-none"
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </li>
  );
}
