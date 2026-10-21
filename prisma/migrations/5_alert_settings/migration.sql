-- V7.1 (Prompt 2) — seuils d'alerte réglables (page « Suivi & retards »).
-- ADDS three columns with a default (same behaviour as before: 0 h, 0 j, 3 j).
-- Nothing existing is dropped, renamed or modified. Safe to run twice.

ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "alertOrderLateHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "alertPartLateDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "alertInsuranceDays" INTEGER NOT NULL DEFAULT 3;
