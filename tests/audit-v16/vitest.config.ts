import { mergeConfig } from "vitest/config";
import dbConfig from "../../vitest.db.config";

/**
 * V16 audit — reproductions of the problems listed in docs/AUDIT-V16.md, on a THROW-AWAY local database.
 * Each test asserts TODAY'S (faulty) behaviour, so it passes while the problem exists. When a problem is
 * fixed in phase C, its test is turned into a regression test (expectation inverted) and moved to tests/.
 * Not part of `npm run test:db` on purpose (separate file pattern).
 *   TEST_DATABASE_URL=postgresql://postgres:MDP@localhost:5432/postgres TEST_DB_NAME=gp_test_v16_audit \
 *   npx vitest run --config tests/audit-v16/vitest.config.ts
 */
const config = mergeConfig(dbConfig, {});
config.test!.include = ["tests/audit-v16/*.audit.ts"];
export default config;
