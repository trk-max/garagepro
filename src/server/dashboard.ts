import "server-only";
import { prisma } from "@/lib/prisma";
import { lowStockParts } from "@/server/parts";
import { ACTIVE_STATUSES } from "@/server/workflow";
import { countByStatus } from "@/server/work-orders";

export async function getDashboard() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [byStatus, dueToday, revenue, unpaid, lowStock, recent] = await Promise.all([
    countByStatus(),
    prisma.workOrder.count({
      where: { status: { in: ACTIVE_STATUSES }, promisedAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.invoice.aggregate({ where: { issuedAt: { gte: startOfMonth } }, _sum: { totalHt: true } }),
    prisma.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIAL"] } }, select: { totalTtc: true, paidAmount: true } }),
    lowStockParts(),
    prisma.workOrder.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        vehicle: { select: { plate: true, make: true, model: true } },
        customer: { select: { name: true } },
        mechanic: { select: { name: true } },
      },
    }),
  ]);

  const inShop = ACTIVE_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);

  return {
    byStatus,
    inShop,
    ready: byStatus.READY,
    dueToday,
    revenueMonthHt: revenue._sum.totalHt ?? 0,
    unpaidTotal: unpaid.reduce((sum, i) => sum + (i.totalTtc - i.paidAmount), 0),
    lowStock,
    recent,
  };
}
