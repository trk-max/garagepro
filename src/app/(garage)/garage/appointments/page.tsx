import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import { appointmentMechanicAction, appointmentStatusAction, checkInAppointmentAction } from "@/actions/workshop";
import { ActionButton, ActionSelect } from "@/components/action-form";
import { PlateChip, StatusBadge } from "@/components/garage/badges";
import { LiveRefresh } from "@/components/live-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addDays, utcToZoned } from "@/lib/booking";
import { fmt, formatDay, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { appointmentsForDay } from "@/server/booking";
import { getSettings } from "@/server/settings";
import { listMechanics } from "@/server/work-orders";

type PageProps = { searchParams: Promise<{ date?: string }> };

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  CONFIRMED: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  CHECKED_IN: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "border-zinc-400/30 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 line-through",
  NO_SHOW: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

export default async function AppointmentsPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewAppointments");
  const settings = await getSettings();
  const today = utcToZoned(new Date(), settings.timezone).date;
  const requested = (await searchParams).date;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;

  const [{ t, lang }, { items, capacity }, mechanics] = await Promise.all([getI18n(), appointmentsForDay(date), listMechanics()]);
  const canManage = can(staff.role, "manageAppointments");
  const active = items.filter((a) => a.status !== "CANCELLED");
  const mechanicOptions = [
    { value: "", label: t.workOrders.unassigned },
    ...mechanics.filter((m) => m.role === "MECHANIC" || m.role === "ADMIN").map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader title={t.appointments.title}>
        <LiveRefresh url="/api/staff/stream?topic=appointments" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label={t.appointments.previous}>
          <Link href={`/garage/appointments?date=${addDays(date, -1)}`}>
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Link>
        </Button>
        <Button asChild variant={date === today ? "default" : "outline"} size="sm">
          <Link href="/garage/appointments">{t.appointments.today}</Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label={t.appointments.next}>
          <Link href={`/garage/appointments?date=${addDays(date, 1)}`}>
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Link>
        </Button>
        <form method="get" className="flex items-center gap-2">
          <Input type="date" name="date" defaultValue={date} className="w-40" dir="ltr" aria-label={t.common.date} />
          <Button type="submit" variant="secondary" size="sm">
            <CalendarDays className="size-4" aria-hidden />
          </Button>
        </form>
        <h2 className="ms-auto text-lg font-semibold capitalize">{formatDay(date, lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{fmt(t.appointments.count, { count: active.length, capacity })}</p>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.appointments.empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
            const start = utcToZoned(a.startAt, settings.timezone).time;
            const end = utcToZoned(a.endAt, settings.timezone).time;
            const serviceName = lang === "ar" && a.service.nameAr ? a.service.nameAr : a.service.name;
            const isOpen = a.status === "CONFIRMED";
            return (
              <li key={a.id} className={cn("rounded-lg border p-4", a.status === "CANCELLED" && "opacity-60")}>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="w-24 shrink-0">
                    <p className="text-lg font-semibold tabular-nums" dir="ltr">{start}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">→ {end}</p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {a.firstName} {a.lastName}
                      </span>
                      {a.customerId && <Badge variant="secondary">{t.appointments.knownCustomer}</Badge>}
                      <Badge variant="outline" className={STATUS_CLASS[a.status]}>
                        {t.booking.statuses[a.status]}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">{a.reference}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <PlateChip plate={a.plate} />
                      {(a.make || a.model) && (
                        <span className="text-muted-foreground">
                          {a.make} {a.model}
                        </span>
                      )}
                      <span>· {serviceName}</span>
                      <a href={`tel:${a.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" dir="ltr">
                        <Phone className="size-3.5" aria-hidden /> {a.phone}
                      </a>
                    </div>
                    {a.notes && <p className="text-sm whitespace-pre-line text-muted-foreground">{a.notes}</p>}
                  </div>

                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    {a.workOrder ? (
                      <Link href={`/garage/work-orders/${a.workOrder.id}`} className="flex items-center gap-2 text-sm hover:underline">
                        <span className="font-mono">{woNumber(a.workOrder.number)}</span>
                        <StatusBadge status={a.workOrder.status} t={t} />
                      </Link>
                    ) : (
                      <>
                        <ActionSelect
                          ariaLabel={t.appointments.mechanic}
                          action={appointmentMechanicAction.bind(null, a.id)}
                          defaultValue={a.mechanic?.id ?? ""}
                          options={mechanicOptions}
                          disabled={!canManage || !isOpen}
                        />
                        {canManage && isOpen && (
                          <>
                            <ActionButton size="sm" action={checkInAppointmentAction.bind(null, a.id)}>
                              {t.appointments.checkIn}
                            </ActionButton>
                            <ActionButton size="sm" variant="outline" action={appointmentStatusAction.bind(null, a.id, "NO_SHOW")}>
                              {t.appointments.noShow}
                            </ActionButton>
                            <ActionButton
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              confirm={`${t.appointments.cancel} ${a.reference} ?`}
                              action={appointmentStatusAction.bind(null, a.id, "CANCELLED")}
                            >
                              {t.appointments.cancel}
                            </ActionButton>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
