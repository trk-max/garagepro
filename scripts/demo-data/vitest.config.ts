import { mergeConfig } from "vitest/config";
import dbConfig from "../../vitest.db.config";

/**
 * V16 — realistic demo data on a THROW-AWAY local database (never the garage's real base, never Supabase).
 * It reuses the database-test setup (database recreated from prisma/migrations, Prisma test client) and
 * creates everything through the app's own server functions, so the data is exactly what the app would write.
 *   TEST_DATABASE_URL=postgresql://postgres:MDP@localhost:5432/postgres TEST_DB_NAME=gp_test_v16_demo \
 *   DEMO_PASSWORD=<mot de passe de test> npx vitest run --config scripts/demo-data/vitest.config.ts
 */
const config = mergeConfig(dbConfig, { test: { testTimeout: 900_000 } });
config.test!.include = ["scripts/demo-data/*.run.ts"];
export default config;
