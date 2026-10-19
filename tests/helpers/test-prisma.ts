import { PrismaPg } from "@prisma/adapter-pg";
import { inject } from "vitest";
// Resolved to the test client (driver adapter) by vitest.db.config.ts.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: inject("dbUrl") }) } as never);
