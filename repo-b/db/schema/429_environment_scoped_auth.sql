-- 429_environment_scoped_auth.sql
-- Shared identity + environment-scoped membership model for:
-- novendor, floyorker, resume, trading

ALTER TABLE IF EXISTS app.environments
  ADD COLUMN IF NOT EXISTS slug text;

ALTER TABLE IF EXISTS app.environments
  ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'private';

ALTER TABLE IF EXISTS app.environments
  DROP CONSTRAINT IF EXISTS environments_auth_mode_check;

ALTER TABLE IF EXISTS app.environments
  ADD CONSTRAINT environments_auth_mode_check
  CHECK (auth_mode IN ('private', 'public', 'hybrid'));

-- Backfill a unique non-null slug for all existing environments first, then
-- reserve canonical slugs for the primary product surfaces.
WITH base AS (
  SELECT
    env_id,
    regexp_replace(lower(client_name), '[^a-z0-9]+', '-', 'g') AS raw_slug
  FROM app.environments
),
ranked AS (
  SELECT
    env_id,
    trim(both '-' FROM raw_slug) AS base_slug,
    row_number() OVER (
      PARTITION BY trim(both '-' FROM raw_slug)
      ORDER BY env_id
    ) AS seq
  FROM base
)
UPDATE app.environments e
SET slug = CASE
  WHEN ranked.base_slug IS NULL OR ranked.base_slug = '' THEN concat('env-', left(e.env_id::text, 8))
  WHEN ranked.seq = 1 THEN concat(ranked.base_slug, '-', left(e.env_id::text, 8))
  ELSE concat(ranked.base_slug, '-', left(e.env_id::text, 8))
END
FROM ranked
WHERE e.env_id = ranked.env_id
  AND (e.slug IS NULL OR e.slug = '');

INSERT INTO app.tenants (name)
SELECT 'Platform Workspace Tenant'
WHERE NOT EXISTS (
  SELECT 1 FROM app.tenants
);

WITH default_tenant AS (
  SELECT tenant_id
  FROM app.tenants
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO app.businesses (tenant_id, name, slug, region)
SELECT tenant_id, name, slug, 'us'
FROM default_tenant
CROSS JOIN (
  VALUES
    ('Novendor', 'novendor'),
    ('Floyorker', 'floyorker'),
    ('My Resume', 'resume-admin'),
    ('Trading Platform', 'trading-platform')
) AS seed(name, slug)
WHERE NOT EXISTS (
  SELECT 1
  FROM app.businesses b
  WHERE b.slug = seed.slug
);

WITH target AS (
  SELECT env_id
  FROM app.environments
  WHERE lower(client_name) LIKE '%floyorker%'
     OR lower(industry) LIKE '%floyorker%'
     OR lower(coalesce(workspace_template_key, '')) = 'website_workspace'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE app.environments e
SET
  slug = 'floyorker',
  auth_mode = 'private',
  client_name = 'Floyorker',
  industry = 'floyorker',
  industry_type = 'floyorker',
  workspace_template_key = COALESCE(e.workspace_template_key, 'website_workspace'),
  business_id = COALESCE(
    e.business_id,
    (SELECT business_id FROM app.businesses WHERE slug = 'floyorker' LIMIT 1)
  ),
  updated_at = now()
FROM target
WHERE e.env_id = target.env_id;

WITH target AS (
  SELECT env_id
  FROM app.environments
  WHERE lower(client_name) LIKE '%resume%'
     OR lower(industry) IN ('visual_resume', 'resume')
     OR lower(coalesce(workspace_template_key, '')) = 'visual_resume'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE app.environments e
SET
  slug = 'resume',
  auth_mode = 'hybrid',
  client_name = 'My Resume',
  industry = 'visual_resume',
  industry_type = 'resume',
  workspace_template_key = COALESCE(e.workspace_template_key, 'visual_resume'),
  business_id = COALESCE(
    e.business_id,
    (SELECT business_id FROM app.businesses WHERE slug = 'resume-admin' LIMIT 1)
  ),
  updated_at = now()
FROM target
WHERE e.env_id = target.env_id;

WITH target AS (
  SELECT env_id
  FROM app.environments
  WHERE env_id = 'c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9'::uuid
     OR lower(client_name) LIKE '%trading%'
     OR lower(industry) = 'trading_platform'
     OR lower(coalesce(workspace_template_key, '')) = 'trading_platform'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE app.environments e
SET
  slug = 'trading',
  auth_mode = 'private',
  client_name = 'Trading Platform',
  industry = 'trading_platform',
  industry_type = 'trading_platform',
  workspace_template_key = COALESCE(e.workspace_template_key, 'trading_platform'),
  business_id = COALESCE(
    e.business_id,
    (SELECT business_id FROM app.businesses WHERE slug = 'trading-platform' LIMIT 1)
  ),
  updated_at = now()
FROM target
WHERE e.env_id = target.env_id;

WITH target AS (
  SELECT env_id
  FROM app.environments
  WHERE lower(client_name) LIKE '%novendor%'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE app.environments e
SET
  slug = 'novendor',
  auth_mode = 'private',
  client_name = 'Novendor',
  industry = 'consulting',
  industry_type = 'consulting',
  workspace_template_key = COALESCE(e.workspace_template_key, 'consulting_revenue_os'),
  business_id = COALESCE(
    e.business_id,
    (SELECT business_id FROM app.businesses WHERE slug = 'novendor' LIMIT 1)
  ),
  updated_at = now()
FROM target
WHERE e.env_id = target.env_id;

INSERT INTO app.environments (
  client_name,
  industry,
  industry_type,
  workspace_template_key,
  schema_name,
  notes,
  business_id,
  slug,
  auth_mode
)
SELECT
  seed.client_name,
  seed.industry,
  seed.industry_type,
  seed.workspace_template_key,
  seed.schema_name,
  seed.notes,
  (SELECT business_id FROM app.businesses WHERE slug = seed.business_slug LIMIT 1),
  seed.slug,
  seed.auth_mode
FROM (
  VALUES
    ('Novendor', 'consulting', 'consulting', 'consulting_revenue_os', 'env_novendor', 'Canonical Novendor environment', 'novendor', 'novendor', 'private'),
    ('Floyorker', 'floyorker', 'floyorker', 'website_workspace', 'env_floyorker', 'Canonical Floyorker environment', 'floyorker', 'floyorker', 'private'),
    ('My Resume', 'visual_resume', 'resume', 'visual_resume', 'env_resume', 'Canonical resume environment', 'resume-admin', 'resume', 'hybrid'),
    ('Trading Platform', 'trading_platform', 'trading_platform', 'trading_platform', 'env_trading_platform', 'Canonical trading environment', 'trading-platform', 'trading', 'private')
) AS seed(client_name, industry, industry_type, workspace_template_key, schema_name, notes, business_slug, slug, auth_mode)
WHERE NOT EXISTS (
  SELECT 1
  FROM app.environments e
  WHERE e.slug = seed.slug
);

INSERT INTO app.env_business_bindings (env_id, business_id)
SELECT e.env_id, e.business_id
FROM app.environments e
WHERE e.slug IN ('novendor', 'floyorker', 'resume', 'trading')
  AND e.business_id IS NOT NULL
ON CONFLICT (env_id, business_id) DO NOTHING;

ALTER TABLE IF EXISTS app.environments
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_environments_slug
  ON app.environments (slug);

CREATE INDEX IF NOT EXISTS idx_app_environments_auth_mode
  ON app.environments (auth_mode);

CREATE TABLE IF NOT EXISTS app.platform_users (
  platform_user_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id  uuid UNIQUE,
  email             text NOT NULL UNIQUE,
  display_name      text,
  status            text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'suspended')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.environment_memberships (
  membership_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id  uuid NOT NULL REFERENCES app.platform_users(platform_user_id) ON DELETE CASCADE,
  env_id            uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  role              text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status            text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'suspended', 'revoked')),
  is_default        boolean NOT NULL DEFAULT false,
  last_used_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform_user_id, env_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_env_memberships_default
  ON app.environment_memberships (platform_user_id)
  WHERE is_default = true AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_app_env_memberships_env
  ON app.environment_memberships (env_id, status);

CREATE TABLE IF NOT EXISTS app.auth_sessions (
  session_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id  uuid NOT NULL REFERENCES app.platform_users(platform_user_id) ON DELETE CASCADE,
  active_env_id     uuid REFERENCES app.environments(env_id) ON DELETE SET NULL,
  active_env_slug   text,
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  user_agent        text,
  ip_address        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_auth_sessions_user
  ON app.auth_sessions (platform_user_id, revoked_at, expires_at DESC);

-- Backfill pre-existing trading rows into the canonical trading tenant so the
-- new environment-scoped API filters do not strand older seeded data.
WITH trading_scope AS (
  SELECT b.tenant_id
  FROM app.environments e
  JOIN app.businesses b ON b.business_id = e.business_id
  WHERE e.slug = 'trading'
  LIMIT 1
)
UPDATE public.trading_themes t
SET tenant_id = trading_scope.tenant_id
FROM trading_scope
WHERE t.tenant_id IS NULL
   OR t.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

WITH trading_scope AS (
  SELECT b.tenant_id
  FROM app.environments e
  JOIN app.businesses b ON b.business_id = e.business_id
  WHERE e.slug = 'trading'
  LIMIT 1
)
UPDATE public.trading_signals t
SET tenant_id = trading_scope.tenant_id
FROM trading_scope
WHERE t.tenant_id IS NULL
   OR t.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

WITH trading_scope AS (
  SELECT b.tenant_id
  FROM app.environments e
  JOIN app.businesses b ON b.business_id = e.business_id
  WHERE e.slug = 'trading'
  LIMIT 1
)
UPDATE public.trading_hypotheses t
SET tenant_id = trading_scope.tenant_id
FROM trading_scope
WHERE t.tenant_id IS NULL
   OR t.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

WITH trading_scope AS (
  SELECT b.tenant_id
  FROM app.environments e
  JOIN app.businesses b ON b.business_id = e.business_id
  WHERE e.slug = 'trading'
  LIMIT 1
)
UPDATE public.trading_positions t
SET tenant_id = trading_scope.tenant_id
FROM trading_scope
WHERE t.tenant_id IS NULL
   OR t.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

WITH trading_scope AS (
  SELECT b.tenant_id
  FROM app.environments e
  JOIN app.businesses b ON b.business_id = e.business_id
  WHERE e.slug = 'trading'
  LIMIT 1
)
UPDATE public.trading_performance_snapshots t
SET tenant_id = trading_scope.tenant_id
FROM trading_scope
WHERE t.tenant_id IS NULL
   OR t.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

WITH trading_scope AS (
  SELECT b.tenant_id
  FROM app.environments e
  JOIN app.businesses b ON b.business_id = e.business_id
  WHERE e.slug = 'trading'
  LIMIT 1
)
UPDATE public.trading_research_notes t
SET tenant_id = trading_scope.tenant_id
FROM trading_scope
WHERE t.tenant_id IS NULL
   OR t.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

WITH trading_scope AS (
  SELECT b.tenant_id
  FROM app.environments e
  JOIN app.businesses b ON b.business_id = e.business_id
  WHERE e.slug = 'trading'
  LIMIT 1
)
UPDATE public.trading_daily_briefs t
SET tenant_id = trading_scope.tenant_id
FROM trading_scope
WHERE t.tenant_id IS NULL
   OR t.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

WITH trading_scope AS (
  SELECT b.tenant_id
  FROM app.environments e
  JOIN app.businesses b ON b.business_id = e.business_id
  WHERE e.slug = 'trading'
  LIMIT 1
)
UPDATE public.trading_watchlist t
SET tenant_id = trading_scope.tenant_id
FROM trading_scope
WHERE t.tenant_id IS NULL
   OR t.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
