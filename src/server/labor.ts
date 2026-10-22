import "server-only";
import { AppError } from "@/lib/http";
import { elapsedMinutes, minutesByUser, personMinutes, suggestedBilledX100, type Interval, type LaborBillingMode } from "@/lib/labor";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { isFinal } from "@/server/workflow";

/** Starts the chronometer of `userId` (himself, or by a manager) on a work order. */
export async function startLabor(actor: StaffUser, workOrderId: string, userId = actor.id, now = new Date()) {
  if (userId !== actor.id && !can(actor, "manageLabor")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (isFinal(wo.status)) throw new AppError("laborClosedOrder", {}, 409);
    const running = await tx.laborEntry.findFirst({
      where: { userId, endedAt: null, voidedAt: null },
      select: { workOrder: { select: { number: true } } },
    });
    if (running) throw new AppError("laborRunning", { n: `OR-${String(running.workOrder.number).padStart(4, "0")}` }, 409);
    try {
      const entry = await tx.laborEntry.create({ data: { workOrderId, userId, startedAt: now, createdById: actor.id }, select: { id: true } });
      await audit(tx, actor, "labor.start", "LaborEntry", entry.id, { after: { workOrderId, userId, startedAt: now } });
      return entry;
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new AppError("laborRunning", { n: "?" }, 409);
      throw error;
    }
  });
}

/** Stops a running chronometer (its owner, or a manager). */
export async function stopLabor(actor: StaffUser, entryId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.laborEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.voidedAt) throw new AppError("notFound", {}, 404);
    if (entry.userId !== actor.id && !can(actor, "manageLabor")) throw new AppError("forbidden", {}, 403);
    const { count } = await tx.laborEntry.updateMany({ where: { id: entryId, endedAt: null }, data: { endedAt: now } });
    if (count === 0) throw new AppError("laborNotRunning", {}, 409);
    await audit(tx, actor, "labor.stop", "LaborEntry", entryId, { after: { endedAt: now } });
  });
}

/** Manager records time after the fact (forgotten chronometer). */
export async function addLaborEntry(actor: StaffUser, input: { workOrderId: string; userId: string; startedAt: Date; endedAt: Date; note?: string }) {
  if (!can(actor, "manageLabor")) throw new AppError("forbidden", {}, 403);
  if (!(input.endedAt > input.startedAt) || input.endedAt.getTime() - input.startedAt.getTime() > 16 * 3_600_000 || input.endedAt.getTime() > Date.now() + 60_000) {
    throw new AppError("laborDates", {}, 422);
  }
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    const entry = await tx.laborEntry.create({ data: { ...input, note: input.note || null, createdById: actor.id }, select: { id: true } });
    await audit(tx, actor, "labor.add", "LaborEntry", entry.id, { after: input });
    return entry;
  });
}

/** Wrong entry: voided with a reason (kept in the history), never deleted. */
export async function voidLaborEntry(actor: StaffUser, entryId: string, reason: string) {
  if (!can(actor, "manageLabor")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const entry = await tx.laborEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.voidedAt) throw new AppError("notFound", {}, 404);
    await tx.laborEntry.update({ where: { id: entryId }, data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason, endedAt: entry.endedAt ?? new Date() } });
    await audit(tx, actor, "labor.void", "LaborEntry", entryId, { before: { startedAt: entry.startedAt, endedAt: entry.endedAt }, after: { voided: true, reason } });
  });
}

/**
 * Time on a work order: per mechanic, total person-hours, elapsed time, and
 * the labour actually billed (LABOR lines) — three different numbers.
 */
export async function laborSummary(workOrderId: string, now = new Date()) {
  const [entries, billed, setting] = await Promise.all([
    prisma.laborEntry.findMany({
      where: { workOrderId },
      orderBy: { startedAt: "asc" },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.workOrderLine.aggregate({ where: { workOrderId, type: "LABOR", voidedAt: null }, _sum: { quantityX100: true } }),
    prisma.setting.findUnique({ where: { id: "garage" }, select: { laborBillingMode: true } }),
  ]);
  const valid = entries.filter((e) => !e.voidedAt);
  const intervals: Interval[] = valid.map((e) => ({ userId: e.userId, start: e.startedAt, end: e.endedAt ?? now }));
  const mode: LaborBillingMode = setting?.laborBillingMode === "PERSON" ? "PERSON" : "ELAPSED";
  const byUser = minutesByUser(intervals);
  return {
    entries,
    mode,
    perUser: [...byUser.entries()].map(([userId, minutes]) => ({ userId, name: valid.find((e) => e.userId === userId)?.user.name ?? "?", minutes })),
    personMinutes: personMinutes(intervals),
    elapsedMinutes: elapsedMinutes(intervals),
    running: valid.filter((e) => !e.endedAt),
    billedX100: billed._sum.quantityX100 ?? 0,
    suggestedX100: suggestedBilledX100(intervals, mode),
    // Both bases, so the team chooses on each repair when several mechanics worked.
    suggestedElapsedX100: suggestedBilledX100(intervals, "ELAPSED"),
    suggestedPersonX100: suggestedBilledX100(intervals, "PERSON"),
    mechanics: byUser.size,
  };
}

/** The chronometer currently running for a user (shown in the workshop view). */
export async function runningLabor(userId: string) {
  return prisma.laborEntry.findFirst({
    where: { userId, endedAt: null, voidedAt: null },
    select: { id: true, startedAt: true, workOrder: { select: { id: true, number: true, vehicle: { select: { plate: true } } } } },
  });
}
