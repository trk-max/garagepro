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
const lines = output.split(/\r?\n/);
const pendingHeader = lines.findIndex((line) => /following migrations? have not yet been applied:/i.test(line));
let pending = null;
if (pendingHeader >= 0) {
  const pendingLines = lines.slice(pendingHeader + 1);
  const blankLine = pendingLines.findIndex((line) => !line.trim());
  const block = blankLine < 0 ? pendingLines : pendingLines.slice(0, blankLine);
  pending = block.map((line) => line.trim()).filter((line) => /^[A-Za-z0-9_-]+$/.test(line));
}

if (!pending || pending.length !== 1 || pending[0] !== migration) {
  const prismaCode = output.match(/\bP\d{4}\b/)?.[0];
  const pendingSummary = pending?.length ? pending.join(", ") : `could not be determined${prismaCode ? ` (Prisma ${prismaCode})` : ""}`;
  console.error(`Production migration refused: pending migrations are ${pendingSummary}; only ${migration} is approved. No migration was applied.`);
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
