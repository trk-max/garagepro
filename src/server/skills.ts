import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { LIVE_LINE } from "@/lib/quote";
import { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";
import { MAX_SCAN_BYTES, sniffScan } from "@/lib/contracts";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import {
  assignmentCheck,
  certState,
  deduceRequiredSkills,
  goalProgress,
  isSkillLevel,
  pickSuggestion,
  rankCandidates,
  requiredSkillIds,
  skillIndices,
  STARTER_SKILLS,
  teamGaps,
  toVerifySkillIds,
  validCertSkillIds,
  type Candidate,
  type CertState,
  type GoalKind,
  type Job,
  type SkillLevel,
  type SkillWarning,
} from "@/lib/skills";
import { stateAfter } from "@/lib/timeclock";
import { audit } from "@/server/audit";
import { putObject, readObject } from "@/server/storage";
import { ACTIVE_STATUSES, DELIVERED_STATUSES, isFinal } from "@/server/workflow";

/**
 * V14 — carte des compétences (serveur). Every read of a person's skills checks the access here
 * (the person himself, or viewSkills); every change checks manageSkills and is written to the audit
 * journal. NOTHING in this file sets a level by itself: levels come only from setLevel (a person).
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export const skillIdFor = (code: string) => `sk_${code}`;
/** Same row on the garage PC and online (hub): one id per (employee, skill). */
export const employeeSkillId = (userId: string, skillId: string) => `es_${createHash("sha1").update(`${userId}:${skillId}`).digest("hex").slice(0, 24)}`;

// ── Access ───────────────────────────────────────────────────────────────────

/** The person himself, or someone allowed to see the whole team (manager / admin / HR). */
export function canSeeSkillsOf(actor: StaffUser, userId: string): boolean {
  return actor.id === userId || can(actor, "viewSkills");
}
function assertView(actor: StaffUser, userId: string) {
  if (!canSeeSkillsOf(actor, userId)) throw new AppError("forbidden", {}, 403);
}
function assertManage(actor: StaffUser) {
  if (!can(actor, "manageSkills")) throw new AppError("forbidden", {}, 403);
}
const reasonOf = (r: string | null | undefined, min = 3) => {
  const v = (r ?? "").trim();
  if (v.length < min) throw new AppError("skillReasonRequired", {}, 422);
  return v.slice(0, 500);
};
const dayToDate = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00Z`) : null);

// ── Catalogue & settings ─────────────────────────────────────────────────────

export async function listSkills(opts: { activeOnly?: boolean } = {}) {
  return prisma.skill.findMany({ where: opts.activeOnly ? { isActive: true } : {}, orderBy: [{ position: "asc" }, { nameFr: "asc" }] });
}
export type SkillRow = Awaited<ReturnType<typeof listSkills>>[number];

export function skillName(s: { nameFr: string; nameAr: string | null; nameEn: string | null }, lang: string): string {
  return (lang === "ar" ? s.nameAr : lang === "en" ? s.nameEn : null) || s.nameFr;
}

export type SkillInput = {
  id?: string | null;
  code: string;
  nameFr: string;
  nameAr?: string | null;
  nameEn?: string | null;
  description?: string | null;
  keywords: string[];
  packageIds: string[];
  supervisionRequired: boolean;
  habilitationRequired: boolean;
  publicLabelFr?: string | null;
  publicLabelAr?: string | null;
  publicLabelEn?: string | null;
  isActive: boolean;
  position: number;
};

const pickSkill = (s: Omit<SkillInput, "id">) => ({
  nameFr: s.nameFr,
  nameAr: s.nameAr || null,
  nameEn: s.nameEn || null,
  description: s.description || null,
  keywords: s.keywords,
  packageIds: s.packageIds,
  supervisionRequired: s.supervisionRequired,
  habilitationRequired: s.habilitationRequired,
  publicLabelFr: s.publicLabelFr || null,
  publicLabelAr: s.publicLabelAr || null,
  publicLabelEn: s.publicLabelEn || null,
  isActive: s.isActive,
  position: s.position,
});

export async function saveSkill(actor: StaffUser, input: SkillInput) {
  assertManage(actor);
  return prisma.$transaction(async (tx) => {
    if (input.id) {
      const before = await tx.skill.findUnique({ where: { id: input.id } });
      if (!before) throw new AppError("notFound", {}, 404);
      const data = pickSkill(input);
      await tx.skill.update({ where: { id: input.id }, data });
      await audit(tx, actor, "skills.catalogueUpdate", "Skill", input.id, { before: { ...before, createdAt: undefined, updatedAt: undefined }, after: data });
      return { id: input.id };
    }
    const id = skillIdFor(input.code);
    if (await tx.skill.findUnique({ where: { id }, select: { id: true } })) throw new AppError("skillCodeTaken", {}, 409);
    const data = pickSkill(input);
    await tx.skill.create({ data: { id, code: input.code, ...data } });
    await audit(tx, actor, "skills.catalogueCreate", "Skill", id, { after: { code: input.code, ...data } });
    return { id };
  });
}

/** Adds the starter skills that are missing (names, keywords; nothing is overwritten). */
export async function createStarterSkills(actor: StaffUser) {
  assertManage(actor);
  return prisma.$transaction(async (tx) => {
    const existing = new Set((await tx.skill.findMany({ select: { id: true } })).map((s) => s.id));
    let created = 0;
    for (const [i, s] of STARTER_SKILLS.entries()) {
      const id = skillIdFor(s.code);
      if (existing.has(id)) continue;
      await tx.skill.create({
        data: { id, code: s.code, nameFr: s.fr, nameAr: s.ar, nameEn: s.en, keywords: s.keywords, supervisionRequired: !!s.supervisionRequired, habilitationRequired: !!s.habilitationRequired, position: (i + 1) * 10 },
      });
      created++;
    }
    if (created) await audit(tx, actor, "skills.catalogueStarter", "Skill", null, { after: { created } });
    return created;
  });
}

export async function saveSkillSettings(actor: StaffUser, input: { certReminderDays: number; supervisorVerifies: boolean; publicLabels: boolean }) {
  assertManage(actor);
  return prisma.$transaction(async (tx) => {
    const before = await tx.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
    const data = { skillCertReminderDays: input.certReminderDays, skillSupervisorVerifies: input.supervisorVerifies, skillPublicLabels: input.publicLabels };
    await tx.setting.update({ where: { id: "garage" }, data });
    await audit(tx, actor, "skills.settings", "Setting", "garage", {
      before: { skillCertReminderDays: before.skillCertReminderDays, skillSupervisorVerifies: before.skillSupervisorVerifies, skillPublicLabels: before.skillPublicLabels },
      after: data,
    });
  });
}

async function skillSettings(db: Db = prisma) {
  const s = await db.setting.findUnique({ where: { id: "garage" }, select: { skillCertReminderDays: true, skillSupervisorVerifies: true, skillPublicLabels: true } });
  return s ?? { skillCertReminderDays: 30, skillSupervisorVerifies: false, skillPublicLabels: false };
}

// ── Levels (always a person's decision, with a reason) ──────────────────────

export async function setLevel(actor: StaffUser, userId: string, skillId: string, level: SkillLevel, reason: string) {
  assertManage(actor);
  if (!isSkillLevel(level)) throw new AppError("invalid", {}, 422);
  // Nobody decides his own level (except the administrator, who has nobody above him).
  if (actor.id === userId && actor.role !== "ADMIN") throw new AppError("skillNotOwnLevel", {}, 403);
  const why = reasonOf(reason);
  return prisma.$transaction(async (tx) => {
    const [user, skill] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } }),
      tx.skill.findUnique({ where: { id: skillId }, select: { id: true } }),
    ]);
    if (!user || !skill) throw new AppError("notFound", {}, 404);
    const current = await tx.employeeSkill.findUnique({ where: { userId_skillId: { userId, skillId } }, select: { level: true } });
    if (current?.level === level) return { changed: false };
    await tx.employeeSkill.upsert({
      where: { userId_skillId: { userId, skillId } },
      update: { level, updatedById: actor.id },
      create: { id: employeeSkillId(userId, skillId), userId, skillId, level, updatedById: actor.id },
    });
    await tx.skillLevelHistory.create({ data: { userId, skillId, fromLevel: current?.level ?? null, toLevel: level, reason: why, actorId: actor.id, actorName: actor.name } });
    await audit(tx, actor, "skills.level", "EmployeeSkill", employeeSkillId(userId, skillId), { before: { userId, skillId, level: current?.level ?? null }, after: { userId, skillId, level, reason: why } });
    return { changed: true };
  });
}

// ── Certificates (private files) ─────────────────────────────────────────────

export const MAX_CERT_BYTES = MAX_SCAN_BYTES;

export type CertificateInput = { skillId?: string | null; type: string; issuer?: string | null; issuedOn?: string | null; expiresOn?: string | null; note?: string | null };

export async function addCertificate(actor: StaffUser, userId: string, input: CertificateInput, file: Buffer | null = null) {
  assertManage(actor);
  const type = input.type.trim();
  if (type.length < 2) throw new AppError("invalid", {}, 422);
  const issuedOn = dayToDate(input.issuedOn);
  const expiresOn = dayToDate(input.expiresOn);
  if (issuedOn && expiresOn && expiresOn < issuedOn) throw new AppError("skillCertDates", {}, 422);
  const [user, skill] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    input.skillId ? prisma.skill.findUnique({ where: { id: input.skillId }, select: { id: true } }) : null,
  ]);
  if (!user || (input.skillId && !skill)) throw new AppError("notFound", {}, 404);
  let stored: { key: string; type: string; size: number } | null = null;
  if (file && file.length > 0) {
    const kind = file.length <= MAX_CERT_BYTES ? sniffScan(file) : null;
    if (!kind) throw new AppError("contractScanType", { max: MAX_CERT_BYTES / 1024 / 1024 }, 422);
    // File first (private storage, never a public URL), then the database row.
    const key = `skills/${userId}/${randomUUID()}.${kind.ext}`;
    await putObject(key, file, kind.contentType);
    stored = { key, type: kind.contentType, size: file.length };
  }
  return prisma.$transaction(async (tx) => {
    const cert = await tx.skillCertificate.create({
      data: {
        userId,
        skillId: input.skillId || null,
        type: type.slice(0, 150),
        issuer: input.issuer?.trim().slice(0, 150) || null,
        issuedOn,
        expiresOn,
        note: input.note?.trim().slice(0, 500) || null,
        fileKey: stored?.key ?? null,
        fileType: stored?.type ?? null,
        fileSize: stored?.size ?? null,
        createdById: actor.id,
      },
      select: { id: true },
    });
    await audit(tx, actor, "skills.certificateAdd", "SkillCertificate", cert.id, { after: { userId, skillId: input.skillId || null, type, issuer: input.issuer ?? null, issuedOn, expiresOn, file: stored ? { type: stored.type, size: stored.size } : null } });
    return cert;
  });
}

/** A wrong certificate is voided with a reason (kept in the history), never deleted. */
export async function voidCertificate(actor: StaffUser, certId: string, reason: string) {
  assertManage(actor);
  const why = reasonOf(reason);
  return prisma.$transaction(async (tx) => {
    const c = await tx.skillCertificate.findUnique({ where: { id: certId } });
    if (!c || c.voidedAt) throw new AppError("notFound", {}, 404);
    await tx.skillCertificate.update({ where: { id: certId }, data: { voidedAt: new Date(), voidedById: actor.id, voidReason: why } });
    await audit(tx, actor, "skills.certificateVoid", "SkillCertificate", certId, { before: { voided: false }, after: { voided: true, reason: why } });
  });
}

/** The certificate file, streamed after the access check (the person himself or viewSkills). */
export async function readCertificateFile(actor: StaffUser, certId: string): Promise<Response> {
  const c = await prisma.skillCertificate.findUnique({ where: { id: certId }, select: { userId: true, fileKey: true, fileType: true } });
  if (!c) throw new AppError("notFound", {}, 404);
  assertView(actor, c.userId);
  if (!c.fileKey || !c.fileType) throw new AppError("notFound", {}, 404);
  const res = await readObject(c.fileKey, c.fileType, null);
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(res.body, { status: res.status, headers });
}

// ── Orders: required skills, jobs (indices) ──────────────────────────────────

const ORDER_SKILL_SELECT = {
  id: true,
  complaint: true,
  skillIds: true,
  lines: { where: { ...LIVE_LINE }, select: { description: true } },
  events: { where: { type: "PACKAGE_APPLIED" }, select: { data: true } },
} satisfies Prisma.WorkOrderSelect;
type OrderSkillSource = Prisma.WorkOrderGetPayload<{ select: typeof ORDER_SKILL_SELECT }>;

const packageIdsOf = (o: OrderSkillSource) =>
  o.events.map((e) => (e.data as { packageId?: unknown } | null)?.packageId).filter((p): p is string => typeof p === "string");

function orderSkills(o: OrderSkillSource, skills: readonly SkillRow[]) {
  const deduced = deduceRequiredSkills(skills, { complaint: o.complaint, lines: o.lines, packageIds: packageIdsOf(o) });
  return { deduced, required: requiredSkillIds(o.skillIds, deduced).filter((id) => skills.some((s) => s.id === id)), manual: Array.isArray(o.skillIds) };
}

/**
 * Delivered orders each person worked on (assigned, or a chronometer on it) since `from`, with the
 * skills of the order, this person's minutes, supervision and linked warranty returns. READ-ONLY.
 */
export async function jobsFor(userIds: readonly string[], from: Date | null, skills?: readonly SkillRow[]): Promise<Map<string, Job[]>> {
  const list = skills ?? (await listSkills());
  const out = new Map<string, Job[]>(userIds.map((u) => [u, []]));
  if (userIds.length === 0) return out;
  const orders = await prisma.workOrder.findMany({
    where: {
      status: { in: DELIVERED_STATUSES },
      ...(from ? { deliveredAt: { gte: from } } : {}),
      OR: [{ mechanicId: { in: [...userIds] } }, { laborEntries: { some: { userId: { in: [...userIds] }, voidedAt: null } } }],
    },
    select: {
      ...ORDER_SKILL_SELECT,
      deliveredAt: true,
      mechanicId: true,
      supervisorId: true,
      laborEntries: { where: { voidedAt: null, userId: { in: [...userIds] } }, select: { userId: true, startedAt: true, endedAt: true } },
      warranties: { where: { voidedAt: null }, select: { _count: { select: { claims: true } } } },
    },
    take: 5000,
  });
  for (const o of orders) {
    const { required } = orderSkills(o, list);
    const returned = o.warranties.some((w) => w._count.claims > 0);
    for (const u of userIds) {
      const entries = o.laborEntries.filter((e) => e.userId === u);
      if (o.mechanicId !== u && entries.length === 0) continue;
      const minutes = entries.reduce((s, e) => s + Math.max(0, Math.round(((e.endedAt ?? e.startedAt).getTime() - e.startedAt.getTime()) / 60_000)), 0);
      out.get(u)!.push({ workOrderId: o.id, deliveredAt: o.deliveredAt ?? new Date(0), skillIds: required, supervised: o.mechanicId === u && !!o.supervisorId, returned, minutes });
    }
  }
  return out;
}

// ── Goals (follow-up) and re-evaluation requests ────────────────────────────

export async function addGoal(actor: StaffUser, userId: string, input: { skillId: string; kind: GoalKind; target: number; sinceDay?: string | null; note?: string | null }) {
  assertManage(actor);
  return prisma.$transaction(async (tx) => {
    const [user, skill] = await Promise.all([tx.user.findUnique({ where: { id: userId }, select: { id: true } }), tx.skill.findUnique({ where: { id: input.skillId }, select: { id: true } })]);
    if (!user || !skill) throw new AppError("notFound", {}, 404);
    const since = dayToDate(input.sinceDay) ?? new Date();
    const g = await tx.skillGoal.create({ data: { userId, skillId: input.skillId, kind: input.kind, target: input.target, since, note: input.note?.trim().slice(0, 300) || null, createdById: actor.id }, select: { id: true } });
    await audit(tx, actor, "skills.goalAdd", "SkillGoal", g.id, { after: { userId, ...input, since } });
    return g;
  });
}

export async function closeGoal(actor: StaffUser, goalId: string) {
  assertManage(actor);
  return prisma.$transaction(async (tx) => {
    const g = await tx.skillGoal.findUnique({ where: { id: goalId }, select: { status: true } });
    if (!g || g.status === "CLOSED") throw new AppError("notFound", {}, 404);
    await tx.skillGoal.update({ where: { id: goalId }, data: { status: "CLOSED", closedAt: new Date(), closedById: actor.id } });
    await audit(tx, actor, "skills.goalClose", "SkillGoal", goalId, { before: { status: g.status }, after: { status: "CLOSED" } });
  });
}

/**
 * Active goals reached → status REACHED + a « à réévaluer » request for the managers (À traiter).
 * Idempotent (one request per goal, deterministic id). NEVER changes a level.
 */
export async function evaluateGoals(userId?: string, now = new Date()): Promise<number> {
  const goals = await prisma.skillGoal.findMany({ where: { status: "ACTIVE", ...(userId ? { userId } : {}) } });
  if (goals.length === 0) return 0;
  const since = new Date(Math.min(...goals.map((g) => g.since.getTime())));
  const jobs = await jobsFor([...new Set(goals.map((g) => g.userId))], since);
  let reached = 0;
  for (const g of goals) {
    if (!goalProgress(g, jobs.get(g.userId) ?? []).reached) continue;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.skillGoal.updateMany({ where: { id: g.id, status: "ACTIVE" }, data: { status: "REACHED", reachedAt: now } });
      if (count === 0) return;
      await tx.skillReviewRequest.createMany({ data: [{ id: `sr_goal_${g.id}`, userId: g.userId, skillId: g.skillId, goalId: g.id, source: "GOAL" }], skipDuplicates: true });
      await audit(tx, null, "skills.goalReached", "SkillGoal", g.id, { after: { userId: g.userId, skillId: g.skillId, target: g.target } });
      reached++;
    });
  }
  return reached;
}

/** The employee asks a manager to re-evaluate one of his skills (message), from his own sheet. */
export async function requestReview(actor: StaffUser, input: { skillId?: string | null; message: string }) {
  const message = input.message.trim();
  if (message.length < 3) throw new AppError("skillReasonRequired", {}, 422);
  return prisma.$transaction(async (tx) => {
    if (input.skillId && !(await tx.skill.findUnique({ where: { id: input.skillId }, select: { id: true } }))) throw new AppError("notFound", {}, 404);
    const r = await tx.skillReviewRequest.create({ data: { userId: actor.id, skillId: input.skillId || null, source: "EMPLOYEE", message: message.slice(0, 500) }, select: { id: true } });
    await audit(tx, actor, "skills.reviewRequest", "SkillReviewRequest", r.id, { after: { skillId: input.skillId ?? null } });
    return r;
  });
}

export async function closeReview(actor: StaffUser, id: string, note?: string | null) {
  assertManage(actor);
  return prisma.$transaction(async (tx) => {
    const r = await tx.skillReviewRequest.findUnique({ where: { id }, select: { status: true, userId: true } });
    if (!r || r.status !== "OPEN") throw new AppError("notFound", {}, 404);
    if (r.userId === actor.id && actor.role !== "ADMIN") throw new AppError("skillNotOwnLevel", {}, 403);
    await tx.skillReviewRequest.update({ where: { id }, data: { status: "DONE", handledAt: new Date(), handledById: actor.id, handledNote: note?.trim().slice(0, 300) || null } });
    await audit(tx, actor, "skills.reviewDone", "SkillReviewRequest", id, { before: { status: "OPEN" }, after: { status: "DONE", note: note ?? null } });
  });
}

// ── Candidates: levels, presence today (clock), leave, load ──────────────────

const WORKSHOP_ROLES: Role[] = ["MECHANIC", "MANAGER", "ADMIN"];

async function loadCandidates(db: Db, now: Date, onlyIds?: readonly string[]): Promise<Candidate[]> {
  const users = await db.user.findMany({
    where: {
      isActive: true,
      ...(onlyIds ? { id: { in: [...onlyIds] } } : { OR: [{ role: { in: WORKSHOP_ROLES } }, { skills: { some: { level: { in: ["AUTONOMOUS", "SUPERVISED", "TRAINING"] } } } }] }),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      skills: { select: { skillId: true, level: true } },
      skillCertificates: { where: { voidedAt: null }, select: { skillId: true, expiresOn: true, voidedAt: true } },
      clockEvents: { where: { voidedAt: null, at: { lte: now } }, orderBy: { at: "desc" }, take: 1, select: { kind: true, at: true } },
      leaveRequests: { where: { status: "APPROVED", startAt: { lte: now }, endAt: { gt: now } }, select: { id: true }, take: 1 },
      laborEntries: { where: { endedAt: null, voidedAt: null }, select: { id: true }, take: 1 },
      _count: { select: { assignedWorkOrders: { where: { status: { in: ACTIVE_STATUSES } } } } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    levels: Object.fromEntries(u.skills.filter((s) => isSkillLevel(s.level)).map((s) => [s.skillId, s.level as SkillLevel])),
    present: stateAfter(u.clockEvents[0] ?? null, now) !== "OUT",
    onLeave: u.leaveRequests.length > 0,
    activeOrders: u._count.assignedWorkOrders,
    chronoRunning: u.laborEntries.length > 0,
    certSkillIds: validCertSkillIds(u.skillCertificates, now),
  }));
}

/** Assisted assignment for one or several orders (work order page, mobile workshop). */
export async function assignmentOptions(workOrderIds: readonly string[], now = new Date()) {
  const [skills, orders, candidates] = await Promise.all([
    listSkills(),
    prisma.workOrder.findMany({
      where: { id: { in: [...workOrderIds] } },
      select: {
        ...ORDER_SKILL_SELECT,
        status: true,
        mechanicId: true,
        supervisorId: true,
        skillWarnings: true,
        skillWarningsAckAt: true,
        skillOverrideReason: true,
        skillOverrideAt: true,
        supervisor: { select: { id: true, name: true } },
      },
    }),
    loadCandidates(prisma, now),
  ]);
  const byId = new Map(skills.map((s) => [s.id, s]));
  return new Map(
    orders.map((o) => {
      const { deduced, required, manual } = orderSkills(o, skills);
      const ranked = rankCandidates(candidates, required, byId);
      return [
        o.id,
        {
          workOrderId: o.id,
          final: isFinal(o.status),
          deduced,
          required: required.map((id) => byId.get(id)!),
          manual,
          ranked,
          suggestion: required.length ? pickSuggestion(ranked) : null,
          mechanicId: o.mechanicId,
          supervisor: o.supervisor,
          warnings: (Array.isArray(o.skillWarnings) ? o.skillWarnings : []) as SkillWarning[],
          warningsAcked: !!o.skillWarningsAckAt,
          override: o.skillOverrideAt ? { reason: o.skillOverrideReason, at: o.skillOverrideAt } : null,
        },
      ] as const;
    }),
  );
}
export type AssignmentOptions = NonNullable<ReturnType<Awaited<ReturnType<typeof assignmentOptions>>["get"]>>;

/** The check of one assignment, inside the caller's transaction. */
async function checkAssignment(tx: Tx, order: OrderSkillSource, mechanicId: string | null, supervisorId: string | null, now: Date) {
  const skills = await tx.skill.findMany();
  const { required } = orderSkills(order, skills as SkillRow[]);
  const people = await loadCandidates(tx, now, [mechanicId, supervisorId].filter((x): x is string => !!x));
  const mechanic = people.find((p) => p.id === mechanicId) ?? null;
  const supervisor = people.find((p) => p.id === supervisorId) ?? null;
  return { required, skills, mechanic, supervisor, check: assignmentCheck({ required, skills: new Map(skills.map((s) => [s.id, s])), mechanic, supervisor }) };
}

/**
 * Assigns the mechanic (and an optional supervisor) to an order. SERVER RULE: when a required skill
 * demands a habilitation, a mechanic without a valid certificate is REFUSED — unless a manager with
 * overrideSkillBlock gives a reason (journalised). Every other case is a warning stored on the order.
 */
export async function assignWithSkills(
  actor: StaffUser,
  workOrderId: string,
  input: { mechanicId: string | null; supervisorId?: string | null; overrideReason?: string | null },
  now = new Date(),
): Promise<{ warnings: SkillWarning[]; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { ...ORDER_SKILL_SELECT, status: true, mechanicId: true, supervisorId: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (isFinal(wo.status)) throw new AppError("final", {}, 409);
    const mechanicId = input.mechanicId || null;
    let supervisorId = input.supervisorId === undefined ? wo.supervisorId : input.supervisorId || null;
    if (!mechanicId || supervisorId === mechanicId) supervisorId = null;
    if (wo.mechanicId === mechanicId && wo.supervisorId === supervisorId && !input.overrideReason) return { warnings: [], changed: false };
    const { check, skills, mechanic, supervisor } = await checkAssignment(tx, wo, mechanicId, supervisorId, now);
    if ((mechanicId && !mechanic) || (supervisorId && !supervisor)) throw new AppError("invalid", {}, 422);
    const warnings: SkillWarning[] = [...check.warnings];
    let override: { reason: string; skills: string[] } | null = null;
    // ── The only blocking rule: habilitation required ──
    if (check.blocked.length > 0) {
      const names = check.blocked.map((id) => skills.find((s) => s.id === id)?.nameFr ?? id).join(", ");
      if (!input.overrideReason?.trim()) throw new AppError("skillHabilitationRequired", { skills: names }, 409);
      if (!can(actor, "overrideSkillBlock")) throw new AppError("skillOverrideForbidden", { skills: names }, 403);
      override = { reason: reasonOf(input.overrideReason), skills: check.blocked };
      for (const skillId of check.blocked) warnings.push({ code: "HABILITATION_OVERRIDDEN", skillId, userId: mechanicId ?? undefined });
    }
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        mechanicId,
        supervisorId,
        skillWarnings: warnings as unknown as Prisma.InputJsonValue,
        skillWarningsAt: warnings.length ? now : null,
        skillWarningsAckAt: null,
        skillWarningsAckById: null,
        skillOverrideReason: override?.reason ?? null,
        skillOverrideById: override ? actor.id : null,
        skillOverrideAt: override ? now : null,
      },
    });
    await tx.workOrderEvent.create({
      data: { workOrderId, actorId: actor.id, type: "ASSIGNED", data: { to: mechanic?.name ?? null, ...(supervisor ? { supervisor: supervisor.name } : {}) } },
    });
    await audit(tx, actor, "skills.assign", "WorkOrder", workOrderId, {
      before: { mechanicId: wo.mechanicId, supervisorId: wo.supervisorId },
      after: { mechanicId, supervisorId, warnings },
    });
    if (override) await audit(tx, actor, "skills.override", "WorkOrder", workOrderId, { after: { mechanicId, skills: override.skills, reason: override.reason } });
    return { warnings, changed: true };
  });
}

/** Required skills chosen by hand (null = back to the deduced ones). */
export async function setOrderSkills(actor: StaffUser, workOrderId: string, skillIds: string[] | null) {
  if (!can(actor, "viewWorkOrders")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, skillIds: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (isFinal(wo.status)) throw new AppError("final", {}, 409);
    const ids = skillIds ? [...new Set(skillIds)] : null;
    if (ids && (await tx.skill.count({ where: { id: { in: ids } } })) !== ids.length) throw new AppError("invalid", {}, 422);
    await tx.workOrder.update({ where: { id: workOrderId }, data: { skillIds: ids ?? Prisma.DbNull } });
    await audit(tx, actor, "skills.orderSkills", "WorkOrder", workOrderId, { before: { skillIds: wo.skillIds ?? null }, after: { skillIds: ids } });
  });
}

/** A manager has seen the warnings of an assignment (À traiter). */
export async function ackWarnings(actor: StaffUser, workOrderId: string) {
  assertManage(actor);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.workOrder.updateMany({ where: { id: workOrderId, skillWarningsAt: { not: null }, skillWarningsAckAt: null }, data: { skillWarningsAckAt: new Date(), skillWarningsAckById: actor.id } });
    if (count === 0) throw new AppError("notFound", {}, 404);
    await audit(tx, actor, "skills.warningsAck", "WorkOrder", workOrderId, { after: { acknowledged: true } });
  });
}

// ── Screens: matrix, employee sheet ──────────────────────────────────────────

export type CertView = { id: string; type: string; issuer: string | null; issuedOn: Date | null; expiresOn: Date | null; skillId: string | null; hasFile: boolean; note: string | null; state: CertState; voidReason: string | null };

const certView = (c: { id: string; type: string; issuer: string | null; issuedOn: Date | null; expiresOn: Date | null; skillId: string | null; fileKey: string | null; note: string | null; voidedAt: Date | null; voidReason: string | null }, now: Date, days: number): CertView => ({
  id: c.id,
  type: c.type,
  issuer: c.issuer,
  issuedOn: c.issuedOn,
  expiresOn: c.expiresOn,
  skillId: c.skillId,
  hasFile: !!c.fileKey,
  note: c.note,
  state: certState(c, now, days),
  voidReason: c.voidReason,
});

/** Team matrix (viewSkills only): levels, « à vérifier », certificates expiring, gaps. */
export async function skillMatrix(actor: StaffUser, now = new Date()) {
  if (!can(actor, "viewSkills")) throw new AppError("forbidden", {}, 403);
  const [skills, users, settings] = await Promise.all([
    listSkills(),
    prisma.user.findMany({
      where: { isActive: true, role: { notIn: ["SELLER", "SHOWROOM_MANAGER", "ACCOUNTANT"] } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        role: true,
        jobTitle: true,
        skills: { select: { skillId: true, level: true } },
        skillCertificates: { where: { voidedAt: null }, orderBy: { expiresOn: "asc" }, select: { id: true, type: true, issuer: true, issuedOn: true, expiresOn: true, skillId: true, fileKey: true, note: true, voidedAt: true, voidReason: true } },
      },
    }),
    skillSettings(),
  ]);
  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    jobTitle: u.jobTitle,
    levels: Object.fromEntries(u.skills.map((s) => [s.skillId, s.level])) as Record<string, SkillLevel>,
    toVerify: toVerifySkillIds(u.skillCertificates, now),
    certificates: u.skillCertificates.map((c) => certView(c, now, settings.skillCertReminderDays)),
  }));
  const gaps = teamGaps(skills, users.flatMap((u) => u.skills.map((s) => ({ userId: u.id, ...s }))), users.map((u) => u.id));
  return { skills, rows, gaps, reminderDays: settings.skillCertReminderDays };
}

/** One employee's sheet: the person himself (read-only) or viewSkills. */
export async function employeeSkillSheet(actor: StaffUser, userId: string, opts: { from?: Date | null; now?: Date } = {}) {
  assertView(actor, userId);
  const now = opts.now ?? new Date();
  const [user, skills, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        jobTitle: true,
        isActive: true,
        skills: { select: { skillId: true, level: true, updatedAt: true } },
        skillHistory: { orderBy: { createdAt: "desc" }, take: 200 },
        skillCertificates: { orderBy: [{ voidedAt: { sort: "asc", nulls: "first" } }, { expiresOn: "asc" }] },
        skillGoals: { orderBy: { createdAt: "desc" } },
        skillReviews: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    }),
    listSkills(),
    skillSettings(),
  ]);
  if (!user) throw new AppError("notFound", {}, 404);
  const jobs = (await jobsFor([userId], null, skills)).get(userId) ?? [];
  const from = opts.from ?? null;
  return {
    user: { id: user.id, name: user.name, role: user.role, jobTitle: user.jobTitle, isActive: user.isActive },
    skills,
    levels: Object.fromEntries(user.skills.map((s) => [s.skillId, s.level])) as Record<string, SkillLevel>,
    history: user.skillHistory,
    certificates: user.skillCertificates.map((c) => certView(c, now, settings.skillCertReminderDays)),
    toVerify: toVerifySkillIds(user.skillCertificates, now),
    goals: user.skillGoals.map((g) => ({ ...g, progress: goalProgress(g, jobs) })),
    reviews: user.skillReviews,
    indices: Object.fromEntries(skills.map((s) => [s.id, skillIndices(jobs, s.id, from ?? undefined)])),
  };
}

/** Rows of the CSV export of the matrix (header first). */
export function matrixRows(m: Awaited<ReturnType<typeof skillMatrix>>, labels: { name: string; roleHeader: string; role: (r: Role) => string; level: (l: string) => string; toVerify: string }, lang: string) {
  const header = [labels.name, labels.roleHeader, ...m.skills.map((s) => skillName(s, lang))];
  const rows = m.rows.map((r) => [r.name, labels.role(r.role), ...m.skills.map((s) => `${r.levels[s.id] ? labels.level(r.levels[s.id]!) : ""}${r.toVerify.includes(s.id) ? ` (${labels.toVerify})` : ""}`)]);
  return [header, ...rows];
}

// ── À traiter / dashboard ────────────────────────────────────────────────────

export const SKILL_TODO_WHERE = {
  warnings: { status: { in: ACTIVE_STATUSES }, skillWarningsAt: { not: null }, skillWarningsAckAt: null } satisfies Prisma.WorkOrderWhereInput,
  reviews: { status: "OPEN" } satisfies Prisma.SkillReviewRequestWhereInput,
};

/** Certificates expiring within the reminder delay or expired, not replaced by a valid one (active staff). */
export async function expiringCertificates(now = new Date()) {
  const { skillCertReminderDays: days } = await skillSettings();
  const certs = await prisma.skillCertificate.findMany({
    where: { voidedAt: null, user: { isActive: true } },
    select: { id: true, userId: true, skillId: true, type: true, expiresOn: true, voidedAt: true, user: { select: { name: true } } },
    orderBy: { expiresOn: "asc" },
  });
  return certs.filter((c) => {
    const s = certState(c, now, days);
    if (s !== "EXPIRING" && s !== "EXPIRED") return false;
    // Replaced: another certificate of the same person for the same skill / type still valid beyond the delay.
    return !certs.some((o) => o.id !== c.id && o.userId === c.userId && (c.skillId ? o.skillId === c.skillId : o.type === c.type) && certState(o, now, days) === "VALID");
  });
}

export async function countSkillTodo(key: "skillCertificates" | "skillWarnings" | "skillReviews", now = new Date()): Promise<number> {
  if (key === "skillCertificates") return (await expiringCertificates(now)).length;
  if (key === "skillWarnings") return prisma.workOrder.count({ where: SKILL_TODO_WHERE.warnings });
  await evaluateGoals(undefined, now).catch(() => 0);
  return prisma.skillReviewRequest.count({ where: SKILL_TODO_WHERE.reviews });
}

/** Dashboard block « manques de compétences ». */
export async function skillGapsSummary(now = new Date()) {
  const [skills, levels, users, expiring] = await Promise.all([
    listSkills({ activeOnly: true }),
    prisma.employeeSkill.findMany({ select: { userId: true, skillId: true, level: true } }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true } }),
    expiringCertificates(now),
  ]);
  const gaps = teamGaps(skills, levels, users.map((u) => u.id));
  return { skills, gaps, expiring: expiring.length, total: skills.length };
}

// ── Customer side: public label only, never a name nor a level ───────────────

/**
 * What the customer tracking page may show: only the PUBLIC labels chosen by the garage for the order's
 * skills, when the setting is on and the assigned mechanic holds a valid certificate for that skill or is
 * AUTONOMOUS on it (and the skill is not « à vérifier »); nothing on a supervised / apprentice order. `hideMechanic`: the assigned mechanic is supervised / in training on the order (an
 * apprentice's name is never shown).
 */
export async function customerSkillView(workOrderId: string, lang: string, now = new Date()): Promise<{ labels: string[]; hideMechanic: boolean }> {
  const [settings, wo] = await Promise.all([
    skillSettings(),
    prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { ...ORDER_SKILL_SELECT, mechanicId: true, supervisorId: true } }),
  ]);
  if (!wo) return { labels: [], hideMechanic: false };
  const skills = await listSkills();
  const { required } = orderSkills(wo, skills);
  const mechanic = wo.mechanicId ? (await loadCandidates(prisma, now, [wo.mechanicId]))[0] ?? null : null;
  const apprentice = !!wo.supervisorId || (!!mechanic && required.some((id) => mechanic.levels[id] === "TRAINING" || mechanic.levels[id] === "SUPERVISED"));
  if (!settings.skillPublicLabels || !mechanic || apprentice) return { labels: [], hideMechanic: apprentice };
  // « à vérifier » (expired certificate, not replaced): no "certified" label until a manager checks it.
  const toVerify = toVerifySkillIds(await prisma.skillCertificate.findMany({ where: { userId: mechanic.id, voidedAt: null }, select: { skillId: true, expiresOn: true, voidedAt: true } }), now);
  const labels = required
    .map((id) => skills.find((s) => s.id === id)!)
    .filter((s) => s.isActive && (mechanic.certSkillIds.includes(s.id) || (mechanic.levels[s.id] === "AUTONOMOUS" && !toVerify.includes(s.id))))
    .map((s) => (lang === "ar" ? s.publicLabelAr : lang === "en" ? s.publicLabelEn : null) || s.publicLabelFr)
    .filter((l): l is string => !!l);
  return { labels: [...new Set(labels)], hideMechanic: apprentice };
}

/** Supervisor of an order (badge + quality control rule). */
export async function supervisorOf(workOrderId: string) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { supervisor: { select: { id: true, name: true } } } });
  return wo?.supervisor ?? null;
}
