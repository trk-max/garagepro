import type { WorkOrderStatus } from "@prisma/client";
import { can, type Permission, type PermSubject } from "@/lib/permissions";

/**
 * Allowed status moves on the shop floor. CANCELLED and CLOSED are final; DELIVERED only moves on to
 * CLOSED (invoice settled — automatic, see closeIfSettled in server/work-orders.ts).
 * V16: every existing move is kept; added WAITING_CUSTOMER / QUOTE_REFUSED around the quote, CANCELLED
 * from every non-final status, and DELIVERED → CLOSED.
 */
export const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  RECEIVED: ["DIAGNOSIS", "QUOTE_SENT", "WAITING_INSURANCE", "IN_PROGRESS", "CANCELLED"],
  DIAGNOSIS: ["QUOTE_SENT", "WAITING_INSURANCE", "WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
  QUOTE_SENT: ["WAITING_CUSTOMER", "QUOTE_REFUSED", "WAITING_INSURANCE", "WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
  // V16 — no answer / decision pending: back to the quote, or refused.
  WAITING_CUSTOMER: ["QUOTE_SENT", "QUOTE_REFUSED", "CANCELLED"],
  // V16 — refused quote: the car is put back together, goes through the FULL quality check, then « Prêt ».
  QUOTE_REFUSED: ["READY", "CANCELLED"],
  // Expertise / accord de l'assurance avant les travaux (sinistre).
  WAITING_INSURANCE: ["QUOTE_SENT", "WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "CANCELLED"],
  // QUOTE_SENT from IN_PROGRESS = devis complémentaire découvert pendant la réparation.
  // « Prêt » passe obligatoirement par le contrôle qualité (checklist validée, voir server/quality.ts).
  IN_PROGRESS: ["QUALITY_CONTROL", "WAITING_PARTS", "WAITING_INSURANCE", "QUOTE_SENT", "CANCELLED"],
  QUALITY_CONTROL: ["WASHING", "READY", "IN_PROGRESS", "CANCELLED"],
  WASHING: ["READY", "QUALITY_CONTROL", "CANCELLED"],
  READY: ["IN_PROGRESS", "DELIVERED", "CANCELLED"],
  DELIVERED: ["CLOSED"],
  CANCELLED: [],
  CLOSED: [],
};

/** The usual next step, shown as the primary button. */
export const NEXT_STEP: Partial<Record<WorkOrderStatus, WorkOrderStatus>> = {
  RECEIVED: "DIAGNOSIS",
  DIAGNOSIS: "QUOTE_SENT",
  QUOTE_SENT: "IN_PROGRESS",
  WAITING_CUSTOMER: "QUOTE_SENT",
  QUOTE_REFUSED: "READY",
  WAITING_INSURANCE: "IN_PROGRESS",
  WAITING_PARTS: "IN_PROGRESS",
  IN_PROGRESS: "QUALITY_CONTROL",
  QUALITY_CONTROL: "WASHING",
  WASHING: "READY",
  READY: "DELIVERED",
};

/** Car still in the garage (READY included: it waits for its owner). */
export const ACTIVE_STATUSES: WorkOrderStatus[] = [
  "RECEIVED",
  "DIAGNOSIS",
  "QUOTE_SENT",
  "WAITING_CUSTOMER",
  "QUOTE_REFUSED",
  "WAITING_INSURANCE",
  "WAITING_PARTS",
  "IN_PROGRESS",
  "QUALITY_CONTROL",
  "WASHING",
  "READY",
];

/** V16 — the car went back to its owner: DELIVERED, or DELIVERED then CLOSED (invoice settled). */
export const DELIVERED_STATUSES: WorkOrderStatus[] = ["DELIVERED", "CLOSED"];
export const isDelivered = (status: WorkOrderStatus) => status === "DELIVERED" || status === "CLOSED";

export const STATUS_ORDER: WorkOrderStatus[] = [...ACTIVE_STATUSES, "DELIVERED", "CLOSED", "CANCELLED"];

/** Nothing can be edited any more (lines, diagnosis…): delivered, closed or cancelled. */
export const isFinal = (status: WorkOrderStatus) => status === "DELIVERED" || status === "CLOSED" || status === "CANCELLED";

// ── V16 — who may make which move, and when a reason is mandatory ────────────

/**
 * Permission needed for a move (customisable per employee in Équipe › Accès, never a hard-coded role).
 * Mechanics keep the technical steps (useWorkshop) but cannot cancel, deliver, nor decide on a quote.
 */
export function transitionPermission(from: WorkOrderStatus, to: WorkOrderStatus): Permission {
  if (to === "CANCELLED") return "cancelWorkOrder";
  if (to === "DELIVERED") return "deliverWorkOrder";
  if (to === "CLOSED") return "closeWorkOrder";
  if (to === "WAITING_INSURANCE") return "manageRepairFollowUp";
  if (to === "QUOTE_SENT" || to === "WAITING_CUSTOMER" || to === "QUOTE_REFUSED") return "manageQuotes";
  if (from === "QUOTE_REFUSED") return "manageQuotes";
  // The customer's (or the insurer's) agreement: a decision on the quote, not a workshop step.
  if ((from === "QUOTE_SENT" || from === "WAITING_INSURANCE") && (to === "IN_PROGRESS" || to === "WAITING_PARTS")) return "manageQuotes";
  return "useWorkshop";
}

export type TransitionContext = {
  /** The order follows the V16 rules (opened after migration 25). */
  workflowV16: boolean;
  /** An agreement is recorded (quoteApprovedAt), e.g. accepted by the customer on the portal. */
  quoteApproved: boolean;
};

/** Reason (3–500 characters) mandatory for this move: stored in the event and the audit journal, never shown to the customer. */
export function reasonRequired(from: WorkOrderStatus, to: WorkOrderStatus, ctx: TransitionContext): boolean {
  if (to === "CANCELLED" || to === "QUOTE_REFUSED") return true;
  // Back to the workshop after the quality check or once ready: why?
  if (to === "IN_PROGRESS" && (from === "QUALITY_CONTROL" || from === "READY")) return true;
  // Until the traced agreement of Lot 2: work started on a quote with no recorded agreement must be justified.
  if (ctx.workflowV16 && !ctx.quoteApproved && (from === "QUOTE_SENT" || from === "WAITING_INSURANCE") && (to === "IN_PROGRESS" || to === "WAITING_PARTS")) return true;
  return false;
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** Trimmed reason when long enough, else null. */
export function cleanReason(reason: string | null | undefined): string | null {
  const r = reason?.trim() ?? "";
  return r.length >= REASON_MIN ? r.slice(0, REASON_MAX) : null;
}

/** New orders cannot start work straight from reception / diagnosis unless the garage allows it (Paramètres). */
export function workWithoutQuoteBlocked(from: WorkOrderStatus, to: WorkOrderStatus, ctx: { workflowV16: boolean; allowWorkWithoutQuote: boolean }): boolean {
  return ctx.workflowV16 && !ctx.allowWorkWithoutQuote && (from === "RECEIVED" || from === "DIAGNOSIS") && to === "IN_PROGRESS";
}

/** What the customer still owes: invoice total − payments − deposit taken at reception (never below 0). */
export function balanceDue(invoice: { totalTtc: number; paidAmount: number } | null, depositAmount: number | null | undefined): number | null {
  if (!invoice) return null;
  return Math.max(0, invoice.totalTtc - invoice.paidAmount - (depositAmount ?? 0));
}

export type DeliveryBlock = "noInvoice" | "balanceDue" | null;

/**
 * Delivery check of a V16 order (setting requirePaidBeforeDelivery, on by default): an invoice must exist and
 * be settled (deposit deducted). Old orders and the setting turned off: never blocked.
 */
export function deliveryBlock(input: {
  requirePaidBeforeDelivery: boolean;
  workflowV16: boolean;
  invoice: { totalTtc: number; paidAmount: number } | null;
  depositAmount: number | null | undefined;
}): DeliveryBlock {
  if (!input.requirePaidBeforeDelivery || !input.workflowV16) return null;
  if (!input.invoice) return "noInvoice";
  return (balanceDue(input.invoice, input.depositAmount) ?? 0) > 0 ? "balanceDue" : null;
}

export type TransitionOption = { to: WorkOrderStatus; reason: boolean };

/** The moves this user may offer from `from` (status dialog, workshop view). */
export function availableTransitions(
  from: WorkOrderStatus,
  subject: PermSubject,
  ctx: TransitionContext & { allowWorkWithoutQuote: boolean; invoiced: boolean },
): TransitionOption[] {
  return TRANSITIONS[from]
    .filter((to) => can(subject, transitionPermission(from, to)))
    .filter((to) => !workWithoutQuoteBlocked(from, to, ctx))
    .filter((to) => !(to === "CANCELLED" && ctx.invoiced))
    .map((to) => ({ to, reason: reasonRequired(from, to, ctx) }));
}

// ── Customer view (portail) ──────────────────────────────────────────────────

export type CustomerStepKey = "reception" | "parts" | "repair" | "quality" | "washing" | "ready";

/** The 6 steps the customer sees, and which shop statuses belong to each. */
export const CUSTOMER_STEPS: { key: CustomerStepKey; statuses: WorkOrderStatus[]; optional?: boolean }[] = [
  { key: "reception", statuses: ["RECEIVED", "DIAGNOSIS", "QUOTE_SENT", "WAITING_CUSTOMER", "QUOTE_REFUSED", "WAITING_INSURANCE"] },
  { key: "parts", statuses: ["WAITING_PARTS"], optional: true },
  { key: "repair", statuses: ["IN_PROGRESS"] },
  { key: "quality", statuses: ["QUALITY_CONTROL"] },
  { key: "washing", statuses: ["WASHING"] },
  { key: "ready", statuses: ["READY", "DELIVERED", "CLOSED"] },
];

export type CustomerStep = { key: CustomerStepKey; state: "done" | "current" | "upcoming" };

/**
 * Maps a shop status to the customer stepper. The optional "parts" step is
 * shown only if the vehicle is (or was) waiting for parts.
 */
export function customerSteps(status: WorkOrderStatus, everWaitedForParts: boolean): { steps: CustomerStep[]; progress: number } {
  const visible = CUSTOMER_STEPS.filter((s) => !s.optional || everWaitedForParts || s.statuses.includes(status));
  const delivered = isDelivered(status);
  const current = visible.findIndex((s) => s.statuses.includes(status));
  const steps = visible.map((s, i) => ({
    key: s.key,
    state: (delivered || i < current ? "done" : i === current ? "current" : "upcoming") as CustomerStep["state"],
  }));
  const progress = delivered ? 100 : current < 0 ? 0 : Math.round((current / (visible.length - 1)) * 100);
  return { steps, progress };
}
