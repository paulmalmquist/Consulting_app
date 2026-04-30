-- 10001_altered_mind_environment_registry.sql
-- Register the Altered Mind personal-practice environment so it appears in the
-- Winston environment switcher and routes to its own workspace at
-- /lab/env/{env_id}/altered-mind. Idempotent — safe to re-run.

-- 1) Template registration (idiom from 516_environment_templates_seed.sql).
INSERT INTO app.environment_templates (
  template_key, version, display_name, description, env_kind_default, industry_type,
  default_home_route, default_auth_mode,
  enabled_modules, theme_tokens, login_copy,
  default_seed_pack, available_seed_packs, is_active, is_latest, notes
) VALUES (
  'altered_mind', 1,
  'Altered Mind',
  'Personal-practice tracker — weekly therapy check-ins, referral pipeline, monthly reflections.',
  'internal', 'therapy_practice',
  '/lab/env/{env_id}/altered-mind', 'private',
  ARRAY['checkins','referrals','reflections','documents'],
  jsonb_build_object('accent', '174 60% 51%', 'accent_soft', '174 60% 78%', 'glow', '64, 196, 188'),
  jsonb_build_object('title', 'Altered Mind', 'subtitle', 'Sign in to your practice tracker.'),
  'empty', ARRAY['empty'], true, true,
  'Personal therapy-practice tracker. Schema: am_daily_checkin / am_weekly_summary / am_referral / am_monthly_reflection.'
)
ON CONFLICT (template_key, version) DO UPDATE SET
  display_name         = EXCLUDED.display_name,
  description          = EXCLUDED.description,
  env_kind_default     = EXCLUDED.env_kind_default,
  industry_type        = EXCLUDED.industry_type,
  default_home_route   = EXCLUDED.default_home_route,
  default_auth_mode    = EXCLUDED.default_auth_mode,
  enabled_modules      = EXCLUDED.enabled_modules,
  theme_tokens         = EXCLUDED.theme_tokens,
  login_copy           = EXCLUDED.login_copy,
  default_seed_pack    = EXCLUDED.default_seed_pack,
  available_seed_packs = EXCLUDED.available_seed_packs,
  is_active            = EXCLUDED.is_active,
  notes                = EXCLUDED.notes,
  updated_at           = now();

-- 2) Business registration (idiom from 430_meridian_stone_environment_registry.sql).
WITH default_tenant AS (
  SELECT tenant_id
  FROM app.tenants
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO app.businesses (tenant_id, name, slug, region)
SELECT tenant_id, 'Altered Mind', 'altered-mind', 'us'
FROM default_tenant
WHERE NOT EXISTS (
  SELECT 1 FROM app.businesses WHERE slug = 'altered-mind'
);

-- Mirror to legacy `business` table where the tenant exists in the legacy `tenant` table.
INSERT INTO business (business_id, tenant_id, name, slug, region)
SELECT
  ab.business_id,
  ab.tenant_id,
  ab.name,
  ab.slug,
  ab.region
FROM app.businesses ab
WHERE ab.slug = 'altered-mind'
  AND EXISTS (SELECT 1 FROM tenant t WHERE t.tenant_id = ab.tenant_id)
  AND NOT EXISTS (
    SELECT 1 FROM business b
    WHERE b.tenant_id = ab.tenant_id AND b.slug = ab.slug
  );

-- 3) Environment row.
INSERT INTO app.environments (
  client_name,
  industry,
  industry_type,
  workspace_template_key,
  schema_name,
  notes,
  business_id,
  slug,
  auth_mode,
  template_key,
  template_version,
  env_kind,
  default_home_route
)
SELECT
  'Altered Mind',
  'healthcare',
  'therapy_practice',
  'altered_mind',
  'env_altered_mind',
  'Personal therapy-practice tracker (am_* tables in public schema, RLS on env_id).',
  (SELECT business_id FROM app.businesses WHERE slug = 'altered-mind' LIMIT 1),
  'altered-mind',
  'private',
  'altered_mind',
  1,
  'internal',
  '/lab/env/{env_id}/altered-mind'
WHERE NOT EXISTS (
  SELECT 1 FROM app.environments WHERE slug = 'altered-mind'
);

-- 4) Env <-> business binding.
INSERT INTO app.env_business_bindings (env_id, business_id)
SELECT e.env_id, e.business_id
FROM app.environments e
WHERE e.slug = 'altered-mind'
  AND e.business_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM app.env_business_bindings ebb WHERE ebb.env_id = e.env_id
  );

-- 5) Owner membership is NOT seeded here.
-- Memberships depend on a specific platform_users row (FK) that does not exist
-- in the CI test database. Membership was applied directly to production via:
--   scripts/seed_altered_mind_membership.sql  (tracked separately)
-- Re-apply after any production restore using that script.
