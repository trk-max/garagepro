/** V14 — carte des compétences : règles pures (déduction, tri, blocage, certificats, objectifs, indices). */
import { describe, expect, it } from "vitest";
import {
  assignmentCheck,
  certState,
  containsKeyword,
  deduceRequiredSkills,
  goalProgress,
  pickSuggestion,
  rankCandidates,
  requiredSkillIds,
  skillIndices,
  teamGaps,
  toCsv,
  toVerifySkillIds,
  validCertSkillIds,
  type Candidate,
  type Job,
  type SkillDef,
} from "@/lib/skills";

const skill = (id: string, extra: Partial<SkillDef> = {}): SkillDef => ({ id, keywords: [], packageIds: [], supervisionRequired: false, habilitationRequired: false, isActive: true, ...extra });
const SKILLS = [
  skill("brakes", { keywords: ["plaquettes", "frein"], packageIds: ["pk_brakes"] }),
  skill("clutch", { keywords: ["embrayage"], supervisionRequired: true }),
  skill("hv", { keywords: ["hybride", "haute tension"], habilitationRequired: true }),
  skill("ac", { keywords: ["clim"], isActive: false }),
];
const MAP = new Map(SKILLS.map((s) => [s.id, s]));
const D = (s: string) => new Date(`${s}T12:00:00Z`);

describe("V14 — required skills deduced from packages and keywords", () => {
  it("package link and whole-word keywords (accents and case ignored)", () => {
    const r = deduceRequiredSkills(SKILLS, { complaint: "Bruit à l'EMBRAYAGE", lines: [{ description: "Plaquettes AV" }], packageIds: [] });
    expect(r.map((d) => d.skillId)).toEqual(["brakes", "clutch"]);
    expect(r[0]).toEqual({ skillId: "brakes", via: ["keyword"], matched: ["plaquettes"] });
    const p = deduceRequiredSkills(SKILLS, { lines: [], packageIds: ["pk_brakes"] });
    expect(p).toEqual([{ skillId: "brakes", via: ["package"], matched: [] }]);
  });
  it("no partial word, inactive skills ignored, phrases work", () => {
    expect(containsKeyword("Freinage", "frein")).toBe(false);
    expect(containsKeyword("Contrôle frein à main", "frein")).toBe(true);
    expect(containsKeyword("Batterie HAUTE  tension", "haute tension")).toBe(true);
    expect(deduceRequiredSkills(SKILLS, { lines: [{ description: "recharge clim" }], packageIds: [] })).toEqual([]);
  });
  it("skills chosen by hand on the order replace the deduced ones", () => {
    const deduced = deduceRequiredSkills(SKILLS, { lines: [{ description: "plaquettes" }], packageIds: [] });
    expect(requiredSkillIds(null, deduced)).toEqual(["brakes"]);
    expect(requiredSkillIds(["hv"], deduced)).toEqual(["hv"]);
    expect(requiredSkillIds([], deduced)).toEqual([]);
  });
});

const cand = (id: string, levels: Candidate["levels"], extra: Partial<Candidate> = {}): Candidate => ({
  id,
  name: id,
  levels,
  present: true,
  onLeave: false,
  activeOrders: 0,
  chronoRunning: false,
  certSkillIds: [],
  ...extra,
});

describe("V14 — suggestions sorted by level, presence and load", () => {
  it("level first, then leave, presence and load", () => {
    const list = [
      cand("busyAuto", { brakes: "AUTONOMOUS" }, { activeOrders: 3 }),
      cand("trainee", { brakes: "TRAINING" }),
      cand("freeAuto", { brakes: "AUTONOMOUS" }),
      cand("absentAuto", { brakes: "AUTONOMOUS" }, { present: false }),
      cand("leaveAuto", { brakes: "AUTONOMOUS" }, { onLeave: true }),
      cand("sup", { brakes: "SUPERVISED" }),
      cand("none", {}),
    ];
    const r = rankCandidates(list, ["brakes"], MAP);
    expect(r.map((c) => c.id)).toEqual(["freeAuto", "busyAuto", "absentAuto", "leaveAuto", "sup", "trainee", "none"]);
    expect(r.map((c) => c.suggestion)).toEqual(["AUTONOMOUS", "AUTONOMOUS", "AUTONOMOUS", "AUTONOMOUS", "SUPERVISED", "ASSISTANT", "NOT_EVALUATED"]);
    expect(pickSuggestion(r)).toEqual({ mechanicId: "freeAuto", supervisorId: null });
  });
  it("no free AUTONOMOUS → SUPERVISED + an AUTONOMOUS supervisor; trainees are never proposed", () => {
    const r = rankCandidates([cand("sup", { clutch: "SUPERVISED" }), cand("chef", { clutch: "AUTONOMOUS" }, { present: false }), cand("app", { clutch: "TRAINING" })], ["clutch"], MAP);
    expect(r.find((c) => c.id === "sup")!.supervisors.map((s) => s.id)).toEqual(["chef"]);
    expect(pickSuggestion(r)).toEqual({ mechanicId: "sup", supervisorId: "chef" });
    expect(pickSuggestion(rankCandidates([cand("app", { clutch: "TRAINING" })], ["clutch"], MAP))).toBeNull();
  });
  it("chronometer running counts as load; no required skill = everyone level-equal", () => {
    const r = rankCandidates([cand("b", {}, { chronoRunning: true }), cand("a", {}, { chronoRunning: false, activeOrders: 0 })], [], MAP);
    expect(r.map((c) => c.id)).toEqual(["a", "b"]);
    expect(r[0]!.worst).toBeNull();
  });
  it("high voltage without a valid certificate goes last, marked BLOCKED", () => {
    const r = rankCandidates([cand("noCert", { hv: "AUTONOMOUS" }), cand("cert", { hv: "SUPERVISED" }, { certSkillIds: ["hv"] })], ["hv"], MAP);
    expect(r.map((c) => [c.id, c.suggestion])).toEqual([["cert", "SUPERVISED"], ["noCert", "BLOCKED"]]);
  });
});

describe("V14 — assignment: one blocking rule (habilitation), warnings otherwise", () => {
  const mech = (levels: Candidate["levels"], extra: Partial<Candidate> = {}) => cand("m", levels, extra);
  it("habilitation required and no valid certificate → blocked", () => {
    expect(assignmentCheck({ required: ["hv"], skills: MAP, mechanic: mech({ hv: "AUTONOMOUS" }), supervisor: null }).blocked).toEqual(["hv"]);
    expect(assignmentCheck({ required: ["hv"], skills: MAP, mechanic: mech({ hv: "AUTONOMOUS" }, { certSkillIds: ["hv"] }), supervisor: null })).toEqual({ warnings: [], blocked: [] });
  });
  it("other cases are warnings, never a block", () => {
    const c = assignmentCheck({ required: ["brakes", "clutch"], skills: MAP, mechanic: mech({ brakes: "TRAINING", clutch: "SUPERVISED" }, { onLeave: true }), supervisor: null });
    expect(c.blocked).toEqual([]);
    expect(c.warnings.map((w) => w.code)).toEqual(["TRAINING_ONLY", "NEEDS_SUPERVISOR", "ON_LEAVE"]);
    const s = assignmentCheck({ required: ["clutch"], skills: MAP, mechanic: mech({ clutch: "SUPERVISED" }), supervisor: cand("s", { clutch: "SUPERVISED" }) });
    expect(s.warnings).toEqual([{ code: "SUPERVISOR_NOT_AUTONOMOUS", skillId: "clutch", userId: "s" }]);
    expect(assignmentCheck({ required: ["clutch"], skills: MAP, mechanic: mech({ clutch: "SUPERVISED" }), supervisor: cand("s", { clutch: "AUTONOMOUS" }) }).warnings).toEqual([]);
    expect(assignmentCheck({ required: ["brakes"], skills: MAP, mechanic: mech({}), supervisor: null }).warnings).toEqual([{ code: "NO_LEVEL", skillId: "brakes" }]);
    expect(assignmentCheck({ required: ["brakes"], skills: MAP, mechanic: null, supervisor: null })).toEqual({ warnings: [], blocked: [] });
  });
});

describe("V14 — certificates", () => {
  const now = D("2026-10-22");
  it("valid, expiring (reminder), expired from the day after, voided", () => {
    expect(certState({ skillId: "hv", expiresOn: null, voidedAt: null }, now, 30)).toBe("VALID");
    expect(certState({ skillId: "hv", expiresOn: new Date("2027-01-01"), voidedAt: null }, now, 30)).toBe("VALID");
    expect(certState({ skillId: "hv", expiresOn: new Date("2026-11-10"), voidedAt: null }, now, 30)).toBe("EXPIRING");
    expect(certState({ skillId: "hv", expiresOn: new Date("2026-10-22"), voidedAt: null }, now, 30)).toBe("EXPIRING");
    expect(certState({ skillId: "hv", expiresOn: new Date("2026-10-21"), voidedAt: null }, now, 30)).toBe("EXPIRED");
    expect(certState({ skillId: "hv", expiresOn: null, voidedAt: now }, now, 30)).toBe("VOID");
  });
  it("expired → « à vérifier » unless a valid certificate replaces it", () => {
    const old = { skillId: "hv", expiresOn: new Date("2025-01-01"), voidedAt: null };
    expect(toVerifySkillIds([old], now)).toEqual(["hv"]);
    expect(validCertSkillIds([old], now)).toEqual([]);
    expect(toVerifySkillIds([old, { skillId: "hv", expiresOn: new Date("2028-01-01"), voidedAt: null }], now)).toEqual([]);
  });
});

const job = (extra: Partial<Job>): Job => ({ workOrderId: "w", deliveredAt: D("2026-06-01"), skillIds: ["clutch"], supervised: true, returned: false, minutes: 60, ...extra });

describe("V14 — goals (follow-up only) and read-only indices", () => {
  it("« 5 embrayages supervisés sans retour »: returns and other skills do not count", () => {
    const goal = { kind: "SUPERVISED_NO_RETURN", target: 3, since: D("2026-01-01"), skillId: "clutch" };
    const jobs = [job({}), job({ returned: true }), job({ supervised: false }), job({ skillIds: ["brakes"] }), job({ deliveredAt: D("2025-12-01") }), job({})];
    expect(goalProgress(goal, jobs)).toEqual({ count: 2, target: 3, reached: false });
    expect(goalProgress(goal, [...jobs, job({})]).reached).toBe(true);
    expect(goalProgress({ ...goal, kind: "JOBS_NO_RETURN" }, jobs).count).toBe(3);
  });
  it("indices: jobs, hours, linked warranty returns, supervised jobs, period", () => {
    const jobs = [job({ minutes: 90 }), job({ returned: true, supervised: false, minutes: 30 }), job({ deliveredAt: D("2025-01-01") })];
    expect(skillIndices(jobs, "clutch")).toEqual({ jobs: 3, minutes: 180, returns: 1, supervised: 2 });
    expect(skillIndices(jobs, "clutch", D("2026-01-01"))).toEqual({ jobs: 2, minutes: 120, returns: 1, supervised: 1 });
  });
  it("team gaps: no AUTONOMOUS among active employees", () => {
    const gaps = teamGaps(
      [{ id: "hv", isActive: true }, { id: "brakes", isActive: true }, { id: "ac", isActive: false }],
      [
        { userId: "a", skillId: "brakes", level: "AUTONOMOUS" },
        { userId: "b", skillId: "hv", level: "SUPERVISED" },
        { userId: "gone", skillId: "hv", level: "AUTONOMOUS" },
      ],
      ["a", "b"],
    );
    expect(gaps).toEqual([{ skillId: "hv", supervised: 1, training: 0 }]);
  });
  it("CSV quotes separators", () => {
    expect(toCsv([["a;b", 'x"y'], [1, "z"]])).toBe('﻿"a;b";"x""y"\r\n1;z\r\n');
  });
});
