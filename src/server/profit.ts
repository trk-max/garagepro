import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { computeProfit, sumProfits, type OverheadMode, type Profit } from "@/lib/profit";
import { classifyComplaint, type ProblemCategory } from "@/lib/report-categories";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { getSettings } from "@/server/settings";

/**
 * Real profit per repair (Prompt 2/5, step A). Reads only recorded data:
 * invoice, lines (with the part cost saved when the part was used), direct
 * expenses, mechanics' time and payments. The formula is in lib/profit.ts.
 */
const PROFIT_SELECT = {
  id: true,
  number: true,
  complaint: true,
  status: true,
  createdAt: true,
  deliveredAt: true,
  customerId: true,
  vehicleId: true,
  customer: { select: { name: true } },
  vehicle: { select: { plate: true, make: true, model: true } },
  invoice: { select: { number: true, totalHt: true, issuedAt: true, payments: { select: { amount: true, payer: true } } } },
  lines: { select: { type: true, quantityX100: true, unitPrice: true, unitCost: true, partId: true, part: { select: { costPrice: true } } } },
  expenses: { where: { voidedAt: null }, select: { amount: true } },
  laborEntries: { where: { voidedAt: null }, select: { userId: true, startedAt: true, endedAt: true, user: { select: { hourlyCost: true } } } },
} satisfies Prisma.WorkOrderSelect;

type Row = Prisma.WorkOrderGetPayload<{ select: typeof PROFIT_SELECT }>;
type Config = { garageHourlyCost: number; overhead: { mode: OverheadMode; value: number } };

const OVERHEAD_MODES: OverheadMode[] = ["NONE", "PERCENT_REVENUE", "PER_LABOR_HOUR"];

async function config(): Promise<Config> {
  const s = await getSettings();
  const mode = (OVERHEAD_MODES as string[]).includes(s.overheadMode) ? (s.overheadMode as OverheadMode) : "NONE";
  return { garageHourlyCost: s.laborCostPerHour, overhead: { mode, value: s.overheadValue } };
}

function profitOf(row: Row, cfg: Config, now = new Date()): Profit {
  return computeProfit({
    invoiceTotalHt: row.invoice?.totalHt ?? null,
    lines: row.lines.map((l) => ({
      type: l.type,
      quantityX100: l.quantityX100,
      unitPrice: l.unitPrice,
      unitCost: l.unitCost,
      currentPartCost: l.part?.costPrice ?? null,
      hasPart: !!l.partId && !!l.part,
    })),
    expenses: row.expenses.map((e) => e.amount),
    labor: row.laborEntries.map((e) => ({
      userId: e.userId,
      minutes: Math.max(0, Math.round(((e.endedAt ?? now).getTime() - e.startedAt.getTime()) / 60_000)),
      hourlyCost: e.user.hourlyCost,
      running: !e.endedAt,
    })),
    garageHourlyCost: cfg.garageHourlyCost,
    overhead: cfg.overhead,
    payments: row.invoice?.payments ?? [],
  });
}

export async function workOrderProfit(workOrderId: string) {
  const [row, cfg] = await Promise.all([prisma.workOrder.findUnique({ where: { id: workOrderId }, select: PROFIT_SELECT }), config()]);
  if (!row) return null;
  return profitOf(row, cfg);
}

export type ProfitGroup = "repair" | "vehicle" | "customer" | "type" | "month";

/**
 * Profitability over a period. A repair belongs to the period of its invoice
 * date (revenue is recognised when invoiced); repairs not invoiced yet are
 * counted apart, never mixed in.
 */
export async function profitReport(from: Date, to: Date, group: ProfitGroup, timeZone: string) {
  const [rows, cfg, notInvoiced] = await Promise.all([
    prisma.workOrder.findMany({
      where: { invoice: { issuedAt: { gte: from, lt: to } } },
      select: PROFIT_SELECT,
      orderBy: { number: "asc" },
      take: 5000,
    }),
    config(),
    prisma.workOrder.count({ where: { status: "DELIVERED", invoice: null, deliveredAt: { gte: from, lt: to } } }),
  ]);
  const items = rows.map((r) => ({ row: r, profit: profitOf(r, cfg) }));
  const month = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(d);

  const keyOf = (r: Row): { key: string; label: string; category?: ProblemCategory } => {
    switch (group) {
      case "vehicle":
        return { key: r.vehicleId, label: `${r.vehicle.plate} — ${r.vehicle.make} ${r.vehicle.model}` };
      case "customer":
        return { key: r.customerId, label: r.customer.name };
      case "type": {
        const category = classifyComplaint(r.complaint);
        return { key: category, label: category, category };
      }
      case "month":
        return { key: month(r.invoice!.issuedAt), label: month(r.invoice!.issuedAt) };
      default:
        return { key: r.id, label: `OR-${String(r.number).padStart(4, "0")} · ${r.vehicle.plate} · ${r.customer.name}` };
    }
  };

  const groups = new Map<string, { key: string; label: string; category?: ProblemCategory; workOrderId?: string; profits: Profit[] }>();
  for (const { row, profit } of items) {
    const k = keyOf(row);
    const g = groups.get(k.key) ?? { ...k, workOrderId: group === "repair" ? row.id : undefined, profits: [] };
    g.profits.push(profit);
    groups.set(k.key, g);
  }
  const lines = [...groups.values()]
    .map((g) => ({ key: g.key, label: g.label, category: g.category, workOrderId: g.workOrderId, ...sumProfits(g.profits) }))
    .sort((a, b) => (group === "month" ? a.key.localeCompare(b.key) : b.profit - a.profit));
  return { lines, total: sumProfits(items.map((i) => i.profit)), notInvoiced, config: cfg };
}

// ── Direct expenses of a repair ──────────────────────────────────────────────

export async function listExpenses(workOrderId: string) {
  return prisma.workOrderExpense.findMany({
    where: { workOrderId },
    orderBy: { createdAt: "asc" },
    include: { supplier: { select: { name: true } } },
  });
}

export async function addExpense(actor: StaffUser, workOrderId: string, input: { description: string; amount: number; supplierId?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true } });
    if (!wo) throw new AppError("notFound", {}, 404);
    const expense = await tx.workOrderExpense.create({
      data: { workOrderId, description: input.description, amount: input.amount, supplierId: input.supplierId || null, createdById: actor.id },
      select: { id: true },
    });
    await audit(tx, actor, "expense.add", "WorkOrderExpense", expense.id, { after: { workOrderId, ...input } });
    return expense;
  });
}

/** Never deleted: cancelled with a reason, kept in the history and the journal. */
export async function voidExpense(actor: StaffUser, expenseId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.workOrderExpense.findUnique({ where: { id: expenseId } });
    if (!old) throw new AppError("notFound", {}, 404);
    const { count } = await tx.workOrderExpense.updateMany({ where: { id: expenseId, voidedAt: null }, data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason } });
    if (count === 0) throw new AppError("alreadyVoided", {}, 409);
    await audit(tx, actor, "expense.void", "WorkOrderExpense", expenseId, { before: { amount: old.amount, description: old.description }, after: { voided: true, reason } });
    return old.workOrderId;
  });
}
