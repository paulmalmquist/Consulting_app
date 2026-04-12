-- 506_research_state_pipeline.sql
-- Canonical research-state pipeline for Trading Platform / History Rhymes.

CREATE TABLE IF NOT EXISTS public.research_state (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_date                date NOT NULL,
  scope_type                text NOT NULL CHECK (scope_type IN ('market', 'asset_class', 'segment')),
  scope_key                 text NOT NULL,
  parent_state_id           uuid REFERENCES public.research_state(id) ON DELETE SET NULL,
  regime_label              text,
  regime_confidence         text CHECK (regime_confidence IN ('low', 'medium', 'high')),
  signal_freshness_score    numeric(5,4),
  signal_coherence_index    numeric(5,4),
  shock_type                text CHECK (shock_type IN ('endogenous', 'exogenous', 'mixed')),
  shock_dominance_score     numeric(5,4),
  credit_regime_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  volatility_regime_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_quality_flags        jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_analogs               jsonb NOT NULL DEFAULT '[]'::jsonb,
  analog_significance_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  divergences               jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_actions             jsonb NOT NULL DEFAULT '[]'::jsonb,
  scenario_distribution_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  parse_status              text NOT NULL DEFAULT 'failed' CHECK (parse_status IN ('complete', 'partial', 'ambiguous', 'failed')),
  parse_confidence          numeric(5,4),
  parse_warnings_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_fields_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_delta_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_path               text,
  source_hash               text,
  brief_type                text,
  schema_version            text NOT NULL DEFAULT 'research_state.v1',
  parser_version            text NOT NULL DEFAULT 'brief_parser.v1',
  engine_version            text NOT NULL DEFAULT 'decision_engine.v1',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state_date, scope_type, scope_key, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_research_state_lookup
  ON public.research_state (scope_type, scope_key, state_date DESC);

CREATE INDEX IF NOT EXISTS idx_research_state_parent
  ON public.research_state (parent_state_id);

CREATE TABLE IF NOT EXISTS public.research_state_field_provenance (
  research_state_field_provenance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_state_id          uuid NOT NULL REFERENCES public.research_state(id) ON DELETE CASCADE,
  field_name                 text NOT NULL,
  value_source               text NOT NULL CHECK (value_source IN ('parsed_brief', 'computed_live', 'inferred_fallback')),
  source_type                text,
  source_ref                 text,
  derivation_method          text,
  source_confidence          numeric(5,4),
  is_missing                 boolean NOT NULL DEFAULT false,
  is_ambiguous               boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (research_state_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_research_state_field_provenance_state
  ON public.research_state_field_provenance (research_state_id);

ALTER TABLE IF EXISTS public.hr_predictions
  ADD COLUMN IF NOT EXISTS research_state_id uuid REFERENCES public.research_state(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forecast_confidence numeric(5,4),
  ADD COLUMN IF NOT EXISTS scenario_dispersion_score numeric(5,4),
  ADD COLUMN IF NOT EXISTS adversarial_risk numeric(5,4),
  ADD COLUMN IF NOT EXISTS agent_agreement_score numeric(5,4),
  ADD COLUMN IF NOT EXISTS invalidation_triggers_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS research_context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deterministic_decision_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_hr_predictions_research_state
  ON public.hr_predictions (research_state_id, prediction_date DESC)
  WHERE research_state_id IS NOT NULL;
