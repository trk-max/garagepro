import "server-only";
import type { Role } from "@prisma/client";
import { AppError } from "@/lib/http";
import { canContract } from "@/lib/contracts";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { cashLowAlert } from "@/server/cash";
import { contractCategoryOf, contractExpiryAlerts } from "@/server/contracts";
import { delays } from "@/server/follow-up";
import { lowStockParts } from "@/server/parts";
import { getSettings } from "@/server/settings";
import { ACTIVE_STATUSES } from "@/server/workflow";

/**
 * Alerts of the "Suivi & retards" page (Prompt 2/5, step D). Each alert has a
 * key that includes the date it is about: if the situation changes (new
 * promised time, new expected date…), it is a NEW alert. An alert can be
 * assigned, marked as handled, or snoozed; handled/snoozed alerts leave the
 * list (no repeated noise) but stay visible in "Traitées / reportées".
 */
export type AlertType = "lateOrder" | "latePart" | "insurance" | "stuck" | "deliveryRisk" | "lowStock" | "cashLow" | "contractExpiry";
export const ALERT_KEY =
  /^(?:(lateOrder|latePart|insurance|stuck|deliveryRisk|lowStock):[a-z0-9]{20,40}:[0-9TZ:.\-]{1,40}|cashLow:(PRUDENT|NORMAL|OPTIMISTIC):\d{4}-\d{2}-\d{2}|contractExpiry:[a-z0-9]{20,40}:\d{4}-\d{2}-\d{2})$/;

export type AlertItem = {
  key: string;
  type: AlertType;
  since: Date;
  workOrder?: { id: string; number: number; plate: string; status: string } | null;
  label: string;
  contact?: { name: string; phone: string | null } | null;
  responsible?: string | null;
  /** cashLow only: first day under the threshold, projected balance that day, lowest point (millimes). */
  cash?: { scenario: string; day: string; balance: number; lowest: number; lowestDay: string; threshold: number } | null;
  /** contractExpiry only (V9): the contract, its last day and the days left (negative = passed). */
  contract?: { id: string; number: string; endDay: string; daysLeft: number | null } | null;
  state: { assignedToId: string | null; assignedName: string | null; handledAt: Date | null; snoozedUntil: Date | null; note: string | null } | null;
};

const STUCK_STATUSES = ACTIVE_STATUSES.filter((s) => s !== "READY");
const NEAR_END = ["QUALITY_CONTROL", "WASHING", "READY"];

/**
 * `viewerRole`: the cash alert (V8.4) is added only for roles allowed to see the forecast
 * (administrator, manager) — never computed, never shown, for the others.
 */
export async function listAlerts(now = new Date(), viewerRole?: Role | null) {
  const settings = await getSettings();
  const [d, active, low, cash, contracts] = await Promise.all([
    delays(now, settings),
    prisma.workOrder.findMany({
      where: { status: { in: STUCK_STATUSES } },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        promisedAt: true,
        vehicle: { select: { plate: true } },
        customer: { select: { name: true, phone: true } },
        mechanic: { select: { name: true } },
        events: { where: { type: "STATUS_CHANGED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
      take: 500,
    }),
    lowStockParts(),
    can(viewerRole, "viewCashForecast") ? cashLowAlert(now) : null,
    // V9: contracts ending soon, only those of the categories this role may see (employment: admin + HR).
    contractExpiryAlerts(viewerRole, now),
  ]);
  const wo = (w: { id: string; number: number; status: string; vehicle: { plate: string } }) => ({ id: w.id, number: w.number, plate: w.vehicle.plate, status: w.status });
  const items: Omit<AlertItem, "state">[] = [];

  for (const w of d.lateOrders) {
    items.push({ key: `lateOrder:${w.id}:${w.promisedAt!.toISOString()}`, type: "lateOrder", since: w.promisedAt!, workOrder: wo(w), label: "", contact: w.customer, responsible: w.mechanic?.name ?? null });
  }
  for (const p of d.lateParts) {
    items.push({
      key: `latePart:${p.id}:${p.expectedAt!.toISOString()}`,
      type: "latePart",
      since: p.expectedAt!,
      workOrder: { id: p.workOrder.id, number: p.workOrder.number, plate: p.workOrder.vehicle.plate, status: "" },
      label: p.description,
      contact: p.supplier ? { name: p.supplier.name, phone: p.supplier.phone } : null,
    });
  }
  for (const w of d.insuranceLate) {
    const since = w.insuranceRequestedAt ?? w.updatedAt;
    items.push({ key: `insurance:${w.id}:${since.toISOString()}`, type: "insurance", since, workOrder: wo({ ...w, status: "WAITING_INSURANCE" }), label: [w.insurerName, w.insuranceClaimRef].filter(Boolean).join(" · "), contact: w.customer });
  }
  const stuckBefore = new Date(now.getTime() - settings.alertStuckDays * 86_400_000);
  const riskUntil = new Date(now.getTime() + settings.alertDeliveryRiskHours * 3_600_000);
  for (const w of active) {
    const lastChange = w.events[0]?.createdAt ?? w.createdAt;
    if (lastChange < stuckBefore) {
      items.push({ key: `stuck:${w.id}:${lastChange.toISOString()}`, type: "stuck", since: lastChange, workOrder: wo(w), label: "", contact: w.customer, responsible: w.mechanic?.name ?? null });
    }
    if (w.promisedAt && w.promisedAt > now && w.promisedAt <= riskUntil && !NEAR_END.includes(w.status)) {
      items.push({ key: `deliveryRisk:${w.id}:${w.promisedAt.toISOString()}`, type: "deliveryRisk", since: w.promisedAt, workOrder: wo(w), label: "", contact: w.customer, responsible: w.mechanic?.name ?? null });
    }
  }
  for (const p of low) {
    items.push({ key: `lowStock:${p.id}:${p.stockX100}`, type: "lowStock", since: p.updatedAt, label: `${p.sku} · ${p.name} (${p.stockX100 / 100} / min ${p.minStockX100 / 100} ${p.unit})`, contact: null });
  }

  if (cash) {
    items.push({
      key: `cashLow:${cash.scenario}:${cash.day}`,
      type: "cashLow",
      since: new Date(`${cash.day}T12:00:00Z`),
      label: "",
      contact: null,
      cash: { scenario: cash.scenario, day: cash.day, balance: cash.balance, lowest: cash.lowest.amount, lowestDay: cash.lowest.day, threshold: cash.threshold },
    });
  }

  for (const c of contracts) {
    const contact = c.customer ?? c.supplier ?? (c.user ? { name: c.user.name, phone: null } : null);
    items.push({
      key: `contractExpiry:${c.id}:${c.endDay}`,
      type: "contractExpiry",
      since: new Date(`${c.endDay}T12:00:00Z`),
      label: `${c.number} · ${c.title}`,
      contact,
      contract: { id: c.id, number: c.number, endDay: c.endDay, daysLeft: c.expiry.daysLeft },
    });
  }

  const states = await prisma.alertState.findMany({ where: { key: { in: items.map((i) => i.key) } } });
  const users = await prisma.user.findMany({ where: { id: { in: states.map((s) => s.assignedToId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const byKey = new Map(states.map((s) => [s.key, s]));
  const all: AlertItem[] = items.map((i) => {
    const s = byKey.get(i.key);
    return { ...i, state: s ? { assignedToId: s.assignedToId, assignedName: s.assignedToId ? (nameOf.get(s.assignedToId) ?? null) : null, handledAt: s.handledAt, snoozedUntil: s.snoozedUntil, note: s.note } : null };
  });
  const isQuiet = (a: AlertItem) => !!a.state?.handledAt || (!!a.state?.snoozedUntil && a.state.snoozedUntil > now);
  return { open: all.filter((a) => !isQuiet(a)), quiet: all.filter(isQuiet), waitingParts: d.waitingParts, settings };
}

export type AlertChange = { assignTo?: string | null; handled?: boolean; snoozeDays?: number; note?: string | null };

export async function updateAlert(actor: StaffUser, key: string, change: AlertChange, now = new Date()) {
  if (!ALERT_KEY.test(key)) throw new AppError("invalid", {}, 422);
  if (key.startsWith("cashLow:") && !can(actor.role, "viewCashForecast")) throw new AppError("forbidden", {}, 403);
  if (key.startsWith("contractExpiry:")) {
    const category = await contractCategoryOf(key.split(":")[1]!);
    if (!category || !canContract(actor.role, category, "view")) throw new AppError("forbidden", {}, 403);
  }
  if (change.assignTo) {
    const u = await prisma.user.findUnique({ where: { id: change.assignTo }, select: { isActive: true } });
    if (!u?.isActive) throw new AppError("invalid", {}, 422);
  }
  return prisma.$transaction(async (tx) => {
    const before = await tx.alertState.findUnique({ where: { key } });
    const data = {
      ...(change.assignTo !== undefined ? { assignedToId: change.assignTo } : {}),
      ...(change.handled === true ? { handledAt: now, handledById: actor.id } : change.handled === false ? { handledAt: null, handledById: null, snoozedUntil: null } : {}),
      ...(change.snoozeDays ? { snoozedUntil: new Date(now.getTime() + change.snoozeDays * 86_400_000) } : {}),
      ...(change.note !== undefined ? { note: change.note } : {}),
    };
    await tx.alertState.upsert({ where: { key }, update: data, create: { key, ...data } });
    const action = change.handled === true ? "alert.handle" : change.handled === false ? "alert.reopen" : change.snoozeDays ? "alert.snooze" : "alert.assign";
    await audit(tx, actor, action, "AlertState", key, { before: before ? { assignedToId: before.assignedToId, handledAt: before.handledAt, snoozedUntil: before.snoozedUntil } : null, after: data });
  });
}
