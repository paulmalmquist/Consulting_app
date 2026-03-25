-- Migration 015: Add environment_id FK to module association tables.
-- Enables per-environment module scoping (1 environment = its own module set).
-- Existing rows remain with NULL environment_id (legacy global rows — hidden in env UI).
-- New rows inserted via environment provisioning will have environment_id set.

ALTER TABLE app.business_departments
  ADD COLUMN IF NOT EXISTS environment_id uuid NULL
    REFERENCES app.environments(env_id) ON DELETE CASCADE;

ALTER TABLE app.business_capabilities
  ADD COLUMN IF NOT EXISTS environment_id uuid NULL
    REFERENCES app.environments(env_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_business_departments_environment_id
  ON app.business_departments (environment_id);

CREATE INDEX IF NOT EXISTS idx_business_capabilities_environment_id
  ON app.business_capabilities (environment_id);
