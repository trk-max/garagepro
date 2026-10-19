import "server-only";
import { createHmac } from "node:crypto";
import type { ClockKind, ClockMethod } from "@prisma/client";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { ALLOWED_NEXT, ipAllowed, kioskCode, secondsLeft, stateAfter, verifyKioskCode, windowAt, type ClockMode, type ClockState } from "@/lib/timeclock";
import { audit } from "@/server/audit";
import { isHubLocal } from "@/server/hub";
import { markAttemptsOk, reserveAttempt } from "@/server/rate-limit";

/** Max wrong codes per person in 10 minutes (a 6-digit code cannot be guessed). */
const MAX_FAILED_PUNCHES = 8;

/** Kiosk secret, derived from AUTH_SECRET (same on the garage PC and online when the .env was copied). */
export function clockSecret(): string {
  const base = process.env.AUTH_SECRET;
  if (!base) throw new Error("AUTH_SECRET missing");
  return createHmac("sha256", base).update("garagepro-clock-kiosk-v1").digest("hex");
}

export function kioskDisplay(now = new Date()) {
  const w = windowAt(now);
  return { code: kioskCode(clockSecret(), w), secondsLeft: secondsLeft(now), window: w };
}

async function clockConfig() {
  const s = await prisma.setting.findUnique({ where: { id: "garage" }, select: { clockMode: true, clockNetworks: true } });
  const mode = (["CODE", "NETWORK", "CODE_AND_NETWORK"].includes(s?.clockMode ?? "") ? s!.clockMode : "CODE") as ClockMode;
  return { mode, networks: s?.clockNetworks ?? null };
}

/** Is the request coming from the garage? (garage hub server, or an allowed public IP online). */
export function fromGarageNetwork(ip: string, networks: string | null): boolean {
  return isHubLocal() || ipAllowed(ip, networks);
}

async function lastPunch(userId: string) {
  return prisma.clockEvent.findFirst({
    where: { userId, voidedAt: null },
    orderBy: { at: "desc" },
    select: { kind: true, at: true },
  });
}

export async function myClockStatus(userId: string, now = new Date()) {
  const [last, config] = await Promise.all([lastPunch(userId), clockConfig()]);
  const state: ClockState = stateAfter(last, now);
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const recent = await prisma.clockEvent.findMany({
    where: { userId, at: { gte: since } },
    orderBy: { at: "asc" },
    select: { id: true, kind: true, at: true, method: true, voidedAt: true, voidReason: true, reason: true },
  });
  return { state, allowed: ALLOWED_NEXT[state], mode: config.mode, recent };
}

/**
 * An employee clocks in/out from their own account. Requires, depending on the
 * garage setting: the code shown on the garage kiosk, and/or the garage network.
 */
export async function punch(actor: StaffUser, kind: ClockKind, input: { code?: string; ip: string; now?: Date }) {
  const now = input.now ?? new Date();
  const { mode, networks } = await clockConfig();
  const reserved = await reserveAttempt([{ key: `clock:${actor.id}`, max: MAX_FAILED_PUNCHES }], 10, true);
  if (!reserved) throw new AppError("clockTooMany", {}, 429);

  let window: number | null = null;
  if (mode === "CODE" || mode === "CODE_AND_NETWORK") {
    window = verifyKioskCode(clockSecret(), input.code ?? "", now);
    if (window === null) throw new AppError("clockCodeInvalid", {}, 403);
  }
  const onNetwork = fromGarageNetwork(input.ip, networks);
  if ((mode === "NETWORK" || mode === "CODE_AND_NETWORK") && !onNetwork) throw new AppError("clockNetwork", {}, 403);
  const method: ClockMethod = mode === "CODE" ? "KIOSK_CODE" : mode === "NETWORK" ? "NETWORK" : "KIOSK_CODE_NETWORK";

  const event = await prisma.$transaction(async (tx) => {
    // One punch at a time per person (two quick taps cannot both pass the sequence check).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clock:${actor.id}`}::text)::bigint)`;
    const last = await tx.clockEvent.findFirst({ where: { userId: actor.id, voidedAt: null }, orderBy: { at: "desc" }, select: { kind: true, at: true } });
    const allowed = ALLOWED_NEXT[stateAfter(last, now)];
    if (!allowed.includes(kind)) throw new AppError("clockSequence", {}, 409);
    try {
      const created = await tx.clockEvent.create({
        data: { userId: actor.id, kind, at: now, method, ip: input.ip.slice(0, 64), codeWindow: window, createdById: actor.id },
        select: { id: true, kind: true, at: true },
      });
      await audit(tx, actor, "clock.punch", "ClockEvent", created.id, { after: { kind, at: now, method } });
      return created;
    } catch (error) {
      // Same kiosk code used twice by this person → replay.
      if ((error as { code?: string }).code === "P2002") throw new AppError("clockCodeInvalid", {}, 403);
      throw error;
    }
  });
  await markAttemptsOk(reserved);
  return event;
}

function assertCanCorrect(actor: StaffUser, userId: string) {
  // A manager does not correct his own time sheet (only an administrator can).
  if (actor.id === userId && actor.role !== "ADMIN") throw new AppError("notOwnCorrection", {}, 403);
}

/** Manager adds a missing punch or replaces a wrong one. Never deletes: the old line is voided. */
export async function correctPunch(actor: StaffUser, input: { userId: string; kind: ClockKind; at: Date; reason: string; replaceEventId?: string }) {
  assertCanCorrect(actor, input.userId);
  if (input.at.getTime() > Date.now() + 5 * 60_000) throw new AppError("invalid", {}, 422);
  return prisma.$transaction(async (tx) => {
    let before: unknown;
    if (input.replaceEventId) {
      const old = await tx.clockEvent.findUnique({ where: { id: input.replaceEventId } });
      if (!old || old.userId !== input.userId || old.voidedAt) throw new AppError("notFound", {}, 404);
      await tx.clockEvent.update({ where: { id: old.id }, data: { voidedAt: new Date(), voidedById: actor.id, voidReason: input.reason } });
      before = { id: old.id, kind: old.kind, at: old.at, method: old.method };
    }
    const created = await tx.clockEvent.create({
      data: { userId: input.userId, kind: input.kind, at: input.at, method: "CORRECTION", reason: input.reason, createdById: actor.id },
      select: { id: true },
    });
    await audit(tx, actor, input.replaceEventId ? "clock.correct" : "clock.add", "ClockEvent", created.id, {
      before,
      after: { userId: input.userId, kind: input.kind, at: input.at, reason: input.reason },
    });
    return created;
  });
}

export async function voidPunch(actor: StaffUser, eventId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.clockEvent.findUnique({ where: { id: eventId } });
    if (!old || old.voidedAt) throw new AppError("notFound", {}, 404);
    assertCanCorrect(actor, old.userId);
    await tx.clockEvent.update({ where: { id: eventId }, data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason } });
    await audit(tx, actor, "clock.void", "ClockEvent", eventId, { before: { kind: old.kind, at: old.at, method: old.method }, after: { voided: true, reason } });
  });
}

export async function listPunches(userId: string, from: Date, to: Date) {
  return prisma.clockEvent.findMany({
    where: { userId, at: { gte: from, lt: to } },
    orderBy: { at: "asc" },
  });
}

/** Who is in the garage right now (managers). */
export async function teamPresence(now = new Date()) {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, clockEvents: { where: { voidedAt: null }, orderBy: { at: "desc" }, take: 1, select: { kind: true, at: true } } },
  });
  return users.map((u) => {
    const last = u.clockEvents[0] ?? null;
    return { id: u.id, name: u.name, role: u.role, state: stateAfter(last, now), lastAt: last?.at ?? null };
  });
}
