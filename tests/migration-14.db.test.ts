/**
 * Prompt 4/5 — migration 14 (warranties, expenses, cash): replaying it on a database that already
 * holds data changes nothing (idempotent, additive), and the hub's change log covers the new tables.
 * Real PostgreSQL. Run: npm run test:db
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { describe, expect, inject, it } from "vitest";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

const SQL = readFileSync(path.resolve(import.meta.dirname, "../prisma/migrations/14_warranties_cash/migration.sql"), "utf8");
const NEW_TABLES = ["Warranty", "WarrantyClaim", "WarrantyRefund", "RecurringExpense", "ExpenseOccurrence", "CashBalance"];

describe("Migration 14 — garanties et trésorerie", () => {
  it("replayed on a database with data: nothing lost, nothing changed", async () => {
    const admin = await makeUser("ADMIN");
    const { wo, vehicle, customer } = await makeWorkOrder();
    await prisma.setting.upsert({ where: { id: "garage" }, update: { warrantyMonths: 7, cashAlertThreshold: 123_000, cashAlertScenario: "OPTIMISTIC" }, create: { id: "garage", warrantyMonths: 7, cashAlertThreshold: 123_000, cashAlertScenario: "OPTIMISTIC" } });
    const w = await prisma.warranty.create({ data: { kind: "REPAIR", workOrderId: wo.id, vehicleId: vehicle.id, customerId: customer.id, label: "Avant migration", startsAt: new Date(), createdById: admin.id } });
    const claim = await prisma.warrantyClaim.create({ data: { warrantyId: w.id, description: "test" } });
    const e = await prisma.recurringExpense.create({ data: { label: "Loyer", category: "RENT", amount: 1000, frequency: "MONTHLY", firstDueDate: new Date("2026-01-01T00:00:00Z") } });
    await prisma.cashBalance.create({ data: { amount: -5000, asOf: new Date("2026-10-01T00:00:00Z") } });
    const counts = async () => Promise.all([prisma.warranty.count(), prisma.warrantyClaim.count(), prisma.recurringExpense.count(), prisma.cashBalance.count(), prisma.workOrder.count()]);
    const before = await counts();

    const db = new pg.Client({ connectionString: inject("dbUrl") });
    await db.connect();
    try {
      await db.query(SQL);
      await db.query(SQL);
      const triggers = await db.query<{ tbl: string }>(
        `SELECT c.relname AS tbl FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname = '_sync_log_trg' AND c.relname = ANY($1)`,
        [NEW_TABLES],
      );
      const hubLog = await db.query(`SELECT to_regprocedure('"_sync_log_change"()') IS NOT NULL AS present`);
      if (hubLog.rows[0]?.present) expect(triggers.rows.map((r) => r.tbl).sort()).toEqual([...NEW_TABLES].sort());
    } finally {
      await db.end();
    }

    expect(await counts()).toEqual(before);
    expect(await prisma.warranty.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ label: "Avant migration", workOrderId: wo.id });
    expect(await prisma.warrantyClaim.findUniqueOrThrow({ where: { id: claim.id } })).toMatchObject({ number: claim.number, status: "OPEN" });
    expect((await prisma.recurringExpense.findUniqueOrThrow({ where: { id: e.id } })).amount).toBe(1000);
    expect(await prisma.setting.findUniqueOrThrow({ where: { id: "garage" } })).toMatchObject({ warrantyMonths: 7, cashAlertThreshold: 123_000, cashAlertScenario: "OPTIMISTIC" });
    // The claim numbering keeps going after a replay (sequence not reset).
    const next = await prisma.warrantyClaim.create({ data: { warrantyId: w.id, description: "après" } });
    expect(next.number).toBeGreaterThan(claim.number);
    await prisma.setting.update({ where: { id: "garage" }, data: { warrantyMonths: 0, cashAlertThreshold: 0, cashAlertScenario: "PRUDENT" } });
  });

  it("new settings default to OFF (no automatic warranty, no cash alert)", async () => {
    const db = new pg.Client({ connectionString: inject("dbUrl") });
    await db.connect();
    try {
      const r = await db.query<{ column_name: string; column_default: string }>(
        `SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'Setting' AND column_name IN ('warrantyMonths','warrantyKm','cashAlertThreshold','cashAlertScenario') ORDER BY column_name`,
      );
      expect(Object.fromEntries(r.rows.map((x) => [x.column_name, x.column_default]))).toEqual({
        cashAlertScenario: "'PRUDENT'::text",
        cashAlertThreshold: "0",
        warrantyKm: "0",
        warrantyMonths: "0",
      });
    } finally {
      await db.end();
    }
  });
});
