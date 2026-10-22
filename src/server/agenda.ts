import "server-only";
import { DELIVERED_STATUSES } from "@/server/workflow";
import { AGREED_LINE } from "@/lib/quote";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  agendaDedupeKey,
  CONFIDENCE_RANK,
  computeForecast,
  DAY_MS,
  DEFAULT_AGENDA_TEMPLATES,
  detectInOrder,
  drivingRhythm,
  forecastSignature,
  garageSignals,
  historyGroup,
  keywordMatches,
  normalizeText,
  packagePriceTtc,
  renderAgendaMessage,
  sameModel,
  STARTER_ITEMS,
  type Confidence,
  type ForecastStatus,
  type MessageLang,
  type OdoReading,
  type Replacement,
} from "@/lib/agenda";
import { displayPlate, formatKm, type Lang } from "@/lib/format";
import { AppError } from "@/lib/http";
import { createId } from "@/lib/id";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit, type AuditActor } from "@/server/audit";
import type { CompanyViewer } from "@/server/company-portal";
import { canSeeMoney } from "@/server/company-portal";
import { isCloudWithHub } from "@/server/hub";
import { deliverPending, queueItems, realSender, type Sender } from "@/server/reminders";
import { getSettings } from "@/server/settings";
import { resolveVehicleQr } from "@/server/vehicle-qr";

/**
 * V12 — agenda des prochaines réparations (server side). Re-uses: delivered work orders and their
 * lines / packages (detection), check-in mileage + real OBD readings (rhythm), the Notification
 * queue of the V7.6 reminders (send, retries, consent, history), packages / parts (quote),
 * warranties, the vehicle QR rules, the company portal rules. Pure maths: src/lib/agenda.ts.
 */

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 24);
/** Deterministic ids: the garage hub and the online copy computing the same thing write the same row. */
export const eventId = (dedupeKey: string) => `me_${sha(dedupeKey)}`;
export const forecastId = (vehicleId: string, itemId: string, version: number) => `fc_${sha(`${vehicleId}|${itemId}|${version}`)}`;
export const starterItemId = (code: string) => `mi_${code.toLowerCase()}`;

const ACTIVE_WORKFLOW: ForecastStatus[] = ["VALIDATED", "SENT", "BOOKED"];
const OPEN_STATUSES: ForecastStatus[] = ["PROPOSED", "VALIDATED", "SENT", "BOOKED"];
const asStrings = (v: Prisma.JsonValue): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export type AgendaItem = Awaited<ReturnType<typeof listItems>>[number];
export const itemName = (item: { nameFr: string; nameAr: string | null; nameEn: string | null }, lang: Lang) =>
  (lang === "ar" ? item.nameAr : lang === "en" ? item.nameEn : null) || item.nameFr;

// ── Catalogue ──────────────────────────────────────────────────────────────

export async function listItems(includeInactive = false) {
  const rows = await prisma.maintenanceItem.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ position: "asc" }, { nameFr: "asc" }] });
  return rows.map((r) => ({ ...r, keywords: asStrings(r.keywords), partIds: asStrings(r.partIds), packageIds: asStrings(r.packageIds) }));
}

/** Creates the starter items that do not exist yet (names + keywords; intervals left EMPTY). */
export async function createStarterCatalogue(actor: StaffUser) {
  const existing = new Set((await prisma.maintenanceItem.findMany({ select: { code: true } })).map((r) => r.code));
  const rows = STARTER_ITEMS.filter((s) => !existing.has(s.code)).map((s, i) => ({
    id: starterItemId(s.code),
    code: s.code,
    nameFr: s.fr,
    nameAr: s.ar,
    nameEn: s.en,
    keywords: s.keywords,
    position: (existing.size + i) * 10,
  }));
  if (rows.length === 0) return 0;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.maintenanceItem.createMany({ data: rows, skipDuplicates: true });
    await audit(tx, actor, "agenda.catalogueStarter", "MaintenanceItem", null, { after: { codes: rows.map((r) => r.code) } });
    return count;
  });
}

export type ItemInput = {
  nameFr: string;
  nameAr?: string | null;
  nameEn?: string | null;
  keywords: string[];
  partIds: string[];
  packageIds: string[];
  intervalKm: number | null;
  intervalMonths: number | null;
  isActive: boolean;
};

export async function saveItem(actor: StaffUser, itemId: string | null, input: ItemInput) {
  const data = {
    nameFr: input.nameFr,
    nameAr: input.nameAr || null,
    nameEn: input.nameEn || null,
    keywords: [...new Set(input.keywords.map(normalizeText).filter(Boolean))],
    partIds: [...new Set(input.partIds)],
    packageIds: [...new Set(input.packageIds)],
    intervalKm: input.intervalKm,
    intervalMonths: input.intervalMonths,
    isActive: input.isActive,
  };
  const id = await prisma.$transaction(async (tx) => {
    if (itemId) {
      const before = await tx.maintenanceItem.findUnique({ where: { id: itemId } });
      if (!before) throw new AppError("notFound", {}, 404);
      await tx.maintenanceItem.update({ where: { id: itemId }, data });
      await audit(tx, actor, "agenda.itemUpdate", "MaintenanceItem", itemId, { before, after: data });
      return itemId;
    }
    const count = await tx.maintenanceItem.count();
    const created = await tx.maintenanceItem.create({ data: { ...data, code: `C-${createId().slice(0, 8).toUpperCase()}`, position: count * 10 }, select: { id: true } });
    await audit(tx, actor, "agenda.itemCreate", "MaintenanceItem", created.id, { after: data });
    return created.id;
  });
  // Catalogue changed → older delivered orders may now match; forecasts recomputed.
  await scanDeliveredOrders();
  await recomputeForecasts(null);
  return id;
}

export type AgendaSettingsInput = { agendaMinCases: number; agendaGoodCases: number; agendaLeadDays: number; agendaAutoSend: boolean; agendaAutoMinConfidence: Confidence; tplAgendaFr: string | null; tplAgendaAr: string | null };

export async function saveAgendaSettings(actor: StaffUser, input: AgendaSettingsInput) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { id: "garage" } });
    await tx.setting.upsert({ where: { id: "garage" }, update: input, create: { id: "garage", ...input } });
    const pick = (s: typeof before) => s && { agendaMinCases: s.agendaMinCases, agendaGoodCases: s.agendaGoodCases, agendaLeadDays: s.agendaLeadDays, agendaAutoSend: s.agendaAutoSend, agendaAutoMinConfidence: s.agendaAutoMinConfidence, tplAgendaFr: s.tplAgendaFr, tplAgendaAr: s.tplAgendaAr };
    await audit(tx, actor, input.agendaAutoSend ? "agenda.settingsAutoSendOn" : "agenda.settings", "Setting", "garage", { before: pick(before), after: input });
  });
  await recomputeForecasts(null);
}

// ── Detection of past replacements ─────────────────────────────────────────

async function itemsForDetection() {
  const items = await listItems();
  const pkgIds = [...new Set(items.flatMap((i) => i.packageIds))];
  const pkgs = pkgIds.length ? await prisma.servicePackage.findMany({ where: { id: { in: pkgIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(pkgs.map((p) => [p.id, p.name]));
  return items.map((i) => ({ ...i, packageNames: i.packageIds.map((id) => names.get(id)).filter((n): n is string => !!n) }));
}

/**
 * Replacements found in DELIVERED work orders (cancelled or open orders are ignored). One event per
 * order and item (dedupeKey): running it again changes nothing, and a detection the garage cancelled
 * is never recreated.
 */
export async function detectForOrders(workOrderIds: string[] | null, items?: Awaited<ReturnType<typeof itemsForDetection>>) {
  const catalogue = items ?? (await itemsForDetection());
  if (catalogue.length === 0) return 0;
  let created = 0;
  let cursor: string | undefined;
  for (;;) {
    const orders = await prisma.workOrder.findMany({
      where: { status: { in: DELIVERED_STATUSES }, ...(workOrderIds ? { id: { in: workOrderIds } } : {}) },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        vehicleId: true,
        mileageIn: true,
        deliveredAt: true,
        updatedAt: true,
        lines: { where: { ...AGREED_LINE }, select: { description: true, partId: true, quantityX100: true, unitPrice: true, taxRateBp: true } },
        events: { where: { type: "PACKAGE_APPLIED" }, select: { data: true } },
      },
    });
    if (orders.length === 0) break;
    cursor = orders.at(-1)!.id;
    const rows = orders.flatMap((o) => {
      const packages = o.events.map((e) => {
        const d = (e.data ?? {}) as { name?: unknown; packageId?: unknown };
        return { id: typeof d.packageId === "string" ? d.packageId : null, name: typeof d.name === "string" ? d.name : "" };
      });
      return detectInOrder(o.lines, packages, catalogue).map((d) => {
        const dedupeKey = `wo:${o.id}:${d.itemId}`;
        return {
          id: eventId(dedupeKey),
          dedupeKey,
          vehicleId: o.vehicleId,
          itemId: d.itemId,
          workOrderId: o.id,
          source: d.source,
          matchedText: d.matchedText.slice(0, 200),
          doneAt: o.deliveredAt ?? o.updatedAt,
          km: o.mileageIn,
          amountTtc: d.amountTtc,
        };
      });
    });
    if (rows.length) created += (await prisma.maintenanceEvent.createMany({ data: rows, skipDuplicates: true })).count;
    if (workOrderIds) break;
  }
  return created;
}

export const scanDeliveredOrders = () => detectForOrders(null);

/** Hook called after a work order is delivered (src/server/work-orders.ts changeStatus). */
export async function afterOrderDelivered(workOrderId: string) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { vehicleId: true } });
  if (!wo) return;
  await detectForOrders([workOrderId]);
  await recomputeForecasts([wo.vehicleId]);
}

/** Hook called after a real mileage reading (OBD) was saved. */
export async function afterReading(vehicleId: string) {
  await recomputeForecasts([vehicleId]);
}

/** The garage declares a replacement done elsewhere / before GaragePro (source MANUAL). */
export async function addManualEvent(actor: StaffUser, vehicleId: string, itemId: string, input: { doneAt: Date; km: number | null }) {
  const id = await prisma.$transaction(async (tx) => {
    const [v, item] = await Promise.all([tx.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } }), tx.maintenanceItem.findUnique({ where: { id: itemId }, select: { id: true } })]);
    if (!v || !item) throw new AppError("notFound", {}, 404);
    const dedupeKey = `manual:${createId()}`;
    const ev = await tx.maintenanceEvent.create({ data: { id: eventId(dedupeKey), dedupeKey, vehicleId, itemId, source: "MANUAL", doneAt: input.doneAt, km: input.km, createdById: actor.id }, select: { id: true } });
    await audit(tx, actor, "agenda.eventAdd", "MaintenanceEvent", ev.id, { after: { vehicleId, itemId, ...input } });
    return ev.id;
  });
  await recomputeForecasts([vehicleId]);
  return id;
}

/**
 * Correct (date / km) or cancel a detection. The detected values stay in doneAt / km; the
 * correction is stored next to them and journaled with before → after.
 */
export async function correctEvent(actor: StaffUser, id: string, input: { doneAt?: Date | null; km?: number | null; cancelReason?: string | null }) {
  const vehicleId = await prisma.$transaction(async (tx) => {
    const ev = await tx.maintenanceEvent.findUnique({ where: { id } });
    if (!ev) throw new AppError("notFound", {}, 404);
    const data: Prisma.MaintenanceEventUpdateInput = { correctedById: actor.id, correctedAt: new Date() };
    if (input.cancelReason) {
      data.cancelledAt = new Date();
      data.cancelReason = input.cancelReason;
    } else {
      if (input.doneAt !== undefined) data.correctedDoneAt = input.doneAt;
      if (input.km !== undefined) data.correctedKm = input.km;
    }
    await tx.maintenanceEvent.update({ where: { id }, data });
    await audit(tx, actor, input.cancelReason ? "agenda.eventCancel" : "agenda.eventCorrect", "MaintenanceEvent", id, {
      before: { doneAt: ev.correctedDoneAt ?? ev.doneAt, km: ev.correctedKm ?? ev.km, cancelledAt: ev.cancelledAt },
      after: { doneAt: input.doneAt, km: input.km, cancelReason: input.cancelReason ?? null },
    });
    return ev.vehicleId;
  });
  await recomputeForecasts([vehicleId]);
}

// ── Recompute (idempotent) ─────────────────────────────────────────────────

type EffEvent = Replacement & { id: string; itemId: string; workOrderId: string | null; amountTtc: number | null };

const effective = (e: { id: string; vehicleId: string; itemId: string; workOrderId: string | null; doneAt: Date; km: number | null; correctedDoneAt: Date | null; correctedKm: number | null; amountTtc: number | null }): EffEvent => ({
  id: e.id,
  vehicleId: e.vehicleId,
  itemId: e.itemId,
  workOrderId: e.workOrderId,
  doneAt: e.correctedDoneAt ?? e.doneAt,
  km: e.correctedKm ?? e.km,
  amountTtc: e.amountTtc,
});

export type RecomputeResult = { created: number; unchanged: number; done: number };

/**
 * Recomputes the forecasts of the given vehicles (null = all). A forecast is never rewritten: when
 * the result differs from the current version, a NEW version is created and the old one keeps its
 * figures (isCurrent = false). Same result = nothing written (idempotent).
 * Workflow kept on a new version of the same cycle (validated / sent / booked / ignored); a new
 * replacement (new cycle) marks the previous validated / sent / booked forecast "done".
 */
export async function recomputeForecasts(vehicleIds: string[] | null, now = new Date(), actor: AuditActor = null): Promise<RecomputeResult> {
  const [settings, items] = await Promise.all([getSettings(), listItems()]);
  const out: RecomputeResult = { created: 0, unchanged: 0, done: 0 };
  if (items.length === 0) return out;
  const targetWhere = vehicleIds ? { id: { in: vehicleIds } } : {};
  const [allVehicles, events, packages] = await Promise.all([
    prisma.vehicle.findMany({ select: { id: true, make: true, model: true, fuel: true, year: true } }),
    prisma.maintenanceEvent.findMany({ where: { cancelledAt: null, itemId: { in: items.map((i) => i.id) } } }),
    prisma.servicePackage.findMany({
      where: { id: { in: [...new Set(items.flatMap((i) => i.packageIds))] }, isActive: true },
      select: { id: true, name: true, lines: { select: { type: true, quantityX100: true, unitPrice: true, part: { select: { salePrice: true } } } } },
    }),
  ]);
  const vehicleById = new Map(allVehicles.map((v) => [v.id, v]));
  const targets = vehicleIds ? allVehicles.filter((v) => vehicleIds.includes(v.id)) : allVehicles;
  if (targets.length === 0) return out;
  const eff = events.map(effective);
  const pkgPrice = new Map(
    packages.map((p) => [p.id, { name: p.name, price: packagePriceTtc(p.lines.map((l) => ({ type: l.type, quantityX100: l.quantityX100, unitPrice: l.unitPrice, partSalePrice: l.part?.salePrice ?? null })), settings.laborRate, settings.defaultTaxBp) }]),
  );

  const [orders, readings, warranties, currents] = await Promise.all([
    prisma.workOrder.findMany({ where: { vehicle: targetWhere, mileageIn: { not: null }, status: { not: "CANCELLED" } }, select: { vehicleId: true, mileageIn: true, createdAt: true } }),
    prisma.vehicleReading.findMany({ where: { vehicle: targetWhere, odometerKm: { not: null } }, select: { vehicleId: true, odometerKm: true, recordedAt: true, source: true } }),
    prisma.warranty.findMany({ where: { vehicle: targetWhere, voidedAt: null, endsAt: { gt: now } }, select: { vehicleId: true, partId: true, label: true, endsAt: true } }),
    prisma.maintenanceForecast.findMany({ where: { vehicle: targetWhere, isCurrent: true } }),
  ]);
  const readingsBy = new Map<string, OdoReading[]>();
  const push = (id: string, r: OdoReading) => readingsBy.set(id, [...(readingsBy.get(id) ?? []), r]);
  for (const o of orders) push(o.vehicleId, { at: o.createdAt, km: o.mileageIn!, source: "ORDER" });
  for (const r of readings) push(r.vehicleId, { at: r.recordedAt, km: r.odometerKm!, source: r.source === "ADAPTER" ? "ADAPTER" : "SIMULATED" });
  const currentBy = new Map(currents.map((c) => [`${c.vehicleId}|${c.itemId}`, c]));

  // Fleet history per item (all vehicles with events for it).
  const fleetBy = new Map<string, { vehicle: (typeof allVehicles)[number]; events: EffEvent[] }[]>();
  for (const item of items) {
    const byVehicle = new Map<string, EffEvent[]>();
    for (const e of eff) if (e.itemId === item.id) byVehicle.set(e.vehicleId, [...(byVehicle.get(e.vehicleId) ?? []), e]);
    fleetBy.set(item.id, [...byVehicle.entries()].filter(([vid]) => vehicleById.has(vid)).map(([vid, evs]) => ({ vehicle: vehicleById.get(vid)!, events: evs })));
  }

  for (const v of targets) {
    const rhythm = drivingRhythm(readingsBy.get(v.id) ?? []);
    for (const item of items) {
      const fleet = fleetBy.get(item.id) ?? [];
      const mine = (fleet.find((f) => f.vehicle.id === v.id)?.events ?? []).sort((a, b) => a.doneAt.getTime() - b.doneAt.getTime());
      const last = mine.at(-1) ?? null;
      const history = historyGroup(v, fleet, settings.agendaMinCases);
      const current = currentBy.get(`${v.id}|${item.id}`) ?? null;
      const hasData = mine.length > 0 || !!item.intervalKm || !!item.intervalMonths || !!history;
      if (!hasData && !current) continue;

      const result = computeForecast({
        now,
        lastDone: last ? { at: last.doneAt, km: last.km, eventId: last.id } : null,
        rhythm,
        history,
        reference: { intervalKm: item.intervalKm, intervalMonths: item.intervalMonths },
        goodCases: settings.agendaGoodCases,
      });

      // Indicative price: the package linked to the item, else the last price invoiced (this car, else same model). Never invented.
      let priceTtc: number | null = null;
      let priceSource: string | null = null;
      let priceRef: Record<string, unknown> | null = null;
      const pkg = item.packageIds.map((id) => pkgPrice.get(id)).find((p) => p && p.price !== null);
      if (pkg) {
        priceTtc = pkg.price;
        priceSource = "PACKAGE";
        priceRef = { package: pkg.name };
      } else {
        const invoiced = [...mine].reverse().find((e) => e.amountTtc !== null) ?? fleet.filter((f) => sameModel(f.vehicle, v)).flatMap((f) => f.events).filter((e) => e.amountTtc !== null).sort((a, b) => b.doneAt.getTime() - a.doneAt.getTime())[0];
        if (invoiced) {
          priceTtc = invoiced.amountTtc;
          priceSource = "LAST_INVOICED";
          priceRef = { eventId: invoiced.id, workOrderId: invoiced.workOrderId, at: invoiced.doneAt };
        }
      }
      // Still under warranty (linked part, or the item's keyword in the warranty label).
      const w = warranties
        .filter((x) => x.vehicleId === v.id && ((x.partId && item.partIds.includes(x.partId)) || item.keywords.some((k) => keywordMatches(x.label, k))))
        .sort((a, b) => b.endsAt!.getTime() - a.endsAt!.getTime())[0];

      const signature = forecastSignature(result, { lastEventId: last?.id ?? null, priceTtc, warrantyUntil: w?.endsAt ?? null, kmPerMonth: rhythm.kmPerMonth });
      if (current && current.signature === signature) {
        out.unchanged++;
        continue;
      }
      const explain = {
        group: history ? { level: history.level, label: history.label, vehicles: history.vehicles, km: history.km, months: history.months } : null,
        reference: { intervalKm: item.intervalKm, intervalMonths: item.intervalMonths },
        interval: result.interval,
        rhythm: { kmPerMonth: rhythm.kmPerMonth, reason: rhythm.reason, readings: rhythm.readings, spanDays: Math.round(rhythm.spanDays), excluded: rhythm.excluded, current: rhythm.current },
        basis: result.basis,
        price: priceRef,
        lastSource: last ? (events.find((e) => e.id === last.id)?.source ?? null) : null,
      };
      const version = (current?.version ?? 0) + 1;
      const newCycle = !!current && current.lastEventId !== (last?.id ?? null) && !!last;
      try {
        await prisma.$transaction(async (tx) => {
          let inherit: Partial<Prisma.MaintenanceForecastUncheckedCreateInput> = {};
          if (current) {
            const { count } = await tx.maintenanceForecast.updateMany({ where: { id: current.id, isCurrent: true }, data: { isCurrent: false } });
            if (count === 0) throw new Error("concurrent");
            if (newCycle && ACTIVE_WORKFLOW.includes(current.status as ForecastStatus)) {
              await tx.maintenanceForecast.update({ where: { id: current.id }, data: { status: "DONE", doneAt: last!.doneAt, doneWorkOrderId: last!.workOrderId } });
              await audit(tx, actor, "agenda.done", "MaintenanceForecast", current.id, { before: { status: current.status }, after: { status: "DONE", workOrderId: last!.workOrderId } });
              out.done++;
            } else if (!newCycle) {
              inherit = { status: current.status, statusReason: current.statusReason, validatedAt: current.validatedAt, validatedById: current.validatedById, sentAt: current.sentAt, bookedAt: current.bookedAt, appointmentId: current.appointmentId };
            }
          }
          await tx.maintenanceForecast.create({
            data: {
              id: forecastId(v.id, item.id, version),
              vehicleId: v.id,
              itemId: item.id,
              version,
              previousId: current?.id ?? null,
              method: result.method,
              cases: result.cases,
              confidence: result.confidence,
              missing: result.missing,
              lastEventId: last?.id ?? null,
              lastDoneAt: last?.doneAt ?? null,
              lastDoneKm: last?.km ?? null,
              kmPerMonth: rhythm.kmPerMonth,
              dueKm: result.dueKm,
              dueKmLow: result.dueKmLow,
              dueKmHigh: result.dueKmHigh,
              dueByKmDate: result.dueByKmDate,
              dueByTimeDate: result.dueByTimeDate,
              dueDate: result.dueDate,
              dueDateLow: result.dueDateLow,
              dueDateHigh: result.dueDateHigh,
              explain: JSON.parse(JSON.stringify(explain)) as Prisma.InputJsonValue,
              priceTtc,
              priceSource,
              warrantyUntil: w?.endsAt ?? null,
              warrantyLabel: w?.label ?? null,
              signature,
              ...inherit,
            },
          });
        });
        out.created++;
      } catch (e) {
        // Another run wrote the same version at the same moment: its result is as good as ours.
        if (e instanceof Error && (e.message === "concurrent" || /Unique constraint|P2002/.test(e.message))) continue;
        throw e;
      }
    }
  }
  return out;
}

// ── Workflow (validate, ignore, send) ──────────────────────────────────────

async function currentOrThrow(tx: Prisma.TransactionClient, id: string) {
  const f = await tx.maintenanceForecast.findUnique({ where: { id } });
  if (!f || !f.isCurrent) throw new AppError("agendaStale", {}, 409);
  return f;
}

export async function validateForecasts(actor: StaffUser, ids: string[]) {
  let n = 0;
  for (const id of ids) {
    await prisma.$transaction(async (tx) => {
      const f = await currentOrThrow(tx, id);
      if (f.method === "IMPOSSIBLE" || !["PROPOSED", "IGNORED"].includes(f.status)) return;
      await tx.maintenanceForecast.update({ where: { id }, data: { status: "VALIDATED", statusReason: null, validatedAt: new Date(), validatedById: actor.id } });
      await audit(tx, actor, "agenda.validate", "MaintenanceForecast", id, { before: { status: f.status }, after: { status: "VALIDATED" } });
      n++;
    });
  }
  return n;
}

export async function ignoreForecasts(actor: StaffUser, ids: string[], reason: string) {
  if (!reason.trim()) throw new AppError("agendaReason", {}, 422);
  let n = 0;
  for (const id of ids) {
    await prisma.$transaction(async (tx) => {
      const f = await currentOrThrow(tx, id);
      if (f.status === "DONE" || f.status === "IGNORED") return;
      await tx.maintenanceForecast.update({ where: { id }, data: { status: "IGNORED", statusReason: reason.trim().slice(0, 300) } });
      await audit(tx, actor, "agenda.ignore", "MaintenanceForecast", id, { before: { status: f.status }, after: { status: "IGNORED", reason } });
      n++;
    });
  }
  return n;
}

type ForecastForMessage = Prisma.MaintenanceForecastGetPayload<{ include: { item: true; vehicle: { select: { id: true; plate: true; customer: { select: { id: true; name: true; phone: true; email: true; reminderOptOut: true } } } } } }>;

function whenText(f: { dueDate: Date | null; dueKm: number | null }, lang: MessageLang, timeZone: string) {
  if (f.dueDate) return new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : "fr-FR", { month: "long", year: "numeric", timeZone, numberingSystem: "latn" }).format(f.dueDate);
  return f.dueKm ? formatKm(f.dueKm, lang) : "";
}

/** Message text (French or Arabic) for one forecast: always says "estimation"; price only when known. */
export function messageFor(f: ForecastForMessage, lang: MessageLang, s: { garageName: string; phone: string | null; timezone: string; tplAgendaFr: string | null; tplAgendaAr: string | null }) {
  const template = (lang === "ar" ? s.tplAgendaAr : s.tplAgendaFr) ?? DEFAULT_AGENDA_TEMPLATES[lang];
  const dt = f.priceTtc ? Math.round(f.priceTtc / 1000) : null;
  const price = dt ? (lang === "ar" ? `، حوالي ${dt} د.ت` : `, environ ${dt} DT`) : "";
  return renderAgendaMessage(template, { garage: s.garageName, item: itemName(f.item, lang), plate: displayPlate(f.vehicle.plate), when: whenText(f, lang, s.timezone), price, phone: s.phone ?? "" });
}

export async function prepareMessages(ids: string[], lang: MessageLang) {
  const s = await getSettings();
  const rows = await prisma.maintenanceForecast.findMany({
    where: { id: { in: ids }, isCurrent: true },
    include: { item: true, vehicle: { select: { id: true, plate: true, customer: { select: { id: true, name: true, phone: true, email: true, reminderOptOut: true } } } } },
  });
  return rows.map((f) => ({ id: f.id, status: f.status, customer: f.vehicle.customer, plate: f.vehicle.plate, body: messageFor(f, lang, s) }));
}

export type SendOutcome = { id: string; result: "SENT" | "NOT_VALIDATED" | "OPT_OUT" | "ALREADY_SENT" | "NO_CHANNEL" };

/**
 * Sends the reminder of VALIDATED forecasts through the existing queue (SMS / e-mail). Rules:
 * - never without the garage's validation (status VALIDATED), except `auto` when the administrator
 *   switched on "envoi automatique" (checked by the caller, src/server/agenda.ts runAgendaDaily);
 * - customer refused reminders → one SKIPPED line in the history, nothing sent;
 * - one reminder per vehicle, item and cycle (dedupeKey + channel unique) → no repetition.
 */
export async function sendForecasts(actor: StaffUser | null, ids: string[], opts: { lang?: MessageLang; sender?: Sender; now?: Date; auto?: boolean } = {}): Promise<SendOutcome[]> {
  const sender = opts.sender ?? realSender;
  const now = opts.now ?? new Date();
  const lang = opts.lang ?? "fr";
  const s = await getSettings();
  const outcomes: SendOutcome[] = [];
  const rows = await prisma.maintenanceForecast.findMany({
    where: { id: { in: ids }, isCurrent: true },
    include: { item: true, vehicle: { select: { id: true, plate: true, customer: { select: { id: true, name: true, phone: true, email: true, reminderOptOut: true } } } } },
  });
  for (const f of rows) {
    const allowed = f.status === "VALIDATED" || (opts.auto && f.status === "PROPOSED");
    if (!allowed || f.method === "IMPOSSIBLE") {
      outcomes.push({ id: f.id, result: "NOT_VALIDATED" });
      continue;
    }
    const dedupeKey = agendaDedupeKey(f.vehicleId, f.itemId, f.lastEventId);
    const c = f.vehicle.customer;
    const body = messageFor(f, lang, s);
    const subject = `${s.garageName} : ${itemName(f.item, "fr")}`;
    if (c.reminderOptOut) {
      await prisma.notification.createMany({
        data: [{ kind: "AGENDA", channel: "NONE", dedupeKey, customerId: c.id, vehicleId: f.vehicleId, forecastId: f.id, subject, body, status: "SKIPPED", error: "Le client refuse les rappels d'entretien" }],
        skipDuplicates: true,
      });
      outcomes.push({ id: f.id, result: "OPT_OUT" });
      continue;
    }
    const before = await prisma.notification.count({ where: { dedupeKey, status: { not: "SKIPPED" } } });
    if (before > 0) {
      outcomes.push({ id: f.id, result: "ALREADY_SENT" });
      continue;
    }
    await queueItems([{ kind: "AGENDA", dedupeKey, phone: c.phone, email: c.email, customerId: c.id, vehicleId: f.vehicleId, forecastId: f.id, subject, body }], sender);
    const queued = await prisma.notification.count({ where: { dedupeKey, status: { not: "SKIPPED" } } });
    if (queued === 0) {
      outcomes.push({ id: f.id, result: "NO_CHANNEL" });
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.maintenanceForecast.update({ where: { id: f.id }, data: { status: "SENT", sentAt: now, ...(opts.auto && f.status === "PROPOSED" ? { statusReason: "Envoi automatique" } : {}) } });
      await audit(tx, actor, opts.auto ? "agenda.autoSend" : "agenda.send", "MaintenanceForecast", f.id, { before: { status: f.status }, after: { status: "SENT", lang } });
    });
    outcomes.push({ id: f.id, result: "SENT" });
  }
  const sentIds = outcomes.filter((o) => o.result === "SENT").map((o) => o.id);
  // With a garage hub, only the hub sends (as for the other reminders): the online copy only queues.
  if (sentIds.length && !isCloudWithHub()) await deliverPending(now, sender, 200, { forecastId: { in: sentIds } });
  return outcomes;
}

/**
 * Daily job (cron route, also called by the hub): detect, recompute, then send what the garage
 * validated and whose due date is within the lead time. Unvalidated forecasts are sent only when
 * the administrator switched on "envoi automatique" (off by default) and the confidence is enough.
 */
export async function runAgendaDaily(now = new Date(), sender: Sender = realSender) {
  if (isCloudWithHub()) return { skipped: "Le hub du garage calcule l'agenda (évite les doublons)." };
  const detected = await scanDeliveredOrders();
  const recomputed = await recomputeForecasts(null, now);
  const s = await getSettings();
  const horizon = new Date(now.getTime() + s.agendaLeadDays * DAY_MS);
  const due = await prisma.maintenanceForecast.findMany({
    where: { isCurrent: true, method: { not: "IMPOSSIBLE" }, dueDate: { lte: horizon }, status: { in: s.agendaAutoSend ? ["VALIDATED", "PROPOSED"] : ["VALIDATED"] } },
    select: { id: true, status: true, confidence: true },
  });
  const validated = due.filter((f) => f.status === "VALIDATED").map((f) => f.id);
  const auto = s.agendaAutoSend ? due.filter((f) => f.status === "PROPOSED" && f.confidence && CONFIDENCE_RANK[f.confidence as Confidence] >= CONFIDENCE_RANK[s.agendaAutoMinConfidence as Confidence]).map((f) => f.id) : [];
  const sent = [...(await sendForecasts(null, validated, { sender, now })), ...(await sendForecasts(null, auto, { sender, now, auto: true }))];
  return { detected, ...recomputed, sent: sent.filter((o) => o.result === "SENT").length };
}

/** Online booking with a vehicle whose items are named in the reason → forecasts "booked". */
export async function linkAppointment(appointment: { id: string; vehicleId: string | null; notes: string | null }) {
  if (!appointment.vehicleId || !appointment.notes) return 0;
  const notes = normalizeText(appointment.notes);
  const open = await prisma.maintenanceForecast.findMany({ where: { vehicleId: appointment.vehicleId, isCurrent: true, status: { in: ["PROPOSED", "VALIDATED", "SENT"] } }, include: { item: true } });
  let n = 0;
  for (const f of open) {
    const names = [f.item.nameFr, f.item.nameAr, f.item.nameEn].filter((x): x is string => !!x).map(normalizeText);
    if (!names.some((x) => x && notes.includes(x))) continue;
    await prisma.$transaction(async (tx) => {
      await tx.maintenanceForecast.update({ where: { id: f.id }, data: { status: "BOOKED", bookedAt: new Date(), appointmentId: appointment.id } });
      await audit(tx, null, "agenda.booked", "MaintenanceForecast", f.id, { before: { status: f.status }, after: { status: "BOOKED", appointmentId: appointment.id } });
    });
    n++;
  }
  return n;
}

// ── Reading (staff) ────────────────────────────────────────────────────────

export type AgendaFilter = {
  from?: Date | null;
  to?: Date | null;
  itemId?: string | null;
  confidence?: Confidence | "IMPOSSIBLE" | null;
  customerId?: string | null;
  companyId?: string | null;
  status?: ForecastStatus | null;
  q?: string | null;
};

export async function listAgenda(filter: AgendaFilter, take = 300) {
  const where: Prisma.MaintenanceForecastWhereInput = { isCurrent: true };
  if (filter.confidence === "IMPOSSIBLE") where.method = "IMPOSSIBLE";
  else if (filter.confidence) where.confidence = filter.confidence;
  else where.method = { not: "IMPOSSIBLE" };
  if (filter.from || filter.to) where.dueDate = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
  if (filter.itemId) where.itemId = filter.itemId;
  if (filter.status) where.status = filter.status;
  else where.status = { in: OPEN_STATUSES };
  const vehicle: Prisma.VehicleWhereInput = {};
  if (filter.customerId) vehicle.customerId = filter.customerId;
  if (filter.companyId) vehicle.customer = { id: filter.companyId, isCompany: true };
  if (filter.q) vehicle.OR = [{ plate: { contains: filter.q.replace(/\s/g, "").toUpperCase() } }, { customer: { name: { contains: filter.q, mode: "insensitive" } } }];
  if (Object.keys(vehicle).length) where.vehicle = vehicle;
  return prisma.maintenanceForecast.findMany({
    where,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { dueKm: "asc" }],
    take,
    include: { item: true, vehicle: { select: { id: true, plate: true, make: true, model: true, mileage: true, customer: { select: { id: true, name: true, isCompany: true, reminderOptOut: true } } } } },
  });
}

export type AgendaRow = Awaited<ReturnType<typeof listAgenda>>[number];

/** Vehicle page: current forecasts (impossible ones included, with what is missing), events and signals. */
export async function vehicleAgenda(vehicleId: string) {
  const [vehicle, forecasts, events, items, settings] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, plate: true, make: true, model: true, year: true, fuel: true, mileage: true, customerId: true, customer: { select: { name: true, reminderOptOut: true } } } }),
    prisma.maintenanceForecast.findMany({ where: { vehicleId, isCurrent: true }, include: { item: true }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }] }),
    prisma.maintenanceEvent.findMany({ where: { vehicleId }, include: { item: true }, orderBy: { doneAt: "desc" }, take: 100 }),
    listItems(),
    getSettings(),
  ]);
  if (!vehicle) return null;
  const signals = (await modelSignals(settings.agendaMinCases)).filter((s) => sameModel(s, vehicle));
  return { vehicle, forecasts, events, items, signals };
}

/** "Garage signals" for every model (events of the catalogue, cancelled ones excluded). */
export async function modelSignals(minCases: number) {
  const rows = await prisma.maintenanceEvent.findMany({ where: { cancelledAt: null }, select: { itemId: true, km: true, correctedKm: true, vehicle: { select: { make: true, model: true } } } });
  const items = new Map((await listItems()).map((i) => [i.id, i]));
  return garageSignals(
    rows.flatMap((r) => {
      const km = r.correctedKm ?? r.km;
      return km !== null && items.has(r.itemId) ? [{ make: r.vehicle.make, model: r.vehicle.model, itemId: r.itemId, km }] : [];
    }),
    minCases,
  ).map((s) => ({ ...s, item: items.get(s.itemId)! }));
}

/** Previous versions of one forecast (history, never rewritten). */
export async function forecastHistory(vehicleId: string, itemId: string) {
  return prisma.maintenanceForecast.findMany({ where: { vehicleId, itemId }, orderBy: { version: "desc" }, take: 20 });
}

/** Work order page: what is due soon on this car (≤ 90 days or ≤ 3 000 km), with a one-click "add to quote". */
export async function suggestionsForOrder(workOrderId: string, now = new Date()) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { vehicleId: true, mileageIn: true, vehicle: { select: { mileage: true } } } });
  if (!wo) return [];
  const km = wo.mileageIn ?? wo.vehicle.mileage;
  const rows = await prisma.maintenanceForecast.findMany({
    where: {
      vehicleId: wo.vehicleId,
      isCurrent: true,
      method: { not: "IMPOSSIBLE" },
      status: { in: OPEN_STATUSES },
      OR: [{ dueDate: { lte: new Date(now.getTime() + 90 * DAY_MS) } }, ...(km !== null ? [{ dueKm: { lte: km + 3000 } }] : [])],
    },
    include: { item: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
  });
  return rows.map((f) => ({ ...f, item: { ...f.item, partIds: asStrings(f.item.partIds), packageIds: asStrings(f.item.packageIds) } }));
}

/** Adds the item to the order's quote: its linked package, else its linked part (the quote is still approved by the customer as usual). */
export async function addForecastToOrder(actor: StaffUser, workOrderId: string, forecastIdValue: string) {
  const f = await prisma.maintenanceForecast.findUnique({ where: { id: forecastIdValue }, include: { item: true } });
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { vehicleId: true } });
  if (!f || !wo || f.vehicleId !== wo.vehicleId) throw new AppError("notFound", {}, 404);
  const { addLine, applyPackage } = await import("@/server/work-orders");
  const packageIds = asStrings(f.item.packageIds);
  const pkg = packageIds.length ? await prisma.servicePackage.findFirst({ where: { id: { in: packageIds }, isActive: true }, select: { id: true } }) : null;
  if (pkg) await applyPackage(workOrderId, pkg.id, actor);
  else {
    const partIds = asStrings(f.item.partIds);
    const part = partIds.length ? await prisma.part.findFirst({ where: { id: { in: partIds }, isActive: true }, select: { id: true } }) : null;
    if (!part) throw new AppError("agendaNoLink", {}, 422);
    await addLine(workOrderId, { type: "PART", partId: part.id, quantityX100: 100 }, actor);
  }
  await prisma.$transaction(async (tx) => {
    await audit(tx, actor, "agenda.addToQuote", "MaintenanceForecast", f.id, { after: { workOrderId, item: f.item.code } });
  });
}

/**
 * Parts to order in advance: parts linked to the items due within `days` (open forecasts), compared
 * with what is available (stock − reserved). A suggestion only: nothing is ordered automatically.
 */
export async function partsToOrder(now = new Date(), days = 30) {
  const due = await prisma.maintenanceForecast.findMany({
    where: { isCurrent: true, method: { not: "IMPOSSIBLE" }, status: { in: OPEN_STATUSES }, dueDate: { lte: new Date(now.getTime() + days * DAY_MS) } },
    select: { item: { select: { partIds: true, packageIds: true } } },
  });
  const needX100 = new Map<string, number>();
  const pkgIds = [...new Set(due.flatMap((d) => asStrings(d.item.packageIds)))];
  const pkgLines = pkgIds.length ? await prisma.packageLine.findMany({ where: { packageId: { in: pkgIds }, partId: { not: null } }, select: { packageId: true, partId: true, quantityX100: true } }) : [];
  for (const d of due) {
    const pk = asStrings(d.item.packageIds).find((id) => pkgLines.some((l) => l.packageId === id));
    if (pk) for (const l of pkgLines.filter((x) => x.packageId === pk)) needX100.set(l.partId!, (needX100.get(l.partId!) ?? 0) + l.quantityX100);
    else {
      const p = asStrings(d.item.partIds)[0];
      if (p) needX100.set(p, (needX100.get(p) ?? 0) + 100);
    }
  }
  if (needX100.size === 0) return [];
  const parts = await prisma.part.findMany({ where: { id: { in: [...needX100.keys()] }, isActive: true }, select: { id: true, sku: true, name: true, unit: true, stockX100: true, reservedX100: true } });
  return parts
    .map((p) => ({ ...p, neededX100: needX100.get(p.id)!, availableX100: p.stockX100 - p.reservedX100 }))
    .filter((p) => p.neededX100 > p.availableX100)
    .sort((a, b) => b.neededX100 - b.availableX100 - (a.neededX100 - a.availableX100));
}

export async function countDueSoon(now = new Date(), days = 30) {
  return prisma.maintenanceForecast.count({ where: { isCurrent: true, method: { not: "IMPOSSIBLE" }, status: { in: ["PROPOSED", "VALIDATED"] }, dueDate: { lte: new Date(now.getTime() + days * DAY_MS) } } });
}

// ── Customer side ──────────────────────────────────────────────────────────

export type ClientForecast = { id: string; item: { nameFr: string; nameAr: string | null; nameEn: string | null }; dueDate: Date | null; dueKm: number | null; confidence: string | null; priceTtc: number | null; warrantyUntil: Date | null };

async function clientForecasts(vehicleId: string, money: boolean): Promise<ClientForecast[]> {
  const rows = await prisma.maintenanceForecast.findMany({
    where: { vehicleId, isCurrent: true, method: { not: "IMPOSSIBLE" }, status: { in: OPEN_STATUSES } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
    take: 12,
    select: { id: true, dueDate: true, dueKm: true, confidence: true, priceTtc: true, warrantyUntil: true, item: { select: { nameFr: true, nameAr: true, nameEn: true } } },
  });
  return rows.map((r) => ({ ...r, priceTtc: money ? r.priceTtc : null }));
}

/** Tracking page of the customer (session on ONE work order): only the vehicle of that order. */
export async function trackingForecasts(workOrderId: string) {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { vehicleId: true } });
  return wo ? clientForecasts(wo.vehicleId, true) : [];
}

/** QR scan (existing access rules): a wrong / revoked token gets nothing. Public card: no amounts. */
export async function qrForecasts(token: string, who: Parameters<typeof resolveVehicleQr>[1]) {
  const scan = await resolveVehicleQr(token, who);
  if (scan.kind !== "public") return null;
  const v = await prisma.vehicle.findUnique({ where: { qrToken: token }, select: { id: true } });
  return v ? clientForecasts(v.id, false) : null;
}

/** Company portal: maintenance plan of the company's OWN fleet; amounts only for the roles that already see them. */
export async function companyAgenda(viewer: CompanyViewer) {
  const money = canSeeMoney(viewer.role);
  const rows = await prisma.maintenanceForecast.findMany({
    where: { isCurrent: true, method: { not: "IMPOSSIBLE" }, status: { in: OPEN_STATUSES }, vehicle: { customerId: viewer.customerId } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
    select: { id: true, dueDate: true, dueKm: true, confidence: true, method: true, cases: true, priceTtc: true, warrantyUntil: true, item: { select: { nameFr: true, nameAr: true, nameEn: true } }, vehicle: { select: { id: true, plate: true, make: true, model: true } } },
  });
  return { money, rows: rows.map((r) => ({ ...r, priceTtc: money ? r.priceTtc : null })) };
}
