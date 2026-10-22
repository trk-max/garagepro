import type { WorkOrderStatus } from "@prisma/client";
import { Stepper } from "@/components/ui/redesign/stepper";
import type { Dictionary } from "@/lib/i18n/fr";

/** Main path of a repair order (the NEXT_STEP chain of server/workflow, from reception to delivery). */
export const MAIN_PATH: WorkOrderStatus[] = ["RECEIVED", "DIAGNOSIS", "QUOTE_SENT", "IN_PROGRESS", "QUALITY_CONTROL", "WASHING", "READY", "DELIVERED"];

/**
 * Where a status sits on the main path. Waiting for parts / insurance sits between
 * the quote and the work (the work step is shown as current, with a note);
 * cancelled stops the flow (-1). V16: waiting for the customer / refused quote sit on the quote step;
 * closed (delivered + paid) is past the end, like delivered.
 */
export function pathIndex(status: WorkOrderStatus): number {
  if (status === "WAITING_PARTS" || status === "WAITING_INSURANCE") return MAIN_PATH.indexOf("IN_PROGRESS");
  if (status === "WAITING_CUSTOMER" || status === "QUOTE_REFUSED") return MAIN_PATH.indexOf("QUOTE_SENT");
  return MAIN_PATH.indexOf(status);
}

/** Repair order stepper (staff page), labels from t.status. */
export function StatusStepper({ status, t, className }: { status: WorkOrderStatus; t: Dictionary; className?: string }) {
  const side = status === "WAITING_PARTS" || status === "WAITING_INSURANCE" || status === "CANCELLED" || status === "WAITING_CUSTOMER" || status === "QUOTE_REFUSED" || status === "CLOSED";
  return (
    <Stepper
      className={className}
      label={t.workOrders.status}
      steps={MAIN_PATH.map((s) => t.status[s])}
      current={status === "DELIVERED" || status === "CLOSED" ? MAIN_PATH.length : pathIndex(status)}
      note={side ? t.status[status] : undefined}
    />
  );
}
