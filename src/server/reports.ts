import "server-only";
import { addDays, utcToZoned, zonedToUtc } from "@/lib/booking";
import { LIVE_LINE } from "@/lib/quote";
import { agedBalance } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { PERIOD_DAYS, buildReport, type ReportPeriod, type ReportRows } from "@/lib/report";
import { lowStockParts } from "@/server/parts";
import { getSettings } from "@/server/settings";
import { isFinal } from "@/server/workflow";

/** Start of the period: local midnight, `days - 1` days ago (today included). */
export function periodStart(period: ReportPeriod, now: Date, timeZone: string): Date {
  const today = utcToZoned(now, timeZone).date;
  return zonedToUtc(addDays(today, -(PERIOD_DAYS[period] - 1)), "00:00", timeZone);
}

/**
 * Everything the owner wants to know for a period (day, 7 days, 30 days,
 * 90 days): money, cars, problems, parts, mechanics, complaints, ratings.
 * A handful of parallel queries returning only the columns needed.
 */
export async function getReport(period: ReportPeriod, now = new Date()) {
  const settings = await getSettings();
  const timeZone = settings.timezone;
  const days = PERIOD_DAYS[period];
  const start = periodStart(period, now, timeZone);
  const prevStart = new Date(start.getTime() - days * 86_400_000);
  const range = { gte: start, lte: now };
  const prevRange = { gte: prevStart, lt: start };

  const [
    invoices,
    payments,
    createdRaw,
    delivered,
    cancelled,
    openOrders,
    lines,
    supplierInv,
    supplierPaid,
    unpaid,
    lowStock,
    appointments,
    newCustomers,
    claims,
    openClaimsNow,
    feedback,
    prevInvoices,
    prevPayments,
    prevCreated,
    creditNotes,
    prevCreditNotes,
  ] = await Promise.all([
    prisma.invoice.findMany({ where: { issuedAt: range }, select: { totalHt: true, totalTtc: true, paidAmount: true, issuedAt: true } }),
    prisma.payment.findMany({ where: { paidAt: range }, select: { amount: true, method: true, paidAt: true } }),
    prisma.workOrder.findMany({
      where: { createdAt: range },
      select: {
        id: true,
        complaint: true,
        createdAt: true,
        customerId: true,
        vehicleId: true,
        vehicle: { select: { make: true, model: true } },
        customer: { select: { createdAt: true } },
      },
    }),
    prisma.workOrder.findMany({
      where: { deliveredAt: range },
      // V16 Lot 3: promised dates for the KPI « livré à la date promise initiale ».
      select: { createdAt: true, deliveredAt: true, promisedAt: true, promisedAtInitial: true, mechanic: { select: { name: true } } },
    }),
    prisma.workOrder.count({ where: { status: "CANCELLED", updatedAt: range } }),
    prisma.workOrder.findMany({ where: { status: { notIn: ["DELIVERED", "CLOSED", "CANCELLED"] } }, select: { status: true } }),
    prisma.workOrderLine.findMany({
      where: { ...LIVE_LINE, workOrder: { invoice: { issuedAt: range } } },
      select: {
        type: true,
        quantityX100: true,
        unitPrice: true,
        partId: true,
        part: { select: { name: true, costPrice: true } },
        workOrder: { select: { mechanic: { select: { name: true } } } },
      },
    }),
    prisma.supplierInvoice.aggregate({ where: { issuedAt: range }, _sum: { totalTtc: true } }),
    prisma.supplierPayment.aggregate({ where: { paidAt: range }, _sum: { amount: true } }),
    prisma.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIAL"] } }, select: { totalTtc: true, paidAmount: true, dueDate: true, issuedAt: true, status: true } }),
    lowStockParts(),
    prisma.appointment.findMany({ where: { startAt: range }, select: { status: true } }),
    prisma.customer.count({ where: { createdAt: range } }),
    prisma.customerClaim.findMany({ where: { createdAt: range }, select: { category: true, status: true, createdAt: true, resolvedAt: true } }),
    prisma.customerClaim.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.customerFeedback.findMany({
      where: { createdAt: range },
      orderBy: { createdAt: "desc" },
      select: { rating: true, comment: true, name: true, plate: true, createdAt: true },
    }),
    prisma.invoice.findMany({ where: { issuedAt: prevRange }, select: { totalHt: true, totalTtc: true, paidAmount: true, issuedAt: true } }),
    prisma.payment.findMany({ where: { paidAt: prevRange }, select: { amount: true, method: true, paidAt: true } }),
    prisma.workOrder.count({ where: { createdAt: prevRange } }),
    // V16 Lot 4: credit notes (avoirs) deducted from the invoiced revenue of THEIR period.
    prisma.creditNote.findMany({ where: { issuedAt: range }, select: { totalHt: true, totalTtc: true, issuedAt: true } }),
    prisma.creditNote.findMany({ where: { issuedAt: prevRange }, select: { totalHt: true, totalTtc: true, issuedAt: true } }),
  ]);

  // Previous visit of each car (to spot returning customers and comebacks).
  const vehicleIds = [...new Set(createdRaw.map((w) => w.vehicleId))];
  const visits = vehicleIds.length
    ? await prisma.workOrder.findMany({
        where: { vehicleId: { in: vehicleIds }, createdAt: { lte: now }, status: { not: "CANCELLED" } },
        select: { id: true, vehicleId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const previousVisit = (wo: { id: string; vehicleId: string; createdAt: Date }) => {
    let last: Date | null = null;
    for (const v of visits) {
      if (v.vehicleId !== wo.vehicleId || v.id === wo.id) continue;
      if (v.createdAt < wo.createdAt) last = v.createdAt;
    }
    return last;
  };

  const rows: ReportRows = {
    invoices,
    creditNotes,
    // V16 Lot 4: aged balance (0–30, 31–60, 61–90, > 90 days since the invoice date) of what is still owed now.
    aged: agedBalance(unpaid, now),
    payments,
    created: createdRaw.map((w) => ({
      id: w.id,
      complaint: w.complaint,
      createdAt: w.createdAt,
      customerId: w.customerId,
      vehicleId: w.vehicleId,
      make: w.vehicle.make,
      model: w.vehicle.model,
      customerSince: w.customer.createdAt,
      previousVisitAt: previousVisit(w),
    })),
    delivered: delivered.map((d) => ({ createdAt: d.createdAt, deliveredAt: d.deliveredAt!, mechanicName: d.mechanic?.name ?? null, promisedAt: d.promisedAt, promisedAtInitial: d.promisedAtInitial })),
    cancelled,
    inShopNow: openOrders.filter((o) => !isFinal(o.status)).length,
    lines: lines.map((l) => ({
      type: l.type,
      quantityX100: l.quantityX100,
      unitPrice: l.unitPrice,
      partId: l.partId,
      partName: l.part?.name ?? null,
      partCost: l.part?.costPrice ?? null,
      mechanicName: l.workOrder.mechanic?.name ?? null,
    })),
    supplierInvoicesTtc: supplierInv._sum.totalTtc ?? 0,
    supplierPaid: supplierPaid._sum.amount ?? 0,
    outstandingNow: unpaid.reduce((s, i) => s + (i.totalTtc - i.paidAmount), 0),
    overdueNow: unpaid.filter((i) => i.dueDate && i.dueDate < now).length,
    lowStockNow: lowStock.length,
    appointments,
    newCustomers,
    claims,
    openClaimsNow,
    feedback,
  };

  const report = buildReport(
    rows,
    { invoices: prevInvoices, payments: prevPayments, received: prevCreated, creditNotes: prevCreditNotes },
    { start, days, timeZone },
  );
  return { period, start, end: now, timeZone, garageName: settings.garageName, lowStock: lowStock.slice(0, 8), ...report };
}
