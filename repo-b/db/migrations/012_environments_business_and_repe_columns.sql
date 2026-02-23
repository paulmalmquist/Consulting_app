-- Migration 012: Attach business_id and repe_initialized to environments
-- Enables 1 environment = 1 business auto-provisioning and REPE seed tracking.

ALTER TABLE app.environments
  ADD COLUMN IF NOT EXISTS business_id uuid NULL
    REFERENCES app.businesses(business_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repe_initialized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS industry_type text NULL;

CREATE INDEX IF NOT EXISTS idx_environments_business_id
  ON app.environments (business_id);
