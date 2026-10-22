/**
 * « À traiter » shows the cars + partly paid invoices with the next payment date, on a real (throw-away) PostgreSQL:
 * each item's page lists EXACTLY the records it counts (car, plate, number, key figure); deliveredUnpaid = delivered
 * with an invoice not settled; a promise is recorded, journalised, append-only; a missed promise alerts again (red),
 * a payment clears it (settled) or sends the invoice back to wait for the next promise; amount > balance refused;
 * a mechanic cannot record a promise.
 * Run: npm run test:db
 */
import { beforeAll, describe, expect, it } from "vitest";
import { recordPayment } from "@/server/invoices";
import { paymentFollowUps, recordPaymentPromise } from "@/server/payment-promises";
import { todoCounts } from "@/server/todo";
import { todoDetail } from "@/server/todo-details";
import { groupTodos, todoKeysFor, type TodoKey } from "@/lib/todo";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

type Actor = Awaited<ReturnType<typeof makeUser>>;
const DAY = 86_400_000;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string; message?: string }) => e.code ?? String(e.message ?? e));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
let n = 0;

let admin: Actor, manager: Actor, mech: Actor, rec: Actor;
beforeAll(async () => {
  await prisma.setting.upsert({ where: { id: "garage" }, update: {}, create: { id: "garage" } });
  [admin, manager, mech, rec] = await Promise.all([makeUser("ADMIN"), makeUser("MANAGER"), makeUser("MECHANIC"), makeUser("RECEPTION")]);
});

/** A delivered V16 order with an issued invoice (total 300 DT, `paid` already paid, due in `dueInDays`). */
async function invoiced(opts: { paid?: number; dueInDays?: number; status?: string } = {}) {
  const { wo, customer, vehicle } = await makeWorkOrder({ status: opts.status ?? "DELIVERED" });
  await prisma.workOrder.update({ where: { id: wo.id }, data: { workflowV16: true } });
  const paid = opts.paid ?? 0;
  const invoice = await prisma.invoice.create({
    data: {
      number: `FTP-${Date.now()}-${n++}`,
      workOrderId: wo.id,
      customerId: customer.id,
      totalHt: 250_000,
      totalTax: 49_000,
      stampDuty: 1000,
      totalTtc: 300_000,
      paidAmount: paid,
      status: paid > 0 ? "PARTIAL" : "ISSUED",
      issuedAt: new Date(Date.now() - 40 * DAY),
      dueDate: new Date(Date.now() + (opts.dueInDays ?? 10) * DAY),
      snapshot: {},
    },
  });
  if (paid > 0) await prisma.payment.create({ data: { invoiceId: invoice.id, amount: paid, method: "CASH", paidAt: new Date(Date.now() - 30 * DAY) } });
  return { wo, invoice, vehicle, customer };
}

const keyOf = async (invoiceId: string) => (await paymentFollowUps(new Date())).find((r) => r.id === invoiceId)?.key ?? null;

describe("À traiter → exactly the records (cars)", () => {
  it("each item's page lists exactly what it counts (same where clauses), with the car on car rows", async () => {
    // Some data in several lists.
    await invoiced({ paid: 100_000 });
    await invoiced({ dueInDays: -5 });
    await makeWorkOrder({ status: "READY" });
    const late = await makeWorkOrder({ status: "IN_PROGRESS" });
    await prisma.workOrder.update({ where: { id: late.wo.id }, data: { promisedAt: new Date(Date.now() - 3 * DAY) } });
    const actor = { ...admin, perms: { grant: [], deny: [] } };
    const counts = await todoCounts(actor as never);
    // unreadMessages counts messages, its page lists conversations; backup is a state (no records).
    const keys = todoKeysFor("ADMIN").filter((k) => k !== "unreadMessages" && k !== "backup");
    for (const k of keys as TodoKey[]) {
      const rows = await todoDetail(k, actor as never);
      expect(rows, k).not.toBeNull();
      expect(rows!.length, k).toBe(Math.min(counts[k] ?? 0, 200));
    }
    const ready = await todoDetail("readyNotDelivered", actor as never);
    expect(ready!.every((r) => r.car && r.car.plate && r.car.ref && r.href.startsWith("/garage/work-orders/"))).toBe(true);
    const lateRows = await todoDetail("lateRepairs", actor as never);
    const mine = lateRows!.find((r) => r.id === late.wo.id);
    expect(mine?.car?.plate).toBe(late.vehicle.plate);
    expect(mine?.figure).toEqual({ kind: "late", days: 3 });
    // The bell's lines open these pages.
    expect(groupTodos(counts, actor as never).incomplete.find((i) => i.key === "readyNotDelivered")?.target).toBe("/garage/a-traiter/readyNotDelivered");
  });

  it("deliveredUnpaid = delivered and invoice not settled (no invoice yet, or money due); a settled one never shows", async () => {
    const due = await invoiced({ paid: 100_000 });
    const settled = await invoiced({ paid: 0 });
    await prisma.invoice.update({ where: { id: settled.invoice.id }, data: { paidAmount: 300_000, status: "PAID" } });
    const noInvoice = await makeWorkOrder({ status: "DELIVERED" });
    await prisma.workOrder.update({ where: { id: noInvoice.wo.id }, data: { workflowV16: true } });
    const rows = (await todoDetail("deliveredUnpaid", "ADMIN"))!;
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(due.wo.id);
    expect(ids).toContain(noInvoice.wo.id);
    expect(ids).not.toContain(settled.wo.id);
    expect(rows.find((r) => r.id === due.wo.id)?.figure).toEqual({ kind: "money", amount: 200_000 });
    expect(rows.find((r) => r.id === noInvoice.wo.id)?.figure).toEqual({ kind: "noInvoice" });
  });

  it("a payment that settles a delivered order closes it (CLOSED): it leaves deliveredUnpaid", async () => {
    const { wo, invoice } = await invoiced({ paid: 100_000 });
    await recordPayment(invoice.id, { amount: 200_000, method: "CASH" }, rec as never);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).status).toBe("CLOSED");
    expect((await todoDetail("deliveredUnpaid", "ADMIN"))!.map((r) => r.id)).not.toContain(wo.id);
  });
});

describe("Paiements partiels — date du prochain paiement", () => {
  it("partly paid invoice → partialPayments with total / paid / balance / due date; an unpaid late one → overdueInvoices; never both", async () => {
    const partial = await invoiced({ paid: 100_000 });
    const late = await invoiced({ dueInDays: -5 });
    expect(await keyOf(partial.invoice.id)).toBe("partialPayments");
    expect(await keyOf(late.invoice.id)).toBe("overdueInvoices");
    const rows = (await todoDetail("partialPayments", "ADMIN"))!;
    const r = rows.find((x) => x.id === partial.invoice.id)!;
    expect(r.car?.plate).toBe(partial.vehicle.plate);
    expect(r.invoice).toMatchObject({ total: 300_000, paid: 100_000, balance: 200_000, next: null });
    expect((await todoDetail("overdueInvoices", "ADMIN"))!.map((x) => x.id)).not.toContain(partial.invoice.id);
  });

  it("a promise is recorded (latest counts), journalised in the same transaction, and append-only", async () => {
    const { invoice } = await invoiced({ paid: 100_000 });
    const d1 = isoDay(new Date(Date.now() + 5 * DAY));
    const d2 = isoDay(new Date(Date.now() + 9 * DAY));
    const p1 = await recordPaymentPromise(invoice.id, { day: d1, amount: 50_000, note: "Salaire" }, rec as never);
    const p2 = await recordPaymentPromise(invoice.id, { day: d2, amount: null, note: null }, manager as never);
    const rows = await prisma.paymentPromise.findMany({ where: { invoiceId: invoice.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [isoDay(r.promisedAt), r.amount])).toEqual([[d1, 50_000], [d2, null]]);
    const log = await prisma.auditLog.findMany({ where: { entity: "PaymentPromise", entityId: { in: [p1.id, p2.id] } } });
    expect(log.map((l) => l.action)).toEqual(["payment.promise", "payment.promise"]);
    // The next payment shown is the LATEST promise.
    const row = (await todoDetail("partialPayments", "ADMIN"))!.find((x) => x.id === invoice.id)!;
    expect(isoDay(row.invoice!.next!.at)).toBe(d2);
    expect(row.invoice!.next!.overdue).toBe(false);
    // Never changed nor deleted afterwards (the hub synchronisation alone may).
    await expect(prisma.$executeRawUnsafe(`UPDATE "PaymentPromise" SET amount = 1 WHERE id = '${p1.id}'`)).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "PaymentPromise" WHERE id = '${p1.id}'`)).rejects.toThrow(/append-only/);
    // The order's history says it too.
    expect(await prisma.workOrderEvent.count({ where: { workOrderId: invoice.workOrderId, type: "NOTE" } })).toBeGreaterThanOrEqual(2);
  });

  it("checks: past date, amount over the balance, settled invoice, mechanic → refused", async () => {
    const { invoice } = await invoiced({ paid: 100_000 });
    const next = isoDay(new Date(Date.now() + 3 * DAY));
    expect(await code(recordPaymentPromise(invoice.id, { day: isoDay(new Date(Date.now() - DAY)), amount: null, note: null }, rec as never))).toBe("promiseDate");
    expect(await code(recordPaymentPromise(invoice.id, { day: next, amount: 200_001, note: null }, rec as never))).toBe("promiseAmount");
    expect(await code(recordPaymentPromise(invoice.id, { day: next, amount: 200_000, note: null }, rec as never))).toBe("ok");
    expect(await code(recordPaymentPromise(invoice.id, { day: next, amount: null, note: null }, mech as never))).toBe("forbidden");
    const paid = await invoiced({ paid: 0 });
    await prisma.invoice.update({ where: { id: paid.invoice.id }, data: { paidAmount: 300_000, status: "PAID" } });
    expect(await code(recordPaymentPromise(paid.invoice.id, { day: next, amount: null, note: null }, rec as never))).toBe("promiseSettled");
    expect(await prisma.paymentPromise.count({ where: { recordedById: mech.id } })).toBe(0);
  });

  it("a missed promise alerts again (red, « Relancer le client »), in the counts and the bell; a payment clears it", async () => {
    const { invoice } = await invoiced({ paid: 100_000, dueInDays: -2 });
    // Promised 2 days ago (recorded a week ago), nothing paid since.
    await prisma.paymentPromise.create({ data: { invoiceId: invoice.id, workOrderId: invoice.workOrderId, promisedAt: new Date(Date.now() - 2 * DAY), amount: 80_000, createdAt: new Date(Date.now() - 7 * DAY) } });
    expect(await keyOf(invoice.id)).toBe("paymentPromisesDue");
    const actor = { ...manager, perms: { grant: [], deny: [] } };
    const counts = await todoCounts(actor as never);
    expect(counts.paymentPromisesDue).toBeGreaterThanOrEqual(1);
    const item = groupTodos(counts, actor as never).incomplete.find((i) => i.key === "paymentPromisesDue")!;
    expect(item.tone).toBe("danger");
    const row = (await todoDetail("paymentPromisesDue", actor as never))!.find((x) => x.id === invoice.id)!;
    expect(row.tone).toBe("danger");
    expect(row.invoice!.next).toMatchObject({ amount: 80_000, overdue: true });
    expect(row.remindHref).toBe(`/garage/invoices/${invoice.id}#relance`);
    // Not listed twice (it is past its due date too).
    expect((await todoDetail("overdueInvoices", "ADMIN"))!.map((x) => x.id)).not.toContain(invoice.id);

    // The promised amount is paid: the alert clears, the invoice waits for the next promise (still late → overdue).
    await recordPayment(invoice.id, { amount: 80_000, method: "CASH" }, rec as never);
    expect(await keyOf(invoice.id)).toBe("overdueInvoices");
    // A new promise puts it back to « waiting » with its date.
    await recordPaymentPromise(invoice.id, { day: isoDay(new Date(Date.now() + 4 * DAY)), amount: null, note: null }, rec as never);
    expect(await keyOf(invoice.id)).toBe("partialPayments");
    // The rest is paid: settled, it leaves every list.
    await recordPayment(invoice.id, { amount: 120_000, method: "CARD" }, rec as never);
    expect(await keyOf(invoice.id)).toBeNull();
  });
});
