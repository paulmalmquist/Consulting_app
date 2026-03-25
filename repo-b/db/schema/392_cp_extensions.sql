-- 392_cp_extensions.sql
-- Extend existing PDS tables with construction-specific fields for Capital Projects OS.

-- Projects: geographic, collaboration, and budget origin fields
ALTER TABLE IF EXISTS pds_projects
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS market text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS latitude numeric(12,8),
  ADD COLUMN IF NOT EXISTS longitude numeric(12,8),
  ADD COLUMN IF NOT EXISTS gc_name text,
  ADD COLUMN IF NOT EXISTS architect_name text,
  ADD COLUMN IF NOT EXISTS owner_rep text,
  ADD COLUMN IF NOT EXISTS original_budget numeric(28,12) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_reserve numeric(28,12) NOT NULL DEFAULT 0;

-- Punch items: location, trade, severity, photos
ALTER TABLE IF EXISTS pds_punch_items
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS floor text,
  ADD COLUMN IF NOT EXISTS room text,
  ADD COLUMN IF NOT EXISTS trade text,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'minor',
  ADD COLUMN IF NOT EXISTS photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

-- RFIs: discipline, drawing reference, impact tracking
ALTER TABLE IF EXISTS pds_rfis
  ADD COLUMN IF NOT EXISTS discipline text,
  ADD COLUMN IF NOT EXISTS reference_drawing text,
  ADD COLUMN IF NOT EXISTS cost_impact numeric(28,12) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schedule_impact_days int DEFAULT 0;

-- Submittals: revision tracking, review workflow
ALTER TABLE IF EXISTS pds_submittals
  ADD COLUMN IF NOT EXISTS revision text DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS review_round int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reviewer_name text,
  ADD COLUMN IF NOT EXISTS review_action text;
