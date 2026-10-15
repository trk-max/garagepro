-- Réclamations et avis clients (V5.0).
-- ADDS two tables and two enums. Nothing existing is dropped or modified.
-- Every statement is guarded (IF NOT EXISTS / duplicate_object), so running it
-- twice, or after `prisma db push`, is safe.

DO $$ BEGIN
  CREATE TYPE "ClaimCategory" AS ENUM ('QUALITY', 'DELAY', 'PRICE', 'BILLING', 'DAMAGE', 'BEHAVIOR', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CustomerClaim" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "category" "ClaimCategory" NOT NULL DEFAULT 'OTHER',
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "plate" TEXT,
    "message" TEXT NOT NULL,
    "response" TEXT,
    "workOrderId" TEXT,
    "customerId" TEXT,
    "handledById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "name" TEXT,
    "plate" TEXT,
    "workOrderId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerClaim_number_key" ON "CustomerClaim"("number");
CREATE INDEX IF NOT EXISTS "CustomerClaim_status_createdAt_idx" ON "CustomerClaim"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CustomerClaim_createdAt_idx" ON "CustomerClaim"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerFeedback_workOrderId_key" ON "CustomerFeedback"("workOrderId");
CREATE INDEX IF NOT EXISTS "CustomerFeedback_createdAt_idx" ON "CustomerFeedback"("createdAt");

DO $$ BEGIN
  ALTER TABLE "CustomerClaim" ADD CONSTRAINT "CustomerClaim_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerClaim" ADD CONSTRAINT "CustomerClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerClaim" ADD CONSTRAINT "CustomerClaim_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
