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
    cloud = await freshDb(admin, "gp_hub_cloud", allMigrations.filter((m) => !m.startsWith("3_")));
    local = await freshDb(admin, "gp_hub_local", allMigrations);
    await cloud.query(`INSERT INTO "User"(id, email, name, "passwordHash", "updatedAt") VALUES ('u1', 'a@g.tn', 'Admin', 'x', now())`);
    await addCustomer(cloud, "c1", "Sami");
    await addVehicle(cloud, "v1", "100TU1000", "c1");
    await addWorkOrder(cloud, "w1", "c1", "v1");
  });

  afterAll(async () => {
    await local?.end();
    await cloud?.end();
    await admin?.query("DROP DATABASE IF EXISTS gp_hub_local WITH (FORCE)");
    await admin?.query("DROP DATABASE IF EXISTS gp_hub_cloud WITH (FORCE)");
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

  it("a database without a hub logs nothing", async () => {
    const plain = await freshDb(admin, "gp_hub_plain", allMigrations);
    try {
      await addCustomer(plain, "x1", "Nobody");
      expect(Number((await one(plain, `SELECT count(*) FROM "_sync_log"`)).count)).toBe(0);
    } finally {
      await plain.end();
      await admin.query("DROP DATABASE IF EXISTS gp_hub_plain WITH (FORCE)");
    }
  });
});
