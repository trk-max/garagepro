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
