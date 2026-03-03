-- 303_cre_intelligence_graph.sql
-- CRE Intelligence Graph foundation for Winston.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS dim_property (
  property_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  property_name           text NOT NULL,
  address                 text,
  city                    text,
  state                   text,
  postal_code             text,
  country                 text NOT NULL DEFAULT 'US',
  lat                     numeric(10,7),
  lon                     numeric(11,7),
  geom                    geometry(Point, 4326),
  land_use                text,
  size_sqft               numeric(18,2),
  year_built              int,
  parcel_ids              text[] NOT NULL DEFAULT '{}'::text[],
  source_provenance       jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_confidence   numeric(5,4) NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dim_parcel (
  parcel_id               text PRIMARY KEY,
  county_fips             text NOT NULL,
  assessor_id             text,
  geom                    geometry(MultiPolygon, 4326),
  land_area               numeric(18,2),
  assessed_value          numeric(18,2),
  tax_year                int,
  provenance              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dim_building (
  building_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id             uuid NOT NULL REFERENCES dim_property(property_id) ON DELETE CASCADE,
  floors                  int,
  construction_type       text,
  sqft                    numeric(18,2),
  year_built              int,
  provenance              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dim_entity (
  entity_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  entity_type             text NOT NULL
                          CHECK (entity_type IN ('owner','borrower','lender','manager','tenant','broker','analyst','insurer','servicer','other')),
  name                    text NOT NULL,
  identifiers             jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bridge_property_entity (
  bridge_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  property_id             uuid NOT NULL REFERENCES dim_property(property_id) ON DELETE CASCADE,
  entity_id               uuid NOT NULL REFERENCES dim_entity(entity_id) ON DELETE CASCADE,
  role                    text NOT NULL,
  start_date              date,
  end_date                date,
  confidence              numeric(5,4) NOT NULL DEFAULT 0,
  provenance              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, entity_id, role, start_date)
);

CREATE TABLE IF NOT EXISTS dim_geography (
  geography_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geography_type          text NOT NULL
                          CHECK (geography_type IN ('tract','county','cbsa','zip','submarket')),
  geoid                   text NOT NULL,
  name                    text NOT NULL,
  state_code              text,
  cbsa_code               text,
  vintage                 int NOT NULL,
  geom                    geometry(MultiPolygon, 4326),
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (geography_type, geoid, vintage)
);

CREATE TABLE IF NOT EXISTS cre_geography_alias (
  alias_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geography_id            uuid NOT NULL REFERENCES dim_geography(geography_id) ON DELETE CASCADE,
  alias_type              text NOT NULL,
  alias_value             text NOT NULL,
  source                  text NOT NULL,
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_type, alias_value, source)
);

CREATE TABLE IF NOT EXISTS bridge_property_geography (
  bridge_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  property_id             uuid NOT NULL REFERENCES dim_property(property_id) ON DELETE CASCADE,
  geography_id            uuid NOT NULL REFERENCES dim_geography(geography_id) ON DELETE CASCADE,
  geography_type          text NOT NULL,
  match_method            text NOT NULL DEFAULT 'spatial_join',
  confidence              numeric(5,4) NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, geography_id)
);

CREATE TABLE IF NOT EXISTS fact_property_timeseries (
  fact_id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  property_id             uuid NOT NULL REFERENCES dim_property(property_id) ON DELETE CASCADE,
  period                  date NOT NULL,
  metric_key              text NOT NULL,
  value                   numeric(18,6) NOT NULL,
  units                   text,
  source                  text NOT NULL,
  vintage                 text,
  pulled_at               timestamptz NOT NULL DEFAULT now(),
  provenance              jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS fact_market_timeseries (
  fact_id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geography_id            uuid NOT NULL REFERENCES dim_geography(geography_id) ON DELETE CASCADE,
  period                  date NOT NULL,
  metric_key              text NOT NULL,
  value                   numeric(18,6) NOT NULL,
  units                   text,
  source                  text NOT NULL,
  vintage                 text,
  pulled_at               timestamptz NOT NULL DEFAULT now(),
  provenance              jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS doc_store_index (
  doc_id                  uuid PRIMARY KEY,
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  property_id             uuid REFERENCES dim_property(property_id) ON DELETE SET NULL,
  entity_id               uuid REFERENCES dim_entity(entity_id) ON DELETE SET NULL,
  type                    text NOT NULL,
  uri                     text NOT NULL,
  extracted_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  extraction_version      text NOT NULL,
  citations               jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score        numeric(5,4) NOT NULL DEFAULT 0,
  review_status           text NOT NULL DEFAULT 'pending'
                          CHECK (review_status IN ('pending','review_required','approved','rejected')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_store (
  feature_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  entity_scope            text NOT NULL,
  entity_id               uuid NOT NULL,
  period                  date NOT NULL,
  feature_key             text NOT NULL,
  value                   numeric(18,6) NOT NULL,
  version                 text NOT NULL,
  lineage_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_scope, entity_id, period, feature_key, version)
);

CREATE TABLE IF NOT EXISTS forecast_registry (
  forecast_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  scope                   text NOT NULL,
  entity_id               uuid NOT NULL,
  target                  text NOT NULL,
  horizon                 text NOT NULL,
  model_version           text NOT NULL,
  prediction              numeric(18,6) NOT NULL,
  lower_bound             numeric(18,6),
  upper_bound             numeric(18,6),
  baseline_prediction     numeric(18,6),
  status                  text NOT NULL DEFAULT 'materialized',
  intervals               jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation_ptr         text,
  explanation_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_vintages         jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forecast_questions (
  question_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  text                    text NOT NULL,
  scope                   text NOT NULL,
  entity_id               uuid,
  event_date              date NOT NULL,
  resolution_criteria     text NOT NULL,
  resolution_source       text NOT NULL,
  probability             numeric(8,6) NOT NULL DEFAULT 0.5,
  method                  text NOT NULL DEFAULT 'ensemble',
  status                  text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','resolved','cancelled')),
  brier_score             numeric(12,6),
  last_moved_at           timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cre_source_registry (
  source_key              text PRIMARY KEY,
  display_name            text NOT NULL,
  source_type             text NOT NULL,
  license_class           text NOT NULL
                          CHECK (license_class IN ('public','open','restricted')),
  allows_robotic_access   boolean NOT NULL DEFAULT false,
  respect_robots_txt      boolean NOT NULL DEFAULT true,
  rate_limit_per_minute   int,
  source_url              text,
  default_scope           jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled              boolean NOT NULL DEFAULT true,
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cre_metric_catalog (
  metric_key              text PRIMARY KEY,
  label                   text NOT NULL,
  metric_scope            text NOT NULL,
  units                   text,
  description             text,
  is_public               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cre_feature_set_catalog (
  version                 text PRIMARY KEY,
  label                   text NOT NULL,
  description             text,
  target_metro            text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cre_model_catalog (
  model_version           text PRIMARY KEY,
  model_family            text NOT NULL,
  label                   text NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cre_forecast_question_template (
  template_key            text PRIMARY KEY,
  text_template           text NOT NULL,
  scope                   text NOT NULL,
  resolution_criteria     text NOT NULL,
  resolution_source       text NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cre_ingest_run (
  run_id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key              text NOT NULL REFERENCES cre_source_registry(source_key),
  scope_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  text NOT NULL
                          CHECK (status IN ('running','success','failed','cached')),
  rows_read               int NOT NULL DEFAULT 0,
  rows_written            int NOT NULL DEFAULT 0,
  error_count             int NOT NULL DEFAULT 0,
  duration_ms             int,
  token_cost              numeric(18,6),
  raw_artifact_path       text,
  error_summary           text,
  started_at              timestamptz NOT NULL DEFAULT now(),
  finished_at             timestamptz
);

CREATE TABLE IF NOT EXISTS cre_entity_resolution_candidate (
  candidate_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  property_id             uuid REFERENCES dim_property(property_id) ON DELETE CASCADE,
  entity_type             text NOT NULL,
  candidate_type          text NOT NULL
                          CHECK (candidate_type IN ('merge','split','link')),
  source_record           jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_match          jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence              numeric(5,4) NOT NULL DEFAULT 0,
  evidence                jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  reviewed_at             timestamptz,
  reviewed_by             text
);

CREATE TABLE IF NOT EXISTS cre_entity_resolution_decision (
  decision_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            uuid NOT NULL REFERENCES cre_entity_resolution_candidate(candidate_id) ON DELETE CASCADE,
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  property_id             uuid REFERENCES dim_property(property_id) ON DELETE SET NULL,
  action                  text NOT NULL,
  approved_by             text NOT NULL,
  decision_notes          text,
  before_state            jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forecast_signal_observation (
  observation_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id             uuid NOT NULL REFERENCES forecast_questions(question_id) ON DELETE CASCADE,
  signal_source           text NOT NULL,
  signal_type             text NOT NULL,
  source_ref              text,
  observed_at             timestamptz NOT NULL DEFAULT now(),
  probability             numeric(8,6) NOT NULL,
  weight                  numeric(8,6),
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS forecast_backtest_result (
  backtest_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL,
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id),
  scope                   text NOT NULL,
  entity_id               uuid NOT NULL,
  target                  text NOT NULL,
  model_version           text NOT NULL,
  metric_key              text NOT NULL,
  metric_value            numeric(18,6) NOT NULL,
  sample_size             int NOT NULL DEFAULT 0,
  window_label            text,
  generated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dim_property_env_business ON dim_property (env_id, business_id);
CREATE INDEX IF NOT EXISTS idx_dim_property_name_trgm ON dim_property USING gin (property_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dim_property_geom ON dim_property USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_dim_parcel_geom ON dim_parcel USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_dim_geography_type_geoid ON dim_geography (geography_type, geoid, vintage);
CREATE INDEX IF NOT EXISTS idx_dim_geography_geom ON dim_geography USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_bridge_property_geography_property ON bridge_property_geography (property_id, geography_type);
CREATE INDEX IF NOT EXISTS idx_fact_market_ts_lookup ON fact_market_timeseries (geography_id, metric_key, period DESC);
CREATE INDEX IF NOT EXISTS idx_fact_property_ts_lookup ON fact_property_timeseries (property_id, metric_key, period DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_property_ts_dedupe
  ON fact_property_timeseries (property_id, period, metric_key, source, COALESCE(vintage, ''));
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_market_ts_dedupe
  ON fact_market_timeseries (geography_id, period, metric_key, source, COALESCE(vintage, ''));
CREATE INDEX IF NOT EXISTS idx_feature_store_lookup ON feature_store (entity_scope, entity_id, version, period DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_registry_lookup ON forecast_registry (scope, entity_id, target, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_questions_env_business ON forecast_questions (env_id, business_id, status, event_date);
CREATE INDEX IF NOT EXISTS idx_resolution_candidates_env_business ON cre_entity_resolution_candidate (env_id, business_id, status);
CREATE INDEX IF NOT EXISTS idx_signal_observation_question_time ON forecast_signal_observation (question_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_run_source_time ON cre_ingest_run (source_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_store_index_scope ON doc_store_index (env_id, business_id, review_status);

ALTER TABLE IF EXISTS re_pipeline_property
  ADD COLUMN IF NOT EXISTS canonical_property_id uuid REFERENCES dim_property(property_id);
