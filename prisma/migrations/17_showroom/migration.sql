-- V9 (Prompt 5/5) — showroom : rôles vendeur / responsable showroom.
-- ADDITIVE only. Safe to run twice. The new enum values are not used in this file
-- (PostgreSQL forbids using a value added in the same transaction).

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SELLER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SHOWROOM_MANAGER';
