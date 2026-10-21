import "server-only";
import { prisma } from "@/lib/prisma";

/** Oldest unpaid (issued / partly paid) invoice of a customer, for the "Send an invoice" quick action. Callers check viewClientInvoices. */
export async function oldestUnpaidInvoice(customerId: string) {
  return prisma.invoice.findFirst({
    where: { customerId, status: { in: ["ISSUED", "PARTIAL"] } },
    orderBy: { issuedAt: "asc" },
    select: { id: true, number: true },
  });
}
