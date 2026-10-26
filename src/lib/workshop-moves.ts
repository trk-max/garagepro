import type { WorkOrderStatus } from "@prisma/client";
import type { PermSubject } from "@/lib/permissions";
import { NEXT_STEP, availableTransitions, type TransitionOption } from "@/server/workflow";

/**
 * Status moves offered on the PHONE screens (mobile workshop /garage/atelier and the team app's order
 * screen): only this person's moves (V16 per-move permissions), never delivery / cancelling (done from
 * the order page) nor a move still waiting for the customer's approval. `next` = the usual next step
 * when it needs no reason (one big button); the others open the reason dialog when they need one.
 */
export function workshopMoves(
  wo: { status: WorkOrderStatus; workflowV16: boolean; quoteApprovedAt: Date | null },
  who: PermSubject,
  settings: { allowWorkWithoutQuote: boolean },
): { next: WorkOrderStatus | undefined; alternatives: TransitionOption[] } {
  const options = availableTransitions(wo.status, who, {
    workflowV16: wo.workflowV16,
    quoteApproved: !!wo.quoteApprovedAt,
    allowWorkWithoutQuote: settings.allowWorkWithoutQuote,
    invoiced: false,
  }).filter((o) => o.to !== "CANCELLED" && o.to !== "DELIVERED" && !o.needsApproval);
  const nextOption = options.find((o) => o.to === NEXT_STEP[wo.status]);
  const next = nextOption && !nextOption.reason ? nextOption.to : undefined;
  return { next, alternatives: options.filter((o) => o.to !== next) };
}
