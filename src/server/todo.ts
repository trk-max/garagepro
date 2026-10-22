import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { contractCategoriesFor } from "@/lib/contracts";
import type { PermSubject } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { groupTodos, QUOTE_WAIT_DAYS, todoKeysFor, type TodoCounts, type TodoKey, type TodoList } from "@/lib/todo";
import { missingVehicleInfo } from "@/lib/vehicle-info";
import { backupProblem } from "@/server/backups";
import { countDueSoon, partsToOrder } from "@/server/agenda";
import { countLongWaits } from "@/server/accueil";
import { countOpenClaims } from "@/server/claims";
import { countExpiringContracts } from "@/server/contracts";
import { countLateRepairs } from "@/server/follow-up";
import { countOverdue } from "@/server/invoices";
import { unreadForStaff } from "@/server/messaging";
import { ACTIVE_STATUSES } from "@/server/workflow";

/**
 * V10.4 — counts of the "À traiter" list (bell + /garage/a-traiter). Only the keys the
 * person may see (role + overrides) are computed (todoKeysFor), all in ONE Promise.all of COUNT queries;
 * every count has its own .catch so the menu never breaks (tables missing before a
 * migration, …). The where clauses are shared with src/server/todo-details.ts.
 */
/** The signed-in user: role + per-user overrides (V10.3), so custom access applies here too. */
export type TodoActor = Pick<StaffUser, "id" | "role" | "perms">;

const DAY = 86_400_000;
const quoteCut = (now: Date) => new Date(now.getTime() - QUOTE_WAIT_DAYS * DAY);

/** Where clauses (also used by the details page, so the counts and the rows agree). */
export const TODO_WHERE = {
  activeOrders: { status: { in: ACTIVE_STATUSES } } satisfies Prisma.WorkOrderWhereInput,
  quoteWaiting: (now: Date): Prisma.WorkOrderWhereInput => ({
    status: "QUOTE_SENT",
    quoteApprovedAt: null,
    createdAt: { lt: quoteCut(now) },
    // Still QUOTE_SENT and no status change for N days = the customer has not answered.
    events: { none: { type: "STATUS_CHANGED", createdAt: { gte: quoteCut(now) } } },
  }),
  readyNotDelivered: { status: "READY" } satisfies Prisma.WorkOrderWhereInput,
  missingParts: { status: { in: ["NEEDED", "ORDERED"] }, workOrder: { status: { in: ACTIVE_STATUSES } } } satisfies Prisma.WorkOrderPartNeedWhereInput,
  insuranceWaiting: { status: "WAITING_INSURANCE", insuranceDecision: null } satisfies Prisma.WorkOrderWhereInput,
  certificateFields: { isActive: true, OR: [{ jobTitle: null }, { jobTitle: "" }, { hireDate: null }] } satisfies Prisma.UserWhereInput,
  // Same rule as the quality check page: every point answered, waiting for the final approval.
  qualityChecks: {
    approvedAt: null,
    checkedAt: { not: null },
    roadTest: { not: null },
    fluidsOk: true,
    warningsOk: true,
    toolsRemoved: true,
    workVerified: true,
    billingVerified: true,
    workOrder: { status: "QUALITY_CONTROL" },
  } satisfies Prisma.QualityCheckWhereInput,
  contracts: (who: PermSubject, access: "manage" | "approve", status: string[]): Prisma.ContractWhereInput => ({
    category: { in: contractCategoriesFor(who, access) },
    status: { in: status },
  }),
};

export const CONTRACT_TODO = {
  contractDrafts: ["manage", ["DRAFT"]],
  contractsToApprove: ["approve", ["VALIDATION", "LEGAL_REVIEW"]],
  contractsToSign: ["manage", ["APPROVED", "PENDING_SIGNATURE"]],
} as const;

/** Active repairs whose vehicle still misses VIN / year / fuel / colour (same rule as the check-in form). */
async function countVehicleInfo(): Promise<number> {
  const rows = await prisma.workOrder.findMany({
    where: TODO_WHERE.activeOrders,
    select: { vehicle: { select: { vin: true, year: true, fuel: true, color: true } } },
    take: 500,
  });
  return rows.filter((r) => missingVehicleInfo(r.vehicle).length > 0).length;
}

function counter(key: TodoKey, actor: TodoActor, now: Date): Promise<number> {
  const contract = (k: keyof typeof CONTRACT_TODO) => {
    const [access, status] = CONTRACT_TODO[k];
    return prisma.contract.count({ where: TODO_WHERE.contracts(actor, access, [...status]) });
  };
  switch (key) {
    case "vehicleInfo": return countVehicleInfo();
    case "quoteWaiting": return prisma.workOrder.count({ where: TODO_WHERE.quoteWaiting(now) });
    case "readyNotDelivered": return prisma.workOrder.count({ where: TODO_WHERE.readyNotDelivered });
    case "lateRepairs": return countLateRepairs(now);
    case "missingParts": return prisma.workOrderPartNeed.count({ where: TODO_WHERE.missingParts });
    case "insuranceWaiting": return prisma.workOrder.count({ where: TODO_WHERE.insuranceWaiting });
    case "overdueInvoices": return countOverdue(now);
    case "openClaims": return countOpenClaims();
    case "unreadMessages": return unreadForStaff(actor);
    case "warrantyOpen": return prisma.warrantyClaim.count({ where: { status: "OPEN" } });
    case "contractDrafts": case "contractsToApprove": case "contractsToSign": return contract(key);
    case "contractsExpiring": return countExpiringContracts(actor);
    case "certificateFields": return prisma.user.count({ where: TODO_WHERE.certificateFields });
    // Column-to-column comparison done by the database (same rule as isLow: stock ≤ minimum).
    case "lowStock": return prisma.part.count({ where: { isActive: true, stockX100: { lte: prisma.part.fields.minStockX100 } } });
    case "backup": return backupProblem();
    case "agendaDue": return countDueSoon(now);
    case "agendaParts": return partsToOrder(now).then((p) => p.length);
    case "receptionWaiting": return countLongWaits(now);
    case "leaves": return prisma.leaveRequest.count({ where: { status: "PENDING" } });
    case "purchaseOrders": return prisma.purchaseOrder.count({ where: { status: "PENDING_APPROVAL" } });
    case "qualityChecks": return prisma.qualityCheck.count({ where: TODO_WHERE.qualityChecks });
    case "warrantyDecisions": return prisma.warrantyClaim.count({ where: { status: "SUBMITTED" } });
  }
}

/** Raw counts for the keys this person may see (others are absent). */
export async function todoCounts(actor: TodoActor, now = new Date()): Promise<TodoCounts> {
  const keys = todoKeysFor(actor);
  const values = await Promise.all(keys.map((k) => counter(k, actor, now).catch(() => 0)));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}

/**
 * Counts + grouped list, computed once per request (layout and page share it). Pass the
 * StaffUser from getStaff (itself cached per request: same object = one computation).
 */
export const getTodo = cache(async (actor: TodoActor): Promise<{ counts: TodoCounts; list: TodoList }> => {
  const counts = await todoCounts(actor);
  return { counts, list: groupTodos(counts, actor) };
});
