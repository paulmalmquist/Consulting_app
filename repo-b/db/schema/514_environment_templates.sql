-- Environment Templates registry — forward-looking blueprint system for NEW environments.
--
-- Scope: Applies to environments provisioned via the v2 pipeline (create_environment_v2).
-- Existing canonical environments (novendor, floyorker, resume, trading, meridian, stone-pds)
-- are intentionally NOT migrated onto this table. They remain reference implementations.
--
-- Mined lessons from legacy environments are seeded as templates (see 516_environment_templates_seed.sql).

CREATE TABLE IF NOT EXISTS app.environment_templates (
  template_key         text NOT NULL,
  version              int  NOT NULL DEFAULT 1,
  display_name         text NOT NULL,
  description          text,
  env_kind_default     text NOT NULL CHECK (env_kind_default IN ('internal','client','demo','public','lab','resume')),
  industry_type        text,
  default_home_route   text,                              -- e.g. '/lab/env/{env_id}/re'
  default_auth_mode    text CHECK (default_auth_mode IN ('private','public','hybrid')) DEFAULT 'private',
  enabled_modules      text[] NOT NULL DEFAULT '{}',     -- advisory: list of module keys (repe, pds, crm, …)
  theme_tokens         jsonb  NOT NULL DEFAULT '{}'::jsonb,
  login_copy           jsonb  NOT NULL DEFAULT '{}'::jsonb,
  default_seed_pack    text,                              -- references a key in environment_seed_packs_v2 registry
  available_seed_packs text[] NOT NULL DEFAULT '{}',
  is_active            boolean NOT NULL DEFAULT true,
  is_latest            boolean NOT NULL DEFAULT true,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_key, version)
);

-- Only one row per template_key may be flagged as latest.
CREATE UNIQUE INDEX IF NOT EXISTS uq_environment_templates_latest
  ON app.environment_templates(template_key) WHERE is_latest = true;

COMMENT ON TABLE app.environment_templates IS
  'Forward-looking environment blueprint registry. Consumed by create_environment_v2 only. '
  'Existing canonical environments are NOT mapped here — they remain reference implementations.';

COMMENT ON COLUMN app.environment_templates.is_latest IS
  'Which version is the default for new environments. Flipped explicitly when publishing a new version; never auto-flipped.';

COMMENT ON COLUMN app.environment_templates.enabled_modules IS
  'Advisory list of module keys (repe, pds, crm, tasks, docs, …). Consumed by v2 pipeline for nav/capability hints. Does not enforce runtime gates in this pass.';
