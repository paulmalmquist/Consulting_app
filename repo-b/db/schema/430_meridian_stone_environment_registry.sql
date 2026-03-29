-- 430_meridian_stone_environment_registry.sql
-- Promote Meridian Capital Management and Stone PDS into the canonical
-- environment-scoped auth registry so they can participate in branded entry,
-- membership assignment, and environment-aware session routing.

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
    ('Meridian Capital Management', 'meridian-capital'),
    ('Stone PDS', 'stone-pds')
) AS seed(name, slug)
WHERE NOT EXISTS (
  SELECT 1
  FROM app.businesses b
  WHERE b.slug = seed.slug
);

WITH target AS (
  SELECT env_id
  FROM app.environments
  WHERE lower(client_name) LIKE '%meridian capital%'
     OR lower(slug) = 'meridian'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE app.environments e
SET
  slug = 'meridian',
  auth_mode = 'private',
  client_name = 'Meridian Capital Management',
  industry = 'real_estate_pe',
  industry_type = 'repe',
  workspace_template_key = COALESCE(e.workspace_template_key, 'repe_workspace'),
  business_id = COALESCE(
    e.business_id,
    (SELECT business_id FROM app.businesses WHERE slug = 'meridian-capital' LIMIT 1)
  ),
  updated_at = now()
FROM target
WHERE e.env_id = target.env_id;

WITH target AS (
  SELECT env_id
  FROM app.environments
  WHERE lower(client_name) LIKE '%stone pds%'
     OR lower(slug) = 'stone-pds'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE app.environments e
SET
  slug = 'stone-pds',
  auth_mode = 'private',
  client_name = 'Stone PDS',
  industry = 'pds',
  industry_type = 'pds',
  workspace_template_key = COALESCE(e.workspace_template_key, 'pds_enterprise'),
  business_id = COALESCE(
    e.business_id,
    (SELECT business_id FROM app.businesses WHERE slug = 'stone-pds' LIMIT 1)
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
    ('Meridian Capital Management', 'real_estate_pe', 'repe', 'repe_workspace', 'env_meridian_capital_management', 'Canonical Meridian environment', 'meridian-capital', 'meridian', 'private'),
    ('Stone PDS', 'pds', 'pds', 'pds_enterprise', 'env_stone_pds', 'Canonical Stone PDS environment', 'stone-pds', 'stone-pds', 'private')
) AS seed(client_name, industry, industry_type, workspace_template_key, schema_name, notes, business_slug, slug, auth_mode)
WHERE NOT EXISTS (
  SELECT 1
  FROM app.environments e
  WHERE e.slug = seed.slug
);

INSERT INTO app.env_business_bindings (env_id, business_id)
SELECT e.env_id, e.business_id
FROM app.environments e
WHERE e.slug IN ('meridian', 'stone-pds')
  AND e.business_id IS NOT NULL
ON CONFLICT (env_id, business_id) DO NOTHING;
