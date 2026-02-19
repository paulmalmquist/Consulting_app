-- 263_fin_underwriting.sql
-- Deterministic underwriting orchestration schema with strict provenance.

CREATE OR REPLACE FUNCTION set_row_updated_at_public()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS uw_run (
  run_id                   uuid PRIMARY KEY REFERENCES run(run_id) ON DELETE CASCADE,
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  env_id                   uuid,
  execution_id             uuid REFERENCES app.executions(execution_id),
  property_name            text NOT NULL,
  property_type            text NOT NULL
                            CHECK (
                              property_type IN (
                                'multifamily',
                                'industrial',
                                'office',
                                'retail',
                                'medical_office',
                                'senior_housing',
                                'student_housing'
                              )
                            ),
  address_line1            text,
  address_line2            text,
  city                     text,
  state_province           text,
  postal_code              text,
  country                  text NOT NULL DEFAULT 'US',
  submarket                text,
  gross_area_sf            numeric(18,2),
  unit_count               int,
  occupancy_pct            numeric(10,6),
  in_place_noi_cents       bigint,
  purchase_price_cents     bigint,
  property_inputs_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                   text NOT NULL DEFAULT 'created'
                            CHECK (
                              status IN (
                                'created',
                                'research_ingested',
                                'scenarios_ran',
                                'completed',
                                'failed'
                              )
                            ),
  research_version         int NOT NULL DEFAULT 0 CHECK (research_version >= 0),
  normalized_version       int NOT NULL DEFAULT 0 CHECK (normalized_version >= 0),
  model_input_version      int NOT NULL DEFAULT 0 CHECK (model_input_version >= 0),
  output_version           int NOT NULL DEFAULT 0 CHECK (output_version >= 0),
  model_version            text NOT NULL DEFAULT 'uw_model_v1',
  normalization_version    text NOT NULL DEFAULT 'uw_norm_v1',
  contract_version         text NOT NULL DEFAULT 'uw_research_contract_v1',
  input_hash               text NOT NULL,
  dataset_version_id       uuid REFERENCES dataset_version(dataset_version_id),
  rule_version_id          uuid REFERENCES rule_version(rule_version_id),
  error_message            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, input_hash)
);

CREATE INDEX IF NOT EXISTS uw_run_business_created_idx
  ON uw_run (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS uw_run_business_status_idx
  ON uw_run (business_id, status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'uw_run_set_updated_at'
  ) THEN
    CREATE TRIGGER uw_run_set_updated_at
      BEFORE UPDATE ON uw_run
      FOR EACH ROW
      EXECUTE FUNCTION set_row_updated_at_public();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS uw_research_source (
  research_source_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  citation_key             text NOT NULL,
  url                      text NOT NULL,
  title                    text,
  publisher                text,
  date_accessed            date NOT NULL,
  raw_text_excerpt         text,
  excerpt_hash             text NOT NULL,
  raw_payload_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, citation_key)
);

CREATE INDEX IF NOT EXISTS uw_research_source_run_idx
  ON uw_research_source (run_id, created_at);

CREATE TABLE IF NOT EXISTS uw_research_datum (
  research_datum_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  source_id                uuid REFERENCES uw_research_source(research_source_id) ON DELETE SET NULL,
  citation_key             text,
  datum_key                text NOT NULL,
  fact_class               text NOT NULL CHECK (fact_class IN ('fact', 'assumption', 'inference')),
  value_kind               text NOT NULL CHECK (value_kind IN ('decimal', 'integer', 'text', 'date', 'bool', 'json')),
  value_decimal            numeric(20,8),
  value_int                bigint,
  value_text               text,
  value_date               date,
  value_bool               boolean,
  value_json               jsonb,
  unit                     text CHECK (
                              unit IS NULL
                              OR unit IN ('pct_decimal', 'usd_cents', 'sf', 'units', 'bps', 'ratio', 'count')
                            ),
  confidence               numeric(5,4),
  validation_warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_outlier               boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uw_research_datum_run_idx
  ON uw_research_datum (run_id, datum_key);
CREATE INDEX IF NOT EXISTS uw_research_datum_run_fact_class_idx
  ON uw_research_datum (run_id, fact_class);

CREATE TABLE IF NOT EXISTS uw_comp_sale (
  comp_sale_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  source_id                uuid REFERENCES uw_research_source(research_source_id) ON DELETE SET NULL,
  citation_key             text NOT NULL,
  address                  text NOT NULL,
  submarket                text,
  close_date               date,
  sale_price_cents         bigint NOT NULL CHECK (sale_price_cents >= 0),
  cap_rate                 numeric(10,6) CHECK (cap_rate IS NULL OR (cap_rate >= 0 AND cap_rate <= 0.2)),
  noi_cents                bigint CHECK (noi_cents IS NULL OR noi_cents >= 0),
  size_sf                  numeric(18,2) CHECK (size_sf IS NULL OR size_sf >= 0),
  price_per_sf_cents       bigint CHECK (price_per_sf_cents IS NULL OR price_per_sf_cents >= 0),
  confidence               numeric(5,4),
  dedupe_key               text NOT NULL,
  is_outlier               boolean NOT NULL DEFAULT false,
  validation_warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS uw_comp_sale_run_idx
  ON uw_comp_sale (run_id, close_date DESC);

CREATE TABLE IF NOT EXISTS uw_comp_lease (
  comp_lease_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  source_id                uuid REFERENCES uw_research_source(research_source_id) ON DELETE SET NULL,
  citation_key             text NOT NULL,
  address                  text NOT NULL,
  submarket                text,
  lease_date               date,
  rent_psf_cents           bigint NOT NULL CHECK (rent_psf_cents >= 0),
  term_months              int CHECK (term_months IS NULL OR term_months >= 0),
  size_sf                  numeric(18,2) CHECK (size_sf IS NULL OR size_sf >= 0),
  concessions_cents        bigint CHECK (concessions_cents IS NULL OR concessions_cents >= 0),
  confidence               numeric(5,4),
  dedupe_key               text NOT NULL,
  is_outlier               boolean NOT NULL DEFAULT false,
  validation_warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS uw_comp_lease_run_idx
  ON uw_comp_lease (run_id, lease_date DESC);

CREATE TABLE IF NOT EXISTS uw_market_snapshot (
  market_snapshot_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  source_id                uuid REFERENCES uw_research_source(research_source_id) ON DELETE SET NULL,
  citation_key             text NOT NULL,
  metric_key               text NOT NULL,
  metric_date              date,
  metric_grain             text NOT NULL DEFAULT 'point',
  metric_value_decimal     numeric(20,8) NOT NULL,
  unit                     text NOT NULL CHECK (unit IN ('pct_decimal', 'usd_cents', 'sf', 'units', 'bps', 'ratio', 'count')),
  confidence               numeric(5,4),
  validation_warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uw_market_snapshot_run_idx
  ON uw_market_snapshot (run_id, metric_key, metric_date DESC);

CREATE TABLE IF NOT EXISTS uw_assumption (
  assumption_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  source_id                uuid REFERENCES uw_research_source(research_source_id) ON DELETE SET NULL,
  citation_key             text,
  assumption_key           text NOT NULL,
  value_json               jsonb NOT NULL,
  rationale                text,
  assumption_origin        text NOT NULL DEFAULT 'user'
                            CHECK (assumption_origin IN ('user', 'research_suggestion', 'system', 'inference')),
  assumed_by               text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uw_assumption_run_idx
  ON uw_assumption (run_id, assumption_key);

CREATE TABLE IF NOT EXISTS uw_scenario (
  scenario_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  scenario_type            text NOT NULL CHECK (scenario_type IN ('base', 'upside', 'downside', 'custom')),
  name                     text NOT NULL,
  levers_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default               boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, name)
);

CREATE TABLE IF NOT EXISTS uw_model_result (
  model_result_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  scenario_id              uuid NOT NULL REFERENCES uw_scenario(scenario_id) ON DELETE CASCADE,
  valuation_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  returns_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  debt_json                jsonb NOT NULL DEFAULT '{}'::jsonb,
  sensitivities_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  proforma_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation           text NOT NULL CHECK (recommendation IN ('buy', 'pass', 'reprice')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, scenario_id)
);

CREATE TABLE IF NOT EXISTS uw_report_artifact (
  report_artifact_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  scenario_id              uuid REFERENCES uw_scenario(scenario_id) ON DELETE CASCADE,
  artifact_type            text NOT NULL
                            CHECK (
                              artifact_type IN (
                                'ic_memo_md',
                                'appraisal_md',
                                'outputs_json',
                                'outputs_md',
                                'sources_ledger_md'
                              )
                            ),
  content_md               text,
  content_json             jsonb,
  content_hash             text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uw_report_artifact_run_idx
  ON uw_report_artifact (run_id, scenario_id, artifact_type);

CREATE TABLE IF NOT EXISTS uw_input_snapshot (
  input_snapshot_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  snapshot_type            text NOT NULL CHECK (snapshot_type IN ('research_raw', 'research_normalized', 'model_input')),
  version                  int NOT NULL CHECK (version >= 1),
  payload_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash             text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, snapshot_type, version)
);

CREATE TABLE IF NOT EXISTS uw_output_snapshot (
  output_snapshot_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  scenario_id              uuid REFERENCES uw_scenario(scenario_id) ON DELETE CASCADE,
  snapshot_type            text NOT NULL CHECK (snapshot_type IN ('model_output', 'report_bundle')),
  version                  int NOT NULL CHECK (version >= 1),
  payload_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash             text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, scenario_id, snapshot_type, version)
);

CREATE TABLE IF NOT EXISTS uw_audit_event (
  uw_audit_event_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  run_id                   uuid NOT NULL REFERENCES uw_run(run_id) ON DELETE CASCADE,
  event_type               text NOT NULL,
  event_payload_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uw_audit_event_run_idx
  ON uw_audit_event (run_id, created_at DESC);
