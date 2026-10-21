import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, Role } from "@prisma/client";
import { utcToZoned } from "@/lib/booking";
import { readContractData, type ContractDataJson, type ContractSnapshot, type GarageSnap, type PartySnap, type RepairSnap, type VehicleSnap } from "@/lib/contract-document";
import { templateRows, type LegalRef } from "@/lib/contract-templates";
import {
  accessForMove,
  canContract,
  checkMove,
  cleanData,
  computeDates,
  contractCategoriesFor,
  contractFlags,
  contractNumber,
  employmentErrors,
  expiryOf,
  isContractStatus,
  isEditable,
  MAX_SCAN_BYTES,
  missingFields,
  sniffScan,
  withDefaults,
  type ContractCategory,
  type ContractStatus,
  type TemplateClause,
  type TemplateField,
} from "@/lib/contracts";
import { dayToDbDate, dbDay } from "@/lib/expense-schedule";
import { computeTotals, GARAGE_TZ, lineTotalHt } from "@/lib/format";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit, type AuditActor } from "@/server/audit";
import { assertCanNumberDocuments } from "@/server/hub";
import { getSettings } from "@/server/settings";
import { putObject, readObject } from "@/server/storage";

/**
 * Contracts (V9.0, Prompt 5/5). Every function checks the category access AGAIN on the server
 * (src/lib/contracts.ts CONTRACT_ACCESS): employment contracts = administrator + HR only.
 * Every change writes a ContractEvent (history, before / after) and an audit line in the SAME
 * transaction. No electronic signature, no automatic renewal, never "compliant".
 */

type Db = Prisma.TransactionClient;

const todayIn = (tz: string, now = new Date()) => utcToZoned(now, tz).date;

function assertAccess(actor: StaffUser, category: string, access: "view" | "manage" | "approve") {
  if (!canContract(actor.role, category, access)) throw new AppError("forbidden", {}, 403);
}

// ── Templates ────────────────────────────────────────────────────────────────

/** Copies the catalogue into the database (missing rows only: a recorded review is never overwritten). */
export async function ensureTemplates(db: Db | typeof prisma = prisma) {
  await db.contractTemplate.createMany({ data: templateRows() as unknown as Prisma.ContractTemplateCreateManyInput[], skipDuplicates: true });
}

export type TemplateRow = {
  id: string;
  code: string;
  category: ContractCategory;
  subtype: string | null;
  title: string;
  version: number;
  jurisdiction: string;
  legalRefs: LegalRef[];
  unverified: string[];
  verifiedDay: string;
  reviewStatus: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  fields: TemplateField[];
  clauses: TemplateClause[];
  active: boolean;
};

function toTemplate(t: Prisma.ContractTemplateGetPayload<object>): TemplateRow {
  return {
    id: t.id,
    code: t.code,
    category: t.category as ContractCategory,
    subtype: t.subtype,
    title: t.title,
    version: t.version,
    jurisdiction: t.jurisdiction,
    legalRefs: (t.legalRefs as unknown as LegalRef[]) ?? [],
    unverified: (t.unverified as unknown as string[]) ?? [],
    verifiedDay: dbDay(t.verifiedAt),
    reviewStatus: t.reviewStatus,
    reviewedById: t.reviewedById,
    reviewedAt: t.reviewedAt,
    reviewNote: t.reviewNote,
    fields: (t.fields as unknown as TemplateField[]) ?? [],
    clauses: (t.clauses as unknown as TemplateClause[]) ?? [],
    active: t.active,
  };
}

/** Templates of the categories the actor may create (latest active version of each code). */
export async function listTemplates(actor: StaffUser, opts: { category?: string } = {}) {
  await ensureTemplates();
  const cats = contractCategoriesFor(actor.role, "manage").filter((c) => !opts.category || c === opts.category);
  const rows = await prisma.contractTemplate.findMany({ where: { category: { in: cats }, active: true }, orderBy: [{ category: "asc" }, { code: "asc" }, { version: "desc" }] });
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.code) && seen.add(r.code)).map(toTemplate);
}

/** All template versions with their review state (administrator page). */
export async function listAllTemplates(actor: StaffUser) {
  if (!can(actor.role, "reviewContractTemplates")) throw new AppError("forbidden", {}, 403);
  await ensureTemplates();
  const rows = await prisma.contractTemplate.findMany({ orderBy: [{ category: "asc" }, { code: "asc" }, { version: "desc" }] });
  const reviewers = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.reviewedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  return rows.map((r) => ({ ...toTemplate(r), reviewedBy: reviewers.find((u) => u.id === r.reviewedById)?.name ?? null }));
}

export async function getTemplate(actor: StaffUser, id: string) {
  await ensureTemplates();
  const t = await prisma.contractTemplate.findUnique({ where: { id } });
  if (!t) return null;
  if (!canContract(actor.role, t.category, "manage") && !can(actor.role, "reviewContractTemplates")) throw new AppError("forbidden", {}, 403);
  return toTemplate(t);
}

/**
 * An administrator records that a lawyer reviewed THIS template version (who / when / note).
 * `reviewed: false` puts it back to "to be validated by a lawyer". Never automatic.
 */
export async function setTemplateReview(actor: StaffUser, id: string, reviewed: boolean, note: string | null) {
  if (!can(actor.role, "reviewContractTemplates")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const before = await tx.contractTemplate.findUnique({ where: { id }, select: { reviewStatus: true, reviewedById: true, reviewedAt: true, reviewNote: true, code: true, version: true } });
    if (!before) throw new AppError("notFound", {}, 404);
    const data = reviewed
      ? { reviewStatus: "REVIEWED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note }
      : { reviewStatus: "NEEDS_LEGAL_REVIEW", reviewedById: null, reviewedAt: null, reviewNote: note };
    await tx.contractTemplate.update({ where: { id }, data });
    await audit(tx, actor, reviewed ? "contractTemplate.review" : "contractTemplate.unreview", "ContractTemplate", id, { before, after: data });
  });
}

// ── Snapshots of the parties ─────────────────────────────────────────────────

async function garageSnap(db: Db): Promise<GarageSnap & { timezone: string }> {
  const s = await db.setting.findUnique({ where: { id: "garage" } });
  return {
    name: s?.garageName ?? "Garage",
    legalName: s?.legalName ?? null,
    address: s?.legalAddress || s?.address || null,
    city: s?.city ?? null,
    phone: s?.phone ?? null,
    email: s?.email ?? null,
    taxId: s?.taxId ?? null,
    registry: s?.registryNumber ? `RNE ${s.registryNumber}${s.registryCity ? ` (${s.registryCity})` : ""}` : null,
    repName: s?.legalRepName ?? null,
    repTitle: s?.legalRepTitle ?? null,
    timezone: s?.timezone || GARAGE_TZ,
  };
}

const vehicleSnap = (v: { plate: string; make: string; model: string; vin: string | null; year: number | null; mileage: number | null }): VehicleSnap => ({
  plate: v.plate,
  make: v.make,
  model: v.model,
  vin: v.vin,
  year: v.year,
  mileage: v.mileage,
});

const vehicleSelect = { id: true, plate: true, make: true, model: true, vin: true, year: true, mileage: true, customerId: true } as const;

/** Repair section from the work order: lines TTC, totals, quote approval, invoice and payments, warranties. */
async function repairSnap(db: Db, workOrderId: string, tz: string) {
  const wo = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      number: true,
      complaint: true,
      diagnosis: true,
      mileageIn: true,
      promisedAt: true,
      quoteApprovedAt: true,
      customerId: true,
      vehicleId: true,
      customer: { select: { id: true, name: true, phone: true, email: true, address: true, taxId: true, isCompany: true } },
      vehicle: { select: vehicleSelect },
      lines: { orderBy: { position: "asc" }, select: { type: true, description: true, quantityX100: true, unitPrice: true, taxRateBp: true } },
      invoice: { select: { number: true, totalHt: true, totalTax: true, stampDuty: true, totalTtc: true, paidAmount: true, status: true } },
      warranties: { where: { voidedAt: null }, select: { label: true, endsAt: true, endKm: true } },
    },
  });
  if (!wo) throw new AppError("contractParty", {}, 422);
  const settings = await db.setting.findUnique({ where: { id: "garage" }, select: { stampDuty: true, warrantyMonths: true, warrantyKm: true } });
  const totals = computeTotals(wo.lines, settings?.stampDuty ?? 0);
  const ttcOf = (ht: number, bp: number) => Math.round((ht * (10_000 + bp)) / 10_000);
  const lines = wo.lines.map((l) => ({
    type: l.type,
    description: l.description,
    quantityX100: l.quantityX100,
    unitTtc: ttcOf(l.unitPrice, l.taxRateBp),
    totalTtc: ttcOf(lineTotalHt(l), l.taxRateBp),
    taxRateBp: l.taxRateBp,
  }));
  const day = (d: Date | null) => (d ? utcToZoned(d, tz).date : null);
  const repair: RepairSnap = {
    workOrderNumber: wo.number,
    complaint: wo.complaint,
    diagnosis: wo.diagnosis,
    mileageIn: wo.mileageIn,
    lines,
    // The invoice, once issued, is the reference (frozen amounts).
    totals: wo.invoice ? { ht: wo.invoice.totalHt, tax: wo.invoice.totalTax, stamp: wo.invoice.stampDuty, ttc: wo.invoice.totalTtc } : { ht: totals.totalHt, tax: totals.totalTax, stamp: totals.stampDuty, ttc: totals.totalTtc },
    discountTtc: lines.filter((l) => l.totalTtc < 0).reduce((s, l) => s + l.totalTtc, 0),
    quoteApprovedAt: day(wo.quoteApprovedAt),
    promisedAt: day(wo.promisedAt),
    invoice: wo.invoice ? { number: wo.invoice.number, totalTtc: wo.invoice.totalTtc, paid: wo.invoice.paidAmount, status: wo.invoice.status } : null,
    warranties: wo.warranties.map((w) => ({ label: w.label, endDay: day(w.endsAt), endKm: w.endKm })),
  };
  // Pre-filled fields: only what is really recorded (nothing invented).
  const prefill: Record<string, string> = {};
  if (repair.promisedAt) prefill.expectedDate = repair.promisedAt;
  if (repair.warranties.length) {
    prefill.warrantyTerms = repair.warranties
      .map((w) => `Garantie « ${w.label} »${w.endDay ? ` jusqu'au ${w.endDay.split("-").reverse().join("/")}` : ""}${w.endKm ? `${w.endDay ? " ou" : ""} jusqu'à ${w.endKm} km` : ""}.`)
      .join(" ");
  } else if (settings && (settings.warrantyMonths > 0 || settings.warrantyKm > 0)) {
    prefill.warrantyTerms = `Les réparations sont garanties ${[settings.warrantyMonths > 0 ? `${settings.warrantyMonths} mois` : null, settings.warrantyKm > 0 ? `${settings.warrantyKm} km` : null].filter(Boolean).join(" ou ")} à compter de la remise du véhicule (la première limite atteinte).`;
  }
  if (repair.invoice && repair.invoice.paid > 0) prefill.deposit = (repair.invoice.paid / 1000).toFixed(3);
  const party: PartySnap = { kind: "CUSTOMER", name: wo.customer.name, address: wo.customer.address, phone: wo.customer.phone, email: wo.customer.email, taxId: wo.customer.taxId, isCompany: wo.customer.isCompany };
  return { wo, repair, prefill, party, vehicle: vehicleSnap(wo.vehicle) };
}

type Parties = {
  customerId: string | null;
  workOrderId: string | null;
  userId: string | null;
  supplierId: string | null;
  vehicleIds: string[];
  snapshot: ContractSnapshot;
  prefill: Record<string, string>;
};

/** Resolves and checks the parties required by the category, and photographs them. */
async function resolveParties(
  tx: Db,
  category: ContractCategory,
  input: { workOrderId?: string | null; customerId?: string | null; vehicleIds?: string[]; userId?: string | null; supplierId?: string | null },
  now: Date,
): Promise<Parties> {
  const garage = await garageSnap(tx);
  const { timezone, ...g } = garage;
  const base = { customerId: null, workOrderId: null, userId: null, supplierId: null, vehicleIds: [] as string[], prefill: {} as Record<string, string> };
  const snap = (party: PartySnap | null, vehicles: VehicleSnap[], repair?: RepairSnap): ContractSnapshot => ({ garage: g, party, vehicles, repair: repair ?? null, takenAt: now.toISOString() });

  if (category === "REPAIR") {
    if (!input.workOrderId) throw new AppError("contractParty", {}, 422);
    const r = await repairSnap(tx, input.workOrderId, timezone);
    return { ...base, customerId: r.wo.customerId, workOrderId: r.wo.id, vehicleIds: [r.wo.vehicleId], prefill: r.prefill, snapshot: snap(r.party, [r.vehicle], r.repair) };
  }
  if (category === "FLEET") {
    if (!input.customerId) throw new AppError("contractParty", {}, 422);
    const c = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true, name: true, phone: true, email: true, address: true, taxId: true, isCompany: true } });
    const ids = [...new Set(input.vehicleIds ?? [])];
    if (!c || !c.isCompany || ids.length === 0) throw new AppError("contractFleetCompany", {}, 422);
    const vehicles = await tx.vehicle.findMany({ where: { id: { in: ids } }, select: vehicleSelect, orderBy: { plate: "asc" } });
    if (vehicles.length !== ids.length || vehicles.some((v) => v.customerId !== c.id)) throw new AppError("contractFleetCompany", {}, 422);
    return { ...base, customerId: c.id, vehicleIds: ids, snapshot: snap({ kind: "CUSTOMER", ...c }, vehicles.map(vehicleSnap)) };
  }
  if (category === "EMPLOYMENT") {
    if (!input.userId) return { ...base, snapshot: snap(null, []) };
    const u = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, phone: true, email: true, nationalId: true, jobTitle: true } });
    if (!u) throw new AppError("contractParty", {}, 422);
    const prefill: Record<string, string> = { employeeName: u.name };
    if (u.nationalId) prefill.nationalId = u.nationalId;
    if (u.jobTitle) prefill.jobTitle = u.jobTitle;
    return { ...base, userId: u.id, prefill, snapshot: snap({ kind: "EMPLOYEE", name: u.name, phone: u.phone, email: u.email, nationalId: u.nationalId }, []) };
  }
  if (category === "SUPPLIER") {
    if (!input.supplierId) throw new AppError("contractParty", {}, 422);
    const s = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, name: true, phone: true, email: true, address: true, taxId: true } });
    if (!s) throw new AppError("contractParty", {}, 422);
    return { ...base, supplierId: s.id, snapshot: snap({ kind: "SUPPLIER", ...s }, []) };
  }
  // BLANK: optional customer or supplier, otherwise the free "partyName" field.
  if (input.customerId) {
    const c = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true, name: true, phone: true, email: true, address: true, taxId: true, isCompany: true } });
    if (!c) throw new AppError("contractParty", {}, 422);
    return { ...base, customerId: c.id, snapshot: snap({ kind: "CUSTOMER", ...c }, []) };
  }
  if (input.supplierId) {
    const s = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, name: true, phone: true, email: true, address: true, taxId: true } });
    if (!s) throw new AppError("contractParty", {}, 422);
    return { ...base, supplierId: s.id, snapshot: snap({ kind: "SUPPLIER", ...s }, []) };
  }
  return { ...base, snapshot: snap(null, []) };
}

/** Dates + category rules (employment: CDI default, CDD reasons, probation). Throws the first error. */
function checkRules(category: ContractCategory, fields: Record<string, string>, d: { startDay: string; endDay?: string | null; durationMonths?: number | null }) {
  const employment = category === "EMPLOYMENT";
  if (employment) {
    if (fields.employmentType !== "CDD") fields.employmentType = "CDI";
    const err = employmentErrors({ ...fields, endDay: d.endDay ?? null, durationMonths: d.durationMonths ?? null });
    // A CDD with only a duration gets its end date computed below: not an "end missing" error.
    const real = err.filter((e) => !(e === "contractCddEnd" && d.durationMonths));
    if (real.length) throw new AppError(real[0]!, {}, 422);
    if (!fields.employeeName?.trim()) throw new AppError("contractParty", {}, 422);
  }
  const dates = computeDates({ ...d, indefinite: employment && fields.employmentType === "CDI" });
  if (typeof dates === "string") throw new AppError(dates, {}, 422);
  return dates;
}

function eventActor(actor: AuditActor) {
  return { actorId: actor?.id ?? null, actorName: actor?.name ?? "Système" };
}

// ── Create / update ──────────────────────────────────────────────────────────

export type NewContract = {
  templateId: string;
  workOrderId?: string | null;
  customerId?: string | null;
  vehicleIds?: string[];
  userId?: string | null;
  supplierId?: string | null;
  startDay: string;
  endDay?: string | null;
  durationMonths?: number | null;
  fields?: Record<string, string>;
  excluded?: string[];
};

async function nextNumber(tx: Db, now: Date) {
  const year = now.getFullYear();
  const seq = await tx.sequence.upsert({ where: { key: `contract-${year}` }, create: { key: `contract-${year}`, value: 1 }, update: { value: { increment: 1 } } });
  return contractNumber(year, seq.value);
}

const partyName = (s: ContractSnapshot, fields: Record<string, string>) => fields.employeeName || s.party?.name || fields.partyName || "";

export async function createContract(actor: StaffUser, input: NewContract, opts: { previous?: { id: string; number: string; basis: string } } = {}) {
  await ensureTemplates();
  const tplRow = await prisma.contractTemplate.findUnique({ where: { id: input.templateId } });
  if (!tplRow || !tplRow.active) throw new AppError("notFound", {}, 404);
  const tpl = toTemplate(tplRow);
  assertAccess(actor, tpl.category, "manage");
  assertCanNumberDocuments();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const parties = await resolveParties(tx, tpl.category, input, now);
    const typed = cleanData(tpl.fields, input.fields ?? {});
    const fields = cleanData(tpl.fields, withDefaults(tpl.fields, { ...parties.prefill, ...typed }));
    const dates = checkRules(tpl.category, fields, { startDay: input.startDay, endDay: tpl.category === "REPAIR" ? null : input.endDay, durationMonths: tpl.category === "REPAIR" ? null : input.durationMonths });
    const excluded = (input.excluded ?? []).filter((k) => tpl.clauses.some((c) => c.key === k && !c.required));
    const flags = contractFlags({ category: tpl.category, subtype: tpl.subtype, templateReviewStatus: tpl.reviewStatus, data: fields, isRenewal: !!opts.previous });
    const number = await nextNumber(tx, now);
    const data: ContractDataJson = { fields, snapshot: parties.snapshot, excluded };
    const name = partyName(parties.snapshot, fields);
    const c = await tx.contract.create({
      data: {
        number,
        templateId: tpl.id,
        templateVersion: tpl.version,
        category: tpl.category,
        subtype: tpl.subtype,
        title: name ? `${tpl.title} — ${name}` : tpl.title,
        customerId: parties.customerId,
        workOrderId: parties.workOrderId,
        userId: parties.userId,
        supplierId: parties.supplierId,
        startDate: dayToDbDate(dates.startDay),
        endDate: dates.endDay ? dayToDbDate(dates.endDay) : null,
        durationMonths: dates.durationMonths,
        indefinite: dates.indefinite,
        data: data as unknown as Prisma.InputJsonValue,
        flags,
        previousContractId: opts.previous?.id ?? null,
        renewalBasis: opts.previous?.basis ?? null,
        createdById: actor.id,
        vehicles: { create: parties.vehicleIds.map((vehicleId) => ({ vehicleId })) },
      },
      select: { id: true, number: true },
    });
    const summary = { number, category: tpl.category, template: tpl.id, workOrderId: parties.workOrderId, customerId: parties.customerId, userId: parties.userId, supplierId: parties.supplierId, vehicleIds: parties.vehicleIds, ...dates, flags };
    await tx.contractEvent.create({ data: { contractId: c.id, ...eventActor(actor), type: "CREATED", toStatus: "DRAFT", after: summary as Prisma.InputJsonValue, note: opts.previous ? `Renouvellement de ${opts.previous.number}` : null } });
    // Salary / ID number are not copied into the journal: only which fields were filled.
    await audit(tx, actor, "contract.create", "Contract", c.id, { after: { ...summary, fields: Object.keys(fields) } });
    if (opts.previous) {
      await tx.contractEvent.create({ data: { contractId: opts.previous.id, ...eventActor(actor), type: "RENEWED", after: { renewedBy: number, basis: opts.previous.basis }, note: opts.previous.basis } });
      await audit(tx, actor, "contract.renew", "Contract", opts.previous.id, { after: { newContract: number, basis: opts.previous.basis } });
    }
    return c;
  });
}

export type ContractUpdate = { startDay: string; endDay?: string | null; durationMonths?: number | null; fields: Record<string, string>; excluded?: string[]; vehicleIds?: string[] };

/** Edits a DRAFT: fields, clauses, dates, fleet vehicles; the parties' snapshot is taken again. */
export async function updateContract(actor: StaffUser, id: string, input: ContractUpdate) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.contract.findUnique({ where: { id }, include: { template: true, vehicles: { select: { vehicleId: true } } } });
    if (!c) throw new AppError("notFound", {}, 404);
    assertAccess(actor, c.category, "manage");
    if (!isEditable(c.status)) throw new AppError("contractNotDraft", {}, 409);
    const tpl = toTemplate(c.template);
    const cat = c.category as ContractCategory;
    const old = readContractData(c.data);
    const vehicleIds = cat === "FLEET" && input.vehicleIds ? input.vehicleIds : c.vehicles.map((v) => v.vehicleId);
    const parties = await resolveParties(tx, cat, { workOrderId: c.workOrderId, customerId: c.customerId, userId: c.userId, supplierId: c.supplierId, vehicleIds }, new Date());
    const fields = cleanData(tpl.fields, input.fields);
    const dates = checkRules(cat, fields, { startDay: input.startDay, endDay: cat === "REPAIR" ? null : input.endDay, durationMonths: cat === "REPAIR" ? null : input.durationMonths });
    const excluded = (input.excluded ?? []).filter((k) => tpl.clauses.some((cl) => cl.key === k && !cl.required));
    const flags = contractFlags({ category: cat, subtype: c.subtype, templateReviewStatus: tpl.reviewStatus, data: fields, isRenewal: !!c.previousContractId });
    const data: ContractDataJson = { fields, snapshot: parties.snapshot, excluded };
    const { count } = await tx.contract.updateMany({
      where: { id, status: "DRAFT" },
      data: {
        startDate: dayToDbDate(dates.startDay),
        endDate: dates.endDay ? dayToDbDate(dates.endDay) : null,
        durationMonths: dates.durationMonths,
        indefinite: dates.indefinite,
        data: data as unknown as Prisma.InputJsonValue,
        flags,
        title: partyName(parties.snapshot, fields) ? `${tpl.title} — ${partyName(parties.snapshot, fields)}` : tpl.title,
      },
    });
    if (count === 0) throw new AppError("contractNotDraft", {}, 409);
    if (cat === "FLEET" && input.vehicleIds) {
      await tx.contractVehicle.deleteMany({ where: { contractId: id, vehicleId: { notIn: parties.vehicleIds } } });
      await tx.contractVehicle.createMany({ data: parties.vehicleIds.map((vehicleId) => ({ contractId: id, vehicleId })), skipDuplicates: true });
    }
    // History: only what changed, before → after.
    const changed = [...new Set([...Object.keys(old.fields), ...Object.keys(fields)])].filter((k) => (old.fields[k] ?? "") !== (fields[k] ?? ""));
    const before = {
      startDay: dbDay(c.startDate),
      endDay: c.endDate ? dbDay(c.endDate) : null,
      excluded: old.excluded,
      vehicleIds: c.vehicles.map((v) => v.vehicleId),
      fields: Object.fromEntries(changed.map((k) => [k, old.fields[k] ?? null])),
    };
    const after = { startDay: dates.startDay, endDay: dates.endDay, excluded, vehicleIds: parties.vehicleIds, fields: Object.fromEntries(changed.map((k) => [k, fields[k] ?? null])) };
    await tx.contractEvent.create({ data: { contractId: id, ...eventActor(actor), type: "UPDATED", before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue } });
    await audit(tx, actor, "contract.update", "Contract", id, { before: { ...before, fields: changed }, after: { ...after, fields: changed } });
  });
}

// ── Status ───────────────────────────────────────────────────────────────────

export async function moveContract(actor: StaffUser, id: string, to: string, note?: string | null, now = new Date()) {
  if (!isContractStatus(to)) throw new AppError("contractTransition", {}, 422);
  const settings = await getSettings();
  const today = todayIn(settings.timezone || GARAGE_TZ, now);
  return prisma.$transaction(async (tx) => {
    const c = await tx.contract.findUnique({ where: { id }, include: { template: { select: { reviewStatus: true, fields: true } } } });
    if (!c) throw new AppError("notFound", {}, 404);
    assertAccess(actor, c.category, "view");
    assertAccess(actor, c.category, accessForMove(to));
    const d = readContractData(c.data);
    const flags = contractFlags({ category: c.category, subtype: c.subtype, templateReviewStatus: c.template.reviewStatus, data: d.fields, isRenewal: !!c.previousContractId });
    const err = checkMove(c.status, to, {
      needsLegalReview: flags.length > 0,
      hasScan: !!c.signedScanKey,
      endDay: c.endDate ? dbDay(c.endDate) : null,
      today,
      missing: missingFields(c.template.fields as unknown as TemplateField[], d.fields),
      reason: note,
    });
    if (err === "contractMissingFields") throw new AppError(err, { fields: missingFields(c.template.fields as unknown as TemplateField[], d.fields).join(", ") }, 422);
    if (err) throw new AppError(err, {}, err === "contractTransition" ? 409 : 422);
    const data: Prisma.ContractUpdateManyMutationInput = { status: to, flags };
    if (to === "TERMINATED") Object.assign(data, { terminatedAt: now, terminationReason: note?.trim() ?? null });
    const { count } = await tx.contract.updateMany({ where: { id, status: c.status }, data });
    if (count === 0) throw new AppError("contractTransition", {}, 409);
    const legal = c.status === "LEGAL_REVIEW" && to === "APPROVED" ? "Revue juridique / RH confirmée" : null;
    const text = [legal, note?.trim() || null].filter(Boolean).join(" — ") || null;
    await tx.contractEvent.create({ data: { contractId: id, ...eventActor(actor), type: "STATUS", fromStatus: c.status, toStatus: to, note: text } });
    await audit(tx, actor, "contract.status", "Contract", id, { before: { status: c.status }, after: { status: to, note: text, flags } });
  });
}

// ── Signed scan (hand-signed paper, archived) ────────────────────────────────

export async function uploadSignedScan(actor: StaffUser, id: string, bytes: Buffer) {
  const c = await prisma.contract.findUnique({ where: { id }, select: { id: true, category: true, status: true, signedScanKey: true } });
  if (!c) throw new AppError("notFound", {}, 404);
  assertAccess(actor, c.category, "manage");
  if (!["PENDING_SIGNATURE", "SIGNED", "ACTIVE"].includes(c.status)) throw new AppError("contractScanStatus", {}, 409);
  const kind = bytes.length <= MAX_SCAN_BYTES ? sniffScan(bytes) : null;
  if (!kind) throw new AppError("contractScanType", { max: MAX_SCAN_BYTES / 1024 / 1024 }, 422);
  // File first (private storage), then the database. A previous scan is never deleted (history).
  const key = `contracts/${id}/${randomUUID()}.${kind.ext}`;
  await putObject(key, bytes, kind.contentType);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const next: ContractStatus = c.status === "PENDING_SIGNATURE" ? "SIGNED" : (c.status as ContractStatus);
    const { count } = await tx.contract.updateMany({
      where: { id, status: c.status },
      data: { signedScanKey: key, signedScanType: kind.contentType, signedScanSize: bytes.length, signedAt: now, status: next },
    });
    if (count === 0) throw new AppError("contractTransition", {}, 409);
    const info = { type: kind.contentType, size: bytes.length };
    await tx.contractEvent.create({
      data: { contractId: id, ...eventActor(actor), type: "SCAN", fromStatus: c.status, toStatus: next, before: c.signedScanKey ? { previousScan: c.signedScanKey } : undefined, after: info },
    });
    await audit(tx, actor, "contract.scan", "Contract", id, { before: { status: c.status, hadScan: !!c.signedScanKey }, after: { status: next, ...info } });
    return { status: next };
  });
}

/** The signed scan, streamed after the access check (never a public URL). */
export async function readSignedScan(actor: StaffUser, id: string): Promise<Response> {
  const c = await prisma.contract.findUnique({ where: { id }, select: { category: true, number: true, signedScanKey: true, signedScanType: true } });
  if (!c) throw new AppError("notFound", {}, 404);
  assertAccess(actor, c.category, "view");
  if (!c.signedScanKey || !c.signedScanType) throw new AppError("notFound", {}, 404);
  const res = await readObject(c.signedScanKey, c.signedScanType, null);
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", `inline; filename="${c.number}-signe.${c.signedScanType === "application/pdf" ? "pdf" : c.signedScanType === "image/png" ? "png" : "jpg"}"`);
  return new Response(res.body, { status: res.status, headers });
}

// ── Renewal: a NEW contract, never automatic ────────────────────────────────

export async function renewContract(actor: StaffUser, id: string, input: { startDay: string; endDay?: string | null; durationMonths?: number | null; basis: string }) {
  const c = await prisma.contract.findUnique({ where: { id }, include: { template: { select: { code: true } }, vehicles: { select: { vehicleId: true } } } });
  if (!c) throw new AppError("notFound", {}, 404);
  assertAccess(actor, c.category, "manage");
  if (!["SIGNED", "ACTIVE", "EXPIRED"].includes(c.status)) throw new AppError("contractRenewStatus", {}, 409);
  const basis = input.basis.trim();
  if (basis.length < 3) throw new AppError("contractRenewBasis", {}, 422);
  await ensureTemplates();
  // Latest active version of the same template (a newer text starts again "to be validated").
  const latest = await prisma.contractTemplate.findFirst({ where: { code: c.template.code, active: true }, orderBy: { version: "desc" }, select: { id: true } });
  const d = readContractData(c.data);
  return createContract(
    actor,
    {
      templateId: latest?.id ?? c.templateId,
      workOrderId: c.workOrderId,
      customerId: c.customerId,
      vehicleIds: c.vehicles.map((v) => v.vehicleId),
      userId: c.userId,
      supplierId: c.supplierId,
      startDay: input.startDay,
      endDay: input.endDay,
      durationMonths: input.durationMonths,
      fields: d.fields,
      excluded: d.excluded,
    },
    { previous: { id: c.id, number: c.number, basis } },
  );
}

// ── Reading ──────────────────────────────────────────────────────────────────

export type ContractFilter = {
  category?: string;
  status?: string;
  expiring?: boolean;
  workOrderId?: string;
  customerId?: string;
  vehicleId?: string;
  supplierId?: string;
  userId?: string;
  take?: number;
};

const listSelect = {
  id: true,
  number: true,
  title: true,
  category: true,
  subtype: true,
  status: true,
  startDate: true,
  endDate: true,
  indefinite: true,
  flags: true,
  signedScanKey: true,
  workOrderId: true,
  customer: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  workOrder: { select: { id: true, number: true, invoice: { select: { id: true, number: true, status: true, totalTtc: true, paidAmount: true } } } },
  vehicles: { select: { vehicle: { select: { id: true, plate: true } } } },
} satisfies Prisma.ContractSelect;

/** Contracts of the categories the actor may see (employment ones only for administrator + HR). */
export async function listContracts(actor: StaffUser, filter: ContractFilter = {}, now = new Date()) {
  const visible = contractCategoriesFor(actor.role, "view");
  if (visible.length === 0) throw new AppError("forbidden", {}, 403);
  const categories = filter.category ? visible.filter((c) => c === filter.category) : visible;
  const settings = await getSettings();
  const today = todayIn(settings.timezone || GARAGE_TZ, now);
  const window = settings.contractAlertDays;
  const until = dayToDbDate(new Date(Date.parse(`${today}T00:00:00Z`) + window * 86_400_000).toISOString().slice(0, 10));
  const rows = await prisma.contract.findMany({
    where: {
      category: { in: categories },
      ...(filter.status && isContractStatus(filter.status) ? { status: filter.status } : {}),
      ...(filter.expiring ? { status: { in: ["SIGNED", "ACTIVE"] }, endDate: { not: null, lte: until } } : {}),
      ...(filter.workOrderId ? { workOrderId: filter.workOrderId } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.vehicleId ? { vehicles: { some: { vehicleId: filter.vehicleId } } } : {}),
    },
    select: listSelect,
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.take ?? 300, 500),
  });
  return rows.map((r) => ({ ...r, startDay: dbDay(r.startDate), endDay: r.endDate ? dbDay(r.endDate) : null, expiry: expiryOf({ status: r.status, endDay: r.endDate ? dbDay(r.endDate) : null }, today, window) }));
}

export async function getContract(actor: StaffUser, id: string) {
  const c = await prisma.contract.findUnique({
    where: { id },
    include: {
      template: true,
      customer: { select: { id: true, name: true, isCompany: true } },
      user: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      workOrder: { select: { id: true, number: true, status: true, invoice: { select: { id: true, number: true, status: true, totalTtc: true, paidAmount: true } } } },
      vehicles: { select: { vehicle: { select: { id: true, plate: true, make: true, model: true, customerId: true } } } },
      previous: { select: { id: true, number: true, category: true } },
      renewals: { select: { id: true, number: true, status: true }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) return null;
  assertAccess(actor, c.category, "view");
  const settings = await getSettings();
  const today = todayIn(settings.timezone || GARAGE_TZ);
  const template = toTemplate(c.template);
  const data = readContractData(c.data);
  const endDay = c.endDate ? dbDay(c.endDate) : null;
  return {
    ...c,
    template,
    data,
    startDay: dbDay(c.startDate),
    endDay,
    flags: (c.flags as string[]) ?? [],
    liveFlags: contractFlags({ category: c.category, subtype: c.subtype, templateReviewStatus: template.reviewStatus, data: data.fields, isRenewal: !!c.previousContractId }),
    missing: missingFields(template.fields, data.fields),
    expiry: expiryOf({ status: c.status, endDay }, today, settings.contractAlertDays),
    today,
    can: {
      manage: canContract(actor.role, c.category, "manage"),
      approve: canContract(actor.role, c.category, "approve"),
    },
  };
}

export type ContractDetail = NonNullable<Awaited<ReturnType<typeof getContract>>>;

// ── Expiry alerts ────────────────────────────────────────────────────────────

/**
 * Signed / active contracts whose end date is within Setting.contractAlertDays (or already passed
 * while still marked running), for the categories the role may see. Nothing for other roles.
 */
export async function contractExpiryAlerts(role: Role | null | undefined, now = new Date()) {
  const cats = contractCategoriesFor(role, "view");
  if (cats.length === 0) return [];
  const settings = await getSettings();
  const today = todayIn(settings.timezone || GARAGE_TZ, now);
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + settings.contractAlertDays * 86_400_000);
  const rows = await prisma.contract.findMany({
    where: { category: { in: cats }, status: { in: ["SIGNED", "ACTIVE"] }, endDate: { not: null, lte: until } },
    select: { id: true, number: true, title: true, category: true, status: true, endDate: true, customer: { select: { name: true, phone: true } }, supplier: { select: { name: true, phone: true } }, user: { select: { name: true } } },
    orderBy: { endDate: "asc" },
    take: 200,
  });
  return rows.map((r) => ({ ...r, endDay: dbDay(r.endDate!), expiry: expiryOf({ status: r.status, endDay: dbDay(r.endDate!) }, today, settings.contractAlertDays) }));
}

export async function countExpiringContracts(role: Role | null | undefined) {
  return (await contractExpiryAlerts(role)).length;
}

/** Category of a contract (alerts: the key gives the id, the access is checked on the category). */
export async function contractCategoryOf(id: string): Promise<string | null> {
  return (await prisma.contract.findUnique({ where: { id }, select: { category: true } }))?.category ?? null;
}

/** Paramètres : alerte N jours avant la fin d'un contrat (administrateur). */
export async function setContractAlertDays(actor: StaffUser, days: number) {
  if (!can(actor.role, "manageSettings")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { id: "garage" }, select: { contractAlertDays: true } });
    await tx.setting.upsert({ where: { id: "garage" }, update: { contractAlertDays: days }, create: { id: "garage", contractAlertDays: days } });
    await audit(tx, actor, "settings.contractAlert", "Setting", "garage", { before, after: { contractAlertDays: days } });
  });
}
