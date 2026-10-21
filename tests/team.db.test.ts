/**
 * Prompt 1 — real database tests (PostgreSQL + real Prisma queries).
 * Run: npm run test:db   (see vitest.db.config.ts)
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { kioskCode, windowAt } from "@/lib/timeclock";
import { employeeReport, employeeReportCsv } from "@/server/team-reports";
import { cancelLeave, decideLeave, getLeaveBalance, requestLeave } from "@/server/leaves";
import { wholeDaysSpan } from "@/lib/leaves";
import { addLaborEntry, laborSummary, startLabor, stopLabor, voidLaborEntry } from "@/server/labor";
import { approveQualityCheck, saveQualityCheck } from "@/server/quality";
import { changeStatus } from "@/server/work-orders";
import { clockSecret, correctPunch, punch, voidPunch } from "@/server/timeclock";
import { issueCertificate, getCertificate } from "@/server/certificates";
import { certificatePdf } from "@/server/certificate-pdf";
import { addPartNeed, delays, updateInsurance, updatePartNeed } from "@/server/follow-up";
import { authenticateCompanyUser, companyOverview, companyWorkOrder, companyWorkOrders, createCompanyUser, updateCompanyUser } from "@/server/company-portal";
import { calendarItems } from "@/server/calendar";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

const code = (d: Date) => kioskCode(clockSecret(), windowAt(d));
const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error).message;
  }
  return "NO ERROR";
};

afterEach(() => vi.unstubAllEnvs());

beforeAll(async () => {
  await prisma.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
});

describe("pointage", () => {
  it("needs the code currently shown on the garage kiosk, once", async () => {
    const m = await makeUser("MECHANIC");
    const t0 = new Date("2026-10-20T07:00:05Z");
    expect(await fail(punch(m, "IN", { code: "000000", ip: "1.2.3.4", now: t0 }))).toBe("clockCodeInvalid");
    const ev = await punch(m, "IN", { code: code(t0), ip: "1.2.3.4", now: t0 });
    expect(ev.kind).toBe("IN");
    // Same code again (photo / replay) for the next punch: refused.
    expect(await fail(punch(m, "BREAK_START", { code: code(t0), ip: "1.2.3.4", now: new Date(t0.getTime() + 10_000) }))).toBe("clockCodeInvalid");
    // Two arrivals in a row: refused.
    const t1 = new Date("2026-10-20T07:05:00Z");
    expect(await fail(punch(m, "IN", { code: code(t1), ip: "1.2.3.4", now: t1 }))).toBe("clockSequence");
    const t2 = new Date("2026-10-20T16:00:00Z");
    await punch(m, "OUT", { code: code(t2), ip: "1.2.3.4", now: t2 });
    const audits = await prisma.auditLog.count({ where: { actorId: m.id, action: "clock.punch" } });
    expect(audits).toBe(2);
  });

  it("network mode: only from the garage network", async () => {
    await prisma.setting.update({ where: { id: "garage" }, data: { clockMode: "CODE_AND_NETWORK", clockNetworks: "41.226.10.5" } });
    try {
      const m = await makeUser("MECHANIC");
      const t = new Date("2026-10-21T07:00:00Z");
      expect(await fail(punch(m, "IN", { code: code(t), ip: "8.8.8.8", now: t }))).toBe("clockNetwork");
      expect((await punch(m, "IN", { code: code(t), ip: "41.226.10.5", now: t })).kind).toBe("IN");
      vi.stubEnv("GARAGE_HUB_LOCAL", "1"); // the garage server itself = garage network
      const m2 = await makeUser("MECHANIC");
      expect((await punch(m2, "IN", { code: code(t), ip: "direct", now: t })).kind).toBe("IN");
    } finally {
      await prisma.setting.update({ where: { id: "garage" }, data: { clockMode: "CODE", clockNetworks: null } });
    }
  });

  it("blocks guessing after 8 wrong codes", async () => {
    const m = await makeUser("MECHANIC");
    const t = new Date();
    for (let i = 0; i < 8; i++) await fail(punch(m, "IN", { code: "123456", ip: "x", now: t }));
    expect(await fail(punch(m, "IN", { code: code(t), ip: "x", now: t }))).toBe("clockTooMany");
  });

  it("corrections void the old line and keep both, never by the person himself", async () => {
    const manager = await makeUser("MANAGER");
    const m = await makeUser("MECHANIC");
    const t = new Date("2026-10-12T07:00:00Z");
    const ev = await punch(m, "IN", { code: code(t), ip: "x", now: t });
    expect(await fail(correctPunch(manager, { userId: manager.id, kind: "IN", at: t, reason: "oubli" }))).toBe("notOwnCorrection");
    await correctPunch(manager, { userId: m.id, kind: "IN", at: new Date("2026-10-12T06:55:00Z"), reason: "arrivé avant, borne en panne", replaceEventId: ev.id });
    const lines = await prisma.clockEvent.findMany({ where: { userId: m.id }, orderBy: { createdAt: "asc" } });
    expect(lines).toHaveLength(2);
    expect(lines[0]!.voidedAt).not.toBeNull();
    expect(lines[1]!.method).toBe("CORRECTION");
    await correctPunch(manager, { userId: m.id, kind: "OUT", at: new Date("2026-10-12T15:55:00Z"), reason: "oubli sortie" });
    const r = await employeeReport(m.id, new Date("2026-10-12T00:00:00Z"), new Date("2026-10-13T00:00:00Z"));
    expect(r!.presenceMinutes).toBe(540); // 06:55 → 15:55 UTC, corrected line used
    await voidPunch(manager, lines[1]!.id, "erreur");
    expect(await prisma.auditLog.count({ where: { entity: "ClockEvent", action: { in: ["clock.correct", "clock.add", "clock.void"] }, actorId: manager.id } })).toBe(3);
  });
});

describe("congés et absences", () => {
  it("request → manager decides; overlaps and self-approval refused", async () => {
    const manager = await makeUser("MANAGER");
    const m = await makeUser("MECHANIC");
    const leave = await requestLeave(m, { type: "PAID_LEAVE", startAt: new Date("2026-11-02T00:00:00Z"), endAt: new Date("2026-11-05T00:00:00Z"), allDay: true, reason: "Famille" });
    expect(leave.status).toBe("PENDING");
    expect(await fail(requestLeave(m, { type: "UNPAID", startAt: new Date("2026-11-04T00:00:00Z"), endAt: new Date("2026-11-06T00:00:00Z"), allDay: true }))).toBe("leaveOverlap");
    expect(await fail(decideLeave(m, leave.id, true))).toBe("forbidden"); // a mechanic cannot decide
    const own = await requestLeave(manager, { type: "PAID_LEAVE", startAt: new Date("2026-12-01T00:00:00Z"), endAt: new Date("2026-12-02T00:00:00Z"), allDay: true });
    expect(await fail(decideLeave(manager, own.id, true))).toBe("notOwnDecision");
    await decideLeave(manager, leave.id, true, "OK");
    expect(await fail(decideLeave(manager, leave.id, false))).toBe("leaveNotPending");
    expect((await prisma.leaveRequest.findUnique({ where: { id: leave.id } }))!.status).toBe("APPROVED");
    expect(await fail(cancelLeave(m, leave.id))).toBe("forbidden"); // approved: only a manager cancels
    await cancelLeave(manager, leave.id, "annulé à la demande");
    const history = await prisma.auditLog.findMany({ where: { entityId: leave.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => h.action)).toEqual(["leave.request", "leave.approve", "leave.cancel"]);
  });

  it("paid-leave balance: fixed days per year minus approved days; pending shown apart; refused not counted", async () => {
    const manager = await makeUser("MANAGER");
    const m = await makeUser("MECHANIC", { annualLeaveDays: 24 });
    const tz = "Africa/Tunis";
    const approved = await requestLeave(m, { type: "PAID_LEAVE", ...wholeDaysSpan("2026-03-02", "2026-03-04", tz), allDay: true }); // Mon–Wed = 3 d
    await decideLeave(manager, approved.id, true);
    await requestLeave(m, { type: "PAID_LEAVE", ...wholeDaysSpan("2026-03-09", "2026-03-10", tz), allDay: true }); // pending, 2 d
    const refused = await requestLeave(m, { type: "PAID_LEAVE", ...wholeDaysSpan("2026-04-06", "2026-04-10", tz), allDay: true });
    await decideLeave(manager, refused.id, false, "période chargée");
    await requestLeave(manager, { userId: m.id, type: "SICK", ...wholeDaysSpan("2026-05-04", "2026-05-05", tz), allDay: true }); // not paid leave
    expect(await getLeaveBalance(m.id, 2026)).toEqual({ year: 2026, allowance: 24, taken: 3, pending: 2, remaining: 21 });
    expect((await getLeaveBalance(m.id, 2027))!.taken).toBe(0); // new year, no carry-over
    const unset = await makeUser("MECHANIC");
    expect((await getLeaveBalance(unset.id, 2026))!.remaining).toBeNull();
  });

  it("an absence recorded by a manager is approved at once, with its author", async () => {
    const manager = await makeUser("MANAGER");
    const m = await makeUser("MECHANIC");
    const abs = await requestLeave(manager, { userId: m.id, type: "ABSENCE", startAt: new Date("2026-11-10T00:00:00Z"), endAt: new Date("2026-11-11T00:00:00Z"), allDay: true });
    expect(abs.status).toBe("APPROVED");
    expect(abs.decidedById).toBe(manager.id);
    const other = await makeUser("MECHANIC");
    expect(await fail(requestLeave(other, { userId: m.id, type: "ABSENCE", startAt: new Date("2026-11-20T00:00:00Z"), endAt: new Date("2026-11-21T00:00:00Z"), allDay: true }))).toBe("forbidden");
  });

  it("calendar: pending requests and the leave type are private", async () => {
    const manager = await makeUser("MANAGER");
    const a = await makeUser("MECHANIC");
    const b = await makeUser("MECHANIC");
    const p = await requestLeave(a, { type: "SICK", startAt: new Date("2027-01-04T00:00:00Z"), endAt: new Date("2027-01-05T00:00:00Z"), allDay: true });
    const range = [new Date("2027-01-01T00:00:00Z"), new Date("2027-01-31T00:00:00Z")] as const;
    const forB = (await calendarItems(b, ...range)).filter((i) => i.kind === "leave");
    expect(forB.find((i) => i.id === p.id)).toBeUndefined(); // pending: not shown to colleagues
    await decideLeave(manager, p.id, true);
    const forB2 = (await calendarItems(b, ...range)).filter((i) => i.kind === "leave" && i.id === p.id);
    expect(forB2).toHaveLength(1);
    expect((forB2[0] as { type: unknown }).type).toBeNull(); // colleague sees "absent", not "sick"
    const forA = (await calendarItems(a, ...range)).find((i) => i.kind === "leave" && i.id === p.id) as { type: unknown };
    expect(forA.type).toBe("SICK");
  });
});

describe("temps des mécaniciens", () => {
  it("two mechanics 2 h together = 4 person-hours, 2 h suggested for billing", async () => {
    const manager = await makeUser("MANAGER");
    const a = await makeUser("MECHANIC");
    const b = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder({ status: "IN_PROGRESS" });
    const start = new Date(Date.now() - 2 * 3_600_000);
    const ea = await startLabor(a, wo.id, a.id, start);
    const eb = await startLabor(b, wo.id, b.id, start);
    expect(await fail(startLabor(a, wo.id))).toBe("laborRunning"); // one timer at a time
    expect(await fail(stopLabor(b, ea.id))).toBe("forbidden"); // not someone else's
    const end = new Date(start.getTime() + 2 * 3_600_000);
    await stopLabor(a, ea.id, end);
    await stopLabor(manager, eb.id, end);
    const s = await laborSummary(wo.id);
    expect(s.personMinutes).toBe(240);
    expect(s.elapsedMinutes).toBe(120);
    expect(s.suggestedX100).toBe(200);
    expect(s.billedX100).toBe(0); // nothing billed automatically
    // A wrong entry is voided (kept), not deleted.
    const extra = await addLaborEntry(manager, { workOrderId: wo.id, userId: a.id, startedAt: new Date(start.getTime() - 3_600_000), endedAt: start });
    expect((await laborSummary(wo.id)).personMinutes).toBe(300);
    await voidLaborEntry(manager, extra.id, "doublon");
    expect((await laborSummary(wo.id)).personMinutes).toBe(240);
    expect(await prisma.laborEntry.count({ where: { workOrderId: wo.id } })).toBe(3);
    // Employee report counts each mechanic's own time.
    const r = await employeeReport(a.id, new Date(start.getTime() - 86_400_000), new Date(end.getTime() + 60_000));
    expect(r!.laborMinutes).toBe(120);
    expect(employeeReportCsv(r!)).toContain("OR-");
  });

  it("no chronometer on a delivered order", async () => {
    const a = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder({ status: "DELIVERED" });
    expect(await fail(startLabor(a, wo.id))).toBe("laborClosedOrder");
  });
});

describe("contrôle qualité obligatoire", () => {
  const all = { roadTest: "DONE" as const, fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true };
  it("'Ready' is refused until the checklist is complete AND validated by a manager", async () => {
    const manager = await makeUser("MANAGER");
    const mech = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder({ status: "QUALITY_CONTROL" });
    expect(await fail(changeStatus(wo.id, "READY", manager))).toBe("qcNotApproved");
    await saveQualityCheck(mech, wo.id, { ...all, toolsRemoved: false });
    expect(await fail(approveQualityCheck(manager, wo.id))).toBe("qcIncomplete");
    await saveQualityCheck(mech, wo.id, all);
    expect(await fail(approveQualityCheck(mech, wo.id))).toBe("forbidden"); // final validation: manager
    await approveQualityCheck(manager, wo.id);
    // Changing a point afterwards cancels the validation.
    await saveQualityCheck(mech, wo.id, { ...all, roadTest: "NOT_NEEDED" });
    expect(await fail(changeStatus(wo.id, "READY", manager))).toBe("qcNotApproved");
    await approveQualityCheck(manager, wo.id);
    await changeStatus(wo.id, "READY", manager);
    expect((await prisma.workOrder.findUnique({ where: { id: wo.id } }))!.status).toBe("READY");
    // Back to the workshop → must be validated again.
    await changeStatus(wo.id, "IN_PROGRESS", manager);
    expect((await prisma.qualityCheck.findUnique({ where: { workOrderId: wo.id } }))!.approvedAt).toBeNull();
  });

  it("the old shortcut IN_PROGRESS → READY no longer exists", async () => {
    const manager = await makeUser("MANAGER");
    const { wo } = await makeWorkOrder({ status: "IN_PROGRESS" });
    expect(await fail(changeStatus(wo.id, "READY", manager))).toBe("transition");
  });
});

describe("assurance, pièces manquantes, retards", () => {
  it("records the insurance file and lists late items", async () => {
    const rec = await makeUser("RECEPTION");
    const { wo } = await makeWorkOrder({ status: "DIAGNOSIS" });
    await changeStatus(wo.id, "WAITING_INSURANCE", rec);
    await updateInsurance(rec, wo.id, { insurerName: "STAR", insuranceClaimRef: "S-123", insuranceRequestedAt: new Date(Date.now() - 5 * 86_400_000) });
    const need = await addPartNeed(rec, wo.id, { description: "Pare-choc avant", quantityX100: 100, expectedAt: new Date(Date.now() - 86_400_000) });
    await updatePartNeed(rec, need.id, { status: "ORDERED" });
    const d = await delays();
    expect(d.insuranceLate.map((w) => w.id)).toContain(wo.id);
    expect(d.lateParts.map((p) => p.id)).toContain(need.id);
    await updatePartNeed(rec, need.id, { status: "RECEIVED" });
    expect((await delays()).lateParts.map((p) => p.id)).not.toContain(need.id);
    await updateInsurance(rec, wo.id, { insurerName: "STAR", insuranceClaimRef: "S-123", insuranceDecision: "APPROVED" });
    expect((await prisma.workOrder.findUnique({ where: { id: wo.id } }))!.insuranceDecidedAt).not.toBeNull();
  });
});

describe("journal d'audit", () => {
  it("lines cannot be changed or deleted, secrets are masked", async () => {
    const admin = await makeUser("ADMIN");
    const { audit } = await import("@/server/audit");
    await audit(prisma, admin, "test.secret", "Test", "x", { after: { password: "hunter2", note: "ok" } });
    const line = await prisma.auditLog.findFirstOrThrow({ where: { action: "test.secret" } });
    expect(line.after).toEqual({ password: "[masqué]", note: "ok" });
    await expect(prisma.auditLog.update({ where: { id: line.id }, data: { action: "x" } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: line.id } })).rejects.toThrow(/append-only/);
  });
});

describe("attestation de travail", () => {
  it("refuses when information is missing, then issues a numbered, archived PDF", async () => {
    const manager = await makeUser("MANAGER");
    const m = await makeUser("MECHANIC", { jobTitle: "Mécanicien", hireDate: new Date("2023-03-01"), nationalId: "01234567" });
    await prisma.setting.update({ where: { id: "garage" }, data: { legalName: null, legalRepName: null, legalRepTitle: null, city: null, address: null } });
    const err = await fail(issueCertificate(manager, m.id, {}));
    expect(err).toBe("certificateMissing");
    await prisma.setting.update({ where: { id: "garage" }, data: { legalName: "SARL Garage Atlas", address: "12 rue de Carthage, Tunis", legalRepName: "Malek B.", legalRepTitle: "Gérant", city: "Tunis", taxId: "1234567/A/M/000" } });
    expect(await fail(issueCertificate(m, m.id, {}))).toBe("forbidden");
    const cert = await issueCertificate(manager, m.id, { purpose: "dossier bancaire" });
    expect(cert.number).toMatch(/^ATT-\d{4}-\d{4}$/);
    const stored = await getCertificate(cert.id);
    expect(stored!.snapshot.employee).toMatchObject({ name: m.name, jobTitle: "Mécanicien", hireDate: "2023-03-01", nationalId: "01234567" });
    const pdf = await certificatePdf(stored!.snapshot);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("portail entreprise", () => {
  it("a company sees only its own vehicles and repairs; viewers see no amounts", async () => {
    const admin = await makeUser("ADMIN");
    const mech = await makeUser("MECHANIC");
    const a = await makeWorkOrder();
    const b = await makeWorkOrder();
    expect(await fail(createCompanyUser(mech, a.customer.id, { email: "x@a.tn", name: "X", role: "VIEWER", password: "Motdepasse1!" }))).toBe("forbidden");
    await createCompanyUser(admin, a.customer.id, { email: "Fleet@A.tn", name: "Flotte A", role: "VIEWER", password: "Motdepasse1!" });
    await createCompanyUser(admin, b.customer.id, { email: "fleet@b.tn", name: "Flotte B", role: "FLEET_ADMIN", password: "Motdepasse2!" });
    expect(await fail(authenticateCompanyUser("fleet@a.tn", "mauvais", "9.9.9.9"))).toBe("companyLogin");
    const ua = await authenticateCompanyUser("fleet@a.tn", "Motdepasse1!", "9.9.9.9");
    const viewerA = { id: ua.id, customerId: ua.customerId, role: ua.role, name: ua.name, email: ua.email };
    expect((await companyOverview(viewerA)).vehicles.map((v) => v.id)).toEqual([a.vehicle.id]);
    expect(await companyWorkOrder(viewerA, b.wo.id)).toBeNull(); // another company's id → nothing
    const own = await companyWorkOrder(viewerA, a.wo.id);
    expect(own?.id).toBe(a.wo.id);
    expect(own && "invoice" in own ? own.invoice : undefined).toBeUndefined(); // VIEWER: no money
    expect((await companyWorkOrders(viewerA)).every((w) => w.vehicle.id === a.vehicle.id)).toBe(true);
    await updateCompanyUser(admin, ua.id, { isActive: false });
    expect(await fail(authenticateCompanyUser("fleet@a.tn", "Motdepasse1!", "9.9.9.9"))).toBe("companyLogin");
  });

  it("login is rate-limited per e-mail", async () => {
    const admin = await makeUser("ADMIN");
    const c = await makeWorkOrder();
    await createCompanyUser(admin, c.customer.id, { email: "brute@c.tn", name: "C", role: "VIEWER", password: "Motdepasse3!" });
    for (let i = 0; i < 8; i++) await fail(authenticateCompanyUser("brute@c.tn", "x", `7.7.7.${i}`));
    expect(await fail(authenticateCompanyUser("brute@c.tn", "Motdepasse3!", "7.7.7.99"))).toBe("tooMany");
  });
});
