-- 447_metric_routing_metadata.sql
-- Extends semantic_metric_def with routing metadata for the unified metric system.
-- Adds: query_strategy, template_key, service_function, aliases, metric_family,
--        allowed_breakouts, time_behavior, polarity, format_hint_fe
-- Idempotent: ADD COLUMN IF NOT EXISTS
-- Depends on: 340_semantic_catalog.sql

ALTER TABLE semantic_metric_def
  ADD COLUMN IF NOT EXISTS query_strategy   text NOT NULL DEFAULT 'semantic',
  ADD COLUMN IF NOT EXISTS template_key     text,
  ADD COLUMN IF NOT EXISTS service_function text,
  ADD COLUMN IF NOT EXISTS aliases          text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metric_family    text,
  ADD COLUMN IF NOT EXISTS allowed_breakouts text[],
  ADD COLUMN IF NOT EXISTS time_behavior    text NOT NULL DEFAULT 'point_in_time',
  ADD COLUMN IF NOT EXISTS polarity         text DEFAULT 'up_good',
  ADD COLUMN IF NOT EXISTS format_hint_fe   text;

COMMENT ON COLUMN semantic_metric_def.query_strategy   IS 'Execution strategy: template | semantic | service | computed';
COMMENT ON COLUMN semantic_metric_def.template_key     IS 'Maps to query_templates.py key (e.g. repe.fund_returns)';
COMMENT ON COLUMN semantic_metric_def.service_function IS 'Python service callable key (e.g. portfolio_kpis)';
COMMENT ON COLUMN semantic_metric_def.aliases          IS 'NLP synonyms for extraction (e.g. {"internal rate of return", "fund irr"})';
COMMENT ON COLUMN semantic_metric_def.metric_family    IS 'Logical grouping: returns | income | leverage | occupancy | capital | valuation | cash_flow | construction';
COMMENT ON COLUMN semantic_metric_def.allowed_breakouts IS 'Dimensions this metric can be broken out by (e.g. {fund, market, property_type})';
COMMENT ON COLUMN semantic_metric_def.time_behavior    IS 'Temporal semantics: point_in_time | additive_period | latest_snapshot';
COMMENT ON COLUMN semantic_metric_def.polarity         IS 'Direction preference: up_good | down_good | neutral';
COMMENT ON COLUMN semantic_metric_def.format_hint_fe   IS 'Frontend format hint: dollar | percent | ratio | count | number';

CREATE INDEX IF NOT EXISTS idx_smd_family
  ON semantic_metric_def (business_id, metric_family) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_smd_strategy
  ON semantic_metric_def (business_id, query_strategy) WHERE is_active = true;
