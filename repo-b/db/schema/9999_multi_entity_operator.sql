-- 9999_multi_entity_operator.sql
-- Seed the reusable multi-entity operator template and the canonical
-- Hall Boys Operating System environment.

INSERT INTO app.templates (key, label, description, departments, capabilities)
VALUES (
  'multi_entity_operator',
  'Multi-Entity Operator',
  'Cross-entity operating system for shared-services leadership, project control, document intelligence, vendor consolidation, and close management.',
  '["executive", "accounting", "operations", "projects", "documents", "crm", "reporting", "compliance"]'::jsonb,
  '"__all__"'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  departments = EXCLUDED.departments,
  capabilities = EXCLUDED.capabilities;

WITH default_tenant AS (
  SELECT tenant_id
  FROM app.tenants
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO app.businesses (tenant_id, name, slug, region)
SELECT tenant_id, 'Hall Boys Holdings', 'hall-boys-holdings', 'us'
FROM default_tenant
WHERE NOT EXISTS (
  SELECT 1
  FROM app.businesses
  WHERE slug = 'hall-boys-holdings'
);

INSERT INTO business (business_id, tenant_id, name, slug, region)
SELECT
  ab.business_id,
  ab.tenant_id,
  ab.name,
  ab.slug,
  ab.region
FROM app.businesses ab
WHERE ab.slug = 'hall-boys-holdings'
  AND EXISTS (
    SELECT 1
    FROM tenant t
    WHERE t.tenant_id = ab.tenant_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM business b
    WHERE b.tenant_id = ab.tenant_id
      AND b.slug = ab.slug
  );

WITH target AS (
  SELECT env_id
  FROM app.environments
  WHERE lower(client_name) LIKE '%hall boys%'
     OR lower(slug) = 'hall-boys'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE app.environments e
SET
  slug = 'hall-boys',
  auth_mode = 'private',
  client_name = 'Hall Boys Operating System',
  industry = 'multi_entity_operator',
  industry_type = 'multi_entity_operator',
  workspace_template_key = 'multi_entity_operator',
  schema_name = COALESCE(e.schema_name, 'env_hall_boys_operator'),
  notes = 'Canonical Hall Boys multi-entity operator environment',
  business_id = (
    SELECT business_id
    FROM app.businesses
    WHERE slug = 'hall-boys-holdings'
    LIMIT 1
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
  'Hall Boys Operating System',
  'multi_entity_operator',
  'multi_entity_operator',
  'multi_entity_operator',
  'env_hall_boys_operator',
  'Canonical Hall Boys multi-entity operator environment',
  (SELECT business_id FROM app.businesses WHERE slug = 'hall-boys-holdings' LIMIT 1),
  'hall-boys',
  'private'
WHERE NOT EXISTS (
  SELECT 1
  FROM app.environments
  WHERE slug = 'hall-boys'
);

INSERT INTO app.env_business_bindings (env_id, business_id)
SELECT e.env_id, b.business_id
FROM app.environments e
JOIN app.businesses ab
  ON ab.business_id = e.business_id
JOIN business b
  ON b.tenant_id = ab.tenant_id
 AND b.slug = ab.slug
WHERE e.slug = 'hall-boys'
ON CONFLICT (env_id) DO NOTHING;

WITH hall_boys_env AS (
  SELECT e.env_id, e.business_id
  FROM app.environments e
  WHERE e.slug = 'hall-boys'
  LIMIT 1
)
INSERT INTO app.business_departments (business_id, department_id, enabled, environment_id)
SELECT
  env.business_id,
  d.department_id,
  true,
  env.env_id
FROM hall_boys_env env
JOIN app.departments d
  ON d.key = ANY(
    ARRAY[
      'executive',
      'accounting',
      'operations',
      'projects',
      'documents',
      'crm',
      'reporting',
      'compliance'
    ]::text[]
  )
ON CONFLICT (business_id, department_id) DO UPDATE
SET
  enabled = true,
  environment_id = EXCLUDED.environment_id;

WITH hall_boys_env AS (
  SELECT e.env_id, e.business_id
  FROM app.environments e
  WHERE e.slug = 'hall-boys'
  LIMIT 1
)
INSERT INTO app.business_capabilities (business_id, capability_id, enabled, environment_id)
SELECT
  env.business_id,
  c.capability_id,
  true,
  env.env_id
FROM hall_boys_env env
JOIN app.capabilities c ON true
JOIN app.departments d
  ON d.department_id = c.department_id
WHERE d.key = ANY(
  ARRAY[
    'executive',
    'accounting',
    'operations',
    'projects',
    'documents',
    'crm',
    'reporting',
    'compliance'
  ]::text[]
)
ON CONFLICT (business_id, capability_id) DO UPDATE
SET
  enabled = true,
  environment_id = EXCLUDED.environment_id;

INSERT INTO app.business_template_snapshot
  (business_id, template_key, expected_departments, expected_capabilities, captured_at, updated_at)
SELECT
  e.business_id,
  'multi_entity_operator',
  ARRAY[
    'executive',
    'accounting',
    'operations',
    'projects',
    'documents',
    'crm',
    'reporting',
    'compliance'
  ]::text[],
  (
    SELECT array_agg(c.key ORDER BY c.key)
    FROM app.capabilities c
    JOIN app.departments d ON d.department_id = c.department_id
    WHERE d.key = ANY(
        ARRAY[
        'executive',
        'accounting',
        'operations',
        'projects',
        'documents',
        'crm',
        'reporting',
        'compliance'
      ]::text[]
    )
  ),
  now(),
  now()
FROM app.environments e
WHERE e.slug = 'hall-boys'
ON CONFLICT (business_id) DO UPDATE
SET
  template_key = EXCLUDED.template_key,
  expected_departments = EXCLUDED.expected_departments,
  expected_capabilities = EXCLUDED.expected_capabilities,
  updated_at = now();
