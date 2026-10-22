/**
 * V14 — carte des compétences : règles pures (aucune base de données), testées dans tests/skills.test.ts.
 * - déduction des compétences requises d'un ordre (forfaits liés, mots-clés des lignes) ;
 * - tri des mécaniciens proposés (niveau, congé, présence, charge) et suggestion ;
 * - avertissements d'affectation et SEUL blocage : habilitation exigée sans certificat valide ;
 * - état des certificats, « à vérifier », objectifs (suivi), indices (lecture seule), manques de l'équipe.
 * Rien ici ne décide ni ne change un niveau : un niveau est toujours choisi par un responsable.
 */

export const SKILL_LEVELS = ["AUTONOMOUS", "SUPERVISED", "TRAINING", "NOT_CONCERNED"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export const isSkillLevel = (v: unknown): v is SkillLevel => typeof v === "string" && (SKILL_LEVELS as readonly string[]).includes(v);

/** AUTONOMOUS first; "not concerned" and "no level" last (same rank). */
const LEVEL_RANK: Record<SkillLevel, number> = { AUTONOMOUS: 0, SUPERVISED: 1, TRAINING: 2, NOT_CONCERNED: 3 };
export const levelRank = (l: SkillLevel | null | undefined) => (l ? LEVEL_RANK[l] : 3);

export const GOAL_KINDS = ["SUPERVISED_NO_RETURN", "JOBS_NO_RETURN"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

/** Lower case, no accents: "Plaquettes AV — Frein" → "plaquettes av — frein". */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Whole-word (or whole-phrase) match, accents and case ignored. */
export function containsKeyword(text: string, keyword: string): boolean {
  const k = normalizeText(keyword).trim();
  if (!k) return false;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(normalizeText(text));
}

export const stringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export type SkillDef = {
  id: string;
  keywords: unknown;
  packageIds: unknown;
  supervisionRequired: boolean;
  habilitationRequired: boolean;
  isActive: boolean;
};

export type OrderText = { complaint?: string | null; lines: readonly { description: string }[]; packageIds: readonly string[] };
export type DeducedSkill = { skillId: string; via: ("package" | "keyword")[]; matched: string[] };

/** Skills an order needs: a linked package was applied, or a keyword appears in a line / the complaint. */
export function deduceRequiredSkills(skills: readonly SkillDef[], order: OrderText): DeducedSkill[] {
  const texts = [...order.lines.map((l) => l.description), order.complaint ?? ""].filter(Boolean);
  const out: DeducedSkill[] = [];
  for (const s of skills) {
    if (!s.isActive) continue;
    const via: DeducedSkill["via"] = [];
    const matched: string[] = [];
    if (stringList(s.packageIds).some((p) => order.packageIds.includes(p))) via.push("package");
    for (const k of stringList(s.keywords)) {
      if (texts.some((t) => containsKeyword(t, k))) matched.push(k);
    }
    if (matched.length) via.push("keyword");
    if (via.length) out.push({ skillId: s.id, via, matched });
  }
  return out;
}

/** Skills chosen by hand on the order (array) win; otherwise the deduced ones. */
export function requiredSkillIds(manual: unknown, deduced: readonly DeducedSkill[]): string[] {
  return Array.isArray(manual) ? stringList(manual) : deduced.map((d) => d.skillId);
}

// ── Certificates ──────────────────────────────────────────────────────────────

export type CertLike = { skillId: string | null; expiresOn: Date | null; voidedAt: Date | null };
export type CertState = "VALID" | "EXPIRING" | "EXPIRED" | "VOID";
const DAY = 86_400_000;

/** `expiresOn` is the last valid day (a calendar date): expired from the next day on. */
export function certState(c: CertLike, now: Date, reminderDays: number): CertState {
  if (c.voidedAt) return "VOID";
  if (!c.expiresOn) return "VALID";
  const end = c.expiresOn.getTime() + DAY;
  if (now.getTime() >= end) return "EXPIRED";
  if (now.getTime() >= end - Math.max(0, reminderDays) * DAY) return "EXPIRING";
  return "VALID";
}

export const certValid = (c: CertLike, now: Date) => {
  const s = certState(c, now, 0);
  return s === "VALID" || s === "EXPIRING";
};

/** Skill ids for which the person holds a valid (not voided, not expired) certificate. */
export function validCertSkillIds(certs: readonly CertLike[], now: Date): string[] {
  return [...new Set(certs.filter((c) => c.skillId && certValid(c, now)).map((c) => c.skillId!))];
}

/**
 * "À vérifier": a certificate linked to the skill has expired and no valid one replaces it.
 * An INDICATOR only — the level itself never changes.
 */
export function toVerifySkillIds(certs: readonly CertLike[], now: Date): string[] {
  const valid = new Set(validCertSkillIds(certs, now));
  return [...new Set(certs.filter((c) => c.skillId && !c.voidedAt && certState(c, now, 0) === "EXPIRED" && !valid.has(c.skillId)).map((c) => c.skillId!))];
}

// ── Assisted assignment ───────────────────────────────────────────────────────

export type Candidate = {
  id: string;
  name: string;
  levels: Readonly<Record<string, SkillLevel>>;
  /** Clocked in (or on a break) right now. */
  present: boolean;
  /** Approved leave covering now. */
  onLeave: boolean;
  /** Active orders assigned to this person. */
  activeOrders: number;
  chronoRunning: boolean;
  /** Skills with a valid certificate. */
  certSkillIds: readonly string[];
};

export type WarningCode = "TRAINING_ONLY" | "NEEDS_SUPERVISOR" | "SUPERVISOR_NOT_AUTONOMOUS" | "NO_LEVEL" | "ON_LEAVE" | "HABILITATION_OVERRIDDEN";
export type SkillWarning = { code: WarningCode; skillId?: string; userId?: string };
export type AssignmentCheck = { warnings: SkillWarning[]; blocked: string[] };

/**
 * What assigning `mechanic` (with `supervisor`) to an order needing `required` means.
 * `blocked` = skills that REQUIRE a habilitation the mechanic does not hold (valid certificate): the
 * only case refused by the server (unless a manager overrides with a reason). Everything else is a
 * warning: the manager decides.
 */
export function assignmentCheck(input: {
  required: readonly string[];
  skills: ReadonlyMap<string, Pick<SkillDef, "supervisionRequired" | "habilitationRequired">>;
  mechanic: Pick<Candidate, "id" | "levels" | "onLeave" | "certSkillIds"> | null;
  supervisor: Pick<Candidate, "id" | "levels"> | null;
}): AssignmentCheck {
  const { mechanic, required, skills } = input;
  const supervisor = input.supervisor && mechanic && input.supervisor.id !== mechanic.id ? input.supervisor : null;
  const warnings: SkillWarning[] = [];
  const blocked: string[] = [];
  if (!mechanic) return { warnings, blocked };
  for (const skillId of required) {
    const def = skills.get(skillId);
    if (!def) continue;
    if (def.habilitationRequired && !mechanic.certSkillIds.includes(skillId)) blocked.push(skillId);
    const level = mechanic.levels[skillId];
    if (level === "AUTONOMOUS") continue;
    if (level === "SUPERVISED") {
      if (!supervisor) {
        if (def.supervisionRequired) warnings.push({ code: "NEEDS_SUPERVISOR", skillId });
      } else if (supervisor.levels[skillId] !== "AUTONOMOUS") warnings.push({ code: "SUPERVISOR_NOT_AUTONOMOUS", skillId, userId: supervisor.id });
    } else if (level === "TRAINING") warnings.push({ code: "TRAINING_ONLY", skillId });
    else warnings.push({ code: "NO_LEVEL", skillId });
  }
  if (mechanic.onLeave) warnings.push({ code: "ON_LEAVE", userId: mechanic.id });
  return { warnings, blocked };
}

export type Suggestion = "AUTONOMOUS" | "SUPERVISED" | "ASSISTANT" | "NOT_EVALUATED" | "BLOCKED";
export type RankedCandidate = Candidate & {
  /** Weakest level over the required skills (no level = NOT_CONCERNED; null when the order needs no particular skill). */
  worst: SkillLevel | null;
  suggestion: Suggestion;
  blocked: string[];
  /** For a SUPERVISED candidate: available colleagues AUTONOMOUS on the skills where he is supervised. */
  supervisors: { id: string; name: string }[];
};

const free = (c: Candidate) => !c.onLeave && c.present;
const load = (c: Candidate) => c.activeOrders + (c.chronoRunning ? 1 : 0);

/** Sorted list for the assignment picker: level, then leave, presence today, current load, name. */
export function rankCandidates(
  candidates: readonly Candidate[],
  required: readonly string[],
  skills: ReadonlyMap<string, Pick<SkillDef, "supervisionRequired" | "habilitationRequired">>,
): RankedCandidate[] {
  const req = required.filter((id) => skills.has(id));
  const ranked = candidates.map((c) => {
    const levels = req.map((id) => c.levels[id] ?? null);
    const worst = req.length === 0 ? null : levels.reduce<SkillLevel>((w, l) => (levelRank(l) > levelRank(w) ? (l ?? "NOT_CONCERNED") : w), "AUTONOMOUS");
    const blocked = req.filter((id) => skills.get(id)!.habilitationRequired && !c.certSkillIds.includes(id));
    const suggestion: Suggestion = blocked.length
      ? "BLOCKED"
      : worst === null || worst === "AUTONOMOUS"
        ? "AUTONOMOUS"
        : worst === "SUPERVISED"
          ? "SUPERVISED"
          : worst === "TRAINING"
            ? "ASSISTANT"
            : "NOT_EVALUATED";
    return { ...c, worst, suggestion, blocked, supervisors: [] as { id: string; name: string }[], _rank: levelRank(worst ?? "AUTONOMOUS") };
  });
  for (const r of ranked) {
    if (r.suggestion !== "SUPERVISED") continue;
    const supervisedOn = req.filter((id) => r.levels[id] === "SUPERVISED");
    r.supervisors = candidates
      .filter((o) => o.id !== r.id && !o.onLeave && supervisedOn.every((id) => o.levels[id] === "AUTONOMOUS"))
      .sort((a, b) => Number(!a.present) - Number(!b.present) || load(a) - load(b) || a.name.localeCompare(b.name))
      .map((o) => ({ id: o.id, name: o.name }));
  }
  return ranked
    .sort(
      (a, b) =>
        Number(a.blocked.length > 0) - Number(b.blocked.length > 0) ||
        a._rank - b._rank ||
        Number(a.onLeave) - Number(b.onLeave) ||
        Number(!a.present) - Number(!b.present) ||
        load(a) - load(b) ||
        a.name.localeCompare(b.name),
    )
    .map((r) => {
      const { _rank: rank, ...rest } = r;
      void rank;
      return rest;
    });
}

/**
 * The proposal: an AUTONOMOUS person who is free (present, not on leave); otherwise a free SUPERVISED one
 * with an AUTONOMOUS supervisor; otherwise nothing. EN_FORMATION is never proposed (assistant only).
 */
export function pickSuggestion(ranked: readonly RankedCandidate[]): { mechanicId: string; supervisorId: string | null } | null {
  const auto = ranked.find((r) => r.suggestion === "AUTONOMOUS" && free(r));
  if (auto) return { mechanicId: auto.id, supervisorId: null };
  const sup = ranked.find((r) => r.suggestion === "SUPERVISED" && free(r) && r.supervisors.length > 0);
  if (sup) return { mechanicId: sup.id, supervisorId: sup.supervisors[0]!.id };
  return null;
}

// ── Read-only indices and goals ──────────────────────────────────────────────

/** One delivered order an employee worked on (assigned, or a chronometer on it). */
export type Job = {
  workOrderId: string;
  deliveredAt: Date;
  skillIds: readonly string[];
  /** The employee was the mechanic and the order had a supervisor. */
  supervised: boolean;
  /** At least one warranty claim on this order's warranties. */
  returned: boolean;
  /** This employee's chronometer minutes on the order. */
  minutes: number;
};

export type SkillIndices = { jobs: number; minutes: number; returns: number; supervised: number };

/** Read-only figures for one skill (never used to set a level). */
export function skillIndices(jobs: readonly Job[], skillId: string, from?: Date): SkillIndices {
  const mine = jobs.filter((j) => j.skillIds.includes(skillId) && (!from || j.deliveredAt >= from));
  return {
    jobs: mine.length,
    minutes: mine.reduce((s, j) => s + j.minutes, 0),
    returns: mine.filter((j) => j.returned).length,
    supervised: mine.filter((j) => j.supervised).length,
  };
}

export type GoalLike = { kind: string; target: number; since: Date; skillId: string };

/** Progress of a goal: FOLLOW-UP only. Reaching it asks a manager to re-evaluate; it changes no level. */
export function goalProgress(goal: GoalLike, jobs: readonly Job[]): { count: number; target: number; reached: boolean } {
  const count = jobs.filter(
    (j) => j.skillIds.includes(goal.skillId) && j.deliveredAt >= goal.since && !j.returned && (goal.kind !== "SUPERVISED_NO_RETURN" || j.supervised),
  ).length;
  return { count, target: goal.target, reached: goal.target > 0 && count >= goal.target };
}

/** Team gaps: active skills with no AUTONOMOUS active employee (« aucun AUTONOME en hybride »). */
export function teamGaps(
  skills: readonly { id: string; isActive: boolean }[],
  levels: readonly { userId: string; skillId: string; level: string }[],
  activeUserIds: readonly string[],
): { skillId: string; supervised: number; training: number }[] {
  const active = new Set(activeUserIds);
  return skills
    .filter((s) => s.isActive)
    .map((s) => {
      const of = levels.filter((l) => l.skillId === s.id && active.has(l.userId));
      return { skillId: s.id, auto: of.filter((l) => l.level === "AUTONOMOUS").length, supervised: of.filter((l) => l.level === "SUPERVISED").length, training: of.filter((l) => l.level === "TRAINING").length };
    })
    .filter((g) => g.auto === 0)
    .map(({ skillId, supervised, training }) => ({ skillId, supervised, training }));
}

/** CSV (";" separator, quoted when needed, BOM for Excel). */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}

/** Starter catalogue (names only, no rule switched on except "habilitation" for high voltage). */
export const STARTER_SKILLS: readonly {
  code: string;
  fr: string;
  ar: string;
  en: string;
  keywords: string[];
  supervisionRequired?: boolean;
  habilitationRequired?: boolean;
}[] = [
  { code: "OIL", fr: "Vidange / entretien", ar: "تغيير الزيت / الصيانة", en: "Oil change / service", keywords: ["vidange", "filtre a huile", "entretien"] },
  { code: "BRAKES", fr: "Freins", ar: "الفرامل", en: "Brakes", keywords: ["frein", "freins", "plaquettes", "disques", "etrier"] },
  { code: "TIMING", fr: "Distribution", ar: "سير التوزيع", en: "Timing belt / chain", keywords: ["distribution", "courroie de distribution", "kit distribution"], supervisionRequired: true },
  { code: "CLUTCH", fr: "Embrayage / boîte", ar: "القابض / علبة السرعات", en: "Clutch / gearbox", keywords: ["embrayage", "boite de vitesses", "boite"], supervisionRequired: true },
  { code: "DIAG", fr: "Diagnostic électronique", ar: "التشخيص الإلكتروني", en: "Electronic diagnosis", keywords: ["diagnostic", "valise", "calculateur", "obd"] },
  { code: "AC", fr: "Climatisation", ar: "التكييف", en: "Air conditioning", keywords: ["climatisation", "clim", "recharge clim"] },
  { code: "HV", fr: "Hybride / électrique (haute tension)", ar: "هجين / كهربائي (جهد عالٍ)", en: "Hybrid / electric (high voltage)", keywords: ["hybride", "haute tension", "batterie de traction"], supervisionRequired: true, habilitationRequired: true },
  { code: "BODY", fr: "Carrosserie", ar: "هيكل السيارة", en: "Bodywork", keywords: ["carrosserie", "peinture", "debosselage"] },
  { code: "TYRES", fr: "Pneus / géométrie", ar: "الإطارات / ضبط الزوايا", en: "Tyres / alignment", keywords: ["pneu", "pneus", "parallelisme", "geometrie", "equilibrage"] },
  { code: "INJECTION", fr: "Injection", ar: "الحقن", en: "Fuel injection", keywords: ["injection", "injecteur", "injecteurs"] },
];
