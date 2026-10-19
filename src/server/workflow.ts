import type { WorkOrderStatus } from "@prisma/client";

/** Allowed status moves on the shop floor. DELIVERED and CANCELLED are final. */
export const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  RECEIVED: ["DIAGNOSIS", "QUOTE_SENT", "WAITING_INSURANCE", "IN_PROGRESS", "CANCELLED"],
  DIAGNOSIS: ["QUOTE_SENT", "WAITING_INSURANCE", "WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
  QUOTE_SENT: ["WAITING_INSURANCE", "WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
  // Expertise / accord de l'assurance avant les travaux (sinistre).
  WAITING_INSURANCE: ["QUOTE_SENT", "WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "CANCELLED"],
  // QUOTE_SENT from IN_PROGRESS = devis complémentaire découvert pendant la réparation.
  // « Prêt » passe obligatoirement par le contrôle qualité (checklist validée, voir server/quality.ts).
  IN_PROGRESS: ["QUALITY_CONTROL", "WAITING_PARTS", "WAITING_INSURANCE", "QUOTE_SENT", "CANCELLED"],
  QUALITY_CONTROL: ["WASHING", "READY", "IN_PROGRESS"],
  WASHING: ["READY", "QUALITY_CONTROL"],
  READY: ["IN_PROGRESS", "DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** The usual next step, shown as the primary button. */
export const NEXT_STEP: Partial<Record<WorkOrderStatus, WorkOrderStatus>> = {
  RECEIVED: "DIAGNOSIS",
  DIAGNOSIS: "QUOTE_SENT",
  QUOTE_SENT: "IN_PROGRESS",
  WAITING_INSURANCE: "IN_PROGRESS",
  WAITING_PARTS: "IN_PROGRESS",
  IN_PROGRESS: "QUALITY_CONTROL",
  QUALITY_CONTROL: "WASHING",
  WASHING: "READY",
  READY: "DELIVERED",
};

export const ACTIVE_STATUSES: WorkOrderStatus[] = [
  "RECEIVED",
  "DIAGNOSIS",
  "QUOTE_SENT",
  "WAITING_INSURANCE",
  "WAITING_PARTS",
  "IN_PROGRESS",
  "QUALITY_CONTROL",
  "WASHING",
  "READY",
];

export const STATUS_ORDER: WorkOrderStatus[] = [...ACTIVE_STATUSES, "DELIVERED", "CANCELLED"];

export const isFinal = (status: WorkOrderStatus) => status === "DELIVERED" || status === "CANCELLED";

// ── Customer view (portail) ──────────────────────────────────────────────────

export type CustomerStepKey = "reception" | "parts" | "repair" | "quality" | "washing" | "ready";

/** The 6 steps the customer sees, and which shop statuses belong to each. */
export const CUSTOMER_STEPS: { key: CustomerStepKey; statuses: WorkOrderStatus[]; optional?: boolean }[] = [
  { key: "reception", statuses: ["RECEIVED", "DIAGNOSIS", "QUOTE_SENT", "WAITING_INSURANCE"] },
  { key: "parts", statuses: ["WAITING_PARTS"], optional: true },
  { key: "repair", statuses: ["IN_PROGRESS"] },
  { key: "quality", statuses: ["QUALITY_CONTROL"] },
  { key: "washing", statuses: ["WASHING"] },
  { key: "ready", statuses: ["READY", "DELIVERED"] },
];

export type CustomerStep = { key: CustomerStepKey; state: "done" | "current" | "upcoming" };

/**
 * Maps a shop status to the customer stepper. The optional "parts" step is
 * shown only if the vehicle is (or was) waiting for parts.
 */
export function customerSteps(status: WorkOrderStatus, everWaitedForParts: boolean): { steps: CustomerStep[]; progress: number } {
  const visible = CUSTOMER_STEPS.filter((s) => !s.optional || everWaitedForParts || s.statuses.includes(status));
  const delivered = status === "DELIVERED";
  const current = visible.findIndex((s) => s.statuses.includes(status));
  const steps = visible.map((s, i) => ({
    key: s.key,
    state: (delivered || i < current ? "done" : i === current ? "current" : "upcoming") as CustomerStep["state"],
  }));
  const progress = delivered ? 100 : current < 0 ? 0 : Math.round((current / (visible.length - 1)) * 100);
  return { steps, progress };
}
