import "server-only";
import { computeTotals } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Latest repair orders for the overview table: vehicle, customer, first line (or
 * the customer's complaint) and — finance roles only — the price: the invoice
 * total when invoiced, else the lines' total incl. tax. Amounts are not even
 * read for other roles.
 */
export async function recentOrderRows(opts: { finance: boolean }, take = 8) {
  const orders = await prisma.workOrder.findMany({
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      number: true,
      status: true,
      complaint: true,
      updatedAt: true,
      vehicle: { select: { plate: true, make: true, model: true } },
      customer: { select: { name: true } },
      lines: opts.finance
        ? { where: { voidedAt: null }, orderBy: { position: "asc" }, select: { description: true, quantityX100: true, unitPrice: true, taxRateBp: true } }
        : { where: { voidedAt: null }, orderBy: { position: "asc" }, take: 1, select: { description: true, quantityX100: true, unitPrice: true, taxRateBp: true } },
      invoice: opts.finance ? { select: { totalTtc: true } } : false,
    },
  });
  return orders.map(({ lines, invoice, ...o }) => ({
    ...o,
    service: lines[0]?.description ?? o.complaint,
    price: opts.finance ? (invoice?.totalTtc ?? computeTotals(lines, 0).totalTtc) : null,
  }));
}
