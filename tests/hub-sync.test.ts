/**
 * Real-database test of the garage hub synchronisation (two PostgreSQL databases:
 * "garage" and "online"). Skipped unless TEST_PG_URL points to a throw-away
 * PostgreSQL server where the test may create and drop databases, e.g.
 *   TEST_PG_URL="postgresql://postgres@localhost:5432/postgres" npm run test:hub
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JS script without types
import { installHub } from "../scripts/hub/init.mjs";
// @ts-expect-error plain JS script without types
import { syncOnce, topoOrder } from "../scripts/hub/sync-engine.mjs";
// @ts-expect-error plain JS script without types
import { syncMedia } from "../scripts/hub/media-sync.mjs";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import { vi } from "vitest";

const BASE = process.env.TEST_PG_URL;
/** Names of the throw-away databases: TEST_HUB_DB_PREFIX lets two working copies run this test on one server at once. */
const HUB = /^gp_[a-z0-9_]{1,30}$/.test(process.env.TEST_HUB_DB_PREFIX ?? "") ? process.env.TEST_HUB_DB_PREFIX! : "gp_hub";
const MIGRATIONS = path.join(import.meta.dirname, "../prisma/migrations");
const migrationSql = (name: string) => readFileSync(path.join(MIGRATIONS, name, "migration.sql"), "utf8");
const allMigrations = readdirSync(MIGRATIONS).filter((d) => /^\d+_/.test(d)).sort((a, b) => parseInt(a) - parseInt(b));

function urlFor(db: string) {
  const u = new URL(BASE!);
  u.pathname = `/${db}`;
  return u.toString();
}

async function freshDb(admin: pg.Client, name: string, migrations: string[]) {
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  const c = new pg.Client({ connectionString: urlFor(name) });
  await c.connect();
  for (const m of migrations) await c.query(migrationSql(m));
  return c;
}

const one = async (db: pg.Client, sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
const NOW = "now()";

async function addCustomer(db: pg.Client, id: string, name: string, phone = "20111222") {
  await db.query(`INSERT INTO "Customer"(id, name, phone, "updatedAt") VALUES ($1, $2, $3, ${NOW})`, [id, name, phone]);
}
async function addVehicle(db: pg.Client, id: string, plate: string, customerId: string) {
  await db.query(`INSERT INTO "Vehicle"(id, plate, make, model, "customerId", "updatedAt") VALUES ($1, $2, 'Peugeot', '208', $3, ${NOW})`, [id, plate, customerId]);
}
async function addWorkOrder(db: pg.Client, id: string, customerId: string, vehicleId: string) {
  return (await one(db, `INSERT INTO "WorkOrder"(id, complaint, "customerId", "vehicleId", "updatedAt") VALUES ($1, 'Freins', $2, $3, ${NOW}) RETURNING number`, [id, customerId, vehicleId])).number as number;
}

describe("topoOrder (no database)", () => {
  it("puts parents before children and keeps cycles", () => {
    const order = topoOrder(["WorkOrder", "Vehicle", "Customer", "A", "B"], [
      { child: "WorkOrder", parent: "Vehicle" },
      { child: "WorkOrder", parent: "Customer" },
      { child: "Vehicle", parent: "Customer" },
      { child: "A", parent: "B" },
      { child: "B", parent: "A" },
    ]);
    expect(order.indexOf("Customer")).toBeLessThan(order.indexOf("Vehicle"));
    expect(order.indexOf("Vehicle")).toBeLessThan(order.indexOf("WorkOrder"));
    expect(order).toHaveLength(5);
  });
});

describe.skipIf(!BASE)("garage hub ↔ online database", () => {
  let admin: pg.Client;
  let local: pg.Client;
  let cloud: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: BASE });
    await admin.connect();
    // Online = what Supabase has before the hub (no sync log yet); garage = all migrations.
    cloud = await freshDb(admin, `${HUB}_cloud`, allMigrations.filter((m) => !m.startsWith("3_")));
    local = await freshDb(admin, `${HUB}_local`, allMigrations);
    await cloud.query(`INSERT INTO "User"(id, email, name, "passwordHash", "updatedAt") VALUES ('u1', 'a@g.tn', 'Admin', 'x', now())`);
    await addCustomer(cloud, "c1", "Sami");
    await addVehicle(cloud, "v1", "100TU1000", "c1");
    await addWorkOrder(cloud, "w1", "c1", "v1");
  });

  afterAll(async () => {
    await local?.end();
    await cloud?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${HUB}_local WITH (FORCE)`);
    await admin?.query(`DROP DATABASE IF EXISTS ${HUB}_cloud WITH (FORCE)`);
    await admin?.end();
  });

  it("installation copies everything and splits the numbers (garage odd, online even)", async () => {
    const copied = await installHub(local, cloud);
    expect(copied.Customer).toBe(1);
    expect(copied.WorkOrder).toBe(1);
    expect((await one(local, `SELECT name FROM "Customer" WHERE id='c1'`)).name).toBe("Sami");
    // Copy is not logged locally, so nothing goes back online.
    expect(Number((await one(local, `SELECT count(*) FROM "_sync_log"`)).count)).toBe(0);
    await expect(installHub(local, cloud)).rejects.toThrow(/déjà/);
  });

  it("works offline on both sides, then merges everything when back online", async () => {
    // Garage, internet down: new customer + car + work order (parents and children together).
    await addCustomer(local, "c2", "Garage client");
    await addVehicle(local, "v2", "200TU2000", "c2");
    const nLocal = await addWorkOrder(local, "w2", "c2", "v2");
    // Meanwhile online: a customer booked from the website.
    await addCustomer(cloud, "c3", "Online client");
    await addVehicle(cloud, "v3", "300TU3000", "c3");
    const nCloud = await addWorkOrder(cloud, "w3", "c3", "v3");
    expect(nLocal % 2).toBe(1);
    expect(nCloud % 2).toBe(0);

    const report = await syncOnce(local, cloud);
    expect(report.errors).toEqual([]);
    expect(report.pushed).toBe(3);
    expect(report.pulled).toBe(3);
    for (const db of [local, cloud]) {
      expect(Number((await one(db, `SELECT count(*) FROM "WorkOrder"`)).count)).toBe(3);
      expect(Number((await one(db, `SELECT count(DISTINCT number) FROM "WorkOrder"`)).count)).toBe(3);
    }
    // No ping-pong: the next round has nothing to do.
    const again = await syncOnce(local, cloud);
    expect([again.pushed, again.pulled]).toEqual([0, 0]);
  });

  it("same row changed on both sides: the latest change wins", async () => {
    await cloud.query(`UPDATE "Customer" SET phone='99000000' WHERE id='c1'`);
    await new Promise((r) => setTimeout(r, 20));
    await local.query(`UPDATE "Customer" SET phone='55000000' WHERE id='c1'`);
    const r1 = await syncOnce(local, cloud);
    expect(r1.conflicts).toBe(1);
    for (const db of [local, cloud]) expect((await one(db, `SELECT phone FROM "Customer" WHERE id='c1'`)).phone).toBe("55000000");

    await local.query(`UPDATE "Customer" SET name='Old' WHERE id='c3'`);
    await new Promise((r) => setTimeout(r, 20));
    await cloud.query(`UPDATE "Customer" SET name='New' WHERE id='c3'`);
    await syncOnce(local, cloud);
    for (const db of [local, cloud]) expect((await one(db, `SELECT name FROM "Customer" WHERE id='c3'`)).name).toBe("New");
  });

  it("deletions travel too, children before parents", async () => {
    await cloud.query(`DELETE FROM "WorkOrder" WHERE id='w3'`);
    await cloud.query(`DELETE FROM "Vehicle" WHERE id='v3'`);
    await cloud.query(`DELETE FROM "Customer" WHERE id='c3'`);
    const r = await syncOnce(local, cloud);
    expect(r.errors).toEqual([]);
    expect(await one(local, `SELECT id FROM "Customer" WHERE id='c3'`)).toBeUndefined();
  });

  it("a row refused by the other side is reported and retried, never lost", async () => {
    // Same plate typed on both sides while disconnected (plate is unique).
    await addVehicle(local, "v4", "400TU4000", "c1");
    await addVehicle(cloud, "v5", "400TU4000", "c2");
    const r1 = await syncOnce(local, cloud);
    expect(r1.errors.length).toBe(2);
    expect(Number((await one(local, `SELECT count(*) FROM "_sync_log" WHERE row_id='v4'`)).count)).toBe(1);
    // Staff fixes it online (deletes the duplicate): the garage's car now goes through.
    await cloud.query(`DELETE FROM "Vehicle" WHERE id='v5'`);
    const r2 = await syncOnce(local, cloud);
    expect(r2.errors).toEqual([]);
    expect((await one(cloud, `SELECT id FROM "Vehicle" WHERE plate='400TU4000'`)).id).toBe("v4");
    expect(await one(local, `SELECT id FROM "Vehicle" WHERE id='v5'`)).toBeUndefined();
  });

  it("V7 tables travel too (journal is append-only but copied by the hub)", async () => {
    await local.query(`INSERT INTO "AuditLog"(id, "actorName", action, entity) VALUES ('a1', 'Admin', 'leave.approve', 'LeaveRequest')`);
    await local.query(`INSERT INTO "LeaveRequest"(id, "userId", type, "startAt", "endAt", "updatedAt") VALUES ('l1', 'u1', 'PAID_LEAVE', now(), now() + interval '1 day', now())`);
    const r = await syncOnce(local, cloud);
    expect(r.errors).toEqual([]);
    expect((await one(cloud, `SELECT action FROM "AuditLog" WHERE id='a1'`)).action).toBe("leave.approve");
    expect(Number((await one(cloud, `SELECT number FROM "LeaveRequest" WHERE id='l1'`)).number) % 2).toBe(1); // garage numbers are odd
    await expect(cloud.query(`DELETE FROM "AuditLog" WHERE id='a1'`)).rejects.toThrow(/append-only/);
  });

  it("V12 agenda tables travel too (catalogue, replacements, forecast versions, message link)", async () => {
    await local.query(`INSERT INTO "MaintenanceItem"(id, code, "nameFr", keywords, "intervalKm", "updatedAt") VALUES ('mi_oil', 'OIL', 'Vidange', '["vidange"]', 10000, now())`);
    await local.query(`INSERT INTO "MaintenanceEvent"(id, "dedupeKey", "vehicleId", "itemId", source, "doneAt", km, "updatedAt") VALUES ('me1', 'manual:x', 'v1', 'mi_oil', 'MANUAL', now(), 40000, now())`);
    await local.query(`INSERT INTO "MaintenanceForecast"(id, "vehicleId", "itemId", version, method, "dueKm", signature, status, "updatedAt") VALUES ('fc1', 'v1', 'mi_oil', 1, 'REFERENCE', 50000, 's1', 'VALIDATED', now())`);
    // Offline online: the website's copy marks it booked; the garage meanwhile writes version 2.
    const r1 = await syncOnce(local, cloud);
    expect(r1.errors).toEqual([]);
    expect((await one(cloud, `SELECT "dueKm", status FROM "MaintenanceForecast" WHERE id='fc1'`))).toEqual({ dueKm: 50000, status: "VALIDATED" });
    expect((await one(cloud, `SELECT km FROM "MaintenanceEvent" WHERE id='me1'`)).km).toBe(40000);
    await local.query(`UPDATE "MaintenanceForecast" SET "isCurrent"=false WHERE id='fc1'`);
    await local.query(`INSERT INTO "MaintenanceForecast"(id, "vehicleId", "itemId", version, "previousId", method, "dueKm", signature, "updatedAt") VALUES ('fc2', 'v1', 'mi_oil', 2, 'fc1', 'REFERENCE', 55000, 's2', now())`);
    await cloud.query(`INSERT INTO "Notification"(id, kind, channel, "dedupeKey", body, "forecastId") VALUES ('n1', 'AGENDA', 'SMS', 'agenda:v1:mi_oil:me1', 'x', 'fc1')`);
    const r2 = await syncOnce(local, cloud);
    expect(r2.errors).toEqual([]);
    for (const db of [local, cloud]) {
      expect(Number((await one(db, `SELECT count(*) FROM "MaintenanceForecast" WHERE "isCurrent"`)).count)).toBe(1);
      expect((await one(db, `SELECT "forecastId" FROM "Notification" WHERE id='n1'`)).forecastId).toBe("fc1");
    }
  });

  it("V14 skills tables travel too (catalogue, levels, append-only history, certificates, goals, reviews, supervisor)", async () => {
    await local.query(`INSERT INTO "User"(id, email, name, "passwordHash", "updatedAt") VALUES ('u14', 'u14@test.tn', 'Méca', 'x', now()) ON CONFLICT DO NOTHING`);
    await local.query(`INSERT INTO "Skill"(id, code, "nameFr", keywords, "habilitationRequired", "updatedAt") VALUES ('sk_HV', 'HV', 'Haute tension', '["hybride"]', true, now())`);
    await local.query(`INSERT INTO "EmployeeSkill"(id, "userId", "skillId", level, "updatedAt") VALUES ('es_1', 'u14', 'sk_HV', 'SUPERVISED', now())`);
    await local.query(`INSERT INTO "SkillLevelHistory"(id, "userId", "skillId", "toLevel", reason, "actorName") VALUES ('h1', 'u14', 'sk_HV', 'SUPERVISED', 'Formation', 'Chef')`);
    await local.query(`INSERT INTO "SkillCertificate"(id, "userId", "skillId", type, "expiresOn", "fileKey", "fileType", "updatedAt") VALUES ('c1', 'u14', 'sk_HV', 'B1VL', '2030-01-01', 'skills/u14/a.pdf', 'application/pdf', now())`);
    await local.query(`INSERT INTO "SkillGoal"(id, "userId", "skillId", kind, target, since, "updatedAt") VALUES ('g1', 'u14', 'sk_HV', 'SUPERVISED_NO_RETURN', 5, now(), now())`);
    await local.query(`INSERT INTO "SkillReviewRequest"(id, "userId", source, message, "updatedAt") VALUES ('r1', 'u14', 'EMPLOYEE', 'À revoir', now())`);
    await local.query(`UPDATE "WorkOrder" SET "supervisorId"='u14', "skillWarnings"='[{"code":"NEEDS_SUPERVISOR"}]' WHERE id='w1'`);
    const r1 = await syncOnce(local, cloud);
    expect(r1.errors).toEqual([]);
    expect((await one(cloud, `SELECT level FROM "EmployeeSkill" WHERE id='es_1'`)).level).toBe("SUPERVISED");
    expect((await one(cloud, `SELECT reason FROM "SkillLevelHistory" WHERE id='h1'`)).reason).toBe("Formation");
    expect((await one(cloud, `SELECT "fileKey" FROM "SkillCertificate" WHERE id='c1'`)).fileKey).toBe("skills/u14/a.pdf");
    expect(Number((await one(cloud, `SELECT count(*) FROM "SkillGoal" WHERE id='g1'`)).count)).toBe(1);
    expect((await one(cloud, `SELECT status FROM "SkillReviewRequest" WHERE id='r1'`)).status).toBe("OPEN");
    expect((await one(cloud, `SELECT "supervisorId", "skillWarnings" FROM "WorkOrder" WHERE id='w1'`))).toEqual({ supervisorId: "u14", skillWarnings: [{ code: "NEEDS_SUPERVISOR" }] });
    // A level changed online (same deterministic id) comes back to the garage; the history stays append-only.
    await cloud.query(`UPDATE "EmployeeSkill" SET level='AUTONOMOUS', "updatedAt"=now() WHERE id='es_1'`);
    await cloud.query(`INSERT INTO "SkillLevelHistory"(id, "userId", "skillId", "fromLevel", "toLevel", reason, "actorName") VALUES ('h2', 'u14', 'sk_HV', 'SUPERVISED', 'AUTONOMOUS', 'Évaluation', 'Admin')`);
    const r2 = await syncOnce(local, cloud);
    expect(r2.errors).toEqual([]);
    expect((await one(local, `SELECT level FROM "EmployeeSkill" WHERE id='es_1'`)).level).toBe("AUTONOMOUS");
    expect(Number((await one(local, `SELECT count(*) FROM "SkillLevelHistory" WHERE "userId"='u14'`)).count)).toBe(2);
    await expect(local.query(`UPDATE "SkillLevelHistory" SET reason='x' WHERE id='h1'`)).rejects.toThrow(/append-only/);
  });

  it("V15 reception queue travels too (tickets, devices, counters; odd / even daily counters never collide)", async () => {
    // Starting catalogue inserted by the migration on both sides with the same ids: no conflict.
    for (const db of [local, cloud]) expect(Number((await one(db, `SELECT count(*) FROM "QueueReason" WHERE id='qr_dropoff'`)).count)).toBe(1);
    // Garage (kiosk, offline from the internet): ticket A-1 (odd counter) and a device.
    await local.query(`INSERT INTO "Sequence"(key, value) VALUES ('queue:2026-10-22:A:odd', 1)`);
    await local.query(`INSERT INTO "QueueTicket"(id, day, prefix, number, "reasonId", "reasonKind", "trackToken", "updatedAt") VALUES ('qt1', '2026-10-22', 'A', 1, 'qr_dropoff', 'DROP_OFF', 'tok1tok1tok1tok1tok1tok1', now())`);
    await local.query(`INSERT INTO "QueueDevice"(id, name, kind, "tokenHash", "updatedAt") VALUES ('qd1', 'Tablette entrée', 'KIOSK', 'h1', now())`);
    // Online desk at the same time: ticket A-2 (even counter).
    await cloud.query(`INSERT INTO "Sequence"(key, value) VALUES ('queue:2026-10-22:A:even', 1)`);
    await cloud.query(`INSERT INTO "QueueTicket"(id, day, prefix, number, "reasonId", "reasonKind", "trackToken", source, "updatedAt") VALUES ('qt2', '2026-10-22', 'A', 2, 'qr_dropoff', 'DROP_OFF', 'tok2tok2tok2tok2tok2tok2', 'DESK', now())`);
    const r1 = await syncOnce(local, cloud);
    expect(r1.errors).toEqual([]);
    for (const db of [local, cloud]) {
      expect((await db.query(`SELECT number FROM "QueueTicket" WHERE day='2026-10-22' ORDER BY number`)).rows.map((r) => r.number)).toEqual([1, 2]);
      expect((await one(db, `SELECT name FROM "QueueDevice" WHERE id='qd1'`)).name).toBe("Tablette entrée");
    }
    // The garage desk calls A-1: the status reaches the online copy.
    await local.query(`UPDATE "QueueTicket" SET status='CALLED', "callCount"=1, "calledAt"=now(), "counterId"='qc_1', "updatedAt"=now() WHERE id='qt1'`);
    const r2 = await syncOnce(local, cloud);
    expect(r2.errors).toEqual([]);
    expect((await one(cloud, `SELECT status, "counterId" FROM "QueueTicket" WHERE id='qt1'`))).toEqual({ status: "CALLED", counterId: "qc_1" });
  });

  it("V16 workflow: migration 25 replays twice without logging its backfill; new statuses and voided lines travel both ways", async () => {
    // An order whose first promised date is still empty (as before migration 25), on the garage PC (hub on).
    await local.query(`UPDATE "WorkOrder" SET "promisedAt"='2026-11-02 15:00:00', "promisedAtInitial"=NULL, "updatedAt"=now() WHERE id='w1'`);
    expect((await syncOnce(local, cloud)).errors).toEqual([]);
    await cloud.query(`UPDATE "WorkOrder" SET "promisedAtInitial"=NULL WHERE id='w1'`);
    const logged = async (db: pg.Client) => Number((await one(db, `SELECT count(*) FROM "_sync_log"`)).count);
    const before = await logged(local);
    for (const db of [local, cloud]) for (let i = 0; i < 2; i++) await db.query(migrationSql("25_workflow_v16"));
    // Backfill done on both sides, and NOT written to the change log (garagepro.sync = on during the backfill).
    expect(await logged(local)).toBe(before);
    for (const db of [local, cloud]) expect((await one(db, `SELECT "promisedAtInitial" = "promisedAt" AS same FROM "WorkOrder" WHERE id='w1'`)).same).toBe(true);
    // Garage: refused quote + a voided line.
    await local.query(`UPDATE "WorkOrder" SET status='QUOTE_REFUSED', "updatedAt"=now() WHERE id='w1'`);
    await local.query(`INSERT INTO "WorkOrderLine"(id, "workOrderId", type, description, "quantityX100", "unitPrice", "voidedAt", "voidReason", "voidedById") VALUES ('l16', 'w1', 'PART', 'Disque', 100, 50000, now(), 'Pièce du client', 'u1')`);
    // Online at the same time: waiting for the customer on another order, and a new order closed there.
    await cloud.query(`UPDATE "WorkOrder" SET status='WAITING_CUSTOMER', "updatedAt"=now() WHERE id='w2'`);
    await addWorkOrder(cloud, "w16", "c1", "v1");
    await cloud.query(`UPDATE "WorkOrder" SET status='CLOSED', "updatedAt"=now() WHERE id='w16'`);
    const r = await syncOnce(local, cloud);
    expect(r.errors).toEqual([]);
    for (const db of [local, cloud]) {
      expect((await db.query(`SELECT id, status FROM "WorkOrder" WHERE id IN ('w1', 'w2', 'w16') ORDER BY id`)).rows).toEqual([
        { id: "w1", status: "QUOTE_REFUSED" },
        { id: "w16", status: "CLOSED" },
        { id: "w2", status: "WAITING_CUSTOMER" },
      ]);
      // Created after migration 25 on the online side: follows the V16 rules on both sides.
      expect((await one(db, `SELECT "workflowV16" FROM "WorkOrder" WHERE id='w16'`)).workflowV16).toBe(true);
      expect((await one(db, `SELECT "voidReason", "voidedAt" IS NOT NULL AS voided FROM "WorkOrderLine" WHERE id='l16'`))).toEqual({ voidReason: "Pièce du client", voided: true });
    }
  }, 20_000);

  it("V16 Lot 2: migration 26 replays twice; its backfill is not logged (orders waiting for a quote answer → PENDING, the rest APPROVED)", async () => {
    // A garage database still at migration 25 (with the hub change log), with two orders.
    const before26 = allMigrations.filter((m) => parseInt(m) < 26);
    const old = await freshDb(admin, `${HUB}_m26`, before26);
    try {
      await old.query(`INSERT INTO "User"(id, email, name, "passwordHash", "updatedAt") VALUES ('u9', 'z@g.tn', 'Admin', 'x', now())`);
      await addCustomer(old, "c9", "Avant V16");
      await addVehicle(old, "v9", "900TU9000", "c9");
      await addWorkOrder(old, "wq", "c9", "v9");
      await addWorkOrder(old, "wi", "c9", "v9");
      await old.query(`UPDATE "WorkOrder" SET status='QUOTE_SENT' WHERE id='wq'`);
      await old.query(`UPDATE "WorkOrder" SET status='IN_PROGRESS', "quoteApprovedAt"=now() WHERE id='wi'`);
      for (const [id, wo] of [["lq", "wq"], ["li", "wi"]]) {
        await old.query(`INSERT INTO "WorkOrderLine"(id, "workOrderId", type, description, "quantityX100", "unitPrice") VALUES ($1, $2, 'LABOR', 'MO', 100, 10000)`, [id, wo]);
      }
      await old.query(`DELETE FROM "_sync_log"`);
      for (let i = 0; i < 2; i++) await old.query(migrationSql("26_quotes"));
      expect(Number((await one(old, `SELECT count(*) FROM "_sync_log"`)).count)).toBe(0);
      expect((await old.query(`SELECT id, "approvalStatus" AS s, "stockDeferred" AS d FROM "WorkOrderLine" ORDER BY id`)).rows).toEqual([
        { id: "li", s: "APPROVED", d: false },
        { id: "lq", s: "PENDING", d: false },
      ]);
      // New lines: PENDING by default; the hub logs the two new tables.
      await old.query(`INSERT INTO "WorkOrderLine"(id, "workOrderId", type, description, "quantityX100", "unitPrice") VALUES ('ln', 'wi', 'LABOR', 'Neuve', 100, 1)`);
      expect((await one(old, `SELECT "approvalStatus" AS s FROM "WorkOrderLine" WHERE id='ln'`)).s).toBe("PENDING");
      const trg = await old.query(`SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname = '_sync_log_trg' AND c.relname IN ('Quote', 'QuoteApproval') ORDER BY 1`);
      expect(trg.rows.map((r) => r.relname)).toEqual(["Quote", "QuoteApproval"]);
    } finally {
      await old.end();
      await admin.query(`DROP DATABASE IF EXISTS ${HUB}_m26 WITH (FORCE)`);
    }
  }, 30_000);

  it("V16 Lot 2: a customer's portal decision made online while the garage is offline reaches the garage without overwriting its work", async () => {
    for (const db of [local, cloud]) for (let i = 0; i < 2; i++) await db.query(migrationSql("26_quotes"));
    // Garage: order waiting for the answer to quote D2026-0001 (two lines), sent to the customer, synchronised.
    await addCustomer(local, "c26", "Client devis");
    await addVehicle(local, "v26", "260TU2600", "c26");
    await addWorkOrder(local, "w26", "c26", "v26");
    await local.query(`UPDATE "WorkOrder" SET status='QUOTE_SENT', "updatedAt"=now() WHERE id='w26'`);
    await local.query(
      `INSERT INTO "Quote"(id, "workOrderId", number, version, snapshot, "snapshotHash", "sentAt") VALUES ('q26', 'w26', 'D2026-0001', 1, '{"lines":[]}', 'abc', now())`,
    );
    for (const [id, d] of [["l26a", "Plaquettes"], ["l26b", "Disques"]]) {
      await local.query(`INSERT INTO "WorkOrderLine"(id, "workOrderId", type, description, "quantityX100", "unitPrice", "quoteId") VALUES ($1, 'w26', 'LABOR', $2, 100, 50000, 'q26')`, [id, d]);
    }
    expect((await syncOnce(local, cloud)).errors).toEqual([]);

    // Internet down at the garage. Online, the customer decides on the portal — what recordPortalDecision writes
    // with a hub: new rows (decision, event, journal) + line and quote statuses, never the WorkOrder row.
    await cloud.query(`UPDATE "Quote" SET status='PARTIAL' WHERE id='q26' AND status='SENT'`);
    await cloud.query(`UPDATE "WorkOrderLine" SET "approvalStatus"='APPROVED' WHERE id='l26a'`);
    await cloud.query(`UPDATE "WorkOrderLine" SET "approvalStatus"='REFUSED' WHERE id='l26b'`);
    await cloud.query(
      `INSERT INTO "QuoteApproval"(id, "quoteId", "workOrderId", decision, "approvedLineIds", "refusedLineIds", "amountApprovedTtc", "approverName", channel, ip, "userAgent", "quoteHash")
       VALUES ('qa26', 'q26', 'w26', 'PARTIAL', '["l26a"]', '["l26b"]', 60500, 'Client devis', 'PORTAL', '41.1.2.3', 'Phone', 'abc')`,
    );
    await cloud.query(`INSERT INTO "WorkOrderEvent"(id, "workOrderId", type, data) VALUES ('e26', 'w26', 'QUOTE_APPROVED', '{"decision":"PARTIAL"}')`);
    // Meanwhile at the garage (later): diagnosis written, a supplement line added, a note.
    await local.query(`UPDATE "WorkOrder" SET diagnosis='Flexible fissuré', "updatedAt"=now() WHERE id='w26'`);
    await local.query(`INSERT INTO "WorkOrderLine"(id, "workOrderId", type, description, "quantityX100", "unitPrice") VALUES ('l26c', 'w26', 'LABOR', 'Flexible', 100, 30000)`);
    await local.query(`INSERT INTO "WorkOrderEvent"(id, "workOrderId", type, body) VALUES ('n26', 'w26', 'NOTE', 'Vu au pont')`);

    // Back online.
    const r = await syncOnce(local, cloud);
    expect(r.errors).toEqual([]);
    for (const db of [local, cloud]) {
      // The decision (append-only proof) and its derived statuses arrived…
      expect(await one(db, `SELECT decision, ip, channel FROM "QuoteApproval" WHERE id='qa26'`)).toEqual({ decision: "PARTIAL", ip: "41.1.2.3", channel: "PORTAL" });
      expect((await one(db, `SELECT status FROM "Quote" WHERE id='q26'`)).status).toBe("PARTIAL");
      expect((await db.query(`SELECT id, "approvalStatus" AS s FROM "WorkOrderLine" WHERE "workOrderId"='w26' ORDER BY id`)).rows).toEqual([
        { id: "l26a", s: "APPROVED" },
        { id: "l26b", s: "REFUSED" },
        { id: "l26c", s: "PENDING" },
      ]);
      // …and the garage's own work was not overwritten (the WorkOrder row was only changed at the garage).
      expect(await one(db, `SELECT status, diagnosis FROM "WorkOrder" WHERE id='w26'`)).toEqual({ status: "QUOTE_SENT", diagnosis: "Flexible fissuré" });
      expect(Number((await one(db, `SELECT count(*) FROM "WorkOrderEvent" WHERE id IN ('e26', 'n26')`)).count)).toBe(2);
    }
    // The proof cannot be changed afterwards, on either side (the sync itself may).
    await expect(local.query(`UPDATE "QuoteApproval" SET "amountApprovedTtc"=1 WHERE id='qa26'`)).rejects.toThrow(/append-only/);
    await expect(cloud.query(`DELETE FROM "QuoteApproval" WHERE id='qa26'`)).rejects.toThrow(/append-only/);
  }, 30_000);

  it("V16 Lot 3: migration 27 replays twice; date revisions (append-only) travel both ways, new columns too", async () => {
    // Replayed twice on both sides (already applied by the setup): no error, nothing logged, trigger in place.
    const logged = async (db: pg.Client) => Number((await one(db, `SELECT count(*) FROM "_sync_log"`)).count);
    const before = await logged(local);
    for (const db of [local, cloud]) for (let i = 0; i < 2; i++) await db.query(migrationSql("27_delays_refusal"));
    expect(await logged(local)).toBe(before);
    const trg = await local.query(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname = '_sync_log_trg' AND c.relname = 'PromiseRevision'`);
    expect(trg.rowCount).toBe(1);

    await addCustomer(local, "c27", "Client retard");
    await addVehicle(local, "v27", "270TU2700", "c27");
    await addWorkOrder(local, "w27", "c27", "v27");
    expect((await syncOnce(local, cloud)).errors).toEqual([]);
    // Garage (hub): promised date moved, revision written; a missing part tied to a line, announced fee line.
    await local.query(`UPDATE "WorkOrder" SET "promisedAt"='2026-11-12 15:00:00', "updatedAt"=now() WHERE id='w27'`);
    await local.query(
      `INSERT INTO "PromiseRevision"(id, "workOrderId", "oldDate", "newDate", reason, note, notified, "dedupeKey") VALUES ('r27a', 'w27', '2026-11-10 15:00:00', '2026-11-12 15:00:00', 'PARTS', 'interne', true, 'promise:a')`,
    );
    await local.query(`INSERT INTO "WorkOrderLine"(id, "workOrderId", type, description, "quantityX100", "unitPrice", "approvalStatus", "isAnnouncedFee") VALUES ('l27', 'w27', 'LABOR', 'Frais de diagnostic', 100, 30000, 'APPROVED', true)`);
    await local.query(`INSERT INTO "WorkOrderPartNeed"(id, "workOrderId", description, "workOrderLineId", "expectedAt", "updatedAt") VALUES ('n27', 'w27', 'Kit', 'l27', '2026-11-11 00:00:00', now())`);
    // Online at the same time (e.g. the storekeeper from outside): the part's expected date revised.
    await cloud.query(
      `INSERT INTO "PromiseRevision"(id, "workOrderId", "partNeedId", "oldDate", "newDate", reason, notified) VALUES ('r27b', 'w27', 'n27x', NULL, '2026-11-11 00:00:00', 'PARTS', false)`,
    );
    const r = await syncOnce(local, cloud);
    expect(r.errors).toEqual([]);
    for (const db of [local, cloud]) {
      expect((await db.query(`SELECT id, reason, notified FROM "PromiseRevision" WHERE "workOrderId"='w27' ORDER BY id`)).rows).toEqual([
        { id: "r27a", reason: "PARTS", notified: true },
        { id: "r27b", reason: "PARTS", notified: false },
      ]);
      expect(await one(db, `SELECT "isAnnouncedFee" FROM "WorkOrderLine" WHERE id='l27'`)).toEqual({ isAnnouncedFee: true });
      expect(await one(db, `SELECT "workOrderLineId" FROM "WorkOrderPartNeed" WHERE id='n27'`)).toEqual({ workOrderLineId: "l27" });
    }
    // The proof cannot be changed afterwards, on either side (the sync itself may).
    await expect(local.query(`UPDATE "PromiseRevision" SET reason='OTHER' WHERE id='r27b'`)).rejects.toThrow(/append-only/);
    await expect(cloud.query(`DELETE FROM "PromiseRevision" WHERE id='r27a'`)).rejects.toThrow(/append-only/);
  }, 30_000);

  it("V16 Lot 4: migration 28 replays twice; signatures, handovers and credit notes travel both ways, append-only on both sides; the frozen invoice lets the sync pass; signature files copied by the media sync", async () => {
    const logged = async (db: pg.Client) => Number((await one(db, `SELECT count(*) FROM "_sync_log"`)).count);
    const before = await logged(local);
    for (const db of [local, cloud]) for (let i = 0; i < 2; i++) await db.query(migrationSql("28_signed_handover_billing"));
    expect(await logged(local)).toBe(before);
    for (const tbl of ["Signature", "VehicleHandover", "CreditNote"]) {
      const trg = await local.query(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.tgname = '_sync_log_trg' AND c.relname = $1`, [tbl]);
      expect(trg.rowCount).toBe(1);
    }
    // Orders opened before migration 28 keep the old rules (workflowLot4 false, written without an UPDATE); new ones true.
    const pre = await freshDb(admin, `${HUB}_l4pre`, allMigrations.filter((m) => parseInt(m) < 28));
    try {
      await addCustomer(pre, "cp", "Avant");
      await addVehicle(pre, "vp", "100TU0028", "cp");
      await addWorkOrder(pre, "wp", "cp", "vp");
      await pre.query(migrationSql("28_signed_handover_billing"));
      await addWorkOrder(pre, "wq", "cp", "vp");
      expect((await pre.query(`SELECT id, "workflowLot4" FROM "WorkOrder" ORDER BY id`)).rows).toEqual([
        { id: "wp", workflowLot4: false },
        { id: "wq", workflowLot4: true },
      ]);
    } finally {
      await pre.end();
      await admin.query(`DROP DATABASE IF EXISTS ${HUB}_l4pre WITH (FORCE)`);
    }

    await addCustomer(local, "c28", "Client restitution");
    await addVehicle(local, "v28", "280TU2800", "c28");
    await addWorkOrder(local, "w28", "c28", "v28");
    expect(await one(local, `SELECT "workflowLot4" FROM "WorkOrder" WHERE id='w28'`)).toEqual({ workflowLot4: true });
    // Garage (offline): intake signed, invoice issued. Online at the same time: the handover signed on a tablet.
    await local.query(`INSERT INTO "Signature"(id, "workOrderId", kind, "signerName", "imageKey", "documentKey", "documentHash") VALUES ('s28a', 'w28', 'INTAKE', 'Client', 'signatures/w28/a.png', 'signatures/w28/a.html', 'h1')`);
    await local.query(`INSERT INTO "Invoice"(id, number, "workOrderId", "customerId", "totalHt", "totalTax", "stampDuty", "totalTtc", snapshot, "snapshotHash") VALUES ('i28', 'F2026-0901', 'w28', 'c28', 100000, 19000, 1000, 120000, '{}', 'h')`);
    let r = await syncOnce(local, cloud);
    expect(r.errors).toEqual([]);
    await cloud.query(`INSERT INTO "Signature"(id, "workOrderId", kind, "signerName", "imageKey", "documentHash", "refId") VALUES ('s28b', 'w28', 'DELIVERY', 'Client', 'signatures/w28/b.png', 'h2', 'h28')`);
    await cloud.query(`INSERT INTO "VehicleHandover"(id, "workOrderId", "mileageOut", "signatureId") VALUES ('h28', 'w28', 51000, 's28b')`);
    // Online: a payment on the invoice (paidAmount / status: the only columns allowed to move).
    await cloud.query(`INSERT INTO "Payment"(id, "invoiceId", amount, method) VALUES ('p28', 'i28', 120000, 'CASH')`);
    await cloud.query(`UPDATE "Invoice" SET "paidAmount" = 120000, status = 'PAID' WHERE id = 'i28'`);

    r = await syncOnce(local, cloud);
    expect(r.errors).toEqual([]);
    for (const db of [local, cloud]) {
      expect((await db.query(`SELECT id, kind FROM "Signature" WHERE "workOrderId"='w28' ORDER BY id`)).rows).toEqual([
        { id: "s28a", kind: "INTAKE" },
        { id: "s28b", kind: "DELIVERY" },
      ]);
      expect(await one(db, `SELECT "mileageOut" FROM "VehicleHandover" WHERE id='h28'`)).toEqual({ mileageOut: 51000 });
      expect(await one(db, `SELECT "paidAmount", status, "totalTtc" FROM "Invoice" WHERE id='i28'`)).toEqual({ paidAmount: 120000, status: "PAID", totalTtc: 120000 });
    }
    // Credit note issued at the garage (status CREDITED on the invoice) travels online.
    await local.query(`INSERT INTO "CreditNote"(id, number, "creditOfInvoiceId", "customerId", reason, "totalHt", "totalTax", "stampDuty", "totalTtc", snapshot, "snapshotHash") VALUES ('cn28', 'AV-2026-0001', 'i28', 'c28', 'Erreur', 100000, 19000, 1000, 120000, '{}', 'h')`);
    await local.query(`UPDATE "Invoice" SET status = 'CREDITED' WHERE id = 'i28'`);
    r = await syncOnce(local, cloud);
    expect(r.errors).toEqual([]);
    expect(await one(cloud, `SELECT number FROM "CreditNote" WHERE id='cn28'`)).toEqual({ number: "AV-2026-0001" });
    expect(await one(cloud, `SELECT status FROM "Invoice" WHERE id='i28'`)).toEqual({ status: "CREDITED" });
    // Frozen on both sides outside the sync; append-only proofs on both sides.
    for (const db of [local, cloud]) {
      await expect(db.query(`UPDATE "Invoice" SET "totalTtc" = 1 WHERE id='i28'`)).rejects.toThrow(/cannot be modified/);
      await expect(db.query(`DELETE FROM "Invoice" WHERE id='i28'`)).rejects.toThrow(/cannot be deleted/);
      await expect(db.query(`UPDATE "Signature" SET "signerName"='x' WHERE id='s28a'`)).rejects.toThrow(/append-only/);
      await expect(db.query(`DELETE FROM "VehicleHandover" WHERE id='h28'`)).rejects.toThrow(/append-only/);
      await expect(db.query(`UPDATE "CreditNote" SET reason='x' WHERE id='cn28'`)).rejects.toThrow(/append-only/);
      await expect(db.query(`UPDATE "Payment" SET amount = 1 WHERE id='p28'`)).rejects.toThrow(/append-only/);
    }
    // The sync itself may write a frozen column (whole-row copy with garagepro.sync = 'on').
    await local.query("BEGIN");
    await local.query("SET LOCAL garagepro.sync = 'on'");
    await local.query(`UPDATE "Invoice" SET "dueDate" = now() WHERE id='i28'`);
    await local.query("ROLLBACK");

    // Signature image + frozen document: copied to the online bucket by the hub's file sync.
    const root = mkdtempSync(path.join(os.tmpdir(), "gp-sig-"));
    mkdirSync(path.join(root, "signatures/w28"), { recursive: true });
    writeFileSync(path.join(root, "signatures/w28/a.png"), "PNG");
    writeFileSync(path.join(root, "signatures/w28/a.html"), "<html>");
    const posted: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(url);
        return new Response("{}", { status: 200 });
      }
      if (url.endsWith("signatures/w28/b.png")) return new Response("PNG2", { status: 200 });
      return new Response("nope", { status: 404 });
    });
    const m = await syncMedia(local, { root, config: { url: "https://x.supabase.co", key: "k", bucket: "media" }, fetchImpl });
    expect(m.errors).toEqual([]);
    expect(posted.some((u) => u.endsWith("signatures/w28/a.png"))).toBe(true);
    expect(posted.some((u) => u.endsWith("signatures/w28/a.html"))).toBe(true);
    expect(m.downloaded).toBeGreaterThanOrEqual(1); // the DELIVERY signature drawn online comes down to the garage PC
  }, 30_000);

  it("a database without a hub logs nothing", async () => {
    const plain = await freshDb(admin, `${HUB}_plain`, allMigrations);
    try {
      await addCustomer(plain, "x1", "Nobody");
      expect(Number((await one(plain, `SELECT count(*) FROM "_sync_log"`)).count)).toBe(0);
    } finally {
      await plain.end();
      await admin.query(`DROP DATABASE IF EXISTS ${HUB}_plain WITH (FORCE)`);
    }
    // Builds a whole database from the 23 migrations: more than the default 5 s on a cold server.
  }, 20_000);
});
