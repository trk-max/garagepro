-- V7.5 (Prompt 2/5, étape C) — QR Code sécurisé par véhicule.
-- ADDS two optional columns and a unique index. Nothing existing is changed. Safe to run twice.

ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "qrToken" TEXT,
ADD COLUMN IF NOT EXISTS "qrIssuedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_qrToken_key" ON "Vehicle"("qrToken");
