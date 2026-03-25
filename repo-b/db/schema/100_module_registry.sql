-- 100_module_registry.sql
-- Module catalog and per-business enablement.
-- Tables always exist; enablement controls UI/behavior/validation.

CREATE TABLE IF NOT EXISTS module (
  module_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  version     text NOT NULL DEFAULT '1.0.0',
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_module (
  business_module_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES business(business_id),
  module_id          uuid NOT NULL REFERENCES module(module_id),
  enabled_at         timestamptz NOT NULL DEFAULT now(),
  enabled_by         uuid REFERENCES actor(actor_id),
  UNIQUE (business_id, module_id)
);

CREATE TABLE IF NOT EXISTS module_dependency (
  module_id           uuid NOT NULL REFERENCES module(module_id),
  depends_on_module_id uuid NOT NULL REFERENCES module(module_id),
  PRIMARY KEY (module_id, depends_on_module_id),
  -- A module cannot depend on itself
  CHECK (module_id <> depends_on_module_id)
);

-- Helper function: check if a business has a module enabled.
-- Usage: SELECT check_module_enabled('business-uuid', 'accounting');
CREATE OR REPLACE FUNCTION check_module_enabled(
  p_business_id uuid,
  p_module_key  text
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM business_module bm
    JOIN module m ON m.module_id = bm.module_id
    WHERE bm.business_id = p_business_id
      AND m.key = p_module_key
  );
$$;

-- Helper function: check module dependencies before enabling.
-- Returns array of missing dependency module keys.
-- Empty array = all dependencies satisfied.
CREATE OR REPLACE FUNCTION check_module_dependencies(
  p_business_id uuid,
  p_module_key  text
) RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    array_agg(dep_m.key),
    ARRAY[]::text[]
  )
  FROM module m
  JOIN module_dependency md ON md.module_id = m.module_id
  JOIN module dep_m ON dep_m.module_id = md.depends_on_module_id
  WHERE m.key = p_module_key
    AND NOT EXISTS (
      SELECT 1
      FROM business_module bm
      WHERE bm.business_id = p_business_id
        AND bm.module_id = dep_m.module_id
    );
$$;
