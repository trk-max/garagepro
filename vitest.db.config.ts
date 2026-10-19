import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Database tests (tests/*.db.test.ts): real PostgreSQL, real Prisma queries.
 *   set TEST_DATABASE_URL=postgresql://postgres:MDP@localhost:5432/postgres
 *   npm run test:db
 * A throw-away database "gp_test_db" is (re)created from prisma/migrations on
 * that server. NEVER point it at the real garage or Supabase database.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@prisma/client": path.resolve(import.meta.dirname, "node_modules/.prisma-test/client/index.js"),
      "@/lib/prisma": path.resolve(import.meta.dirname, "tests/helpers/test-prisma.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.db.test.ts"],
    globalSetup: ["tests/helpers/db-global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { AUTH_SECRET: "test-secret-not-used-in-production", TZ: "UTC" },
  },
});
