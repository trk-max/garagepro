/**
 * Prompt 2/5, step E — REAL backup and restore of the PostgreSQL test database
 * (pg_dump / pg_restore). Run: npm run test:db
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
// @ts-expect-error plain ESM script (no types)
import { createKeyFile, loadKey, restoreInto, runBackup, verifyBackup } from "../scripts/backup/lib.mjs";
import { makeWorkOrder } from "./helpers/db";

const sourceUrl = inject("dbUrl");
const adminUrl = (() => {
  const u = new URL(sourceUrl);
  u.pathname = "/postgres";
  return u.toString();
})();
let dir = "";
let keyFile = "";

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "gp-backup-db-"));
  keyFile = path.join(dir, "backup.key");
  await createKeyFile(keyFile);
  await makeWorkOrder(); // some data in the source
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sauvegarde réelle et restauration testée", () => {
  it("backup is encrypted, copied, and PROVEN restorable (every table's row count identical)", async () => {
    const m = await runBackup({ sourceUrl, dir: path.join(dir, "main"), copyDir: path.join(dir, "usb"), keyFile, keep: 14, restoreAdminUrl: adminUrl });
    expect(m.verification).toBe("restore");
    expect(m.tables).toBeGreaterThan(30);
    expect(m.rows).toBeGreaterThan(0);
    expect(m.counts.WorkOrder).toBeGreaterThan(0);
    expect(m.copies).toEqual([path.join(dir, "usb")]);
    expect((await readdir(path.join(dir, "usb"))).filter((n) => n.endsWith(".gpbk"))).toEqual([m.file]);
    // The plain dump never stays on disk next to the backup.
    expect((await readdir(path.join(dir, "main"))).sort()).toEqual([m.file, `${m.file}.json`].sort());
    // No throw-away database left behind.
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    const left = await admin.query(`SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE 'gp_restore_check_%'`);
    await admin.end();
    expect(left.rows[0].n).toBe(0);
  });

  it("a damaged backup is detected: verification fails", async () => {
    const m = await runBackup({ sourceUrl, dir: path.join(dir, "dmg"), keyFile, keep: 14, restoreAdminUrl: adminUrl });
    const file = path.join(dir, "dmg", m.file);
    const bytes = await readFile(file);
    const mid = Math.floor(bytes.length / 2);
    bytes.writeUInt8(bytes.readUInt8(mid) ^ 0xff, mid);
    await writeFile(file, bytes);
    await expect(verifyBackup(file, await loadKey(keyFile), { expectedSha256: m.sha256Plain, counts: m.counts, restoreAdminUrl: adminUrl })).rejects.toThrow(/refusé/);
  });

  it("restore goes only into a NEW EMPTY database, and the data is there", async () => {
    const m = await runBackup({ sourceUrl, dir: path.join(dir, "rst"), keyFile, keep: 14, restoreAdminUrl: adminUrl });
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    const name = `gp_restore_manual_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${name}`);
    try {
      const target = new URL(adminUrl);
      target.pathname = `/${name}`;
      await restoreInto(path.join(dir, "rst", m.file), await loadKey(keyFile), target.toString());
      const c = new pg.Client({ connectionString: target.toString() });
      await c.connect();
      const n = await c.query(`SELECT count(*)::int AS n FROM "WorkOrder"`);
      await c.end();
      expect(n.rows[0].n).toBe(m.counts.WorkOrder);
      // A second restore into the same (now non-empty) database is refused.
      await expect(restoreInto(path.join(dir, "rst", m.file), await loadKey(keyFile), target.toString())).rejects.toThrow(/n'est pas vide/);
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    }
  });

  it("retention: only the N newest are kept", async () => {
    const d = path.join(dir, "keep");
    for (let i = 0; i < 3; i++) await runBackup({ sourceUrl, dir: d, keyFile, keep: 2, now: new Date(Date.UTC(2026, 9, 21, 23, 0, i)) });
    expect((await readdir(d)).filter((n) => n.endsWith(".gpbk")).sort()).toEqual(["garagepro-20261021-230001.gpbk", "garagepro-20261021-230002.gpbk"]);
  });
});
