import "server-only";
import type { LeaveStatus, LeaveType, Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { parseOpeningHours } from "@/lib/booking";
import { leaveBalance, leaveDaysInYear, type LeaveBalance } from "@/lib/leaves";
import { localToday } from "@/lib/periods";
import { getSettings } from "@/server/settings";

export type LeaveInput = { userId?: string; type: LeaveType; startAt: Date; endAt: Date; allDay: boolean; reason?: string };

const ACTIVE: LeaveStatus[] = ["PENDING", "APPROVED"];

/**
 * An employee asks for a leave / declares an absence (status PENDING).
 * A manager may record it for someone else: it is then already APPROVED, and
 * the journal keeps who did it.
 */
export async function requestLeave(actor: StaffUser, input: LeaveInput) {
  const userId = input.userId ?? actor.id;
  const forSomeoneElse = userId !== actor.id;
  if (forSomeoneElse && !can(actor.role, "manageTeam")) throw new AppError("forbidden", {}, 403);
  if (!(input.endAt > input.startAt)) throw new AppError("leaveDates", {}, 422);
  if (input.endAt.getTime() - input.startAt.getTime() > 366 * 86_400_000) throw new AppError("leaveDates", {}, 422);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${userId}`}::text)::bigint)`;
    const clash = await tx.leaveRequest.findFirst({
      where: { userId, status: { in: ACTIVE }, startAt: { lt: input.endAt }, endAt: { gt: input.startAt } },
      select: { number: true },
    });
    if (clash) throw new AppError("leaveOverlap", { n: clash.number }, 409);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!user) throw new AppError("notFound", {}, 404);
    const autoApprove = forSomeoneElse;
    const created = await tx.leaveRequest.create({
      data: {
        userId,
        type: input.type,
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay,
        reason: input.reason || null,
        createdById: actor.id,
        status: autoApprove ? "APPROVED" : "PENDING",
        ...(autoApprove ? { decidedById: actor.id, decidedAt: new Date(), decisionNote: "Saisi par le responsable" } : {}),
      },
    });
    await audit(tx, actor, autoApprove ? "leave.record" : "leave.request", "LeaveRequest", created.id, { after: pick(created) });
    return created;
  });
}

const pick = (l: { userId: string; type: LeaveType; startAt: Date; endAt: Date; allDay: boolean; status: LeaveStatus; reason?: string | null; decisionNote?: string | null }) => ({
  userId: l.userId,
  type: l.type,
  startAt: l.startAt,
  endAt: l.endAt,
  allDay: l.allDay,
  status: l.status,
  reason: l.reason ?? null,
  decisionNote: l.decisionNote ?? null,
});

/** Manager accepts or refuses. A manager never decides on his own request (an administrator can). */
export async function decideLeave(actor: StaffUser, leaveId: string, approve: boolean, note?: string) {
  if (!can(actor.role, "manageTeam")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!leave) throw new AppError("notFound", {}, 404);
    if (leave.userId === actor.id && actor.role !== "ADMIN") throw new AppError("notOwnDecision", {}, 403);
    if (leave.status !== "PENDING") throw new AppError("leaveNotPending", {}, 409);
    if (approve) {
      const clash = await tx.leaveRequest.findFirst({
        where: { id: { not: leave.id }, userId: leave.userId, status: "APPROVED", startAt: { lt: leave.endAt }, endAt: { gt: leave.startAt } },
        select: { number: true },
      });
      if (clash) throw new AppError("leaveOverlap", { n: clash.number }, 409);
    }
    // Conditional update: two managers clicking at the same time cannot both decide.
    const { count } = await tx.leaveRequest.updateMany({
      where: { id: leave.id, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedAt: new Date(), decisionNote: note || null },
    });
    if (count === 0) throw new AppError("leaveNotPending", {}, 409);
    await audit(tx, actor, approve ? "leave.approve" : "leave.reject", "LeaveRequest", leave.id, {
      before: { status: leave.status },
      after: { status: approve ? "APPROVED" : "REJECTED", note: note || null },
    });
  });
}

/** The employee withdraws a request still pending; a manager can cancel any active one. */
export async function cancelLeave(actor: StaffUser, leaveId: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!leave) throw new AppError("notFound", {}, 404);
    const manager = can(actor.role, "manageTeam") && (leave.userId !== actor.id || actor.role === "ADMIN");
    const ownPending = leave.userId === actor.id && leave.status === "PENDING";
    if (!manager && !ownPending) throw new AppError("forbidden", {}, 403);
    if (!ACTIVE.includes(leave.status)) throw new AppError("leaveNotPending", {}, 409);
    await tx.leaveRequest.update({ where: { id: leave.id }, data: { status: "CANCELLED", decisionNote: note || leave.decisionNote } });
    await audit(tx, actor, "leave.cancel", "LeaveRequest", leave.id, { before: { status: leave.status }, after: { status: "CANCELLED", note: note || null } });
  });
}

export type LeaveFilter = { userId?: string; status?: LeaveStatus; from?: Date; to?: Date };

export async function listLeaves(filter: LeaveFilter) {
  const where: Prisma.LeaveRequestWhereInput = {
    ...(filter.userId ? { userId: filter.userId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.from ? { endAt: { gt: filter.from } } : {}),
    ...(filter.to ? { startAt: { lt: filter.to } } : {}),
  };
  return prisma.leaveRequest.findMany({
    where,
    orderBy: [{ startAt: "desc" }],
    take: 300,
    include: { user: { select: { id: true, name: true } }, decidedBy: { select: { name: true } } },
  });
}

/**
 * Paid-leave balance of one employee for a calendar year (default: this year in
 * the garage's time zone). Counts whole-day PAID_LEAVE only; short
 * authorisations and other absence types do not use the balance.
 */
export async function getLeaveBalance(userId: string, year?: number): Promise<LeaveBalance | null> {
  const settings = await getSettings();
  const tz = settings.timezone;
  const y = year ?? Number(localToday(tz).slice(0, 4));
  const yearStart = new Date(Date.UTC(y, 0, 1) - 86_400_000); // one day of margin for the time zone
  const yearEnd = new Date(Date.UTC(y + 1, 0, 1) + 86_400_000);
  const [user, leaves] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { annualLeaveDays: true } }),
    prisma.leaveRequest.findMany({
      where: { userId, type: "PAID_LEAVE", allDay: true, status: { in: ACTIVE }, startAt: { lt: yearEnd }, endAt: { gt: yearStart } },
      select: { startAt: true, endAt: true, status: true },
    }),
  ]);
  if (!user) return null;
  const hours = parseOpeningHours(settings.openingHours);
  const count = (status: LeaveStatus) => leaveDaysInYear(leaves.filter((l) => l.status === status), y, tz, hours);
  return leaveBalance(user.annualLeaveDays, count("APPROVED"), count("PENDING"), y);
}
