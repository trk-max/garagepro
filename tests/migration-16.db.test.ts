/**
 * V9.0 — migration 16 (roles HR / ACCOUNTANT, contracts): replaying it on a database that already
 * holds contracts changes nothing (idempotent, additive), the hub's change log covers the new
 * tables, and the contract history stays append-only. Real PostgreSQL. Run: npm run test:db
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { describe, expect, inject, it } from "vitest";
import { templateId } from "@/lib/contracts";
import { createContract } from "@/server/contracts";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

const SQL = readFileSync(path.resolve(import.meta.dirname, "../prisma/migrations/16_contracts/migration.sql"), "utf8");
const NEW_TABLES = ["Contract", "ContractEvent", "ContractTemplate", "ContractVehicle"];

describe("Migration 16 — rôles RH / comptable et contrats", () => {
  it("replayed on a database with contracts: nothing lost, nothing changed; hub log on the new tables", async () => {
    const reception = await makeUser("RECEPTION");
    const hr = await makeUser("HR");
    const accountant = await makeUser("ACCOUNTANT");
    const { wo } = await makeWorkOrder();
    const c = await createContract(reception, { templateId: templateId("REPAIR", 1), workOrderId: wo.id, startDay: "2026-10-21", fields: {} });
    await prisma.setting.upsert({ where: { id: "garage" }, update: { contractAlertDays: 45 }, create: { id: "garage", contractAlertDays: 45 } });
    const counts = () => Promise.all([prisma.contract.count(), prisma.contractEvent.count(), prisma.contractTemplate.count(), prisma.contractVehicle.count(), prisma.user.count()]);
    const before = await counts();

    const db = new pg.Client({ connectionString: inject("dbUrl") });
    await db.connect();
    try {
      await db.query(SQL);
      await db.query(SQL);
      const hubLog = await db.query(`SELECT to_regprocedure('"_sync_log_change"()') IS NOT NULL AS present`);
      if (hubLog.rows[0]?.present) {
        const triggers = await db.query<{ tbl: string }>(
          `SELECT c.relname AS tbl FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname = '_sync_log_trg' AND c.relname = ANY($1)`,
          [NEW_TABLES],
        );
        expect(triggers.rows.map((r) => r.tbl).sort()).toEqual([...NEW_TABLES].sort());
      }
      // History lines: no change, no deletion outside the hub's own copy.
      await expect(db.query(`DELETE FROM "ContractEvent" WHERE "contractId" = $1`, [c.id])).rejects.toThrow(/append-only/);
    } finally {
      await db.end();
    }

    expect(await counts()).toEqual(before);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: hr.id } })).role).toBe("HR");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: accountant.id } })).role).toBe("ACCOUNTANT");
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ number: c.number, status: "DRAFT", workOrderId: wo.id });
    expect((await prisma.setting.findUniqueOrThrow({ where: { id: "garage" } })).contractAlertDays).toBe(45);
    await prisma.setting.update({ where: { id: "garage" }, data: { contractAlertDays: 30 } });
  });
});
