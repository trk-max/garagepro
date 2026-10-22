import "server-only";
import { alertCutoffs } from "@/lib/alerts";
import { depositOutstanding } from "@/lib/billing";
import { displayPlate, woNumber } from "@/lib/format";
import { can, type PermSubject } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { TodoKey } from "@/lib/todo";
import { missingVehicleInfo, type VehicleInfoField } from "@/lib/vehicle-info";
import { CONTRACT_TODO, TODO_WHERE } from "@/server/todo";
import { lowRatingsWhere } from "@/server/claims";
import { paymentFollowUps } from "@/server/payment-promises";
import { getSettings } from "@/server/settings";
import { ACTIVE_STATUSES, balanceDue } from "@/server/workflow";

/**
 * V10.4 — the records of each "À traiter" item: the first lines on /garage/a-traiter, ALL of them (up to
 * DETAIL_LIMIT) on /garage/a-traiter/[key], where the bell's items lead. Called with the keys the person may see,
 * so the permission filter is the one of src/server/todo.ts; the where clauses are the counts' own (TODO_WHERE,
 * paymentFollowUps…), so the list shows EXACTLY what is counted. A row about a car carries its plate, make /
 * model, customer, order / invoice number and the key figure (amount due, days late, missing part…).
 * Only "backup" has no record (a state of the backups): its page links to the module.
 */
export type TodoFigure =
  | { kind: "money"; amount: number }
  | { kind: "days"; days: number }
  | { kind: "late"; days: number }
  | { kind: "minutes"; minutes: number }
  | { kind: "noInvoice" }
  | { kind: "unread"; n: number }
  | { kind: "text"; text: string };

/** `missing`: vehicle fields still empty (vehicleInfo only), translated by the page. */
export type TodoRow = {
  id: string;
  title: string;
  sub: string | null;
  href: string;
  at: Date | null;
  missing?: VehicleInfoField[];
  /** The car concerned (plate as stored: the page shows it with PlateChip). */
  car?: { plate: string; vehicle: string; customer: string | null; ref: string | null };
  figure?: TodoFigure;
  /** Invoices with money due: amounts, due date, next payment promised by the customer. */
  invoice?: { total: number; paid: number; balance: number; due: Date; next: { at: Date; amount: number | null; overdue: boolean } | null };
  /** « Relancer le client »: the invoice's reminder panel (existing path), when the person may send reminders. */
  remindHref?: string;
  tone?: "danger";
};

export const OVERVIEW_ROWS = 8;
export const DETAIL_LIMIT = 200;
const DAY = 86_400_000;
const daysSince = (d: Date | null | undefined, now: Date) => (d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY)) : 0);

type WoLite = { id: string; number: number; vehicle: { plate: string; make: string; model: string }; customer: { name: string } };
const woRow = (w: WoLite, at: Date | null = null, figure?: TodoFigure): TodoRow => ({
  id: w.id,
  title: `${woNumber(w.number)} · ${displayPlate(w.vehicle.plate)}`,
  sub: `${w.vehicle.make} ${w.vehicle.model} — ${w.customer.name}`,
  href: `/garage/work-orders/${w.id}`,
  at,
  car: { plate: w.vehicle.plate, vehicle: `${w.vehicle.make} ${w.vehicle.model}`.trim(), customer: w.customer.name, ref: woNumber(w.number) },
  ...(figure ? { figure } : {}),
});
const woSelect = { id: true, number: true, updatedAt: true, vehicle: { select: { plate: true, make: true, model: true } }, customer: { select: { name: true } } } as const;

async function rowsFor(key: TodoKey, who: PermSubject, now: Date, take: number): Promise<TodoRow[] | null> {
  switch (key) {
    case "vehicleInfo": {
      const rows = await prisma.workOrder.findMany({
        where: TODO_WHERE.activeOrders,
        select: { ...woSelect, vehicle: { select: { plate: true, make: true, model: true, vin: true, year: true, fuel: true, color: true } } },
        orderBy: { createdAt: "asc" },
        take: 1000,
      });
      return rows
        .map((w) => ({ w, missing: missingVehicleInfo(w.vehicle) }))
        .filter((x) => x.missing.length > 0)
        .slice(0, take)
        .map(({ w, missing }) => ({ ...woRow(w), missing }));
    }
    case "quoteWaiting":
    case "readyNotDelivered":
    case "waitingCustomer":
    case "insuranceWaiting": {
      const where = key === "quoteWaiting" ? TODO_WHERE.quoteWaiting(now) : TODO_WHERE[key];
      const rows = await prisma.workOrder.findMany({ where, select: woSelect, orderBy: { updatedAt: "asc" }, take });
      return rows.map((w) => woRow(w, w.updatedAt, { kind: "days", days: daysSince(w.updatedAt, now) }));
    }
    case "deliveredUnpaid": {
      // The amount still due (deposit of an order before Lot 4 deducted, as on the order page), or "no invoice yet".
      const rows = await prisma.workOrder.findMany({
        where: TODO_WHERE.deliveredUnpaid,
        select: { ...woSelect, deliveredAt: true, depositAmount: true, workflowLot4: true, invoice: { select: { id: true, number: true, totalTtc: true, paidAmount: true, status: true } } },
        orderBy: { updatedAt: "asc" },
        take,
      });
      return rows.map((w) => {
        const due = balanceDue(w.invoice, depositOutstanding(w));
        const row = woRow(w, w.deliveredAt ?? w.updatedAt, due === null ? { kind: "noInvoice" } : { kind: "money", amount: due });
        return w.invoice ? { ...row, car: { ...row.car!, ref: `${woNumber(w.number)} · ${w.invoice.number}` } } : row;
      });
    }
    case "lateRepairs": {
      // Same rule as countLateRepairs (follow-up): promised time passed by more than the tolerance (Paramètres → Alertes).
      const cut = alertCutoffs(await getSettings(), now);
      const rows = await prisma.workOrder.findMany({
        where: { status: { in: ACTIVE_STATUSES.filter((s) => s !== "READY") }, promisedAt: { lt: cut.order } },
        select: { ...woSelect, promisedAt: true },
        orderBy: { promisedAt: "asc" },
        take,
      });
      return rows.map((w) => woRow(w, w.promisedAt, { kind: "late", days: daysSince(w.promisedAt, now) }));
    }
    case "skillWarnings": {
      const { SKILL_TODO_WHERE } = await import("@/server/skills");
      const rows = await prisma.workOrder.findMany({ where: SKILL_TODO_WHERE.warnings, select: { ...woSelect, skillWarningsAt: true }, orderBy: { skillWarningsAt: "asc" }, take });
      return rows.map((w) => ({ ...woRow(w, w.skillWarningsAt), href: `/garage/work-orders/${w.id}` }));
    }
    case "qualityChecks": {
      const rows = await prisma.qualityCheck.findMany({ where: TODO_WHERE.qualityChecks, select: { checkedAt: true, workOrder: { select: woSelect } }, orderBy: { checkedAt: "asc" }, take });
      return rows.map((q) => woRow(q.workOrder, q.checkedAt));
    }
    case "missingParts": {
      const rows = await prisma.workOrderPartNeed.findMany({
        where: TODO_WHERE.missingParts,
        select: { id: true, description: true, status: true, expectedAt: true, workOrder: { select: woSelect } },
        orderBy: [{ expectedAt: "asc" }],
        take,
      });
      return rows.map((p) => ({
        ...woRow(p.workOrder, p.expectedAt, { kind: "text", text: p.description }),
        id: p.id,
        title: p.description,
        sub: `${woNumber(p.workOrder.number)} · ${displayPlate(p.workOrder.vehicle.plate)}`,
        ...(p.expectedAt && p.expectedAt < now ? { tone: "danger" as const } : {}),
      }));
    }
    case "overdueInvoices":
    case "paymentPromisesDue":
    case "partialPayments": {
      // Paiements partiels: one list per invoice (lib/payment-promise paymentFollowUp), same computation as the count.
      const remind = can(who, "sendReminder");
      const rows = (await paymentFollowUps(now)).filter((r) => r.key === key).slice(0, take);
      return rows.map((r) => ({
        id: r.id,
        title: r.number,
        sub: r.customer.name,
        href: `/garage/invoices/${r.id}`,
        at: r.dueDate,
        car: { plate: r.workOrder.vehicle.plate, vehicle: `${r.workOrder.vehicle.make} ${r.workOrder.vehicle.model}`.trim(), customer: r.customer.name, ref: `${r.number} · ${woNumber(r.workOrder.number)}` },
        figure: { kind: "money", amount: r.balance },
        invoice: { total: r.totalTtc, paid: r.paidAmount, balance: r.balance, due: r.dueDate, next: r.next },
        ...(remind && key !== "partialPayments" ? { remindHref: `/garage/invoices/${r.id}#relance` } : {}),
        ...(key === "paymentPromisesDue" ? { tone: "danger" as const } : {}),
      }));
    }
    case "leaves": {
      const rows = await prisma.leaveRequest.findMany({ where: { status: "PENDING" }, select: { id: true, startAt: true, user: { select: { id: true, name: true } } }, orderBy: { startAt: "asc" }, take });
      return rows.map((r) => ({ id: r.id, title: r.user.name, sub: null, href: "/garage/equipe", at: r.startAt }));
    }
    case "purchaseOrders": {
      const rows = await prisma.purchaseOrder.findMany({ where: { status: "PENDING_APPROVAL" }, select: { id: true, number: true, createdAt: true, supplier: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take });
      return rows.map((p) => ({ id: p.id, title: p.number, sub: p.supplier.name, href: `/garage/purchase-orders/${p.id}`, at: p.createdAt }));
    }
    case "contractDrafts":
    case "contractsToApprove":
    case "contractsToSign": {
      const [access, status] = CONTRACT_TODO[key];
      const rows = await prisma.contract.findMany({ where: TODO_WHERE.contracts(who, access, [...status]), select: { id: true, number: true, title: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take });
      return rows.map((c) => ({ id: c.id, title: c.number, sub: c.title, href: `/garage/contrats/${c.id}`, at: c.updatedAt }));
    }
    case "contractsExpiring": {
      const { contractExpiryAlerts } = await import("@/server/contracts");
      const rows = (await contractExpiryAlerts(who, now)).slice(0, take);
      return rows.map((c) => ({ id: c.id, title: c.number, sub: [c.title, c.customer?.name ?? c.supplier?.name ?? c.user?.name].filter(Boolean).join(" — "), href: `/garage/contrats/${c.id}`, at: c.endDate }));
    }
    case "openClaims": {
      const rows = await prisma.customerClaim.findMany({
        where: { status: { not: "RESOLVED" } },
        select: { id: true, number: true, name: true, plate: true, message: true, createdAt: true, workOrder: { select: woSelect } },
        orderBy: { createdAt: "asc" },
        take,
      });
      return rows.map((c) => ({
        id: c.id,
        title: `REC-${String(c.number).padStart(4, "0")} · ${c.name}`,
        sub: c.message.slice(0, 100),
        href: "/garage/reclamations",
        at: c.createdAt,
        ...(c.workOrder
          ? { car: { plate: c.workOrder.vehicle.plate, vehicle: `${c.workOrder.vehicle.make} ${c.workOrder.vehicle.model}`, customer: c.name, ref: woNumber(c.workOrder.number) } }
          : c.plate
            ? { car: { plate: c.plate, vehicle: "", customer: c.name, ref: null } }
            : {}),
        figure: { kind: "days" as const, days: daysSince(c.createdAt, now) },
      }));
    }
    case "lowRatings": {
      // V16 Lot 5 — low ratings to follow up.
      const rows = await prisma.customerFeedback.findMany({ where: lowRatingsWhere(now), select: { id: true, rating: true, comment: true, name: true, createdAt: true }, orderBy: { createdAt: "asc" }, take });
      return rows.map((f) => ({ id: f.id, title: `${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)} ${f.name ?? ""}`.trim(), sub: f.comment?.slice(0, 80) ?? null, href: "/garage/reclamations", at: f.createdAt }));
    }
    case "unreadMessages": {
      const { conversationScope } = await import("@/server/messaging");
      const actor = typeof who === "string" ? null : (who as { id?: string; role: string });
      if (!actor?.id) return null;
      const rows = await prisma.conversation.findMany({
        where: { ...conversationScope(actor as never), messages: { some: { authorKind: "BUYER", readByStaffAt: null } } },
        select: { id: true, buyerName: true, lastMessageAt: true, listing: { select: { make: true, model: true, year: true, plate: true } }, _count: { select: { messages: { where: { authorKind: "BUYER", readByStaffAt: null } } } } },
        orderBy: { lastMessageAt: "desc" },
        take,
      });
      return rows.map((c) => ({
        id: c.id,
        title: c.buyerName,
        sub: c.listing ? [c.listing.make, c.listing.model, c.listing.year].filter(Boolean).join(" ") : null,
        href: `/garage/messages/${c.id}`,
        at: c.lastMessageAt,
        figure: { kind: "unread" as const, n: c._count.messages },
      }));
    }
    case "warrantyOpen":
    case "warrantyDecisions": {
      const rows = await prisma.warrantyClaim.findMany({
        where: { status: key === "warrantyOpen" ? "OPEN" : "SUBMITTED" },
        select: { id: true, number: true, description: true, openedAt: true, warrantyId: true },
        orderBy: { openedAt: "asc" },
        take,
      });
      return rows.map((c) => ({ id: c.id, title: `GAR-${String(c.number).padStart(4, "0")}`, sub: c.description, href: `/garage/garanties/${c.warrantyId}`, at: c.openedAt }));
    }
    case "certificateFields": {
      const rows = await prisma.user.findMany({ where: TODO_WHERE.certificateFields, select: { id: true, name: true }, orderBy: { name: "asc" }, take });
      return rows.map((u) => ({ id: u.id, title: u.name, sub: null, href: `/garage/equipe/${u.id}`, at: null }));
    }
    case "lowStock": {
      const rows = await prisma.part.findMany({ where: { isActive: true, stockX100: { lte: prisma.part.fields.minStockX100 } }, select: { id: true, sku: true, name: true, stockX100: true, minStockX100: true }, orderBy: { name: "asc" }, take });
      return rows.map((p) => ({ id: p.id, title: p.name, sub: p.sku, href: "/garage/parts?low=1", at: null, figure: { kind: "text" as const, text: `${p.stockX100 / 100} / ${p.minStockX100 / 100}` } }));
    }
    case "agendaDue": {
      // Same rule as countDueSoon (agenda): proposed / validated, due within 30 days.
      const rows = await prisma.maintenanceForecast.findMany({
        where: { isCurrent: true, method: { not: "IMPOSSIBLE" }, status: { in: ["PROPOSED", "VALIDATED"] }, dueDate: { lte: new Date(now.getTime() + 30 * DAY) } },
        select: { id: true, dueDate: true, item: { select: { nameFr: true } }, vehicle: { select: { id: true, plate: true, make: true, model: true, customer: { select: { name: true } } } } },
        orderBy: { dueDate: "asc" },
        take,
      });
      return rows.map((f) => ({
        id: f.id,
        title: f.item.nameFr,
        sub: `${f.vehicle.make} ${f.vehicle.model} — ${f.vehicle.customer.name}`,
        href: `/garage/vehicules/${f.vehicle.id}/entretien`,
        at: f.dueDate,
        car: { plate: f.vehicle.plate, vehicle: `${f.vehicle.make} ${f.vehicle.model}`, customer: f.vehicle.customer.name, ref: null },
        figure: { kind: "text" as const, text: f.item.nameFr },
      }));
    }
    case "agendaParts": {
      const { partsToOrder } = await import("@/server/agenda");
      const rows = (await partsToOrder(now)).slice(0, take);
      return rows.map((p) => ({ id: p.id, title: p.name, sub: p.sku, href: "/garage/agenda?parts=1", at: null, figure: { kind: "text" as const, text: `${p.neededX100 / 100} / ${p.availableX100 / 100}` } }));
    }
    case "receptionWaiting": {
      const [{ countLongWaitsWhere }] = await Promise.all([import("@/server/accueil")]);
      const rows = await prisma.queueTicket.findMany({ where: await countLongWaitsWhere(now), select: { id: true, prefix: true, number: true, plate: true, takenAt: true }, orderBy: { takenAt: "asc" }, take });
      return rows.map((q) => ({
        id: q.id,
        title: `${q.prefix}-${q.number}`,
        sub: null,
        href: "/garage/accueil",
        at: q.takenAt,
        ...(q.plate ? { car: { plate: q.plate, vehicle: "", customer: null, ref: `${q.prefix}-${q.number}` } } : {}),
        figure: { kind: "minutes" as const, minutes: Math.floor((now.getTime() - q.takenAt.getTime()) / 60_000) },
      }));
    }
    case "skillCertificates": {
      const { expiringCertificates } = await import("@/server/skills");
      const rows = (await expiringCertificates(now)).slice(0, take);
      return rows.map((c) => ({ id: c.id, title: c.user.name, sub: c.type, href: `/garage/competences?f=certificats#certificats`, at: c.expiresOn, ...(c.expiresOn && c.expiresOn < now ? { tone: "danger" as const } : {}) }));
    }
    case "skillReviews": {
      const { SKILL_TODO_WHERE } = await import("@/server/skills");
      const rows = await prisma.skillReviewRequest.findMany({ where: SKILL_TODO_WHERE.reviews, select: { id: true, message: true, createdAt: true, user: { select: { name: true } }, skill: { select: { nameFr: true } } }, orderBy: { createdAt: "asc" }, take });
      return rows.map((r) => ({ id: r.id, title: r.user.name, sub: [r.skill?.nameFr, r.message].filter(Boolean).join(" — ") || null, href: "/garage/competences?f=reevaluations#reevaluations", at: r.createdAt }));
    }
    default:
      // "backup": a state of the backups, not a list of records.
      return null;
  }
}

/** Rows per key (null = no row list, the page shows the link only). Errors never break the page. */
export async function todoDetails(keys: TodoKey[], who: PermSubject, now = new Date(), take = OVERVIEW_ROWS) {
  const rows = await Promise.all(keys.map((k) => rowsFor(k, who, now, take).catch(() => null)));
  return Object.fromEntries(keys.map((k, i) => [k, rows[i]])) as Partial<Record<TodoKey, TodoRow[] | null>>;
}

/** All the records of ONE item (the page the bell's line opens). */
export async function todoDetail(key: TodoKey, who: PermSubject, now = new Date()) {
  return rowsFor(key, who, now, DETAIL_LIMIT);
}
