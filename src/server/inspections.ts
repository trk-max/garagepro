import "server-only";
import type { InspectionColor, LineType, PartCondition, Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { parseTemplatePoints, pointsFromLines, priorityForColor } from "@/lib/lot5";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { getSettings } from "@/server/settings";
import { addLineTx } from "@/server/work-orders";
import { isFinal } from "@/server/workflow";

/**
 * V16 Lot 5 — inspection rouge / orange / vert. Templates (points) in Paramètres › Inspections; on an order, one
 * inspection per template run: a colour, a note and a photo (an ordinary WorkOrderMedia sent through the existing
 * upload route → putObject, already copied by the hub's media-sync) per point. A red / orange point becomes a
 * PENDING quote line with its priority (SAFETY / RECOMMENDED) through addLine (permission manageQuotes: the
 * mechanic reports, the front desk prices). Shown on the customer portal.
 */

type Tx = Prisma.TransactionClient;

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(onlyActive = false) {
  const rows = await prisma.inspectionTemplate.findMany({ where: onlyActive ? { isActive: true } : {}, orderBy: { name: "asc" } });
  return rows.map((r) => ({ ...r, points: parseTemplatePoints(r.points) }));
}

/** Creates or updates a template: name + one point per line (same label = same key, so past results keep their key). */
export async function saveTemplate(actor: StaffUser, input: { id?: string | null; name: string; pointsText: string; isActive: boolean }) {
  if (!can(actor, "manageInspections")) throw new AppError("forbidden", {}, 403);
  const name = input.name.trim().slice(0, 120);
  const points = pointsFromLines(input.pointsText);
  if (!name || points.length === 0) throw new AppError("inspectionTemplateEmpty", {}, 422);
  return prisma.$transaction(async (tx) => {
    const data = { name, points: points as unknown as Prisma.InputJsonValue, isActive: input.isActive };
    if (input.id) {
      const before = await tx.inspectionTemplate.findUnique({ where: { id: input.id } });
      if (!before) throw new AppError("notFound", {}, 404);
      await tx.inspectionTemplate.update({ where: { id: input.id }, data });
      await audit(tx, actor, "inspection.templateUpdate", "InspectionTemplate", input.id, { before: { name: before.name, points: before.points, isActive: before.isActive }, after: { name, points, isActive: input.isActive } });
      return input.id;
    }
    const t = await tx.inspectionTemplate.create({ data, select: { id: true } });
    await audit(tx, actor, "inspection.templateCreate", "InspectionTemplate", t.id, { after: { name, points, isActive: input.isActive } });
    return t.id;
  });
}

// ── Inspections of an order ──────────────────────────────────────────────────

async function editableOrder(tx: Tx, workOrderId: string) {
  const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { id: true, status: true } });
  if (!wo) throw new AppError("notFound", {}, 404);
  if (isFinal(wo.status)) throw new AppError("final", {}, 409);
  return wo;
}

export async function startInspection(actor: StaffUser, workOrderId: string, templateId: string) {
  if (!can(actor, "performInspection")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    await editableOrder(tx, workOrderId);
    const tpl = await tx.inspectionTemplate.findUnique({ where: { id: templateId } });
    if (!tpl || !tpl.isActive) throw new AppError("notFound", {}, 404);
    const points = parseTemplatePoints(tpl.points);
    if (!points.length) throw new AppError("inspectionTemplateEmpty", {}, 422);
    const insp = await tx.inspection.create({
      data: { workOrderId, templateId: tpl.id, name: tpl.name, createdById: actor.id, results: { create: points.map((p, i) => ({ pointKey: p.key, label: p.label, position: i })) } },
      select: { id: true },
    });
    await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "NOTE", data: { inspection: { id: insp.id, name: tpl.name, started: true } } } });
    await audit(tx, actor, "inspection.start", "Inspection", insp.id, { after: { workOrderId, template: tpl.name, points: points.length } });
    return insp.id;
  });
}

async function loadResult(tx: Tx, resultId: string) {
  const r = await tx.inspectionResult.findUnique({ where: { id: resultId }, include: { inspection: { select: { id: true, workOrderId: true, completedAt: true } } } });
  if (!r) throw new AppError("notFound", {}, 404);
  await editableOrder(tx, r.inspection.workOrderId);
  return r;
}

/** Colour + note of one point (permission performInspection). */
export async function saveResult(actor: StaffUser, resultId: string, input: { color: InspectionColor | null; note?: string | null }) {
  if (!can(actor, "performInspection")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const r = await loadResult(tx, resultId);
    // A point already turned into a quote line keeps its colour (the line is the customer's decision now).
    if (r.lineId && input.color !== r.color) throw new AppError("inspectionLineLocked", {}, 409);
    const note = input.note?.trim().slice(0, 500) || null;
    await tx.inspectionResult.update({ where: { id: resultId }, data: { color: input.color, note, updatedById: actor.id } });
    await audit(tx, actor, "inspection.result", "InspectionResult", resultId, { before: { color: r.color, note: r.note }, after: { color: input.color, note, point: r.label } });
  });
}

/** Ties a photo (uploaded through the order's media route) to a point. The photo must belong to the same order. */
export async function attachResultPhoto(actor: StaffUser, resultId: string, mediaId: string) {
  if (!can(actor, "performInspection")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const r = await loadResult(tx, resultId);
    const media = await tx.workOrderMedia.findUnique({ where: { id: mediaId }, select: { workOrderId: true, kind: true } });
    if (!media || media.workOrderId !== r.inspection.workOrderId || media.kind !== "PHOTO") throw new AppError("invalid", {}, 422);
    await tx.inspectionResult.update({ where: { id: resultId }, data: { mediaId, updatedById: actor.id } });
    await audit(tx, actor, "inspection.photo", "InspectionResult", resultId, { before: { mediaId: r.mediaId }, after: { mediaId, point: r.label } });
  });
}

/** Marks the inspection finished (summary in the history). Every point must have a colour. */
export async function completeInspection(actor: StaffUser, inspectionId: string) {
  if (!can(actor, "performInspection")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const insp = await tx.inspection.findUnique({ where: { id: inspectionId }, include: { results: { select: { color: true } } } });
    if (!insp) throw new AppError("notFound", {}, 404);
    await editableOrder(tx, insp.workOrderId);
    if (insp.results.some((r) => !r.color)) throw new AppError("inspectionIncomplete", {}, 409);
    const count = (c: InspectionColor) => insp.results.filter((r) => r.color === c).length;
    const summary = { red: count("RED"), orange: count("ORANGE"), green: count("GREEN") };
    const { count: done } = await tx.inspection.updateMany({ where: { id: inspectionId, completedAt: null }, data: { completedAt: new Date() } });
    if (done === 0) return summary;
    await tx.workOrderEvent.create({ data: { workOrderId: insp.workOrderId, actorId: actor.id, type: "NOTE", data: { inspection: { id: insp.id, name: insp.name, ...summary } } } });
    await audit(tx, actor, "inspection.complete", "Inspection", insp.id, { after: { workOrderId: insp.workOrderId, ...summary } });
    return summary;
  });
}

export type ConvertInput = { type: LineType; description: string; quantityX100: number; unitPrice?: number; partId?: string; partCondition?: PartCondition | null };

/**
 * Red / orange point → quote line PENDING with its priority (SAFETY / RECOMMENDED), through addLine (same rules:
 * reservation of the part, quality check reset, journal). Permission manageQuotes. One line per point.
 */
export async function convertResultToLine(actor: StaffUser, resultId: string, input: ConvertInput) {
  if (!can(actor, "manageQuotes")) throw new AppError("forbidden", {}, 403);
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const r = await loadResult(tx, resultId);
    const priority = priorityForColor(r.color);
    if (!priority) throw new AppError("inspectionNotRed", {}, 422);
    // Claimed first (conditional): two clicks never create two lines.
    const { count } = await tx.inspectionResult.updateMany({ where: { id: resultId, lineId: null }, data: { updatedById: actor.id } });
    if (count === 0 || r.lineId) throw new AppError("inspectionAlreadyQuoted", {}, 409);
    const line = await addLineTx(tx, r.inspection.workOrderId, { ...input, priority }, actor, settings);
    await tx.inspectionResult.update({ where: { id: resultId }, data: { lineId: line.id } });
    await audit(tx, actor, "inspection.toQuoteLine", "InspectionResult", resultId, { after: { point: r.label, color: r.color, lineId: line.id, priority } });
    return line.id;
  });
}

/** Inspections of an order with their results (staff page). */
export async function inspectionsFor(workOrderId: string) {
  return prisma.inspection.findMany({
    where: { workOrderId },
    orderBy: { createdAt: "desc" },
    include: {
      results: {
        orderBy: { position: "asc" },
        include: { media: { select: { id: true, visibleToCustomer: true } }, line: { select: { id: true, description: true, approvalStatus: true, voidedAt: true } } },
      },
    },
  });
}
export type InspectionsView = Awaited<ReturnType<typeof inspectionsFor>>;

/**
 * Customer portal: the checked points (never the staff-only details), the photo only when it is visible to the
 * customer, « proposé dans le devis » when a line was created.
 */
export async function portalInspections(workOrderId: string) {
  const rows = await prisma.inspection.findMany({
    where: { workOrderId, results: { some: { color: { not: null } } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      completedAt: true,
      createdAt: true,
      results: {
        where: { color: { not: null } },
        orderBy: { position: "asc" },
        select: { id: true, label: true, color: true, note: true, lineId: true, media: { select: { id: true, visibleToCustomer: true } } },
      },
    },
  });
  return rows.map((i) => ({
    ...i,
    results: i.results.map((r) => ({ id: r.id, label: r.label, color: r.color!, note: r.note, quoted: !!r.lineId, mediaId: r.media?.visibleToCustomer ? r.media.id : null })),
  }));
}
