-- Migration 006: Deterministic ingestion + transformation module.
-- Adds source/version/recipe/run audit tables, canonical ingestion targets,
-- JSON row-store fallback, and metrics datapoint registry integration.

-- ─────────────────────────────────────────────────────────────
-- Ingest source + versions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.ingest_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id uuid NULL,
  name text NOT NULL,
  description text NULL,
  document_id uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE CASCADE,
  file_type text NOT NULL CHECK (file_type IN ('csv', 'xlsx')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingest_source_business_idx
  ON app.ingest_source (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ingest_source_env_idx
  ON app.ingest_source (env_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ingest_source_document_idx
  ON app.ingest_source (document_id);

CREATE TABLE IF NOT EXISTS app.ingest_source_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_source_id uuid NOT NULL REFERENCES app.ingest_source(id) ON DELETE CASCADE,
  document_version_id uuid NOT NULL REFERENCES app.document_versions(version_id) ON DELETE RESTRICT,
  version_num int NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by text NULL,
  UNIQUE (ingest_source_id, version_num),
  UNIQUE (ingest_source_id, document_version_id)
);

CREATE INDEX IF NOT EXISTS ingest_source_version_source_idx
  ON app.ingest_source_version (ingest_source_id, version_num DESC);

-- ─────────────────────────────────────────────────────────────
-- Recipe mapping + transform definitions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.ingest_recipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_source_id uuid NOT NULL REFERENCES app.ingest_source(id) ON DELETE CASCADE,
  target_table_key text NOT NULL,
  mode text NOT NULL DEFAULT 'upsert' CHECK (mode IN ('append', 'upsert', 'replace')),
  primary_key_fields text[] NOT NULL DEFAULT '{}'::text[],
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingest_recipe_source_idx
  ON app.ingest_recipe (ingest_source_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS app.ingest_recipe_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_recipe_id uuid NOT NULL REFERENCES app.ingest_recipe(id) ON DELETE CASCADE,
  source_column text NOT NULL,
  target_column text NOT NULL,
  transform_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  required boolean NOT NULL DEFAULT false,
  mapping_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ingest_recipe_mapping_recipe_idx
  ON app.ingest_recipe_mapping (ingest_recipe_id, mapping_order ASC, id ASC);

CREATE TABLE IF NOT EXISTS app.ingest_recipe_transform_step (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_recipe_id uuid NOT NULL REFERENCES app.ingest_recipe(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  step_type text NOT NULL CHECK (step_type IN ('cast', 'rename', 'derive', 'lookup', 'join', 'filter', 'pivot', 'unpivot')),
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (ingest_recipe_id, step_order)
);

CREATE INDEX IF NOT EXISTS ingest_recipe_transform_step_recipe_idx
  ON app.ingest_recipe_transform_step (ingest_recipe_id, step_order ASC);

-- ─────────────────────────────────────────────────────────────
-- Run history + row-level error audit
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.ingest_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_recipe_id uuid NOT NULL REFERENCES app.ingest_recipe(id) ON DELETE CASCADE,
  source_version_id uuid NOT NULL REFERENCES app.ingest_source_version(id) ON DELETE RESTRICT,
  run_hash text NOT NULL,
  engine_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  rows_read int NOT NULL DEFAULT 0,
  rows_valid int NOT NULL DEFAULT 0,
  rows_inserted int NOT NULL DEFAULT 0,
  rows_updated int NOT NULL DEFAULT 0,
  rows_rejected int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  error_summary text NULL,
  lineage_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ingest_run_recipe_idx
  ON app.ingest_run (ingest_recipe_id, started_at DESC);

CREATE INDEX IF NOT EXISTS ingest_run_hash_idx
  ON app.ingest_run (run_hash);

CREATE TABLE IF NOT EXISTS app.ingest_run_error (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_run_id uuid NOT NULL REFERENCES app.ingest_run(id) ON DELETE CASCADE,
  row_number int NULL,
  column_name text NULL,
  error_code text NOT NULL,
  message text NOT NULL,
  raw_value text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingest_run_error_run_idx
  ON app.ingest_run_error (ingest_run_id, row_number ASC, id ASC);

-- ─────────────────────────────────────────────────────────────
-- Canonical ingestion targets (Option 2) + row-store fallback
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.ingest_vendor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id uuid NULL,
  source_run_id uuid NULL REFERENCES app.ingest_run(id) ON DELETE SET NULL,
  natural_key text NULL,
  name text NOT NULL,
  legal_name text NULL,
  tax_id text NULL,
  payment_terms text NULL,
  email text NULL,
  phone text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ingest_vendor_scope_natural_key_uidx
  ON app.ingest_vendor (
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(env_id, '00000000-0000-0000-0000-000000000000'::uuid),
    natural_key
  )
  WHERE natural_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_vendor_scope_idx
  ON app.ingest_vendor (business_id, env_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.ingest_customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id uuid NULL,
  source_run_id uuid NULL REFERENCES app.ingest_run(id) ON DELETE SET NULL,
  natural_key text NULL,
  name text NOT NULL,
  email text NULL,
  phone text NULL,
  status text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ingest_customer_scope_natural_key_uidx
  ON app.ingest_customer (
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(env_id, '00000000-0000-0000-0000-000000000000'::uuid),
    natural_key
  )
  WHERE natural_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_customer_scope_idx
  ON app.ingest_customer (business_id, env_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.ingest_cashflow_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id uuid NULL,
  source_run_id uuid NULL REFERENCES app.ingest_run(id) ON DELETE SET NULL,
  natural_key text NULL,
  event_date date NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'capital_call',
      'operating_cf',
      'capex',
      'debt_service',
      'refinance_proceeds',
      'sale_proceeds',
      'fee',
      'distribution',
      'other'
    )
  ),
  amount numeric(20,6) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  description text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ingest_cashflow_event_scope_natural_key_uidx
  ON app.ingest_cashflow_event (
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(env_id, '00000000-0000-0000-0000-000000000000'::uuid),
    natural_key
  )
  WHERE natural_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingest_cashflow_event_scope_idx
  ON app.ingest_cashflow_event (business_id, env_id, event_date DESC);

CREATE TABLE IF NOT EXISTS app.gl_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id uuid NULL,
  source_run_id uuid NULL REFERENCES app.ingest_run(id) ON DELETE SET NULL,
  natural_key text NULL,
  txn_date date NOT NULL,
  account text NOT NULL,
  description text NULL,
  amount numeric(20,6) NOT NULL,
  debit numeric(20,6) NULL,
  credit numeric(20,6) NULL,
  reference text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gl_transaction_scope_natural_key_uidx
  ON app.gl_transaction (
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(env_id, '00000000-0000-0000-0000-000000000000'::uuid),
    natural_key
  )
  WHERE natural_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS gl_transaction_scope_idx
  ON app.gl_transaction (business_id, env_id, txn_date DESC);

CREATE TABLE IF NOT EXISTS app.trial_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id uuid NULL,
  source_run_id uuid NULL REFERENCES app.ingest_run(id) ON DELETE SET NULL,
  natural_key text NULL,
  period text NOT NULL,
  account text NOT NULL,
  ending_balance numeric(20,6) NOT NULL,
  debit numeric(20,6) NULL,
  credit numeric(20,6) NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trial_balance_scope_natural_key_uidx
  ON app.trial_balance (
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(env_id, '00000000-0000-0000-0000-000000000000'::uuid),
    natural_key
  )
  WHERE natural_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS trial_balance_scope_idx
  ON app.trial_balance (business_id, env_id, period, account);

CREATE TABLE IF NOT EXISTS app.deal_pipeline_deal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id uuid NULL,
  source_run_id uuid NULL REFERENCES app.ingest_run(id) ON DELETE SET NULL,
  natural_key text NULL,
  deal_name text NOT NULL,
  company text NULL,
  stage text NULL,
  owner text NULL,
  value numeric(20,6) NULL,
  probability numeric(6,3) NULL,
  close_date date NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS deal_pipeline_deal_scope_natural_key_uidx
  ON app.deal_pipeline_deal (
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(env_id, '00000000-0000-0000-0000-000000000000'::uuid),
    natural_key
  )
  WHERE natural_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS deal_pipeline_deal_scope_idx
  ON app.deal_pipeline_deal (business_id, env_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.ingested_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_key text NOT NULL,
  business_id uuid NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id uuid NULL,
  name text NOT NULL,
  schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ingested_table_scope_table_uidx
  ON app.ingested_table (
    table_key,
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(env_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TABLE IF NOT EXISTS app.ingested_row (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingested_table_id uuid NOT NULL REFERENCES app.ingested_table(id) ON DELETE CASCADE,
  natural_key text NULL,
  data_json jsonb NOT NULL,
  source_run_id uuid NOT NULL REFERENCES app.ingest_run(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ingested_row_table_natural_key_uidx
  ON app.ingested_row (ingested_table_id, natural_key)
  WHERE natural_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ingested_row_source_run_idx
  ON app.ingested_row (source_run_id);

-- ─────────────────────────────────────────────────────────────
-- Metrics data point registry integration
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.metrics_data_point_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id uuid NULL,
  data_point_key text NOT NULL,
  source_table_key text NOT NULL,
  aggregation text NOT NULL,
  value_column text NULL,
  last_updated_at timestamptz NULL,
  row_count bigint NOT NULL DEFAULT 0,
  columns_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_data_point_registry_scope_key_uidx
  ON app.metrics_data_point_registry (
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(env_id, '00000000-0000-0000-0000-000000000000'::uuid),
    data_point_key
  );

CREATE INDEX IF NOT EXISTS metrics_data_point_registry_table_idx
  ON app.metrics_data_point_registry (source_table_key, last_updated_at DESC);

-- ─────────────────────────────────────────────────────────────
-- updated_at triggers (only if app.set_updated_at exists)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'set_updated_at'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ingest_source_set_updated_at') THEN
      CREATE TRIGGER ingest_source_set_updated_at
        BEFORE UPDATE ON app.ingest_source
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ingest_recipe_set_updated_at') THEN
      CREATE TRIGGER ingest_recipe_set_updated_at
        BEFORE UPDATE ON app.ingest_recipe
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ingest_vendor_set_updated_at') THEN
      CREATE TRIGGER ingest_vendor_set_updated_at
        BEFORE UPDATE ON app.ingest_vendor
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ingest_customer_set_updated_at') THEN
      CREATE TRIGGER ingest_customer_set_updated_at
        BEFORE UPDATE ON app.ingest_customer
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ingest_cashflow_event_set_updated_at') THEN
      CREATE TRIGGER ingest_cashflow_event_set_updated_at
        BEFORE UPDATE ON app.ingest_cashflow_event
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'gl_transaction_set_updated_at') THEN
      CREATE TRIGGER gl_transaction_set_updated_at
        BEFORE UPDATE ON app.gl_transaction
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trial_balance_set_updated_at') THEN
      CREATE TRIGGER trial_balance_set_updated_at
        BEFORE UPDATE ON app.trial_balance
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'deal_pipeline_deal_set_updated_at') THEN
      CREATE TRIGGER deal_pipeline_deal_set_updated_at
        BEFORE UPDATE ON app.deal_pipeline_deal
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ingested_table_set_updated_at') THEN
      CREATE TRIGGER ingested_table_set_updated_at
        BEFORE UPDATE ON app.ingested_table
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ingested_row_set_updated_at') THEN
      CREATE TRIGGER ingested_row_set_updated_at
        BEFORE UPDATE ON app.ingested_row
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'metrics_data_point_registry_set_updated_at') THEN
      CREATE TRIGGER metrics_data_point_registry_set_updated_at
        BEFORE UPDATE ON app.metrics_data_point_registry
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
  END IF;
END;
$$;
