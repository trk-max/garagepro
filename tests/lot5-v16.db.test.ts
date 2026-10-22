/**
 * V16 Lot 5 — quality, follow-up and steering, on a real (throw-away) PostgreSQL:
 * quality check (road-test km, points set in the settings, approval kept when a point is added later), rework cause
 * and counter, comeback (suggestion < 30 days, permissions, rework labour NOT billed by default, dismissal, unlink),
 * red / orange / green inspection (template of migration 29, colour + note + photo, red point → PENDING quote line
 * with priority, portal view), satisfaction survey at D+3 (opt-out, once, rated), low rating alert, refused work
 * reminders 30 / 90 days, labour entry kind / line, steering KPIs on an isolated period.
 * Run: npm run test:db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFeedback, countLowRatings, handleFeedback } from "@/server/claims";
import { comebackView, dismissComeback, linkComeback, unlinkComeback } from "@/server/comebacks";
import { attachResultPhoto, completeInspection, convertResultToLine, inspectionsFor, portalInspections, saveResult, startInspection } from "@/server/inspections";
import { startLabor, stopLabor } from "@/server/labor";
import { addMedia } from "@/server/media";
import { approveQualityCheck, saveQualityCheck } from "@/server/quality";
import { queueRefusedLineReminders, queueSatisfactionSurveys } from "@/server/reminders";
import { getReport } from "@/server/reports";
import { addLine, changeStatus, createWorkOrder } from "@/server/work-orders";
import { agreeAll, makeUser, prisma } from "./helpers/db";

const QC = { roadTest: "DONE" as const, roadTestKm: 7, fluidsOk: true, warningsOk: true, toolsRemoved: true, workVerified: true, billingVerified: true };
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string; message?: string }) => e.code ?? String(e.message ?? e));
type Actor = Awaited<ReturnType<typeof makeUser>>;
const DAY = 86_400_000;
const smsSender = { channels: () => ["SMS" as const], sms: async () => ({ ok: true }), email: async () => ({ ok: true as const, id: "x" }) };
// A real (tiny) JPEG: the server sniffs the bytes.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);

let manager: Actor, rec: Actor, mech: Actor;
beforeAll(async () => {
  await prisma.setting.upsert({
    where: { id: "garage" },
    update: { stampDuty: 1000, qualityPoints: [], autoSatisfactionSurvey: true, autoRefusedLineReminders: true, diagnosticFee: null },
    create: { id: "garage", stampDuty: 1000 },
  });
  [manager, rec, mech] = await Promise.all([makeUser("MANAGER"), makeUser("RECEPTION"), makeUser("MECHANIC")]);
});
afterAll(() => prisma.setting.update({ where: { id: "garage" }, data: { qualityPoints: [], autoSatisfactionSurvey: true, autoRefusedLineReminders: true } }));

let n = 0;
async function newOrder(opts: { vehicleId?: string; customerId?: string; optOut?: boolean } = {}) {
  const customerId = opts.customerId ?? (await prisma.customer.create({ data: { name: `Client L5 ${n++}`, phone: "20111222", reminderOptOut: !!opts.optOut } })).id;
  const wo = await createWorkOrder(
    {
      customerId,
      ...(opts.vehicleId ? { vehicleId: opts.vehicleId } : { newVehicle: { plate: `L5${Date.now()}${n++}`, make: "Renault", model: "Clio" } }),
      complaint: "Bruit",
      priority: "NORMAL",
    },
    rec as never,
  );
  return prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
}

/** New order in QUALITY_CONTROL through the real flow (line, quote, recorded agreement). */
async function inQc() {
  const wo = await newOrder();
  await addLine(wo.id, { type: "LABOR", description: "Plaquettes", quantityX100: 100, unitPrice: 50_000 }, rec as never);
  await changeStatus(wo.id, "QUOTE_SENT", rec as never);
  await agreeAll(wo.id, rec as never);
  await changeStatus(wo.id, "QUALITY_CONTROL", mech as never);
  return wo;
}

/** Test data: mark an order delivered N days ago (the full delivery flow is covered by the Lot 1–4 tests). */
const deliver = (id: string, daysAgo: number) => prisma.workOrder.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: new Date(Date.now() - daysAgo * DAY) } });

describe("Lot 5 — contrôle qualité", () => {
  it("road-test km mandatory when the test is done; points set in the settings must be ticked; a point added later does not undo an approval", async () => {
    const wo = await inQc();
    expect(await code(saveQualityCheck(manager as never, wo.id, { ...QC, roadTestKm: null }))).toBe("roadTestKmRequired");
    await prisma.setting.update({ where: { id: "garage" }, data: { qualityPoints: [{ key: "pneus", label: "Pression des pneus" }] } });
    await saveQualityCheck(manager as never, wo.id, QC);
    expect(await code(approveQualityCheck(manager as never, wo.id))).toBe("qcIncomplete");
    await saveQualityCheck(manager as never, wo.id, { ...QC, extra: { pneus: true } });
    const qc = await prisma.qualityCheck.findUniqueOrThrow({ where: { workOrderId: wo.id } });
    expect(qc.roadTestKm).toBe(7);
    expect(qc.extraPoints).toEqual({ pneus: { label: "Pression des pneus", ok: true } });
    await approveQualityCheck(manager as never, wo.id);
    // A new point in the settings after the approval: the recorded check still holds for « Prêt ».
    await prisma.setting.update({ where: { id: "garage" }, data: { qualityPoints: [{ key: "pneus", label: "Pression des pneus" }, { key: "lave", label: "Lave-glace" }] } });
    await changeStatus(wo.id, "READY", mech as never);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).status).toBe("READY");
    const log = await prisma.auditLog.findFirst({ where: { action: "quality.save", entityId: wo.id }, orderBy: { createdAt: "desc" } });
    expect((log?.after as { roadTestKm?: number }).roadTestKm).toBe(7);
    await prisma.setting.update({ where: { id: "garage" }, data: { qualityPoints: [] } });
  });

  it("an order opened before migration 29 keeps the old check (no km, no extra point)", async () => {
    const wo = await inQc();
    await prisma.$executeRawUnsafe(`UPDATE "WorkOrder" SET "workflowLot5" = false WHERE id = '${wo.id}'`);
    await prisma.setting.update({ where: { id: "garage" }, data: { qualityPoints: [{ key: "pneus", label: "Pression des pneus" }] } });
    await saveQualityCheck(manager as never, wo.id, { ...QC, roadTestKm: null });
    await approveQualityCheck(manager as never, wo.id);
    await changeStatus(wo.id, "READY", mech as never);
    await prisma.setting.update({ where: { id: "garage" }, data: { qualityPoints: [] } });
    // Old order back to the workshop: reason only (Lot 1), no cause required.
    await changeStatus(wo.id, "IN_PROGRESS", manager as never, { reason: "Retouche" });
  });

  it("rework: cause mandatory, counter from the events (1, 2), journalised, never on the portal", async () => {
    const wo = await inQc();
    expect(await code(changeStatus(wo.id, "IN_PROGRESS", mech as never, { reason: "Bruit à l'essai" }))).toBe("reworkCauseRequired");
    await changeStatus(wo.id, "IN_PROGRESS", mech as never, { reason: "Bruit à l'essai", reworkCause: "ROAD_TEST" });
    await changeStatus(wo.id, "QUALITY_CONTROL", mech as never);
    await changeStatus(wo.id, "IN_PROGRESS", mech as never, { reason: "Serrage oublié", reworkCause: "WORKMANSHIP" });
    const evs = await prisma.workOrderEvent.findMany({ where: { workOrderId: wo.id, type: "STATUS_CHANGED" }, orderBy: { createdAt: "asc" } });
    const reworks = evs.map((e) => e.data as { rework?: number; reworkCause?: string }).filter((d) => d.rework);
    expect(reworks).toEqual([expect.objectContaining({ rework: 1, reworkCause: "ROAD_TEST" }), expect.objectContaining({ rework: 2, reworkCause: "WORKMANSHIP" })]);
    expect((await comebackView(wo.id))?.rework).toBe(2);
    const audit = await prisma.auditLog.findFirst({ where: { action: "workOrder.status", entityId: wo.id }, orderBy: { createdAt: "desc" } });
    expect(audit?.after).toMatchObject({ status: "IN_PROGRESS", reworkCause: "WORKMANSHIP", rework: 2 });
  });
});

describe("Lot 5 — retour atelier", () => {
  it("suggested when the vehicle was delivered < 30 days ago; linked by the front desk; rework labour NOT billed by default", async () => {
    const first = await newOrder();
    await deliver(first.id, 10);
    const second = await newOrder({ vehicleId: first.vehicleId, customerId: first.customerId });
    const view = await comebackView(second.id);
    expect(view?.suggestion?.id).toBe(first.id);
    expect(await code(linkComeback(mech as never, second.id, first.id, "SAME_FAULT"))).toBe("forbidden");
    await linkComeback(rec as never, second.id, first.id, "WORKMANSHIP");
    const linked = await prisma.workOrder.findUniqueOrThrow({ where: { id: second.id } });
    expect(linked).toMatchObject({ comebackOfWorkOrderId: first.id, comebackCategory: "WORKMANSHIP", comebackLinkedById: rec.id });
    expect((await comebackView(second.id))?.linked?.id).toBe(first.id);
    // Twice = refused (conditional write), a different vehicle's order = refused.
    expect(await code(linkComeback(rec as never, second.id, first.id, "OTHER"))).toBe("comebackInvalid");

    await addLine(second.id, { type: "LABOR", description: "Reprise montage", quantityX100: 150, unitPrice: 40_000 }, mech as never);
    await addLine(second.id, { type: "PART", description: "Joint", quantityX100: 100, unitPrice: 8_000 }, mech as never);
    expect(await code(addLine(second.id, { type: "LABOR", description: "Facturée ?", quantityX100: 100, unitPrice: 40_000, billRework: true }, mech as never))).toBe("forbidden");
    await addLine(second.id, { type: "LABOR", description: "Travaux en plus (accord)", quantityX100: 100, unitPrice: 40_000, billRework: true }, rec as never);
    const lines = await prisma.workOrderLine.findMany({ where: { workOrderId: second.id }, orderBy: { position: "asc" } });
    expect(lines.map((l) => [l.description, l.unitPrice, l.isRework])).toEqual([
      ["Reprise montage", 0, true],
      ["Joint", 8_000, false],
      ["Travaux en plus (accord)", 40_000, true],
    ]);
    const log = await prisma.auditLog.findFirst({ where: { action: "workOrder.comebackLink", entityId: second.id } });
    expect(log?.after).toMatchObject({ comebackOfWorkOrderId: first.id, category: "WORKMANSHIP" });

    // Unlink: reason mandatory; lines already added keep their price.
    expect(await code(unlinkComeback(rec as never, second.id, ""))).toBe("reasonRequired");
    await unlinkComeback(rec as never, second.id, "Erreur de véhicule");
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: second.id } })).comebackOfWorkOrderId).toBeNull();
  });

  it("« ce n'est pas un retour » hides the suggestion; older than 30 days = no suggestion; old orders never suggested", async () => {
    const first = await newOrder();
    await deliver(first.id, 5);
    const second = await newOrder({ vehicleId: first.vehicleId, customerId: first.customerId });
    await dismissComeback(rec as never, second.id, first.id);
    expect((await comebackView(second.id))?.suggestion).toBeNull();

    const old = await newOrder();
    await deliver(old.id, 45);
    const later = await newOrder({ vehicleId: old.vehicleId, customerId: old.customerId });
    expect((await comebackView(later.id))?.suggestion).toBeNull();
  });
});

describe("Lot 5 — inspection rouge / orange / vert", () => {
  it("template of migration 29 → colours, note, photo; red point → PENDING quote line SAFETY (front desk), shown on the portal", async () => {
    const wo = await newOrder();
    const tpl = await prisma.inspectionTemplate.findUniqueOrThrow({ where: { id: "inspection-standard" } });
    expect((tpl.points as unknown[]).length).toBe(15);
    const inspId = await startInspection(mech as never, wo.id, tpl.id);
    const results = await prisma.inspectionResult.findMany({ where: { inspectionId: inspId }, orderBy: { position: "asc" } });
    expect(results).toHaveLength(15);
    const [front, rear, ...rest] = results;
    await saveResult(mech as never, front!.id, { color: "RED", note: "Plaquettes à 2 mm" });
    await saveResult(mech as never, rear!.id, { color: "GREEN", note: null });
    const media = await addMedia(wo.id, { bytes: JPEG, caption: "Plaquettes", visibleToCustomer: true }, mech as never);
    await attachResultPhoto(mech as never, front!.id, media.id);

    // Not complete while a point has no colour.
    expect(await code(completeInspection(mech as never, inspId))).toBe("inspectionIncomplete");

    // The mechanic reports, the front desk prices.
    const input = { type: "LABOR" as const, description: "Remplacement plaquettes AV", quantityX100: 100, unitPrice: 45_000 };
    expect(await code(convertResultToLine(mech as never, front!.id, input))).toBe("forbidden");
    expect(await code(convertResultToLine(rec as never, rear!.id, input))).toBe("inspectionNotRed");
    const lineId = await convertResultToLine(rec as never, front!.id, input);
    expect(await code(convertResultToLine(rec as never, front!.id, input))).toBe("inspectionAlreadyQuoted");
    const line = await prisma.workOrderLine.findUniqueOrThrow({ where: { id: lineId } });
    expect(line).toMatchObject({ approvalStatus: "PENDING", priority: "SAFETY", unitPrice: 45_000, workOrderId: wo.id });
    expect(await code(saveResult(mech as never, front!.id, { color: "GREEN" }))).toBe("inspectionLineLocked");

    for (const r of rest) await saveResult(mech as never, r.id, { color: "GREEN" });
    expect(await completeInspection(mech as never, inspId)).toEqual({ red: 1, orange: 0, green: 14 });

    // Sent in the quote like any other pending line.
    await changeStatus(wo.id, "QUOTE_SENT", rec as never);
    expect((await prisma.workOrderLine.findUniqueOrThrow({ where: { id: lineId } })).quoteId).not.toBeNull();

    const portal = await portalInspections(wo.id);
    expect(portal[0]!.results).toHaveLength(15);
    expect(portal[0]!.results[0]).toEqual({ id: front!.id, label: front!.label, color: "RED", note: "Plaquettes à 2 mm", quoted: true, mediaId: media.id });
    // Photo hidden from the customer → not on the portal.
    await prisma.workOrderMedia.update({ where: { id: media.id }, data: { visibleToCustomer: false } });
    expect((await portalInspections(wo.id))[0]!.results[0]!.mediaId).toBeNull();
    expect((await inspectionsFor(wo.id))[0]!.results[0]!.line?.id).toBe(lineId);
    expect(await prisma.auditLog.count({ where: { action: "inspection.toQuoteLine", entityId: front!.id } })).toBe(1);
  });
});

describe("Lot 5 — suivi client", () => {
  it("satisfaction survey at D+3 after the delivery: queued once, never to an opted-out customer, not when already rated, setting respected", async () => {
    const wo = await newOrder();
    const opted = await newOrder({ optOut: true });
    const rated = await newOrder();
    const recent = await newOrder();
    await Promise.all([deliver(wo.id, 4), deliver(opted.id, 4), deliver(rated.id, 4), deliver(recent.id, 1)]);
    await createFeedback({ rating: 5 }, { ip: "10.0.0.9", workOrderId: rated.id });

    await prisma.setting.update({ where: { id: "garage" }, data: { autoSatisfactionSurvey: false } });
    await queueSatisfactionSurveys(new Date(), smsSender);
    expect(await prisma.notification.count({ where: { dedupeKey: `survey:${wo.id}` } })).toBe(0);
    await prisma.setting.update({ where: { id: "garage" }, data: { autoSatisfactionSurvey: true } });

    await queueSatisfactionSurveys(new Date(), smsSender);
    await queueSatisfactionSurveys(new Date(), smsSender);
    const rows = await prisma.notification.findMany({ where: { dedupeKey: { in: [`survey:${wo.id}`, `survey:${opted.id}`, `survey:${rated.id}`, `survey:${recent.id}`] } } });
    expect(rows.map((r) => r.dedupeKey)).toEqual([`survey:${wo.id}`]);
    expect(rows[0]).toMatchObject({ kind: "SURVEY", channel: "SMS", status: "PENDING" });
    expect(rows[0]!.body).toContain("/suivi");
    expect(await prisma.auditLog.count({ where: { action: "workOrder.survey", entityId: wo.id } })).toBe(1);

    // Old orders (before migration 29): never a survey.
    const old = await newOrder();
    await deliver(old.id, 4);
    await prisma.$executeRawUnsafe(`UPDATE "WorkOrder" SET "workflowLot5" = false WHERE id = '${old.id}'`);
    await queueSatisfactionSurveys(new Date(), smsSender);
    expect(await prisma.notification.count({ where: { dedupeKey: `survey:${old.id}` } })).toBe(0);
  });

  it("a rating of 3 or less is an internal alert until followed up (journalised)", async () => {
    const wo = await newOrder();
    await deliver(wo.id, 3);
    const before = await countLowRatings();
    const fb = await createFeedback({ rating: 2, comment: "Toujours le bruit" }, { ip: "10.0.0.8", workOrderId: wo.id });
    expect(await countLowRatings()).toBe(before + 1);
    expect(await prisma.workOrderEvent.count({ where: { workOrderId: wo.id, type: "NOTE", data: { path: ["lowRating"], equals: 2 } } })).toBe(1);
    expect(await code(handleFeedback(mech as never, fb.id, "Rappelé"))).toBe("forbidden");
    await handleFeedback(rec as never, fb.id, "Client rappelé, RDV pris");
    expect(await countLowRatings()).toBe(before);
    expect(await prisma.auditLog.count({ where: { action: "feedback.handled", entityId: fb.id } })).toBe(1);
  });

  it("refused work reminded 30 days after the delivery (opt-out respected, not when the car came back), once per level", async () => {
    const mk = async (optOut = false) => {
      const wo = await newOrder({ optOut });
      await addLine(wo.id, { type: "LABOR", description: "Vidange", quantityX100: 100, unitPrice: 40_000 }, rec as never);
      await addLine(wo.id, { type: "LABOR", description: "Amortisseurs AR", quantityX100: 100, unitPrice: 90_000, priority: "SAFETY" }, rec as never);
      await changeStatus(wo.id, "QUOTE_SENT", rec as never);
      const lines = await prisma.workOrderLine.findMany({ where: { workOrderId: wo.id }, orderBy: { position: "asc" } });
      const { recordStaffDecision } = await import("@/server/quotes");
      await recordStaffDecision(wo.id, { approvedLineIds: [lines[0]!.id], refusedLineIds: [lines[1]!.id], approverName: "Client", channel: "PHONE" } as never, rec as never);
      await deliver(wo.id, 35);
      return wo;
    };
    const a = await mk();
    const b = await mk(true);
    const c = await mk();
    await newOrder({ vehicleId: c.vehicleId, customerId: c.customerId }); // came back since
    await queueRefusedLineReminders(new Date(), smsSender);
    await queueRefusedLineReminders(new Date(), smsSender);
    const rows = await prisma.notification.findMany({ where: { workOrderId: { in: [a.id, b.id, c.id] }, kind: "REFUSED_LINES" } });
    expect(rows.map((r) => r.dedupeKey)).toEqual([`refused-remind:${a.id}:30`]);
    expect(rows[0]!.body).toContain("Amortisseurs AR");
    expect(rows[0]!.body).not.toContain("Vidange");
  });
});

describe("Lot 5 — pointage et KPI", () => {
  it("labour entry: kind and line (optional); a line of another order is refused", async () => {
    const wo = await newOrder();
    const other = await newOrder();
    await addLine(wo.id, { type: "LABOR", description: "Diag", quantityX100: 100, unitPrice: 30_000 }, rec as never);
    await addLine(other.id, { type: "LABOR", description: "Autre", quantityX100: 100, unitPrice: 30_000 }, rec as never);
    const line = await prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: wo.id } });
    const otherLine = await prisma.workOrderLine.findFirstOrThrow({ where: { workOrderId: other.id } });
    const tech = mech;
    expect(await code(startLabor(tech as never, wo.id, tech.id, new Date(), { kind: "DIAGNOSIS", workOrderLineId: otherLine.id }))).toBe("invalid");
    const e = await startLabor(tech as never, wo.id, tech.id, new Date(), { kind: "DIAGNOSIS", workOrderLineId: line.id });
    await stopLabor(tech as never, e.id);
    expect(await prisma.laborEntry.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ kind: "DIAGNOSIS", workOrderLineId: line.id });
    const plain = await startLabor(tech as never, wo.id);
    expect(await prisma.laborEntry.findUniqueOrThrow({ where: { id: plain.id } })).toMatchObject({ kind: null, workOrderLineId: null });
    await stopLabor(tech as never, plain.id);
  });

  it("KPIs of an isolated period (May 2020, orders cancelled so that the current dashboards are not disturbed): line approval, ARO, comeback rate, efficiency, no-show — real data only", async () => {
    const now = new Date("2020-05-20T12:00:00Z");
    const at = (d: string) => new Date(`2020-05-${d}T10:00:00Z`);
    const tech = mech;
    const mk = async (createdAt: Date, comebackOf?: string) => {
      const wo = await newOrder();
      return prisma.workOrder.update({ where: { id: wo.id }, data: { createdAt, status: "CANCELLED", mechanicId: tech.id, ...(comebackOf ? { comebackOfWorkOrderId: comebackOf, comebackCategory: "SAME_FAULT" } : {}) } });
    };
    const w1 = await mk(at("02"));
    const w2 = await mk(at("05"), w1.id);
    await mk(at("06"));
    await mk(at("07"));
    // Quote sent in the period: 3 decided lines (2 accepted), 1 announced fee (never counted).
    const q = await prisma.quote.create({ data: { workOrderId: w1.id, number: `D2020-${n++}`, version: 1, snapshot: {}, snapshotHash: "x", sentAt: at("03") } });
    await prisma.workOrderLine.createMany({
      data: [
        { workOrderId: w1.id, type: "LABOR", description: "A", quantityX100: 100, unitPrice: 30_000, approvalStatus: "APPROVED", quoteId: q.id },
        { workOrderId: w1.id, type: "LABOR", description: "B", quantityX100: 100, unitPrice: 10_000, approvalStatus: "APPROVED", quoteId: q.id },
        { workOrderId: w1.id, type: "PART", description: "C", quantityX100: 100, unitPrice: 60_000, approvalStatus: "REFUSED", quoteId: q.id },
        { workOrderId: w1.id, type: "LABOR", description: "Frais", quantityX100: 100, unitPrice: 20_000, approvalStatus: "APPROVED", quoteId: q.id, isAnnouncedFee: true },
      ],
    });
    // Invoiced in the period: 7 h of priced labour sold on w1 (A, B, the announced fee, 4 h), 5 h clocked.
    await prisma.invoice.create({ data: { number: `F2020-${n++}`, workOrderId: w1.id, customerId: w1.customerId, issuedAt: at("10"), totalHt: 120_000, totalTax: 22_800, stampDuty: 1000, totalTtc: 143_800, snapshot: {} } });
    await prisma.workOrderLine.create({ data: { workOrderId: w1.id, type: "LABOR", description: "MO", quantityX100: 400, unitPrice: 30_000, approvalStatus: "APPROVED" } });
    await prisma.laborEntry.create({ data: { workOrderId: w1.id, userId: tech.id, startedAt: at("08"), endedAt: new Date(at("08").getTime() + 5 * 3_600_000) } });
    // Appointments: 4 kept on the agenda, 1 no-show; 1 cancelled (not in the base).
    const service = await prisma.bookableService.findFirst() ?? (await prisma.bookableService.create({ data: { name: "Diag", durationMin: 30 } }));
    for (const [d, s] of [["11", "CHECKED_IN"], ["12", "CHECKED_IN"], ["13", "NO_SHOW"], ["14", "CONFIRMED"], ["15", "CANCELLED"]] as const) {
      await prisma.appointment.create({ data: { reference: `RDV-${n++}${Date.now()}`, serviceId: service.id, startAt: at(d), endAt: at(d), status: s, firstName: "A", lastName: "B", phone: "20111222", plate: "X" } });
    }
    const r = await getReport("month", now);
    expect(r.kpis?.lineApproval).toEqual({ rate: 66.7, decided: 3, approved: 2, amountRate: 40 });
    expect(r.kpis?.aro).toBe(120_000);
    expect(r.kpis?.comeback).toEqual({ rate: 25, count: 1, opened: 4 });
    expect(r.cars.comebacks).toBe(1);
    expect(r.kpis?.efficiency.technicians).toEqual([{ userId: tech.id, name: tech.name, clocked: 5, sold: 7, efficiency: 140 }]);
    expect(r.kpis?.noShow).toEqual({ rate: 25, count: 1, base: 4 });
    void w2;
  });
});
