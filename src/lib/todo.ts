import { contractCategoriesFor } from "@/lib/contracts";
import { can, type PermSubject } from "@/lib/permissions";

/**
 * V10.4 — "À traiter": what is still incomplete, and what waits for a manager /
 * administrator decision. Pure rules (who sees what, grouping, links), unit-tested
 * in tests/todo.test.ts; the counts come from src/server/todo.ts.
 */
export type TodoGroup = "incomplete" | "approval";

export const TODO_KEYS = [
  // A. Incomplete
  "vehicleInfo", "quoteWaiting", "readyNotDelivered", "lateRepairs", "missingParts", "insuranceWaiting",
  "overdueInvoices", "openClaims", "unreadMessages", "warrantyOpen", "contractDrafts", "contractsExpiring",
  "certificateFields", "lowStock", "backup", "agendaDue", "agendaParts",
  // B. To approve (manager / administrator / HR)
  "leaves", "purchaseOrders", "qualityChecks", "contractsToApprove", "contractsToSign", "warrantyDecisions",
] as const;
export type TodoKey = (typeof TODO_KEYS)[number];

/** `visible` takes a role or the signed-in user (role + per-user overrides, V10.3). */
type Def = { group: TodoGroup; href: string; visible: (who: PermSubject) => boolean };

const followUp = (r: PermSubject) => can(r, "manageRepairFollowUp");
const contracts = (access: "view" | "manage" | "approve") => (r: PermSubject) => can(r, "viewContracts") && contractCategoriesFor(r, access).length > 0;

/** Quote sent and no answer for this many days → "incomplete". */
export const QUOTE_WAIT_DAYS = 3;

export const TODO_DEFS: Record<TodoKey, Def> = {
  vehicleInfo: { group: "incomplete", href: "/garage/work-orders", visible: (r) => can(r, "viewWorkOrders") },
  quoteWaiting: { group: "incomplete", href: "/garage/work-orders?status=QUOTE_SENT", visible: followUp },
  readyNotDelivered: { group: "incomplete", href: "/garage/work-orders?status=READY", visible: followUp },
  lateRepairs: { group: "incomplete", href: "/garage/suivi", visible: followUp },
  missingParts: { group: "incomplete", href: "/garage/suivi", visible: (r) => followUp(r) || can(r, "manageStock") },
  insuranceWaiting: { group: "incomplete", href: "/garage/work-orders?status=WAITING_INSURANCE", visible: followUp },
  overdueInvoices: { group: "incomplete", href: "/garage/invoices?status=OVERDUE", visible: (r) => can(r, "viewClientInvoices") },
  openClaims: { group: "incomplete", href: "/garage/reclamations", visible: (r) => can(r, "manageClaims") },
  unreadMessages: { group: "incomplete", href: "/garage/messages", visible: (r) => can(r, "useShowroomMessages") },
  warrantyOpen: { group: "incomplete", href: "/garage/garanties?f=claims", visible: (r) => can(r, "manageWarranties") },
  contractDrafts: { group: "incomplete", href: "/garage/contrats?s=DRAFT", visible: contracts("manage") },
  contractsExpiring: { group: "incomplete", href: "/garage/contrats?e=1", visible: contracts("view") },
  certificateFields: { group: "incomplete", href: "/garage/equipe", visible: (r) => can(r, "issueCertificates") },
  lowStock: { group: "incomplete", href: "/garage/parts?low=1", visible: (r) => can(r, "requestPurchase") },
  backup: { group: "incomplete", href: "/garage/sauvegardes", visible: (r) => can(r, "manageSettings") },
  // V12 — agenda: due within 30 days, still to validate / send; parts to order in advance.
  agendaDue: { group: "incomplete", href: "/garage/agenda?to=30", visible: (r) => can(r, "manageAgenda") },
  agendaParts: { group: "incomplete", href: "/garage/agenda?parts=1", visible: (r) => can(r, "manageAgenda") && can(r, "requestPurchase") },
  leaves: { group: "approval", href: "/garage/equipe", visible: (r) => can(r, "manageTeam") },
  purchaseOrders: { group: "approval", href: "/garage/purchase-orders?status=PENDING_APPROVAL", visible: (r) => can(r, "approvePurchase") },
  qualityChecks: { group: "approval", href: "/garage/work-orders?status=QUALITY_CONTROL", visible: (r) => can(r, "approveQualityCheck") },
  contractsToApprove: { group: "approval", href: "/garage/contrats?s=VALIDATION", visible: contracts("approve") },
  contractsToSign: { group: "approval", href: "/garage/contrats?s=PENDING_SIGNATURE", visible: contracts("manage") },
  warrantyDecisions: { group: "approval", href: "/garage/garanties?f=claims", visible: (r) => can(r, "viewWarrantyMoney") },
};

/** Keys this person (or role) may see (the server computes only these). */
export const todoKeysFor = (who: PermSubject): TodoKey[] => TODO_KEYS.filter((k) => TODO_DEFS[k].visible(who));

export type TodoCounts = Partial<Record<TodoKey, number>>;
export type TodoItem = { key: TodoKey; group: TodoGroup; href: string; count: number };
export type TodoList = { incomplete: TodoItem[]; approval: TodoItem[]; total: number };

/** Non-zero items of the person (or role), in the fixed order, split in the two sections. */
export function groupTodos(counts: TodoCounts, who: PermSubject): TodoList {
  const items = todoKeysFor(who)
    .map((key) => ({ key, group: TODO_DEFS[key].group, href: TODO_DEFS[key].href, count: counts[key] ?? 0 }))
    .filter((i) => i.count > 0);
  return {
    incomplete: items.filter((i) => i.group === "incomplete"),
    approval: items.filter((i) => i.group === "approval"),
    total: items.reduce((s, i) => s + i.count, 0),
  };
}
