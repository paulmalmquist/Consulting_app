-- 289: Add sector-specific capacity fields to repe_property_asset
-- Each sector (multifamily, senior_housing, student_housing, medical_office, industrial)
-- has columns that only apply to that property type. All nullable.

-- === Multifamily ===
ALTER TABLE IF EXISTS repe_property_asset
  ADD COLUMN IF NOT EXISTS avg_rent_per_unit  NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_mix_json      JSONB;

-- === Senior Housing ===
ALTER TABLE IF EXISTS repe_property_asset
  ADD COLUMN IF NOT EXISTS beds                     INT,
  ADD COLUMN IF NOT EXISTS licensed_beds             INT,
  ADD COLUMN IF NOT EXISTS care_mix_json             JSONB,
  ADD COLUMN IF NOT EXISTS revenue_per_occupied_bed  NUMERIC;

-- === Student Housing ===
ALTER TABLE IF EXISTS repe_property_asset
  ADD COLUMN IF NOT EXISTS beds_student     INT,
  ADD COLUMN IF NOT EXISTS preleased_pct    NUMERIC,
  ADD COLUMN IF NOT EXISTS university_name  TEXT;

-- === Medical Office Building (MOB) ===
ALTER TABLE IF EXISTS repe_property_asset
  ADD COLUMN IF NOT EXISTS leasable_sf                NUMERIC,
  ADD COLUMN IF NOT EXISTS leased_sf                  NUMERIC,
  ADD COLUMN IF NOT EXISTS walt_years                 NUMERIC,
  ADD COLUMN IF NOT EXISTS anchor_tenant              TEXT,
  ADD COLUMN IF NOT EXISTS health_system_affiliation  TEXT;

-- === Industrial ===
ALTER TABLE IF EXISTS repe_property_asset
  ADD COLUMN IF NOT EXISTS clear_height_ft  NUMERIC,
  ADD COLUMN IF NOT EXISTS dock_doors       INT,
  ADD COLUMN IF NOT EXISTS rail_served      BOOLEAN,
  ADD COLUMN IF NOT EXISTS warehouse_sf     NUMERIC,
  ADD COLUMN IF NOT EXISTS office_sf        NUMERIC;
