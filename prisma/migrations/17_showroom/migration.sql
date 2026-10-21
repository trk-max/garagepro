-- V9 (Prompt 5/5) — showroom : rôles vendeur / responsable showroom ; annonces, photos et documents,
-- historique des annonces.
-- ADDITIVE only: 2 enum values and 3 new tables. Nothing existing is changed. Safe to run twice.
-- Statuses and kinds documented in prisma/schema.prisma are stored as TEXT (no new enum type).
-- The new enum values are not used in this file (PostgreSQL forbids using a value added in the same transaction).

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SELLER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SHOWROOM_MANAGER';

CREATE TABLE IF NOT EXISTS "Listing" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "vehicleId" TEXT,
    "plate" TEXT,
    "vin" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT,
    "year" INTEGER,
    "mileage" INTEGER,
    "fuel" TEXT,
    "gearbox" TEXT,
    "engineCc" INTEGER,
    "powerHp" INTEGER,
    "fiscalHp" INTEGER,
    "doors" INTEGER,
    "seats" INTEGER,
    "colorExt" TEXT,
    "colorInt" TEXT,
    "condition" TEXT,
    "price" INTEGER,
    "description" TEXT,
    "equipment" JSONB NOT NULL DEFAULT '[]',
    "specs" JSONB NOT NULL DEFAULT '[]',
    "facts" JSONB NOT NULL DEFAULT '{}',
    "historySummary" TEXT,
    "historyPublic" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sellerId" TEXT NOT NULL,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Listing_number_key" ON "Listing"("number");
CREATE INDEX IF NOT EXISTS "Listing_status_publishedAt_idx" ON "Listing"("status", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "Listing_sellerId_idx" ON "Listing"("sellerId");
CREATE INDEX IF NOT EXISTS "Listing_vehicleId_idx" ON "Listing"("vehicleId");
CREATE INDEX IF NOT EXISTS "Listing_make_idx" ON "Listing"("make");

CREATE TABLE IF NOT EXISTS "ListingMedia" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingMedia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ListingMedia_storageKey_key" ON "ListingMedia"("storageKey");
CREATE INDEX IF NOT EXISTS "ListingMedia_listingId_position_idx" ON "ListingMedia"("listingId", "position");
DO $$ BEGIN
  ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ListingEvent" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ListingEvent_listingId_createdAt_idx" ON "ListingEvent"("listingId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Garage hub: log the changes of the new tables too (only where the hub's change log exists).
DO $$
DECLARE r record;
BEGIN
  IF to_regprocedure('"_sync_log_change"()') IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT c.relname AS tbl, a.attname AS pk
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary AND i.indnatts = 1
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE c.relkind = 'r'
      AND c.relname NOT IN ('_sync_log', '_sync_state', '_prisma_migrations', 'PortalAttempt')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = '_sync_log_trg')
  LOOP
    EXECUTE format('CREATE TRIGGER "_sync_log_trg" AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "_sync_log_change"(%L)', r.tbl, r.pk);
  END LOOP;
END $$;
