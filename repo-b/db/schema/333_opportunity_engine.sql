-- 333_opportunity_engine.sql
-- Opportunity Engine v1 persistence layer.

CREATE TABLE IF NOT EXISTS model_runs (
  run_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  run_type             text NOT NULL DEFAULT 'scheduled',
  mode                 text NOT NULL DEFAULT 'fixture',
  model_version        text NOT NULL,
  status               text NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running', 'success', 'failed')),
  business_lines       text[] NOT NULL DEFAULT ARRAY[]::text[],
  triggered_by         text,
  input_hash           text,
  parameters_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary        text,
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunity_scores (
  opportunity_score_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid NOT NULL REFERENCES model_runs(run_id) ON DELETE CASCADE,
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  business_line        text NOT NULL,
  entity_type          text NOT NULL,
  entity_id            uuid,
  entity_key           text NOT NULL,
  title                text NOT NULL,
  sector               text,
  geography            text,
  as_of_date           date NOT NULL,
  score                numeric(18,6) NOT NULL DEFAULT 0,
  probability          numeric(18,6),
  expected_value       numeric(28,12),
  rank_position        int,
  model_version        text NOT NULL,
  fallback_mode        text,
  features_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, business_line, entity_type, entity_key)
);

CREATE TABLE IF NOT EXISTS project_recommendations (
  recommendation_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid NOT NULL REFERENCES model_runs(run_id) ON DELETE CASCADE,
  opportunity_score_id uuid REFERENCES opportunity_scores(opportunity_score_id) ON DELETE SET NULL,
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  business_line        text NOT NULL,
  entity_type          text NOT NULL,
  entity_id            uuid,
  entity_key           text NOT NULL,
  recommendation_type  text NOT NULL,
  title                text NOT NULL,
  summary              text,
  suggested_action     text,
  action_owner         text,
  priority             text NOT NULL DEFAULT 'medium',
  sector               text,
  geography            text,
  confidence           numeric(18,6) NOT NULL DEFAULT 0,
  why_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  driver_summary       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, business_line, entity_type, entity_key, recommendation_type)
);

CREATE TABLE IF NOT EXISTS market_signals (
  market_signal_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid NOT NULL REFERENCES model_runs(run_id) ON DELETE CASCADE,
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  signal_source        text NOT NULL,
  source_market_id     text NOT NULL,
  signal_key           text NOT NULL,
  signal_name          text NOT NULL,
  canonical_topic      text NOT NULL,
  business_line        text NOT NULL DEFAULT 'market_intel',
  sector               text,
  geography            text,
  signal_direction     text,
  probability          numeric(18,6) NOT NULL DEFAULT 0,
  signal_strength      numeric(18,6) NOT NULL DEFAULT 0,
  confidence           numeric(18,6),
  observed_at          timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  metadata_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, signal_source, signal_key)
);

CREATE TABLE IF NOT EXISTS forecast_snapshots (
  forecast_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id               uuid NOT NULL REFERENCES model_runs(run_id) ON DELETE CASCADE,
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  business_line        text NOT NULL,
  forecast_key         text NOT NULL,
  entity_type          text NOT NULL,
  entity_id            uuid,
  entity_key           text NOT NULL,
  signal_source        text,
  as_of_date           date NOT NULL,
  event_date           date,
  probability          numeric(18,6) NOT NULL DEFAULT 0,
  lower_bound          numeric(18,6),
  upper_bound          numeric(18,6),
  metadata_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, business_line, forecast_key, entity_type, entity_key, as_of_date)
);

CREATE TABLE IF NOT EXISTS signal_explanations (
  signal_explanation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                uuid NOT NULL REFERENCES model_runs(run_id) ON DELETE CASCADE,
  recommendation_id     uuid REFERENCES project_recommendations(recommendation_id) ON DELETE CASCADE,
  opportunity_score_id  uuid REFERENCES opportunity_scores(opportunity_score_id) ON DELETE CASCADE,
  market_signal_id      uuid REFERENCES market_signals(market_signal_id) ON DELETE CASCADE,
  forecast_snapshot_id  uuid REFERENCES forecast_snapshots(forecast_snapshot_id) ON DELETE CASCADE,
  explanation_type      text NOT NULL,
  driver_key            text NOT NULL,
  driver_label          text NOT NULL,
  driver_value          numeric(18,6),
  contribution_score    numeric(18,6),
  rank_position         int NOT NULL DEFAULT 1,
  explanation_text      text,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_runs_lookup
  ON model_runs (env_id, business_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_runs_status
  ON model_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunity_scores_lookup
  ON opportunity_scores (env_id, business_id, business_line, as_of_date DESC, rank_position);

CREATE INDEX IF NOT EXISTS idx_opportunity_scores_entity
  ON opportunity_scores (entity_type, entity_key, as_of_date DESC);

CREATE INDEX IF NOT EXISTS idx_project_recommendations_lookup
  ON project_recommendations (env_id, business_id, business_line, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_recommendations_entity
  ON project_recommendations (entity_type, entity_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_signals_lookup
  ON market_signals (env_id, business_id, canonical_topic, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecast_snapshots_lookup
  ON forecast_snapshots (env_id, business_id, business_line, as_of_date DESC);

CREATE INDEX IF NOT EXISTS idx_signal_explanations_lookup
  ON signal_explanations (run_id, recommendation_id, opportunity_score_id, rank_position);
