import Link from "next/link";
import type { AppointmentStatus } from "@prisma/client";
import { Phone } from "lucide-react";
import { appointmentMechanicAction, appointmentStatusAction, checkInAppointmentAction } from "@/actions/workshop";
import { ActionButton, ActionSelect } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { STATUS_DOT } from "@/components/overview/recent-orders";
import { Chip, StatusDot, type ChipTone } from "@/components/ui/redesign/chip";
import { utcToZoned } from "@/lib/booking";
import type { Dictionary } from "@/lib/i18n/fr";
import { woNumber, type Lang } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { appointmentsForDay } from "@/server/booking";

type Appt = Awaited<ReturnType<typeof appointmentsForDay>>["items"][number];

const TONE: Record<AppointmentStatus, ChipTone> = { CONFIRMED: "accent", CHECKED_IN: "success", CANCELLED: "neutral", NO_SHOW: "danger" };

/**
 * One booking of the day: time, customer, plate / vehicle, service, mechanic and
 * status, with the existing actions — check-in ("Accueillir"), no-show, cancel,
 * assign a mechanic — or the repair order once the car is checked in.
 */
export function AppointmentRow({
  a,
  t,
  lang,
  timeZone,
  canManage,
  mechanicOptions,
}: {
  a: Appt;
  t: Dictionary;
  lang: Lang;
  timeZone: string;
  canManage: boolean;
  mechanicOptions: { value: string; label: string }[];
}) {
  const p = t.v10.pages.appointments;
  const start = utcToZoned(a.startAt, timeZone).time;
  const end = utcToZoned(a.endAt, timeZone).time;
  const serviceName = lang === "ar" && a.service.nameAr ? a.service.nameAr : a.service.name;
  const isOpen = a.status === "CONFIRMED";
  return (
    <li className={cn("flex flex-wrap items-start gap-4 rounded-[18px] bg-gp-panel p-4", a.status === "CANCELLED" && "opacity-60")}>
      <div className="w-20 shrink-0 rounded-[14px] bg-gp-card px-3 py-2 text-center">
        <p className="text-lg font-semibold tabular-nums" dir="ltr">{start}</p>
        <p className="text-xs text-gp-muted" dir="ltr">→ {end}</p>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            {a.firstName} {a.lastName}
          </span>
          <Chip tone={TONE[a.status]} className={a.status === "CANCELLED" ? "line-through" : undefined}>
            {t.booking.statuses[a.status]}
          </Chip>
          {a.customerId && <Chip>{t.appointments.knownCustomer}</Chip>}
          <span className="font-mono text-xs text-gp-muted">{a.reference}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <PlateChip plate={a.plate} />
          {(a.make || a.model) && (
            <span className="text-gp-muted">
              {a.make} {a.model}
            </span>
          )}
          <span>· {serviceName}</span>
          <a href={`tel:${a.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-gp-muted hover:text-gp-ink" dir="ltr">
            <Phone className="size-3.5" aria-hidden /> {a.phone}
          </a>
        </div>
        {a.notes && <p className="text-sm whitespace-pre-line text-gp-muted">{a.notes}</p>}
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        {a.workOrder ? (
          <Link href={`/garage/work-orders/${a.workOrder.id}`} className="flex items-center gap-3 rounded-full bg-gp-card px-4 py-2 text-sm hover:bg-gp-hover">
            <span className="font-mono font-medium">{woNumber(a.workOrder.number)}</span>
            <StatusDot color={STATUS_DOT[a.workOrder.status]}>{t.status[a.workOrder.status]}</StatusDot>
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
                  {p.welcome}
                </ActionButton>
                <ActionButton size="sm" variant="outline" action={appointmentStatusAction.bind(null, a.id, "NO_SHOW")}>
                  {t.appointments.noShow}
                </ActionButton>
                <ActionButton
                  size="sm"
                  variant="ghost"
                  className="text-gp-danger-ink"
                  confirm={`${t.appointments.cancel} ${a.reference} ?`}
                  action={appointmentStatusAction.bind(null, a.id, "CANCELLED")}
                >
                  {p.cancel}
                </ActionButton>
              </>
            )}
          </>
        )}
      </div>
    </li>
  );
}
