-- V9.0 (Prompt 5/5) — rôles RH et comptable ; contrats (modèles versionnés, contrats, véhicules, historique).
-- ADDITIVE only: 2 new values of the "Role" type, new tables, 1 new Setting column (with default).
-- Nothing existing is changed or removed. Safe to run twice. Statuses are TEXT (no new enum type).

-- New team roles (PostgreSQL 12+: allowed in a transaction; the new values are not used in this file).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
