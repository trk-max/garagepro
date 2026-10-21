-- V10 — dashboard redesign: monthly revenue target (Paramètres) and favourite customers.
-- ADDS two columns with defaults. Nothing existing is changed. Safe to run twice.
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "monthlyRevenueTarget" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN NOT NULL DEFAULT false;
