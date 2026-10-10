import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, CheckCircle2, Clock, MapPin, Phone, XCircle } from "lucide-react";
import { cancelBookingAction } from "@/actions/portal";
import { ActionButton } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { Button } from "@/components/ui/button";
import { utcToZoned } from "@/lib/booking";
import { fmt, formatDay } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canCancelOnline, getAppointmentByReference, isValidManageToken } from "@/server/booking";
import { getSettings } from "@/server/settings";

type PageProps = {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ t?: string; new?: string; sent?: string }>;
};

export default async function BookingConfirmationPage({ params, searchParams }: PageProps) {
  const [{ reference }, query] = await Promise.all([params, searchParams]);
  const token = query.t ?? "";
  if (!isValidManageToken(reference, token)) notFound();

  const [appt, settings, { t, lang }] = await Promise.all([getAppointmentByReference(reference), getSettings(), getI18n()]);
  if (!appt) notFound();

  const b = t.booking;
  const start = utcToZoned(appt.startAt, settings.timezone);
  const end = utcToZoned(appt.endAt, settings.timezone);
  const serviceName = lang === "ar" && appt.service.nameAr ? appt.service.nameAr : appt.service.name;
  const active = appt.status === "CONFIRMED";
  const sentChannels = (query.sent ?? "").split(",").filter(Boolean).map((c) => (c === "SMS" ? "SMS" : t.common.email));

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-border">
        <div className={active ? "bg-emerald-600 p-6 text-white" : "bg-slate-700 p-6 text-white"}>
          {active ? <CheckCircle2 className="size-10" aria-hidden /> : <XCircle className="size-10" aria-hidden />}
          <h1 className="mt-3 text-xl font-bold">{active ? b.confirmedTitle : b.statuses[appt.status]}</h1>
          <p className="mt-1 text-sm opacity-90">
            {b.reference} : <span className="font-mono text-base font-semibold tracking-wider">{appt.reference}</span>
          </p>
        </div>

        <dl className="space-y-3 p-6 text-sm">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
            <div>
              <dt className="sr-only">{b.when}</dt>
              <dd className="font-medium capitalize">{formatDay(start.date, lang)}</dd>
              <dd className="text-muted-foreground" dir="ltr">
                {start.time} – {end.time}
              </dd>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{b.service}</dt>
            <dd className="font-medium">{serviceName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{b.plate}</dt>
            <dd>
              <PlateChip plate={appt.plate} />
            </dd>
          </div>
          {settings.address && (
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <dd>
                {settings.garageName} — {settings.address}
              </dd>
            </div>
          )}
        </dl>

        {active && (
          <div className="space-y-3 border-t p-6">
            {query.new && (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                {sentChannels.length ? fmt(b.confirmationSent, { channels: sentChannels.join(", ") }) : b.keepPage}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild className="h-11 bg-navy hover:bg-navy-2">
                <a href={`/api/booking/ics/${appt.reference}?t=${token}`}>
                  <CalendarPlus className="size-4" aria-hidden /> {b.addToCalendar}
                </a>
              </Button>
              {settings.phone && (
                <Button asChild variant="outline" className="h-11">
                  <a href={`tel:${settings.phone.replace(/\s/g, "")}`}>
                    <Phone className="size-4" aria-hidden /> {t.portal.call}
                  </a>
                </Button>
              )}
            </div>
            {canCancelOnline(appt) ? (
              <ActionButton
                variant="ghost"
                className="w-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-700"
                confirm={b.cancelConfirm}
                successMessage={b.cancelled}
                action={cancelBookingAction.bind(null, appt.reference, token)}
              >
                {b.cancel}
              </ActionButton>
            ) : (
              <p className="text-center text-xs text-muted-foreground">{b.cancelTooLate}</p>
            )}
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/rdv" className="font-medium text-brand-700 dark:text-brand-400 hover:underline">
          {b.newBooking}
        </Link>
      </p>
    </div>
  );
}
