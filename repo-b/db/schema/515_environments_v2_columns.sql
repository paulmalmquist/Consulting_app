-- Additive columns on app.environments to support v2 blueprint metadata.
--
-- All columns are nullable / defaulted. Existing rows are unaffected and the legacy
-- create_environment path never reads or writes these columns.
--
-- Only environments created via create_environment_v2 will populate these fields.
-- Legacy envs retain their existing behavior unchanged.

ALTER TABLE app.environments
  ADD COLUMN IF NOT EXISTS template_key       text,
  ADD COLUMN IF NOT EXISTS template_version   int,
  ADD COLUMN IF NOT EXISTS env_kind           text
    CHECK (env_kind IS NULL OR env_kind IN ('internal','client','demo','public','lab','resume')),
  ADD COLUMN IF NOT EXISTS lifecycle_state    text
    CHECK (lifecycle_state IS NULL OR lifecycle_state IN ('draft','provisioning','seeded','verified','live','failed','retired')),
  ADD COLUMN IF NOT EXISTS lifecycle_state_at timestamptz,
  ADD COLUMN IF NOT EXISTS default_home_route text,
  ADD COLUMN IF NOT EXISTS theme_accent       text,
  ADD COLUMN IF NOT EXISTS seed_pack_applied  text,
  ADD COLUMN IF NOT EXISTS seed_pack_version  int,
  ADD COLUMN IF NOT EXISTS manifest_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_report jsonb,
  ADD COLUMN IF NOT EXISTS created_by_actor   text;

-- Soft FK to templates table — nullable so legacy envs (template_key IS NULL) aren't broken.
-- We deliberately do NOT add a real FK constraint so the two code paths stay fully isolated
-- during Phase A. If/when we unify later we can promote this to a proper FK.

CREATE INDEX IF NOT EXISTS idx_environments_template_key
  ON app.environments(template_key) WHERE template_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_environments_lifecycle_state
  ON app.environments(lifecycle_state) WHERE lifecycle_state IS NOT NULL AND lifecycle_state != 'retired';

COMMENT ON COLUMN app.environments.template_key IS
  'Set by create_environment_v2 only. NULL for legacy environments — they remain on the pre-v2 path.';

COMMENT ON COLUMN app.environments.lifecycle_state IS
  'State-machine for v2 envs: draft → provisioning → seeded → verified → live → retired. NULL means legacy env (pre-v2).';

COMMENT ON COLUMN app.environments.manifest_json IS
  'Overflow-only: template-specific low-frequency options (e.g. onboarding_checklist, feature_flags). '
  'Routing, auth, and capabilities MUST use structured columns. Allowlisted keys enforced in app layer.';
