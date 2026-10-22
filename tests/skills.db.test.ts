/**
 * V14 — carte des compétences, on a real PostgreSQL test database (npm run test:db).
 * Levels decided by a person (history + journal), habilitation rule on the server, privacy (employee / customer),
 * supervisor and person-hours, goals that never change a level.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (session.userId ? { user: { id: session.userId } } : null) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const skills = await import("@/server/skills");
const { setLevelAction, assignSkillsAction, requestReviewAction } = await import("@/actions/skills");
const { assignAction } = await import("@/actions/work-orders");
const { addLaborEntry, laborSummary } = await import("@/server/labor");
const { saveQualityCheck } = await import("@/server/quality");
const { getTrackingView } = await import("@/server/portal");
const { makeUser, makeWorkOrder, prisma } = await import("./helpers/db");

afterEach(() => {
  session.userId = null;
});

const DAY = 86_400_000;
let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}`.toUpperCase();
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const asStaff = (u: { id: string; name: string; email: string; role: string }) => ({ ...u, role: u.role as never, perms: { grant: [], deny: [] } });

async function makeSkill(extra: Partial<{ keywords: string[]; packageIds: string[]; habilitationRequired: boolean; supervisionRequired: boolean; publicLabelFr: string }> = {}) {
  const code = `T${uniq()}`;
  return prisma.skill.create({
    data: {
      id: skills.skillIdFor(code),
      code,
      nameFr: `Compétence ${code}`,
      keywords: extra.keywords ?? [code.toLowerCase()],
      packageIds: extra.packageIds ?? [],
      habilitationRequired: !!extra.habilitationRequired,
      supervisionRequired: !!extra.supervisionRequired,
      publicLabelFr: extra.publicLabelFr ?? null,
    },
  });
}
async function orderNeeding(skill: { code: string }, status = "IN_PROGRESS") {
  const { wo, customer, vehicle } = await makeWorkOrder({ status });
  await prisma.workOrderLine.create({ data: { workOrderId: wo.id, type: "LABOR", description: `Intervention ${skill.code.toLowerCase()}`, quantityX100: 100, unitPrice: 35_000 } });
  return { wo, customer, vehicle };
}
const level = (userId: string, skillId: string) => prisma.employeeSkill.findUnique({ where: { userId_skillId: { userId, skillId } } }).then((r) => r?.level ?? null);

describe("niveaux : décidés par un humain, historique jamais réécrit", () => {
  it("a level change is journaled with its history (who, when, old → new, reason); the history is append-only", async () => {
    const manager = await makeUser("MANAGER");
    const mech = await makeUser("MECHANIC");
    const skill = await makeSkill();
    session.userId = manager.id;
    expect(await setLevelAction(mech.id, form({ skillId: skill.id, level: "TRAINING", reason: "Début de formation" }))).toMatchObject({ ok: true });
    expect(await setLevelAction(mech.id, form({ skillId: skill.id, level: "SUPERVISED", reason: "3 interventions correctes" }))).toMatchObject({ ok: true });
    expect(await level(mech.id, skill.id)).toBe("SUPERVISED");
    const history = await prisma.skillLevelHistory.findMany({ where: { userId: mech.id, skillId: skill.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => [h.fromLevel, h.toLevel, h.reason, h.actorId])).toEqual([
      [null, "TRAINING", "Début de formation", manager.id],
      ["TRAINING", "SUPERVISED", "3 interventions correctes", manager.id],
    ]);
    const journal = await prisma.auditLog.findMany({ where: { action: "skills.level", actorId: manager.id }, orderBy: { createdAt: "asc" } });
    expect(journal.at(-1)).toMatchObject({ before: { level: "TRAINING" }, after: { level: "SUPERVISED", reason: "3 interventions correctes" } });
    // Never rewritten: the database refuses an update or a delete.
    await expect(prisma.skillLevelHistory.update({ where: { id: history[0]!.id }, data: { reason: "x" } })).rejects.toThrow(/append-only/);
    await expect(prisma.skillLevelHistory.delete({ where: { id: history[0]!.id } })).rejects.toThrow(/append-only/);
    // Without a reason: refused.
    expect(await setLevelAction(mech.id, form({ skillId: skill.id, level: "AUTONOMOUS", reason: " " }))).toMatchObject({ ok: false });
    expect(await level(mech.id, skill.id)).toBe("SUPERVISED");
  });

  it("a mechanic cannot change his level; a manager cannot change his own either", async () => {
    const mech = await makeUser("MECHANIC");
    const manager = await makeUser("MANAGER");
    const skill = await makeSkill();
    session.userId = mech.id;
    expect(await setLevelAction(mech.id, form({ skillId: skill.id, level: "AUTONOMOUS", reason: "je sais faire" }))).toMatchObject({ ok: false });
    await expect(skills.setLevel(asStaff(mech), mech.id, skill.id, "AUTONOMOUS", "je sais faire")).rejects.toMatchObject({ code: "forbidden" });
    await expect(skills.setLevel(asStaff(manager), manager.id, skill.id, "AUTONOMOUS", "moi-même")).rejects.toMatchObject({ code: "skillNotOwnLevel" });
    expect(await level(mech.id, skill.id)).toBeNull();
    expect(await level(manager.id, skill.id)).toBeNull();
    // He may ask for a re-evaluation (message to the managers).
    expect(await requestReviewAction(form({ skillId: skill.id, message: "Je pense être autonome" }))).toMatchObject({ ok: true });
    expect(await prisma.skillReviewRequest.count({ where: { userId: mech.id, status: "OPEN", source: "EMPLOYEE" } })).toBe(1);
  });

  it("an expired certificate makes the skill « à vérifier » without changing the level", async () => {
    const manager = await makeUser("MANAGER");
    const mech = await makeUser("MECHANIC");
    const skill = await makeSkill({ habilitationRequired: true });
    await skills.setLevel(asStaff(manager), mech.id, skill.id, "AUTONOMOUS", "Formé et habilité");
    await skills.addCertificate(asStaff(manager), mech.id, { skillId: skill.id, type: "Habilitation B1VL", issuedOn: "2023-01-01", expiresOn: "2024-01-01" });
    const sheet = await skills.employeeSkillSheet(asStaff(manager), mech.id);
    expect(sheet.toVerify).toEqual([skill.id]);
    expect(sheet.certificates[0]!.state).toBe("EXPIRED");
    expect(sheet.levels[skill.id]).toBe("AUTONOMOUS");
    expect(await level(mech.id, skill.id)).toBe("AUTONOMOUS");
    const expiring = await skills.expiringCertificates();
    expect(expiring.some((c) => c.userId === mech.id)).toBe(true);
    expect(await skills.countSkillTodo("skillCertificates")).toBeGreaterThan(0);
  });
});

describe("affectation : le seul blocage est l'habilitation", () => {
  it("high voltage: refused without a valid certificate, accepted with a journaled override, accepted with a certificate", async () => {
    const manager = await makeUser("MANAGER");
    const mech = await makeUser("MECHANIC");
    const hv = await makeSkill({ habilitationRequired: true });
    await skills.setLevel(asStaff(manager), mech.id, hv.id, "AUTONOMOUS", "Formé");
    const { wo } = await orderNeeding(hv);

    // Mechanic (no override permission) and the plain select of the order page: refused.
    session.userId = mech.id;
    const refused = await assignAction(wo.id, mech.id);
    expect(refused).toMatchObject({ ok: false });
    expect((refused as { error: string }).error).toMatch(/habilitation/i);
    expect(await assignSkillsAction(wo.id, form({ mechanicId: mech.id, supervisorId: "", overrideReason: "urgent" }))).toMatchObject({ ok: false });
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).mechanicId).toBeNull();

    // Manager override with a reason: accepted, journaled, kept on the order as a warning.
    session.userId = manager.id;
    expect(await assignSkillsAction(wo.id, form({ mechanicId: mech.id, supervisorId: "", overrideReason: "" }))).toMatchObject({ ok: false });
    const ok = await assignSkillsAction(wo.id, form({ mechanicId: mech.id, supervisorId: "", overrideReason: "Seul mécanicien disponible, contrôle par le chef" }));
    expect(ok).toMatchObject({ ok: true });
    const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    expect(after).toMatchObject({ mechanicId: mech.id, skillOverrideReason: "Seul mécanicien disponible, contrôle par le chef", skillOverrideById: manager.id });
    expect(after.skillWarnings).toEqual([{ code: "HABILITATION_OVERRIDDEN", skillId: hv.id, userId: mech.id }]);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "skills.override", entityId: wo.id } });
    expect(log.after).toMatchObject({ mechanicId: mech.id, skills: [hv.id], reason: "Seul mécanicien disponible, contrôle par le chef" });
    expect(await prisma.workOrder.count({ where: { id: wo.id, ...skills.SKILL_TODO_WHERE.warnings } })).toBe(1);
    await skills.ackWarnings(asStaff(manager), wo.id);
    expect(await prisma.workOrder.count({ where: { id: wo.id, ...skills.SKILL_TODO_WHERE.warnings } })).toBe(0);

    // With a valid certificate: accepted without override, no warning.
    const certified = await makeUser("MECHANIC");
    await skills.setLevel(asStaff(manager), certified.id, hv.id, "AUTONOMOUS", "Formé");
    await skills.addCertificate(asStaff(manager), certified.id, { skillId: hv.id, type: "Habilitation B2VL", expiresOn: "2099-01-01" });
    const { wo: wo2 } = await orderNeeding(hv);
    session.userId = certified.id;
    expect(await assignAction(wo2.id, certified.id)).toMatchObject({ ok: true });
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id: wo2.id } })).toMatchObject({ mechanicId: certified.id, skillWarnings: [] });
  });

  it("other cases are warnings only (trainee, supervised without supervisor), never a refusal", async () => {
    const manager = await makeUser("MANAGER");
    const trainee = await makeUser("MECHANIC");
    const clutch = await makeSkill({ supervisionRequired: true });
    await skills.setLevel(asStaff(manager), trainee.id, clutch.id, "TRAINING", "Apprenti");
    const { wo } = await orderNeeding(clutch);
    const r = await skills.assignWithSkills(asStaff(manager), wo.id, { mechanicId: trainee.id });
    expect(r.warnings).toEqual([{ code: "TRAINING_ONLY", skillId: clutch.id }]);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).mechanicId).toBe(trainee.id);
  });

  it("required skills are deduced from the applied package and can be changed by hand", async () => {
    const manager = await makeUser("MANAGER");
    const pkg = await prisma.servicePackage.create({ data: { name: `Clim ${uniq()}` } });
    const ac = await makeSkill({ packageIds: [pkg.id], keywords: [] });
    const other = await makeSkill();
    const { wo } = await makeWorkOrder({ status: "DIAGNOSIS" });
    await prisma.workOrderEvent.create({ data: { workOrderId: wo.id, type: "PACKAGE_APPLIED", data: { name: pkg.name, packageId: pkg.id } } });
    let o = (await skills.assignmentOptions([wo.id])).get(wo.id)!;
    expect(o.required.map((s) => s.id)).toEqual([ac.id]);
    expect(o.deduced[0]).toMatchObject({ skillId: ac.id, via: ["package"] });
    await skills.setOrderSkills(asStaff(manager), wo.id, [other.id]);
    o = (await skills.assignmentOptions([wo.id])).get(wo.id)!;
    expect(o).toMatchObject({ manual: true });
    expect(o.required.map((s) => s.id)).toEqual([other.id]);
    await skills.setOrderSkills(asStaff(manager), wo.id, null);
    expect((await skills.assignmentOptions([wo.id])).get(wo.id)!.required.map((s) => s.id)).toEqual([ac.id]);
  });
});

describe("confidentialité", () => {
  it("employee A does not see B's skills, certificates or files; A sees his own; managers see both", async () => {
    const manager = await makeUser("MANAGER");
    const a = await makeUser("MECHANIC");
    const b = await makeUser("MECHANIC");
    const skill = await makeSkill();
    await skills.setLevel(asStaff(manager), b.id, skill.id, "SUPERVISED", "Évaluation");
    const pdf = Buffer.from("%PDF-1.4\n% test certificate\n");
    const cert = await skills.addCertificate(asStaff(manager), b.id, { skillId: skill.id, type: "Attestation clim" }, pdf);
    expect(skills.canSeeSkillsOf(asStaff(a), b.id)).toBe(false);
    await expect(skills.employeeSkillSheet(asStaff(a), b.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(skills.readCertificateFile(asStaff(a), cert.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(skills.skillMatrix(asStaff(a))).rejects.toMatchObject({ code: "forbidden" });
    expect((await skills.employeeSkillSheet(asStaff(a), a.id)).user.id).toBe(a.id);
    expect((await skills.employeeSkillSheet(asStaff(b), b.id)).levels[skill.id]).toBe("SUPERVISED");
    expect((await skills.readCertificateFile(asStaff(b), cert.id)).status).toBe(200);
    expect((await skills.employeeSkillSheet(asStaff(manager), b.id)).levels[skill.id]).toBe("SUPERVISED");
    const hr = await makeUser("HR");
    expect((await skills.skillMatrix(asStaff(hr))).rows.some((r) => r.id === b.id)).toBe(true);
  });

  it("the customer never sees names nor levels: public label only, an apprentice's name hidden", async () => {
    const manager = await makeUser("MANAGER");
    const apprentice = await makeUser("MECHANIC", { name: "Yassine Apprenti" });
    const chief = await makeUser("MECHANIC", { name: "Karim Chef" });
    const ac = await makeSkill({ publicLabelFr: "technicien certifié climatisation" });
    await skills.setLevel(asStaff(manager), apprentice.id, ac.id, "SUPERVISED", "En progrès");
    await skills.setLevel(asStaff(manager), chief.id, ac.id, "AUTONOMOUS", "Expert");
    await prisma.setting.upsert({ where: { id: "garage" }, update: { skillPublicLabels: true }, create: { id: "garage", skillPublicLabels: true } });
    try {
      const { wo } = await orderNeeding(ac);
      await skills.assignWithSkills(asStaff(manager), wo.id, { mechanicId: apprentice.id, supervisorId: chief.id });
      const view = await getTrackingView(wo.id, "fr");
      const json = JSON.stringify(view);
      expect(view!.mechanicName).toBeNull();
      for (const secret of ["Yassine", "Karim", "SUPERVISED", "AUTONOMOUS", "TRAINING", "Supervisé", "Autonome"]) expect(json).not.toContain(secret);
      // The apprentice is supervised: no "certified technician" label either (nobody certified did it alone).
      expect(view!.skillLabels).toEqual([]);

      // The chief alone (AUTONOMOUS): public label shown, his first name only (as before V14).
      await skills.assignWithSkills(asStaff(manager), wo.id, { mechanicId: chief.id, supervisorId: null });
      const v2 = await getTrackingView(wo.id, "fr");
      expect(v2!.skillLabels).toEqual(["technicien certifié climatisation"]);
      expect(v2!.mechanicName).toBe("Karim");
      expect(JSON.stringify(v2)).not.toMatch(/AUTONOMOUS|Chef/);
    } finally {
      await prisma.setting.update({ where: { id: "garage" }, data: { skillPublicLabels: false } });
    }
  });
});

describe("supervision et heures-personnes", () => {
  it("the supervisor keeps his own hours; person-hours = both; the supervisor validates « travaux vérifiés » when set so", async () => {
    const manager = await makeUser("MANAGER");
    const mech = await makeUser("MECHANIC");
    const sup = await makeUser("MECHANIC");
    const skill = await makeSkill({ supervisionRequired: true });
    await skills.setLevel(asStaff(manager), mech.id, skill.id, "SUPERVISED", "En progrès");
    await skills.setLevel(asStaff(manager), sup.id, skill.id, "AUTONOMOUS", "Expert");
    const { wo } = await orderNeeding(skill);
    const r = await skills.assignWithSkills(asStaff(manager), wo.id, { mechanicId: mech.id, supervisorId: sup.id });
    expect(r.warnings).toEqual([]);
    // Without a supervisor, the same assignment carries the "needs a supervisor" warning.
    const { wo: alone } = await orderNeeding(skill);
    expect((await skills.assignWithSkills(asStaff(manager), alone.id, { mechanicId: mech.id })).warnings).toEqual([{ code: "NEEDS_SUPERVISOR", skillId: skill.id }]);

    const t0 = new Date(Date.now() - 5 * 3_600_000);
    await addLaborEntry(asStaff(manager), { workOrderId: wo.id, userId: mech.id, startedAt: t0, endedAt: new Date(t0.getTime() + 120 * 60_000) });
    await addLaborEntry(asStaff(manager), { workOrderId: wo.id, userId: sup.id, startedAt: new Date(t0.getTime() + 60 * 60_000), endedAt: new Date(t0.getTime() + 90 * 60_000) });
    const labor = await laborSummary(wo.id);
    expect(Object.fromEntries(labor.perUser.map((u) => [u.userId, u.minutes]))).toEqual({ [mech.id]: 120, [sup.id]: 30 });
    expect(labor.personMinutes).toBe(150);
    expect(labor.elapsedMinutes).toBe(120);

    const items = { roadTest: "DONE" as const, fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true };
    await prisma.setting.upsert({ where: { id: "garage" }, update: { skillSupervisorVerifies: true }, create: { id: "garage", skillSupervisorVerifies: true } });
    try {
      await expect(saveQualityCheck(asStaff(mech), wo.id, items)).rejects.toMatchObject({ code: "skillSupervisorVerifies" });
      await saveQualityCheck(asStaff(sup), wo.id, items);
      expect((await prisma.qualityCheck.findUniqueOrThrow({ where: { workOrderId: wo.id } })).workVerified).toBe(true);
    } finally {
      await prisma.setting.update({ where: { id: "garage" }, data: { skillSupervisorVerifies: false } });
    }
  });
});

describe("objectifs et indices : aucun passage automatique de niveau", () => {
  it("a goal reached asks for a re-evaluation; the level stays as the manager set it", async () => {
    const manager = await makeUser("MANAGER");
    const mech = await makeUser("MECHANIC");
    const sup = await makeUser("MECHANIC");
    const clutch = await makeSkill();
    await skills.setLevel(asStaff(manager), mech.id, clutch.id, "SUPERVISED", "Début");
    const goal = await skills.addGoal(asStaff(manager), mech.id, { skillId: clutch.id, kind: "SUPERVISED_NO_RETURN", target: 2, sinceDay: "2020-01-01" });
    // Two delivered supervised clutch jobs, one of them returned under warranty → 1 / 2.
    const jobs = [];
    for (let i = 0; i < 3; i++) {
      const { wo, customer, vehicle } = await orderNeeding(clutch, "DELIVERED");
      await prisma.workOrder.update({ where: { id: wo.id }, data: { mechanicId: mech.id, supervisorId: sup.id, deliveredAt: new Date(Date.now() - (10 - i) * DAY) } });
      jobs.push({ wo, customer, vehicle });
    }
    const w = await prisma.warranty.create({ data: { kind: "REPAIR", workOrderId: jobs[0]!.wo.id, vehicleId: jobs[0]!.vehicle.id, customerId: jobs[0]!.customer.id, label: "Embrayage", startsAt: new Date() } });
    await prisma.warrantyClaim.create({ data: { warrantyId: w.id, description: "Patine" } });

    const sheet = await skills.employeeSkillSheet(asStaff(manager), mech.id);
    expect(sheet.indices[clutch.id]).toMatchObject({ jobs: 3, returns: 1, supervised: 3 });
    expect(sheet.goals[0]!.progress).toEqual({ count: 2, target: 2, reached: true });

    expect(await skills.evaluateGoals(mech.id)).toBe(1);
    expect(await skills.evaluateGoals(mech.id)).toBe(0); // idempotent
    expect(await prisma.skillGoal.findUniqueOrThrow({ where: { id: goal.id } })).toMatchObject({ status: "REACHED" });
    expect(await prisma.skillReviewRequest.findUniqueOrThrow({ where: { id: `sr_goal_${goal.id}` } })).toMatchObject({ source: "GOAL", status: "OPEN", userId: mech.id });
    // No automatic level change, ever.
    expect(await level(mech.id, clutch.id)).toBe("SUPERVISED");
    expect(await prisma.skillLevelHistory.count({ where: { userId: mech.id } })).toBe(1);
    expect(await skills.countSkillTodo("skillReviews")).toBeGreaterThan(0);
  });
});
