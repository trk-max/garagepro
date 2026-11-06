import { spawnSync } from "node:child_process";

if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production") {
  process.exit(0);
}

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  console.error("Production migration refused: required database environment is unavailable.");
  process.exit(1);
}

console.log("Applying only the approved additive production schema change.");
const deploy = spawnSync("npx", [
  "prisma",
  "db",
  "execute",
  "--file",
  "prisma/migrations/33_targeted_quality/migration.sql",
  "--schema",
  "prisma/schema.prisma",
], {
  stdio: "inherit",
  env: process.env,
});

if (deploy.error) {
  console.error("Production migration deployment failed.");
  process.exit(1);
}

process.exit(deploy.status ?? 1);
