/**
 * Next maintenance of a vehicle (pure). A plan says "every N days" and/or
 * "every N km", counted from the last time it was done.
 * - By date: due = last done + N days.
 * - By km: due = last done km + N km, compared with the LAST RECORDED mileage
 *   of the vehicle. When the mileage (or the km at the last service) is not
 *   recorded, the km rule cannot be evaluated: it is reported as such, never guessed.
 * Whichever comes first wins. "SOON" = within `leadDays` (or within `kmMargin` km).
 */
export type MaintenancePlan = { intervalDays: number | null; intervalKm: number | null; lastDoneAt: Date | null; lastDoneKm: number | null };
export type MaintenanceStatus = "OK" | "SOON" | "OVERDUE" | "UNKNOWN";

export type NextDue = {
  dueDate: Date | null;
  dueKm: number | null;
  status: MaintenanceStatus;
  /** The km rule exists but cannot be checked (no mileage or no km at last service). */
  kmUnknown: boolean;
  /** What triggered SOON/OVERDUE. */
  by: "date" | "km" | null;
};

const DAY = 86_400_000;

export function nextDue(plan: MaintenancePlan, currentKm: number | null, now: Date, leadDays: number, kmMargin = 500): NextDue {
  const dueDate = plan.intervalDays && plan.lastDoneAt ? new Date(plan.lastDoneAt.getTime() + plan.intervalDays * DAY) : null;
  const dueKm = plan.intervalKm && plan.lastDoneKm !== null ? plan.lastDoneKm + plan.intervalKm : null;
  const kmUnknown = !!plan.intervalKm && (dueKm === null || currentKm === null);

  let dateStatus: MaintenanceStatus | null = null;
  if (dueDate) dateStatus = dueDate <= now ? "OVERDUE" : dueDate.getTime() - now.getTime() <= leadDays * DAY ? "SOON" : "OK";
  let kmStatus: MaintenanceStatus | null = null;
  if (dueKm !== null && currentKm !== null) kmStatus = currentKm >= dueKm ? "OVERDUE" : dueKm - currentKm <= kmMargin ? "SOON" : "OK";

  const rank = { OVERDUE: 3, SOON: 2, OK: 1, UNKNOWN: 0 } as const;
  const candidates = [
    dateStatus && { s: dateStatus, by: "date" as const },
    kmStatus && { s: kmStatus, by: "km" as const },
  ].filter(Boolean) as { s: MaintenanceStatus; by: "date" | "km" }[];
  if (candidates.length === 0) return { dueDate, dueKm, status: "UNKNOWN", kmUnknown, by: null };
  const worst = candidates.sort((a, b) => rank[b.s] - rank[a.s])[0]!;
  return { dueDate, dueKm, status: worst.s, kmUnknown, by: worst.s === "OK" ? null : worst.by };
}

/** One reminder per due occurrence: the key changes only when the plan is done again. */
export function maintenanceDedupeKey(planId: string, due: NextDue): string {
  return `maint:${planId}:${due.dueDate ? due.dueDate.toISOString().slice(0, 10) : "-"}:${due.dueKm ?? "-"}`;
}

/** Fills {name} placeholders; unknown ones stay visible rather than silently disappearing. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/** Retry delay after a failed send: 15 min, 30 min, 1 h… Gives up after `maxAttempts`. */
export const MAX_ATTEMPTS = 3;
export const retryDelayMs = (attempts: number) => 15 * 60_000 * 2 ** Math.max(0, attempts - 1);
