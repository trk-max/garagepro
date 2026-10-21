import "server-only";
import type { AppointmentStatus } from "@prisma/client";
import { addDays, parseOpeningHours, utcToZoned, zonedToUtc, type OpeningHours } from "@/lib/booking";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/server/settings";

/**
 * V10 dashboard — today's appointments (viewAppointments is checked by the caller).
 * Online bookings are CONFIRMED at once (no "pending" state), so there is nothing to
 * confirm; declining = the existing cancel / no-show action (appointmentStatusAction),
 * arrival = checkInAppointmentAction (src/actions/workshop.ts).
 */
export type ScheduleItem = {
  id: string;
  reference: string;
  startAt: Date;
  endAt: Date;
  /** "HH:MM" in the garage's time zone. */
  start: string;
  end: string;
  status: AppointmentStatus;
  customerName: string;
  phone: string;
  plate: string;
  vehicle: string | null;
  service: string;
  mechanic: { id: string; name: string } | null;
  workOrder: { id: string; number: number } | null;
};

/** Today's garage-day appointments in time order; cancelled ones are left out unless `includeCancelled`. */
export async function todaySchedule(now = new Date(), opts: { includeCancelled?: boolean } = {}): Promise<{ day: string; timeZone: string; items: ScheduleItem[] }> {
  const timeZone = (await getSettings()).timezone;
  const day = utcToZoned(now, timeZone).date;
  const rows = await prisma.appointment.findMany({
    where: {
      startAt: { gte: zonedToUtc(day, "00:00", timeZone), lt: zonedToUtc(addDays(day, 1), "00:00", timeZone) },
      ...(opts.includeCancelled ? {} : { status: { not: "CANCELLED" } }),
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      reference: true,
      startAt: true,
      endAt: true,
      status: true,
      firstName: true,
      lastName: true,
      phone: true,
      plate: true,
      make: true,
      model: true,
      service: { select: { name: true } },
      mechanic: { select: { id: true, name: true } },
      workOrder: { select: { id: true, number: true } },
    },
  });
  const items = rows.map((a) => ({
    id: a.id,
    reference: a.reference,
    startAt: a.startAt,
    endAt: a.endAt,
    start: utcToZoned(a.startAt, timeZone).time,
    end: utcToZoned(a.endAt, timeZone).time,
    status: a.status,
    customerName: `${a.firstName} ${a.lastName}`.trim(),
    phone: a.phone,
    plate: a.plate,
    vehicle: [a.make, a.model].filter(Boolean).join(" ") || null,
    service: a.service.name,
    mechanic: a.mechanic,
    workOrder: a.workOrder,
  }));
  return { day, timeZone, items };
}

/** Online booking settings as saved in Paramètres (edited by updateBookingSettingsAction, audited). */
export async function bookingSettings(): Promise<{
  bookingEnabled: boolean;
  openingHours: OpeningHours;
  slotMinutes: number;
  capacity: number;
  leadMinutes: number;
  horizonDays: number;
  timeZone: string;
}> {
  const s = await getSettings();
  return {
    bookingEnabled: s.bookingEnabled,
    openingHours: parseOpeningHours(s.openingHours),
    slotMinutes: s.bookingSlotMinutes,
    capacity: s.bookingCapacity,
    leadMinutes: s.bookingLeadMinutes,
    horizonDays: s.bookingHorizonDays,
    timeZone: s.timezone,
  };
}
