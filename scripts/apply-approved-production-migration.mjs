import { spawnSync } from "node:child_process";

const migration = "33_targeted_quality";

if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production") {
  process.exit(0);
}

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  console.error("Production migration refused: required database environment is unavailable.");
  process.exit(1);
}

const status = spawnSync("npx", ["prisma", "migrate", "status"], {
  encoding: "utf8",
  env: process.env,
});

if (status.error) {
  console.error("Production migration status check failed; no migration was applied.");
  process.exit(1);
}

if (status.status === 0) {
  console.log("Production database migrations are already up to date.");
  process.exit(0);
}

const output = `${status.stdout ?? ""}\n${status.stderr ?? ""}`;
const pendingBlock = output.match(/Following migration(?:s)? have not yet been applied:\r?\n([\s\S]*?)(?:\r?\n\r?\n|$)/);
const pending = pendingBlock?.[1]
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (!pending || pending.length !== 1 || pending[0] !== migration) {
  console.error(`Production migration refused: only ${migration} may be pending; no migration was applied.`);
  process.exit(1);
}

console.log(`Applying the approved additive production migration ${migration}.`);
const deploy = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

if (deploy.error) {
  console.error("Production migration deployment failed.");
  process.exit(1);
}

process.exit(deploy.status ?? 1);
