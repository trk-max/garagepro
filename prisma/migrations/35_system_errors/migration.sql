CREATE TABLE IF NOT EXISTS "SystemError" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "place" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "userId" TEXT,
  "requestId" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemError_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SystemError_fingerprint_key"
  ON "SystemError"("fingerprint");
CREATE INDEX IF NOT EXISTS "SystemError_lastSeenAt_idx"
  ON "SystemError"("lastSeenAt");
CREATE INDEX IF NOT EXISTS "SystemError_source_lastSeenAt_idx"
  ON "SystemError"("source", "lastSeenAt");

DROP TRIGGER IF EXISTS "_sync_log_trg" ON "SystemError";
CREATE TRIGGER "_sync_log_trg"
  AFTER INSERT OR UPDATE OR DELETE ON "SystemError"
  FOR EACH ROW EXECUTE FUNCTION "_sync_log_change"('id');
