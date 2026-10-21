-- V7.2 — solde de congés : nombre de jours de congé payé par an, par employé.
-- ADDS one optional column. Nothing existing is dropped, renamed or modified. Safe to run twice.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "annualLeaveDays" INTEGER;
