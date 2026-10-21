import Link from "next/link";
import type { Setting } from "@prisma/client";
import { Globe } from "lucide-react";
import type { bookingSettings } from "@/server/dashboard-v10-schedule";
import { BookingHoursForm } from "@/components/garage/booking-settings";
import { Chip } from "@/components/ui/redesign/chip";
import { Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt } from "@/lib/format";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * "Booking settings": administrators edit the real fields (online booking on/off,
 * capacity, slots, opening hours) with the existing form; other roles read them.
 */
export function BookingCard({ t, info, settings, canEdit }: { t: Dictionary; info: Awaited<ReturnType<typeof bookingSettings>>; settings: Setting; canEdit: boolean }) {
  const p = t.v10.pages.appointments;
  const b = t.bookingSettings;
  return (
    <Surface aria-labelledby="ap-settings">
      <SurfaceHeader id="ap-settings" title={p.settings}>
        <Chip tone={info.bookingEnabled ? "success" : "neutral"}>
          <Globe className="size-3.5" aria-hidden /> {p.online} · {info.bookingEnabled ? p.on : p.off}
        </Chip>
      </SurfaceHeader>
      {canEdit ? (
        <>
          <BookingHoursForm t={t} settings={settings} />
          <Link href="/garage/settings" className="mt-4 inline-block text-[13px] text-gp-muted underline-offset-2 hover:underline">
            {p.servicesLink}
          </Link>
        </>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-gp-muted">{fmt(p.perSlot, { n: info.capacity, m: info.slotMinutes })}</p>
          <ul className="space-y-1.5 text-sm">
            {WEEK_ORDER.map((d) => {
              const day = info.openingHours[String(d)];
              return (
                <li key={d} className="flex items-center justify-between rounded-full bg-gp-panel px-4 py-2">
                  <span>{b.days[d]}</span>
                  <span className="tabular-nums text-gp-muted" dir="ltr">{day ? `${day.open} – ${day.close}` : b.closed}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-gp-muted">{p.readOnly}</p>
        </>
      )}
    </Surface>
  );
}
