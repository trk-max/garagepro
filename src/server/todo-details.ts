import "server-only";
import { displayPlate, woNumber } from "@/lib/format";
import type { PermSubject } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { TodoKey } from "@/lib/todo";
import { missingVehicleInfo, type VehicleInfoField } from "@/lib/vehicle-info";
import { CONTRACT_TODO, TODO_WHERE } from "@/server/todo";

/**
 * V10.4 — first lines of each "À traiter" item for /garage/a-traiter (the bell shows
 * only the counts). Called with the keys the person may see AND that have a count, so
 * the permission filter is the one of src/server/todo.ts. Items without a natural row
 * (messages, complaints, backup, contracts ending) link to their page only.
 */
/** `missing`: vehicle fields still empty (vehicleInfo only), translated by the page. */
export type TodoRow = { id: string; title: string; sub: string | null; href: string; at: Date | null; missing?: VehicleInfoField[] };

const ROWS = 8;
const woRow = (w: { id: string; number: number; vehicle: { plate: string; make: string; model: string }; customer: { name: string } }, at: Date | null = null): TodoRow => ({
  id: w.id,
  title: `${woNumber(w.number)} · ${displayPlate(w.vehicle.plate)}`,
  sub: `${w.vehicle.make} ${w.vehicle.model} — ${w.customer.name}`,
  href: `/garage/work-orders/${w.id}`,
  at,
});
const woSelect = { id: true, number: true, updatedAt: true, vehicle: { select: { plate: true, make: true, model: true } }, customer: { select: { name: true } } } as const;

async function rowsFor(key: TodoKey, who: PermSubject, now: Date): Promise<TodoRow[] | null> {
  switch (key) {
    case "vehicleInfo": {
      const rows = await prisma.workOrder.findMany({
        where: TODO_WHERE.activeOrders,
        select: { ...woSelect, vehicle: { select: { plate: true, make: true, model: true, vin: true, year: true, fuel: true, color: true } } },
        orderBy: { createdAt: "asc" },
        take: 300,
      });
      return rows
        .map((w) => ({ w, missing: missingVehicleInfo(w.vehicle) }))
        .filter((x) => x.missing.length > 0)
        .slice(0, ROWS)
        .map(({ w, missing }) => ({ ...woRow(w), missing }));
    }
    case "quoteWaiting":
    case "readyNotDelivered":
    case "insuranceWaiting": {
      const where = key === "quoteWaiting" ? TODO_WHERE.quoteWaiting(now) : TODO_WHERE[key];
      const rows = await prisma.workOrder.findMany({ where, select: woSelect, orderBy: { updatedAt: "asc" }, take: ROWS });
      return rows.map((w) => woRow(w, w.updatedAt));
    }
    case "qualityChecks": {
      const rows = await prisma.qualityCheck.findMany({ where: TODO_WHERE.qualityChecks, select: { checkedAt: true, workOrder: { select: woSelect } }, orderBy: { checkedAt: "asc" }, take: ROWS });
      return rows.map((q) => woRow(q.workOrder, q.checkedAt));
    }
    case "missingParts": {
      const rows = await prisma.workOrderPartNeed.findMany({
        where: TODO_WHERE.missingParts,
        select: { id: true, description: true, status: true, expectedAt: true, workOrder: { select: { id: true, number: true, vehicle: { select: { plate: true } } } } },
        orderBy: [{ expectedAt: "asc" }],
        take: ROWS,
      });
      return rows.map((p) => ({ id: p.id, title: p.description, sub: `${woNumber(p.workOrder.number)} · ${displayPlate(p.workOrder.vehicle.plate)}`, href: `/garage/work-orders/${p.workOrder.id}`, at: p.expectedAt }));
    }
    case "leaves": {
      const rows = await prisma.leaveRequest.findMany({ where: { status: "PENDING" }, select: { id: true, startAt: true, user: { select: { id: true, name: true } } }, orderBy: { startAt: "asc" }, take: ROWS });
      return rows.map((r) => ({ id: r.id, title: r.user.name, sub: null, href: "/garage/equipe", at: r.startAt }));
    }
    case "purchaseOrders": {
      const rows = await prisma.purchaseOrder.findMany({ where: { status: "PENDING_APPROVAL" }, select: { id: true, number: true, createdAt: true, supplier: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: ROWS });
      return rows.map((p) => ({ id: p.id, title: p.number, sub: p.supplier.name, href: `/garage/purchase-orders/${p.id}`, at: p.createdAt }));
    }
    case "contractDrafts":
    case "contractsToApprove":
    case "contractsToSign": {
      const [access, status] = CONTRACT_TODO[key];
      const rows = await prisma.contract.findMany({ where: TODO_WHERE.contracts(who, access, [...status]), select: { id: true, number: true, title: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: ROWS });
      return rows.map((c) => ({ id: c.id, title: c.number, sub: c.title, href: `/garage/contrats/${c.id}`, at: c.updatedAt }));
    }
    case "warrantyOpen":
    case "warrantyDecisions": {
      const rows = await prisma.warrantyClaim.findMany({
        where: { status: key === "warrantyOpen" ? "OPEN" : "SUBMITTED" },
        select: { id: true, number: true, description: true, openedAt: true, warrantyId: true },
        orderBy: { openedAt: "asc" },
        take: ROWS,
      });
      return rows.map((c) => ({ id: c.id, title: `GAR-${String(c.number).padStart(4, "0")}`, sub: c.description, href: `/garage/garanties/${c.warrantyId}`, at: c.openedAt }));
    }
    case "certificateFields": {
      const rows = await prisma.user.findMany({ where: TODO_WHERE.certificateFields, select: { id: true, name: true }, orderBy: { name: "asc" }, take: ROWS });
      return rows.map((u) => ({ id: u.id, title: u.name, sub: null, href: `/garage/equipe/${u.id}`, at: null }));
    }
    case "overdueInvoices": {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const rows = await prisma.invoice.findMany({
        where: { status: { in: ["ISSUED", "PARTIAL"] }, OR: [{ dueDate: { lt: today } }, { dueDate: null, issuedAt: { lt: today } }] },
        select: { id: true, number: true, dueDate: true, issuedAt: true, customer: { select: { name: true } } },
        orderBy: { issuedAt: "asc" },
        take: ROWS,
      });
      return rows.map((i) => ({ id: i.id, title: i.number, sub: i.customer.name, href: `/garage/invoices/${i.id}`, at: i.dueDate ?? i.issuedAt }));
    }
    case "lowStock": {
      const rows = await prisma.part.findMany({ where: { isActive: true, stockX100: { lte: prisma.part.fields.minStockX100 } }, select: { id: true, sku: true, name: true }, orderBy: { name: "asc" }, take: ROWS });
      return rows.map((p) => ({ id: p.id, title: p.name, sub: p.sku, href: "/garage/parts?low=1", at: null }));
    }
    default:
      return null;
  }
}

/** Rows per key (null = no row list, the page shows the link only). Errors never break the page. */
export async function todoDetails(keys: TodoKey[], who: PermSubject, now = new Date()) {
  const rows = await Promise.all(keys.map((k) => rowsFor(k, who, now).catch(() => null)));
  return Object.fromEntries(keys.map((k, i) => [k, rows[i]])) as Partial<Record<TodoKey, TodoRow[] | null>>;
}
