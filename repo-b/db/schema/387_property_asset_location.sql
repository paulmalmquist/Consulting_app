-- 387_property_asset_location.sql
-- Add latitude/longitude columns to repe_property_asset for portfolio map visualization.
-- Depends on: 265_repe_object_model.sql, 270_re_institutional_model.sql, 285_re_asset_accounting_seed.sql
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE IF EXISTS repe_property_asset
  ADD COLUMN IF NOT EXISTS latitude   NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude  NUMERIC(10,7);
