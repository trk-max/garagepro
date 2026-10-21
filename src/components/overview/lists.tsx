import Link from "next/link";
import { CalendarDays, CheckCircle2, PackageSearch, ShieldCheck, Siren } from "lucide-react";
import type { AlertItem, AlertType } from "@/server/alerts";
import type { todayAppointments } from "@/server/dashboard";
import type { Dictionary } from "@/lib/i18n/fr";
import { displayPlate, formatQty, formatTime, type Lang } from "@/lib/format";
import { Chip } from "@/components/ui/redesign/chip";
import { EmptyState, PillLink, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";

const row = "flex min-h-12 items-center gap-3 rounded-[14px] px-3 py-2 transition-colors duration-150 hover:bg-gp-hover";

/** Alerts to handle, grouped by kind (same list as Suivi & retards). */
export function AlertsCard({ t, alerts }: { t: Dictionary; alerts: AlertItem[] }) {
  const o = t.v10.overview;
  const byType = new Map<AlertType, number>();
  for (const a of alerts) byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
  return (
    <Surface aria-labelledby="ov-alerts">
      <SurfaceHeader id="ov-alerts" title={o.alerts}>
        <Chip tone={alerts.length ? "danger" : "success"}>{alerts.length}</Chip>
      </SurfaceHeader>
      {alerts.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={o.noAlerts} />
      ) : (
        <ul className="-mx-2">
          {[...byType].map(([type, n]) => (
            <li key={type}>
              <Link href="/garage/suivi" className={row}>
                <Siren className="size-4 shrink-0 text-gp-danger-ink" aria-hidden />
                <span className="flex-1 text-[13px]">{t.v7.alerts.types[type]}</span>
                <span className="font-semibold tabular-nums">{n}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

type Appt = Awaited<ReturnType<typeof todayAppointments>>[number];

/** Today's bookings (confirmed / checked in), in time order. */
export function AppointmentsCard({ t, lang, appts }: { t: Dictionary; lang: Lang; appts: Appt[] }) {
  const db = t.v7.dash;
  return (
    <Surface aria-labelledby="ov-appts">
      <SurfaceHeader id="ov-appts" title={db.appointmentsToday}>
        <PillLink href="/garage/appointments" variant="outline" className="h-10">
          {t.v10.overview.viewAll}
        </PillLink>
      </SurfaceHeader>
      {appts.length === 0 ? (
        <EmptyState icon={CalendarDays} title={db.noAppointments} />
      ) : (
        <ul className="-mx-2">
          {appts.map((a) => (
            <li key={a.id} className={row}>
              <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{formatTime(a.startAt, lang)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {a.firstName} {a.lastName}
                </span>
                <span className="block truncate text-xs text-gp-muted">
                  <span dir="ltr" className="font-mono">{displayPlate(a.plate)}</span> · {a.service.name}
                </span>
              </span>
              {a.status === "CHECKED_IN" && <CheckCircle2 className="size-4 text-gp-success-ink" aria-label={db.checkedIn} />}
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

type LowPart = { id: string; sku: string; name: string; stockX100: number; minStockX100: number };

/** Parts at or under their minimum, with the shortcut to order them. */
export function LowStockCard({ t, lang, parts, canOrder }: { t: Dictionary; lang: Lang; parts: LowPart[]; canOrder: boolean }) {
  return (
    <Surface aria-labelledby="ov-low">
      <SurfaceHeader id="ov-low" title={t.dashboard.lowStock}>
        <PillLink href="/garage/parts?low=1" variant="outline" className="h-10">
          {t.nav.parts}
        </PillLink>
      </SurfaceHeader>
      {parts.length === 0 ? (
        <EmptyState icon={PackageSearch} title={t.dashboard.noLowStock} />
      ) : (
        <ul className="-mx-2">
          {parts.slice(0, 8).map((p) => (
            <li key={p.id} className={row}>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                <span className="font-mono text-xs text-gp-muted">{p.sku}</span> {p.name}
              </span>
              <Chip tone={p.stockX100 <= 0 ? "danger" : "accent"}>
                <span dir="ltr" className="tabular-nums">
                  {formatQty(p.stockX100, lang)} / {formatQty(p.minStockX100, lang)}
                </span>
              </Chip>
            </li>
          ))}
        </ul>
      )}
      {canOrder && parts.length > 0 && (
        <PillLink href="/garage/purchase-orders/new?prefill=low" className="mt-4 w-full">
          {t.purchase.prefillLow}
        </PillLink>
      )}
    </Surface>
  );
}
