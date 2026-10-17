import "server-only";
import type { ClaimCategory, ClaimStatus } from "@prisma/client";
import { phoneMatchNeedle } from "@/lib/booking";
import { AppError, isUniqueViolation } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { reserveAttempt } from "@/server/rate-limit";

/** Public forms: at most this many complaints / reviews per IP per hour (no captcha needed). */
const MAX_PER_IP_PER_HOUR = 5;

export type ClaimInput = { name: string; phone: string; email?: string; plate?: string; category: ClaimCategory; message: string };

/**
 * New complaint from the customer site. Linked to the work order when sent from
 * the repair tracker, otherwise to the customer file only if plate + phone match.
 */
export async function createClaim(input: ClaimInput, ctx: { ip: string; workOrderId?: string | null }) {
  if (!(await reserveAttempt([{ key: `claim-ip:${ctx.ip}`, max: MAX_PER_IP_PER_HOUR }], 60, false))) {
    throw new AppError("tooMany", {}, 429);
  }
  const link = await findCustomer(input.plate, input.phone, ctx.workOrderId ?? null);
  return prisma.customerClaim.create({
    data: { ...input, workOrderId: link.workOrderId, customerId: link.customerId },
    select: { id: true, number: true },
  });
}

export type FeedbackInput = { rating: number; comment?: string; name?: string; plate?: string };

/**
 * Customer rating. From the repair tracker it is tied to the work order (one
 * rating per order); from the public page it is anonymous-friendly but rate-limited.
 */
export async function createFeedback(input: FeedbackInput, ctx: { ip: string; workOrderId?: string | null }) {
  if (!ctx.workOrderId && !(await reserveAttempt([{ key: `feedback-ip:${ctx.ip}`, max: MAX_PER_IP_PER_HOUR }], 60, false))) {
    throw new AppError("tooMany", {}, 429);
  }
  const link = await findCustomer(input.plate, undefined, ctx.workOrderId ?? null);
  try {
    return await prisma.customerFeedback.create({
      data: { ...input, workOrderId: link.workOrderId, customerId: link.customerId },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("alreadyRated", {}, 409);
    throw error;
  }
}

/**
 * Which customer file a complaint/review belongs to.
 * - From the repair tracker: the signed-in work order (proved by plate + PIN).
 * - From the public page: only when the plate AND the phone typed both match the
 *   same customer file. A plate alone proves nothing (anyone can read a plate),
 *   so a stranger cannot attach messages to someone else's file.
 */
async function findCustomer(plate: string | undefined, phone: string | undefined, workOrderId: string | null) {
  if (workOrderId) {
    const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true, customerId: true } });
    if (wo) return { workOrderId: wo.id, customerId: wo.customerId };
  }
  const needle = phone ? phoneMatchNeedle(phone) : null;
  if (plate && needle) {
    const vehicle = await prisma.vehicle.findUnique({ where: { plate }, select: { customerId: true, customer: { select: { phone: true } } } });
    if (vehicle && vehicle.customer.phone.replace(/\D/g, "").includes(needle)) return { workOrderId: null, customerId: vehicle.customerId };
  }
  return { workOrderId: null, customerId: null };
}

/** Has this work order already been rated? (the tracker hides the form then) */
export async function hasFeedback(workOrderId: string): Promise<boolean> {
  return (await prisma.customerFeedback.count({ where: { workOrderId } })) > 0;
}

// ── Staff side ───────────────────────────────────────────────────────────────

export async function listClaims(status?: ClaimStatus) {
  return prisma.customerClaim.findMany({
    where: status ? { status } : {},
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: {
      handledBy: { select: { name: true } },
      workOrder: { select: { id: true, number: true } },
      customer: { select: { id: true, name: true } },
    },
  });
}

export async function countOpenClaims(): Promise<number> {
  return prisma.customerClaim.count({ where: { status: { not: "RESOLVED" } } });
}

export async function updateClaim(claimId: string, input: { status: ClaimStatus; response?: string }, actor: StaffUser) {
  const claim = await prisma.customerClaim.findUnique({ where: { id: claimId }, select: { resolvedAt: true } });
  if (!claim) throw new AppError("notFound", {}, 404);
  return prisma.customerClaim.update({
    where: { id: claimId },
    data: {
      status: input.status,
      response: input.response ?? null,
      handledById: actor.id,
      // Keep the first resolution date; clear it if the complaint is reopened.
      resolvedAt: input.status === "RESOLVED" ? (claim.resolvedAt ?? new Date()) : null,
    },
    select: { id: true },
  });
}

export async function listFeedback() {
  const [latest, stats] = await Promise.all([
    prisma.customerFeedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { workOrder: { select: { id: true, number: true } }, customer: { select: { id: true, name: true } } },
    }),
    prisma.customerFeedback.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
  ]);
  return { latest, average: stats._avg.rating, count: stats._count._all };
}
