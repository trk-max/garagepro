import "server-only";
import { assertCanNumberDocuments } from "@/server/hub";
import type { InvoiceStatus, LineType, PartCondition, PaymentMethod, Prisma, ReminderChannel } from "@prisma/client";
import { computeTotals, lineTotalHt, normalizePlate } from "@/lib/format";
import { AppError, isUniqueViolation } from "@/lib/http";
import { can } from "@/lib/permissions";
import { creditNoteNumber, paymentDateAllowed, statusFromPaid } from "@/lib/billing";
import { snapshotHash } from "@/lib/quote";
import { addStorageFeeLineTx } from "@/server/storage-fees";
import { createAutoRepairWarranty } from "@/server/warranties";
import { cleanReason } from "@/server/workflow";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { getSettings } from "@/server/settings";
import { closeIfSettled } from "@/server/work-orders";
import { reapplyApprovals, settleDeferredStock } from "@/server/quotes";
import type { SnapshotLegal } from "@/lib/invoice-snapshot";

/** Frozen copy stored on the invoice so later edits never change a legal document. */
export type InvoiceSnapshot = {
  garage: { name: string; address: string | null; phone: string | null; email: string | null; taxId: string | null; footer: string | null };
  customer: { name: string; phone: string; address: string | null; taxId: string | null };
  vehicle: { plate: string; make: string; model: string; mileage: number | null };
  workOrderNumber: number;
  /** V16 Lot 4 — partCondition (nature de la pièce) on the lines of invoices issued from Lot 4 on. */
  lines: { type: LineType; description: string; quantityX100: number; unitPrice: number; taxRateBp: number; totalHt: number; partCondition?: PartCondition | null }[];
  taxByRate: { rateBp: number; base: number; tax: number }[];
  /** V10.6 — only on invoices issued from V10.6 on (see lib/invoice-snapshot snapshotLegal). */
  legal?: SnapshotLegal;
};

/** V16 Lot 2 — lines that go on the invoice: accepted by the customer (V16 orders) / not voided nor refused (older orders). */
export function invoiceLineWhere(workflowV16: boolean): Prisma.WorkOrderLineWhereInput {
  return workflowV16 ? { voidedAt: null, approvalStatus: "APPROVED" } : { voidedAt: null, approvalStatus: { not: "REFUSED" } };
}

export async function createInvoice(workOrderId: string, actor: StaffUser) {
  const settings = await getSettings();

  return prisma.$transaction(async (tx) => {
    const head = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { workflowV16: true, workflowLot4: true, invoice: { select: { id: true } } } });
    if (!head) throw new AppError("notFound", {}, 404);
    if (head.invoice) throw new AppError("alreadyInvoiced", {}, 409);
    // V16 Lot 4: storage fee due at pick-up added as a line (READY, Lot 4 orders, setting on, not waived).
    if (head.workflowLot4) await addStorageFeeLineTx(tx, actor, workOrderId);
    if (head.workflowV16) {
      // V16 Lot 2: decisions synchronised from online applied, accepted parts taken out of the stock.
      await reapplyApprovals(tx, workOrderId);
      await settleDeferredStock(tx, actor, workOrderId);
      // Never invoice a line the customer has not accepted: say so instead of leaving it out silently.
      const pending = await tx.workOrderLine.count({ where: { workOrderId, voidedAt: null, approvalStatus: "PENDING" } });
      if (pending > 0) throw new AppError("pendingLines", { count: pending }, 409);
    }
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      // V16: voided lines are not invoiced; V16 Lot 2: only the lines the customer ACCEPTED (orders opened before
      // V16: every line not refused, as before).
      include: { customer: true, vehicle: true, lines: { where: invoiceLineWhere(head.workflowV16), orderBy: { position: "asc" } }, invoice: { select: { id: true } } },
    });
    if (!wo) throw new AppError("notFound", {}, 404);
    if (wo.invoice) throw new AppError("alreadyInvoiced", {}, 409);
    if (wo.status === "CANCELLED") throw new AppError("final", {}, 409);
    if (wo.lines.length === 0) throw new AppError("noLines", {}, 422);

    const totals = computeTotals(wo.lines, settings.stampDuty);
    const year = new Date().getFullYear();
    assertCanNumberDocuments(); // with a garage hub, invoices are numbered on the garage PC only
    const seq = await tx.sequence.upsert({
      where: { key: `invoice-${year}` },
      create: { key: `invoice-${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    const number = `F${year}-${String(seq.value).padStart(4, "0")}`;

    const snapshot: InvoiceSnapshot = {
      garage: {
        name: settings.garageName,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        taxId: settings.taxId,
        footer: settings.invoiceFooter,
      },
      customer: { name: wo.customer.name, phone: wo.customer.phone, address: wo.customer.address, taxId: wo.customer.taxId },
      vehicle: { plate: wo.vehicle.plate, make: wo.vehicle.make, model: wo.vehicle.model, mileage: wo.mileageIn ?? wo.vehicle.mileage },
      workOrderNumber: wo.number,
      lines: wo.lines.map((l) => ({
        type: l.type,
        description: l.description,
        quantityX100: l.quantityX100,
        unitPrice: l.unitPrice,
        taxRateBp: l.taxRateBp,
        totalHt: lineTotalHt(l),
        // V16 Lot 4: nature of the part (new, used, exchange…) frozen with the line.
        ...(l.partCondition ? { partCondition: l.partCondition } : {}),
      })),
      taxByRate: totals.taxByRate,
      legal: {
        garageLegalName: settings.legalName || null,
        garageRegistry: settings.registryNumber ? `${settings.registryNumber}${settings.registryCity ? ` (${settings.registryCity})` : ""}` : null,
        customerNationalId: wo.customer.nationalId || null,
        paymentTerms: settings.invoicePaymentTerms || null,
        penaltyText: settings.invoicePenaltyText || null,
      },
    };

    const issuedAt = new Date();
    const dueDate = new Date(issuedAt.getTime() + settings.paymentTermsDays * 86_400_000);
    const invoice = await tx.invoice.create({
      data: {
        number,
        issuedAt,
        dueDate,
        workOrderId,
        customerId: wo.customerId,
        totalHt: totals.totalHt,
        totalTax: totals.totalTax,
        stampDuty: totals.stampDuty,
        totalTtc: totals.totalTtc,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        // V16 Lot 4: SHA-256 of the frozen copy (same canonical JSON as the quotes).
        snapshotHash: snapshotHash(snapshot),
      },
      select: { id: true, number: true, snapshotHash: true },
    });
    await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "INVOICED", data: { number } } });
    await audit(tx, actor, "invoice.create", "Invoice", invoice.id, {
      after: { number, workOrderNumber: wo.number, customer: wo.customer.name, totalHt: totals.totalHt, totalTax: totals.totalTax, stampDuty: totals.stampDuty, totalTtc: totals.totalTtc, dueDate, snapshotSha256: invoice.snapshotHash },
    });
    if (wo.workflowLot4) {
      // V16 Lot 4 (audit n° 27): the deposit taken at reception becomes a REAL payment, dated the day it was received
      // (never deducted again by the delivery rule: lib/billing depositOutstanding).
      if (wo.depositAmount && wo.depositAmount > 0) {
        await depositPaymentTx(tx, actor, { invoiceId: invoice.id, number, workOrderId, totalTtc: totals.totalTtc, deposit: wo.depositAmount, method: wo.depositMethod, at: wo.depositReceivedAt ?? wo.createdAt });
      }
      // V16 Lot 4 (audit n° 3): the automatic repair warranty starts with the invoice (once per order).
      await createAutoRepairWarranty(tx, actor, workOrderId, issuedAt);
      await closeIfSettled(tx, workOrderId, actor);
    }
    return { id: invoice.id, number: invoice.number };
  });
}

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "CHECK", "TRANSFER"];

/** V16 Lot 4 — the reception deposit of a new order recorded as a real payment on its new invoice (same transaction). */
async function depositPaymentTx(
  tx: Prisma.TransactionClient,
  actor: StaffUser,
  d: { invoiceId: string; number: string; workOrderId: string; totalTtc: number; deposit: number; method: string | null; at: Date },
) {
  const amount = Math.min(d.deposit, d.totalTtc);
  if (amount <= 0) return;
  const method = PAYMENT_METHODS.includes(d.method as PaymentMethod) ? (d.method as PaymentMethod) : "CASH";
  const status = statusFromPaid(d.totalTtc, amount, "ISSUED");
  const p = await tx.payment.create({
    data: { invoiceId: d.invoiceId, amount, method, reference: "Acompte réception", payer: "CUSTOMER", actorId: actor.id, isDeposit: true, paidAt: d.at },
    select: { id: true },
  });
  await tx.invoice.update({ where: { id: d.invoiceId }, data: { paidAmount: amount, status } });
  await audit(tx, actor, "payment.deposit", "Payment", p.id, {
    after: { invoice: d.number, amount, method, paidAt: d.at, deposit: d.deposit, ...(d.deposit > amount ? { depositExcess: d.deposit - amount } : {}), paidAmount: amount, status },
  });
  await tx.workOrderEvent.create({ data: { workOrderId: d.workOrderId, actorId: actor.id, type: "PAYMENT", data: { amount, method, deposit: true } } });
}

export type PaymentInput = {
  amount: number;
  method: PaymentMethod;
  reference?: string;
  payer?: "CUSTOMER" | "INSURANCE";
  /** V16 Lot 4 (audit n° 26): the real date of the payment (default: now). */
  paidAt?: Date;
  /** V16 Lot 4 (audit n° 19): key of the form — a second submission with the same key records nothing. */
  requestKey?: string | null;
};

export async function recordPayment(invoiceId: string, input: PaymentInput, actor: StaffUser): Promise<{ id: string; duplicate: boolean }> {
  const payer = input.payer ?? "CUSTOMER";
  const requestKey = input.requestKey?.trim().slice(0, 80) || null;
  const already = async () => (requestKey ? await prisma.payment.findUnique({ where: { requestKey }, select: { id: true, invoiceId: true } }) : null);
  const seen = await already();
  if (seen) {
    if (seen.invoiceId !== invoiceId) throw new AppError("invalid", {}, 409);
    return { id: seen.id, duplicate: true };
  }
  try {
    return await prisma.$transaction(async (tx) => {
      // Row lock: a second payment on the same invoice waits here until this one commits,
      // then reads the updated paidAmount (prevents double payment / lost update).
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
      // V16 Lot 4: the same form sent twice (double click, network retry) → the first payment, nothing new.
      if (requestKey) {
        const dup = await tx.payment.findUnique({ where: { requestKey }, select: { id: true } });
        if (dup) return { id: dup.id, duplicate: true };
      }
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { number: true, totalTtc: true, paidAmount: true, status: true, workOrderId: true, issuedAt: true } });
      if (!invoice) throw new AppError("notFound", {}, 404);
      if (invoice.status === "CREDITED") throw new AppError("invoiceCredited", {}, 409);
      const balance = invoice.totalTtc - invoice.paidAmount;
      if (input.amount > balance) throw new AppError("overpaid", {}, 422);
      const paidAt = input.paidAt ?? new Date();
      if (!paymentDateAllowed(paidAt, invoice.issuedAt)) throw new AppError("paymentDate", {}, 422);

      const paidAmount = invoice.paidAmount + input.amount;
      const status: InvoiceStatus = statusFromPaid(invoice.totalTtc, paidAmount, invoice.status);
      const payment = await tx.payment.create({
        data: { invoiceId, amount: input.amount, method: input.method, reference: input.reference, payer, actorId: actor.id, paidAt, requestKey },
        select: { id: true },
      });
      await tx.invoice.update({ where: { id: invoiceId }, data: { paidAmount, status } });
      await audit(tx, actor, "payment.record", "Payment", payment.id, {
        before: { invoice: invoice.number, paidAmount: invoice.paidAmount, status: invoice.status },
        after: { invoice: invoice.number, amount: input.amount, method: input.method, payer, reference: input.reference ?? null, paidAt, paidAmount, status },
      });
      await tx.workOrderEvent.create({
        data: { workOrderId: invoice.workOrderId, actorId: actor.id, type: "PAYMENT", data: { amount: input.amount, method: input.method } },
      });
      // V16: a delivered order whose invoice is now settled is closed automatically.
      await closeIfSettled(tx, invoice.workOrderId, actor);
      return { id: payment.id, duplicate: false };
    });
  } catch (error) {
    // Two requests with the same key at the very same time: the unique index lets only one through.
    if (requestKey && isUniqueViolation(error)) {
      const dup = await already();
      if (dup) return { id: dup.id, duplicate: true };
    }
    throw error;
  }
}

/**
 * V16 Lot 4 — cancels a payment (bounced cheque, typing error, refund of an overpayment / credited invoice):
 * permission reversePayment, reason mandatory. APPEND-ONLY: a new negative Payment row tied to the original
 * (reversalOfId, unique → never twice); the original is never changed. paidAmount / status recomputed; a CLOSED
 * order that is no longer settled goes back to DELIVERED (inverse of the automatic closing). Journalised.
 */
export async function reversePayment(paymentId: string, reason: string, actor: StaffUser) {
  if (!can(actor, "reversePayment")) throw new AppError("forbidden", {}, 403);
  const r = cleanReason(reason);
  if (!r) throw new AppError("reasonRequired", {}, 422);
  try {
    return await prisma.$transaction(async (tx) => {
      const head = await tx.payment.findUnique({ where: { id: paymentId }, select: { invoiceId: true } });
      if (!head) throw new AppError("notFound", {}, 404);
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${head.invoiceId} FOR UPDATE`;
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { id: true, invoiceId: true, amount: true, method: true, payer: true, reference: true, reversalOfId: true, reversedBy: { select: { id: true } } } });
      if (p.reversalOfId || p.amount <= 0) throw new AppError("cannotReverse", {}, 409);
      if (p.reversedBy) throw new AppError("alreadyReversed", {}, 409);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: p.invoiceId }, select: { number: true, totalTtc: true, paidAmount: true, status: true, workOrderId: true } });
      const paidAmount = invoice.paidAmount - p.amount;
      const status = statusFromPaid(invoice.totalTtc, paidAmount, invoice.status);
      const rev = await tx.payment.create({
        data: { invoiceId: p.invoiceId, amount: -p.amount, method: p.method, payer: p.payer, reference: p.reference, actorId: actor.id, reversalOfId: p.id, reason: r },
        select: { id: true },
      });
      await tx.invoice.update({ where: { id: p.invoiceId }, data: { paidAmount, status } });
      await audit(tx, actor, "payment.reverse", "Payment", rev.id, {
        before: { invoice: invoice.number, paidAmount: invoice.paidAmount, status: invoice.status },
        after: { invoice: invoice.number, reversalOf: p.id, amount: -p.amount, reason: r, paidAmount, status },
      });
      await tx.workOrderEvent.create({ data: { workOrderId: invoice.workOrderId, actorId: actor.id, type: "PAYMENT", data: { amount: -p.amount, method: p.method, reversal: true, reason: r } } });
      // No longer settled: a closed order goes back to « Livré » (automatic, like the closing).
      if (status !== "PAID" && status !== "CREDITED") {
        const { count } = await tx.workOrder.updateMany({ where: { id: invoice.workOrderId, status: "CLOSED" }, data: { status: "DELIVERED" } });
        if (count) {
          await tx.workOrderEvent.create({ data: { workOrderId: invoice.workOrderId, actorId: actor.id, type: "STATUS_CHANGED", data: { from: "CLOSED", to: "DELIVERED", auto: true, reopened: true } } });
          await audit(tx, actor, "workOrder.status", "WorkOrder", invoice.workOrderId, { before: { status: "CLOSED" }, after: { status: "DELIVERED", auto: true, reopened: "payment reversed" } });
        }
      }
      return { id: rev.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("alreadyReversed", {}, 409);
    throw error;
  }
}

/** V16 Lot 4 — frozen copy of a credit note: what it cancels (the invoice's frozen copy), why, totals. */
export type CreditNoteSnapshot = {
  invoice: { number: string; issuedAt: string; snapshotHash: string | null };
  reason: string;
  customer: InvoiceSnapshot["customer"];
  vehicle: InvoiceSnapshot["vehicle"];
  workOrderNumber: number;
  lines: InvoiceSnapshot["lines"];
  taxByRate: InvoiceSnapshot["taxByRate"];
  totals: { totalHt: number; totalTax: number; stampDuty: number; totalTtc: number };
};

/**
 * V16 Lot 4 — credit note (avoir) that cancels a WHOLE issued invoice (owner's decision: separate table, own
 * number « AV-2026-0001 » via Sequence credit-AAAA + assertCanNumberDocuments, reason mandatory). The invoice is
 * never changed nor deleted: only its status becomes CREDITED (allowed by the "Invoice_frozen" trigger). One
 * credit note per invoice (unique). A delivered order whose invoice is credited is settled → closed.
 */
export async function issueCreditNote(invoiceId: string, reason: string, actor: StaffUser) {
  if (!can(actor, "issueCreditNote")) throw new AppError("forbidden", {}, 403);
  const r = cleanReason(reason);
  if (!r) throw new AppError("reasonRequired", {}, 422);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { creditNote: { select: { id: true } } } });
      if (!inv) throw new AppError("notFound", {}, 404);
      if (inv.creditNote || inv.status === "CREDITED") throw new AppError("alreadyCredited", {}, 409);
      const year = new Date().getFullYear();
      assertCanNumberDocuments(); // with a garage hub, documents are numbered on the garage PC only
      const seq = await tx.sequence.upsert({ where: { key: `credit-${year}` }, create: { key: `credit-${year}`, value: 1 }, update: { value: { increment: 1 } } });
      const number = creditNoteNumber(year, seq.value);
      const s = inv.snapshot as unknown as InvoiceSnapshot;
      const snapshot: CreditNoteSnapshot = {
        invoice: { number: inv.number, issuedAt: inv.issuedAt.toISOString(), snapshotHash: inv.snapshotHash },
        reason: r,
        customer: s.customer,
        vehicle: s.vehicle,
        workOrderNumber: s.workOrderNumber,
        lines: s.lines,
        taxByRate: s.taxByRate,
        totals: { totalHt: inv.totalHt, totalTax: inv.totalTax, stampDuty: inv.stampDuty, totalTtc: inv.totalTtc },
      };
      const note = await tx.creditNote.create({
        data: {
          number,
          creditOfInvoiceId: inv.id,
          customerId: inv.customerId,
          workOrderId: inv.workOrderId,
          reason: r,
          totalHt: inv.totalHt,
          totalTax: inv.totalTax,
          stampDuty: inv.stampDuty,
          totalTtc: inv.totalTtc,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          snapshotHash: snapshotHash(snapshot),
          createdById: actor.id,
        },
        select: { id: true, number: true, snapshotHash: true },
      });
      await tx.invoice.update({ where: { id: inv.id }, data: { status: "CREDITED" } });
      await tx.workOrderEvent.create({ data: { workOrderId: inv.workOrderId, actorId: actor.id, type: "NOTE", data: { creditNote: note.number, invoice: inv.number, reason: r } } });
      await audit(tx, actor, "creditNote.create", "CreditNote", note.id, {
        before: { invoice: inv.number, status: inv.status, paidAmount: inv.paidAmount },
        after: { number, invoice: inv.number, reason: r, totalTtc: inv.totalTtc, refundDue: Math.max(0, inv.paidAmount), snapshotSha256: note.snapshotHash },
      });
      await closeIfSettled(tx, inv.workOrderId, actor);
      return { id: note.id, number: note.number };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("alreadyCredited", {}, 409);
    throw error;
  }
}

export async function getCreditNote(id: string) {
  const note = await prisma.creditNote.findUnique({ where: { id }, include: { creditOf: { select: { id: true, number: true, issuedAt: true, workOrderId: true } } } });
  if (!note) return null;
  return { ...note, snapshot: note.snapshot as unknown as CreditNoteSnapshot, hashOk: snapshotHash(note.snapshot) === note.snapshotHash };
}

export type InvoiceFilters = {
  number?: string;
  dateMode?: "exact" | "range";
  date?: string; // yyyy-mm-dd
  from?: string;
  to?: string;
  customer?: string;
  plate?: string;
  totalMin?: number; // millimes
  totalMax?: number;
  dueMin?: number;
  dueMax?: number;
  status?: InvoiceStatus | "OVERDUE";
};

const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);
const nextDay = (iso: string) => new Date(dayStart(iso).getTime() + 86_400_000);

/** Overdue = not fully paid and past its due date (or issue date when no due date). */
export function isOverdue(inv: { status: InvoiceStatus; dueDate: Date | null; issuedAt: Date }, now = new Date()): boolean {
  // V16 Lot 4: an invoice cancelled by a credit note is never late.
  return (inv.status === "ISSUED" || inv.status === "PARTIAL") && (inv.dueDate ?? inv.issuedAt) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysLate(inv: { dueDate: Date | null; issuedAt: Date }, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - (inv.dueDate ?? inv.issuedAt).getTime()) / 86_400_000));
}

export async function listInvoices(f: InvoiceFilters) {
  const where: Prisma.InvoiceWhereInput[] = [];
  if (f.number) where.push({ number: { contains: f.number.trim(), mode: "insensitive" } });
  if (f.dateMode === "exact" && f.date) where.push({ issuedAt: { gte: dayStart(f.date), lt: nextDay(f.date) } });
  if (f.dateMode === "range" && (f.from || f.to)) {
    where.push({ issuedAt: { ...(f.from ? { gte: dayStart(f.from) } : {}), ...(f.to ? { lt: nextDay(f.to) } : {}) } });
  }
  if (f.customer) {
    const q = f.customer.trim();
    where.push({ OR: [{ customer: { name: { contains: q, mode: "insensitive" } } }, { customer: { phone: { contains: q.replace(/\s/g, "") } } }] });
  }
  if (f.plate) where.push({ workOrder: { vehicle: { plate: { contains: normalizePlate(f.plate) } } } });
  if (f.totalMin !== undefined) where.push({ totalTtc: { gte: f.totalMin } });
  if (f.totalMax !== undefined) where.push({ totalTtc: { lte: f.totalMax } });
  if (f.status === "OVERDUE") where.push({ status: { in: ["ISSUED", "PARTIAL"] } });
  else if (f.status) where.push({ status: f.status });

  const rows = await prisma.invoice.findMany({
    where: { AND: where },
    include: {
      customer: { select: { name: true, phone: true } },
      workOrder: { select: { id: true, number: true, vehicle: { select: { plate: true } } } },
      reminders: { orderBy: { sentAt: "desc" }, take: 1, select: { sentAt: true } },
      // Paiements partiels: the latest promised date and the payments (to tell a kept promise from a missed one).
      paymentPromises: { orderBy: { createdAt: "desc" }, take: 1, select: { promisedAt: true, amount: true, createdAt: true } },
      payments: { select: { amount: true, paidAt: true } },
    },
    orderBy: { issuedAt: "desc" },
    take: 500,
  });

  // "Reste dû" and "en retard" are computed values: filter them here.
  return rows.filter((inv) => {
    const balance = inv.totalTtc - inv.paidAmount;
    if (f.dueMin !== undefined && balance < f.dueMin) return false;
    if (f.dueMax !== undefined && balance > f.dueMax) return false;
    if (f.status === "OVERDUE" && !isOverdue(inv)) return false;
    return true;
  });
}

/**
 * Number of late customer invoices, counted by the database (no rows loaded).
 * Same rule as isOverdue(): unpaid and due date (or issue date) before today.
 */
export async function countOverdue(now = new Date()): Promise<number> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return prisma.invoice.count({
    where: {
      status: { in: ["ISSUED", "PARTIAL"] },
      OR: [{ dueDate: { lt: today } }, { dueDate: null, issuedAt: { lt: today } }],
    },
  });
}

export async function overdueSummary() {
  const open = await prisma.invoice.findMany({
    where: { status: { in: ["ISSUED", "PARTIAL"] } },
    select: { status: true, dueDate: true, issuedAt: true, totalTtc: true, paidAmount: true },
  });
  const late = open.filter((i) => isOverdue(i));
  return { count: late.length, amount: late.reduce((s, i) => s + i.totalTtc - i.paidAmount, 0) };
}

export async function recordReminder(invoiceId: string, channel: ReminderChannel, message: string, actor: StaffUser) {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { number: true, workOrderId: true, totalTtc: true, paidAmount: true } });
    if (!invoice) throw new AppError("notFound", {}, 404);
    const reminder = await tx.invoiceReminder.create({ data: { invoiceId, channel, message, actorId: actor.id }, select: { id: true } });
    await tx.workOrderEvent.create({
      data: { workOrderId: invoice.workOrderId, actorId: actor.id, type: "NOTE", body: `[${channel}] ${message}` },
    });
    await audit(tx, actor, "invoice.reminder", "InvoiceReminder", reminder.id, {
      after: { invoice: invoice.number, channel, balance: invoice.totalTtc - invoice.paidAmount },
    });
  });
}

export async function getInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { paidAt: "asc" }, include: { reversedBy: { select: { id: true, reason: true, paidAt: true } } } },
      // V16 Lot 4: the credit note that cancels it (if any).
      creditNote: { select: { id: true, number: true, issuedAt: true, reason: true } },
      // V10: live data too, so an old invoice with an incomplete snapshot still opens (lib/invoice-snapshot).
      workOrder: {
        select: {
          id: true,
          number: true,
          mileageIn: true,
          depositAmount: true,
          depositMethod: true,
          workflowLot4: true,
          vehicle: { select: { plate: true, make: true, model: true, mileage: true } },
          lines: { where: { voidedAt: null, approvalStatus: { not: "REFUSED" } }, orderBy: { position: "asc" }, select: { type: true, description: true, quantityX100: true, unitPrice: true, taxRateBp: true } },
        },
      },
      customer: { select: { name: true, phone: true, email: true, address: true, taxId: true } },
      reminders: { orderBy: { sentAt: "desc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!invoice) return null;
  return { ...invoice, snapshot: invoice.snapshot as unknown as InvoiceSnapshot };
}
