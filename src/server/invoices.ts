import "server-only";
import { assertCanNumberDocuments } from "@/server/hub";
import type { InvoiceStatus, LineType, PaymentMethod, Prisma, ReminderChannel } from "@prisma/client";
import { computeTotals, lineTotalHt, normalizePlate } from "@/lib/format";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { getSettings } from "@/server/settings";

/** Frozen copy stored on the invoice so later edits never change a legal document. */
export type InvoiceSnapshot = {
  garage: { name: string; address: string | null; phone: string | null; email: string | null; taxId: string | null; footer: string | null };
  customer: { name: string; phone: string; address: string | null; taxId: string | null };
  vehicle: { plate: string; make: string; model: string; mileage: number | null };
  workOrderNumber: number;
  lines: { type: LineType; description: string; quantityX100: number; unitPrice: number; taxRateBp: number; totalHt: number }[];
  taxByRate: { rateBp: number; base: number; tax: number }[];
};

export async function createInvoice(workOrderId: string, actor: StaffUser) {
  const settings = await getSettings();

  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      include: { customer: true, vehicle: true, lines: { orderBy: { position: "asc" } }, invoice: { select: { id: true } } },
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
      })),
      taxByRate: totals.taxByRate,
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
      },
      select: { id: true, number: true },
    });
    await tx.workOrderEvent.create({ data: { workOrderId, actorId: actor.id, type: "INVOICED", data: { number } } });
    await audit(tx, actor, "invoice.create", "Invoice", invoice.id, {
      after: { number, workOrderNumber: wo.number, customer: wo.customer.name, totalHt: totals.totalHt, totalTax: totals.totalTax, stampDuty: totals.stampDuty, totalTtc: totals.totalTtc, dueDate },
    });
    return invoice;
  });
}

export async function recordPayment(
  invoiceId: string,
  input: { amount: number; method: PaymentMethod; reference?: string; payer?: "CUSTOMER" | "INSURANCE" },
  actor: StaffUser,
) {
  const payer = input.payer ?? "CUSTOMER";
  return prisma.$transaction(async (tx) => {
    // Row lock: a second payment on the same invoice waits here until this one commits,
    // then reads the updated paidAmount (prevents double payment / lost update).
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { number: true, totalTtc: true, paidAmount: true, status: true, workOrderId: true } });
    if (!invoice) throw new AppError("notFound", {}, 404);
    const balance = invoice.totalTtc - invoice.paidAmount;
    if (input.amount > balance) throw new AppError("overpaid", {}, 422);

    const paidAmount = invoice.paidAmount + input.amount;
    const status: InvoiceStatus = paidAmount >= invoice.totalTtc ? "PAID" : "PARTIAL";
    const payment = await tx.payment.create({
      data: { invoiceId, amount: input.amount, method: input.method, reference: input.reference, payer, actorId: actor.id },
      select: { id: true },
    });
    await tx.invoice.update({ where: { id: invoiceId }, data: { paidAmount, status } });
    await audit(tx, actor, "payment.record", "Payment", payment.id, {
      before: { invoice: invoice.number, paidAmount: invoice.paidAmount, status: invoice.status },
      after: { invoice: invoice.number, amount: input.amount, method: input.method, payer, reference: input.reference ?? null, paidAmount, status },
    });
    await tx.workOrderEvent.create({
      data: { workOrderId: invoice.workOrderId, actorId: actor.id, type: "PAYMENT", data: { amount: input.amount, method: input.method } },
    });
  });
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
  return inv.status !== "PAID" && (inv.dueDate ?? inv.issuedAt) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
      payments: { orderBy: { paidAt: "asc" } },
      // V10: live data too, so an old invoice with an incomplete snapshot still opens (lib/invoice-snapshot).
      workOrder: {
        select: {
          id: true,
          number: true,
          mileageIn: true,
          vehicle: { select: { plate: true, make: true, model: true, mileage: true } },
          lines: { orderBy: { position: "asc" }, select: { type: true, description: true, quantityX100: true, unitPrice: true, taxRateBp: true } },
        },
      },
      customer: { select: { name: true, phone: true, email: true, address: true, taxId: true } },
      reminders: { orderBy: { sentAt: "desc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!invoice) return null;
  return { ...invoice, snapshot: invoice.snapshot as unknown as InvoiceSnapshot };
}
