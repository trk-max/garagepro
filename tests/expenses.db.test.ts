/**
 * Prompt 4/5 — fixed costs and due dates: lazy, idempotent generation, payments, permissions.
 * Real PostgreSQL. Run: npm run test:db
 */
import { describe, expect, it } from "vitest";
import { dbDay } from "@/lib/expense-schedule";
import { cancelOccurrencePayment, createExpense, ensureOccurrences, expensesOverview, payOccurrence, setExpenseActive, updateExpense } from "@/server/expenses";
import { makeUser, prisma } from "./helpers/db";

describe("Dépenses et échéances", () => {
  it("mechanics and reception cannot see or change the garage's costs", async () => {
    for (const role of ["MECHANIC", "RECEPTION", "STOREKEEPER"] as const) {
      const u = await makeUser(role);
      await expect(createExpense(u, { label: "Loyer", category: "RENT", amount: 1_000_000, frequency: "MONTHLY", firstDueDate: "2026-11-01" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(expensesOverview(u)).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("due dates are created once, whatever the number of calls", async () => {
    const manager = await makeUser("MANAGER");
    const e = await createExpense(manager, { label: "Loyer test", category: "RENT", amount: 1_200_000, frequency: "MONTHLY", firstDueDate: "2026-01-31", endDate: "2026-06-30" });
    await ensureOccurrences("2026-04-30");
    await ensureOccurrences("2026-04-30");
    await ensureOccurrences("2026-12-31");
    await Promise.all([ensureOccurrences("2026-12-31"), ensureOccurrences("2026-12-31")]);
    const rows = await prisma.expenseOccurrence.findMany({ where: { expenseId: e.id }, orderBy: { dueDate: "asc" } });
    expect(rows.map((r) => dbDay(r.dueDate))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]);
    expect(rows.every((r) => r.amount === 1_200_000)).toBe(true);
  });

  it("end date before the first due date is refused", async () => {
    const manager = await makeUser("MANAGER");
    await expect(createExpense(manager, { label: "X", category: "OTHER", amount: 1000, frequency: "MONTHLY", firstDueDate: "2026-05-01", endDate: "2026-04-01" })).rejects.toMatchObject({ code: "expenseDates" });
  });

  it("paying: once only, can be cancelled with a reason; a new amount changes unpaid future due dates only", async () => {
    const admin = await makeUser("ADMIN");
    const e = await createExpense(admin, { label: "Électricité test", category: "UTILITIES", amount: 300_000, frequency: "MONTHLY", firstDueDate: "2026-09-15" });
    await ensureOccurrences("2026-12-31");
    const occ = await prisma.expenseOccurrence.findMany({ where: { expenseId: e.id }, orderBy: { dueDate: "asc" } });
    expect(occ.map((o) => dbDay(o.dueDate))).toEqual(["2026-09-15", "2026-10-15", "2026-11-15", "2026-12-15"]);

    await payOccurrence(admin, occ[0]!.id, { paidDay: "2026-09-16", paidAmount: 287_500, method: "TRANSFER" });
    await expect(payOccurrence(admin, occ[0]!.id, { paidDay: "2026-09-16", paidAmount: 287_500, method: "TRANSFER" })).rejects.toMatchObject({ code: "occurrencePaid" });

    // "Today" = 2026-10-21: the 15 Oct due date (unpaid, past) keeps its amount, Nov/Dec change.
    await updateExpense(admin, e.id, { label: "Électricité test", category: "UTILITIES", amount: 350_000 }, new Date("2026-10-21T09:00:00Z"));
    const after = await prisma.expenseOccurrence.findMany({ where: { expenseId: e.id }, orderBy: { dueDate: "asc" } });
    expect(after.map((o) => o.amount)).toEqual([300_000, 300_000, 350_000, 350_000]);
    expect(after[0]!.paidAmount).toBe(287_500);

    await cancelOccurrencePayment(admin, occ[0]!.id, "mauvaise échéance");
    const back = await prisma.expenseOccurrence.findUniqueOrThrow({ where: { id: occ[0]!.id } });
    expect(back).toMatchObject({ paidAt: null, paidAmount: null, method: null });
    const actions = (await prisma.auditLog.findMany({ where: { OR: [{ entityId: e.id }, { entityId: occ[0]!.id }] }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(actions).toEqual(["fixedCost.create", "fixedCost.pay", "fixedCost.update", "fixedCost.unpay"]);
  });

  it("a stopped cost is no longer to pay (its rows are kept)", async () => {
    const admin = await makeUser("ADMIN");
    const e = await createExpense(admin, { label: "Abonnement arrêté", category: "OTHER", amount: 50_000, frequency: "MONTHLY", firstDueDate: "2026-10-01" });
    const before = await expensesOverview(admin, 90, new Date("2026-10-21T09:00:00Z"));
    expect(before.toPay.some((o) => o.expenseId === e.id)).toBe(true);
    await setExpenseActive(admin, e.id, false);
    const after = await expensesOverview(admin, 90, new Date("2026-10-21T09:00:00Z"));
    expect(after.toPay.some((o) => o.expenseId === e.id)).toBe(false);
    expect(await prisma.expenseOccurrence.count({ where: { expenseId: e.id } })).toBeGreaterThan(0);
  });
});
