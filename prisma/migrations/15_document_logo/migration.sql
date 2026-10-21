-- V8.5 — logo printed on invoices, quotes, orders and certificates.
-- ADDS one nullable column. Nothing existing is changed. Safe to run twice.
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "logoDataUrl" TEXT;
