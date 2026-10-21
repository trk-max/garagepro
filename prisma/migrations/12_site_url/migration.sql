-- V7.9 — adresse publique du site réglable dans Paramètres (si APP_URL n'est pas défini).
-- ADDS one optional column. Safe to run twice.

ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "siteUrl" TEXT;
