import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { AppointmentRow } from "@/components/appointments/appointment-row";
import { BookingCard } from "@/components/appointments/booking-card";
import { LiveRefresh } from "@/components/live-refresh";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/redesign/chip";
import { PageHeader } from "@/components/ui/redesign/page-header";
import { EmptyState, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import { addDays, utcToZoned } from "@/lib/booking";
import { fmt, formatDay } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { appointmentsForDay } from "@/server/booking";
import { bookingSettings } from "@/server/dashboard-v10-schedule";
import { getSettings } from "@/server/settings";
import { listMechanics } from "@/server/work-orders";

type PageProps = { searchParams: Promise<{ date?: string }> };

const round = "grid size-11 place-items-center rounded-full border border-gp-line bg-gp-card hover:bg-gp-hover";

export default async function AppointmentsPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewAppointments");
  const settings = await getSettings();
  const today = utcToZoned(new Date(), settings.timezone).date;
  const requested = (await searchParams).date;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;

  // The day list keeps the former query (any day, with notes and Arabic service names); bookingSettings feeds the settings card.
  const [{ t, lang }, { items, capacity }, mechanics, info] = await Promise.all([getI18n(), appointmentsForDay(date), listMechanics(), bookingSettings()]);
  const canManage = can(staff.role, "manageAppointments");
  const active = items.filter((a) => a.status !== "CANCELLED");
  const mechanicOptions = [
    { value: "", label: t.workOrders.unassigned },
    ...mechanics.filter((m) => m.role === "MECHANIC" || m.role === "ADMIN").map((m) => ({ value: m.id, label: m.name })),
  ];
  const p = t.v10.pages.appointments;

  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5">
      <PageHeader title={t.appointments.title} subtitle={p.subtitle}>
        <LiveRefresh url="/api/staff/live?topic=appointments" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
      </PageHeader>

      <div className="gp-stagger grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Surface aria-labelledby="ap-day" className="min-w-0">
          <SurfaceHeader id="ap-day" title={date === today ? p.planning : formatDay(date, lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} hint={fmt(t.appointments.count, { count: active.length, capacity })}>
            {date === today && <Chip tone="accent">{formatDay(date, lang, { weekday: "long", day: "numeric", month: "long" })}</Chip>}
          </SurfaceHeader>

          {/* Day navigation (previous / today / next / date picker), unchanged. */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link href={`/garage/appointments?date=${addDays(date, -1)}`} aria-label={t.appointments.previous} className={round}>
              <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
            <Link
              href="/garage/appointments"
              aria-current={date === today ? "date" : undefined}
              className={cn("flex h-11 items-center rounded-full px-5 text-sm font-medium", date === today ? "bg-gp-primary text-gp-primary-ink" : "border border-gp-line bg-gp-card hover:bg-gp-hover")}
            >
              {t.appointments.today}
            </Link>
            <Link href={`/garage/appointments?date=${addDays(date, 1)}`} aria-label={t.appointments.next} className={round}>
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
            <form method="get" className="ms-auto flex items-center gap-2">
              <Input type="date" name="date" defaultValue={date} className="h-11 w-44 bg-gp-card" dir="ltr" aria-label={t.common.date} />
              <button type="submit" aria-label={t.common.date} className={round}>
                <CalendarDays className="size-4" aria-hidden />
              </button>
            </form>
          </div>

          {items.length === 0 ? (
            <EmptyState icon={CalendarDays} title={t.appointments.empty} />
          ) : (
            <ul className="space-y-3">
              {items.map((a) => (
                <AppointmentRow key={a.id} a={a} t={t} lang={lang} timeZone={settings.timezone} canManage={canManage} mechanicOptions={mechanicOptions} />
              ))}
            </ul>
          )}
        </Surface>

        <BookingCard t={t} info={info} settings={settings} canEdit={can(staff.role, "manageSettings")} />
      </div>
    </div>
  );
}
