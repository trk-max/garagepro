import "server-only";
import type { LeaveStatus, LeaveType } from "@prisma/client";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";

export type CalendarItem =
  | { kind: "leave"; id: string; startAt: Date; endAt: Date; allDay: boolean; userId: string; userName: string; type: LeaveType | null; status: LeaveStatus; own: boolean }
  | { kind: "appointment"; id: string; startAt: Date; endAt: Date; title: string; reference: string }
  | { kind: "promised"; id: string; startAt: Date; number: number; plate: string };

/**
 * What the calendar shows between `from` and `to`:
 * - accepted leaves of the whole team (the reason/type only to managers and to the person),
 * - pending requests to managers and to their author,
 * - appointments and promised delivery times to those who can see them.
 */
export async function calendarItems(viewer: StaffUser, from: Date, to: Date): Promise<CalendarItem[]> {
  const manager = can(viewer, "manageTeam");
  const [leaves, appointments, promised] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        startAt: { lt: to },
        endAt: { gt: from },
        OR: [{ status: "APPROVED" }, ...(manager ? [{ status: "PENDING" as const }] : [{ status: "PENDING" as const, userId: viewer.id }])],
      },
      include: { user: { select: { name: true } } },
      orderBy: { startAt: "asc" },
    }),
    can(viewer, "viewAppointments")
      ? prisma.appointment.findMany({
          where: { startAt: { lt: to }, endAt: { gt: from }, status: { in: ["CONFIRMED", "CHECKED_IN"] } },
          select: { id: true, reference: true, startAt: true, endAt: true, plate: true, service: { select: { name: true } } },
          orderBy: { startAt: "asc" },
        })
      : [],
    can(viewer, "viewWorkOrders")
      ? prisma.workOrder.findMany({
          where: { promisedAt: { gte: from, lt: to }, status: { notIn: ["DELIVERED", "CLOSED", "CANCELLED"] } },
          select: { id: true, number: true, promisedAt: true, vehicle: { select: { plate: true } } },
        })
      : [],
  ]);
  return [
    ...leaves.map((l) => {
      const own = l.userId === viewer.id;
      return { kind: "leave" as const, id: l.id, startAt: l.startAt, endAt: l.endAt, allDay: l.allDay, userId: l.userId, userName: l.user.name, type: manager || own ? l.type : null, status: l.status, own };
    }),
    ...appointments.map((a) => ({ kind: "appointment" as const, id: a.id, startAt: a.startAt, endAt: a.endAt, title: `${a.service.name} · ${a.plate}`, reference: a.reference })),
    ...promised.map((w) => ({ kind: "promised" as const, id: w.id, startAt: w.promisedAt!, number: w.number, plate: w.vehicle.plate })),
  ];
}
