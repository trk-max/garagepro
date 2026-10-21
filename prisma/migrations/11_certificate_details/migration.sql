-- V7.8 — attestation de travail selon le modèle standard (capital, siège, registre, type de contrat).
-- ADDS optional columns only. Nothing existing is changed. Safe to run twice.

ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "legalCapital" TEXT,
ADD COLUMN IF NOT EXISTS "legalAddress" TEXT,
ADD COLUMN IF NOT EXISTS "registryNumber" TEXT,
ADD COLUMN IF NOT EXISTS "registryCity" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "contractType" TEXT;
