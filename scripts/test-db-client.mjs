/**
 * Builds a second Prisma client used ONLY by the database tests
 * (tests/*.db.test.ts). It talks to PostgreSQL through the `pg` driver
 * (driver adapter + query compiler), so the tests run anywhere Node runs,
 * without Prisma's native engine. The app keeps using the normal client.
 *   node scripts/test-db-client.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8").replace(
  /generator client \{[\s\S]*?\n\}/,
  `generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["relationJoins", "queryCompiler", "driverAdapters"]
  engineType      = "client"
  output          = "../client"
}`,
);
const dir = path.join(ROOT, "node_modules/.prisma-test/schema");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "schema.prisma"), schema);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(npx, ["prisma", "generate", "--schema", path.join(dir, "schema.prisma")], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
