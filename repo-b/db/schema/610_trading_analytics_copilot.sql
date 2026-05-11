-- 610 - Trading Analytics Copilot demo schema
-- Additive, environment-scoped analytics tables for the Energy Trading Command Center.

CREATE TABLE IF NOT EXISTS public.trading_market_series (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  symbol            text        NOT NULL,
  asset_class       text        NOT NULL,
  source            text        NOT NULL,
  observation_date  date        NOT NULL,
  value             numeric     NOT NULL,
  unit              text        NOT NULL,
  series_type       text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, symbol, observation_date, series_type)
);

CREATE INDEX IF NOT EXISTS idx_trading_market_series_env_symbol_date
  ON public.trading_market_series (env_id, symbol, observation_date DESC);

CREATE INDEX IF NOT EXISTS idx_trading_market_series_source
  ON public.trading_market_series (env_id, source, observation_date DESC);

CREATE TABLE IF NOT EXISTS public.trading_feature_series (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  symbol            text        NOT NULL,
  feature_name      text        NOT NULL,
  observation_date  date        NOT NULL,
  value             numeric     NOT NULL,
  method            text        NOT NULL,
  source_hash       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, symbol, feature_name, observation_date)
);

CREATE INDEX IF NOT EXISTS idx_trading_feature_series_env_feature_date
  ON public.trading_feature_series (env_id, feature_name, observation_date DESC);

CREATE TABLE IF NOT EXISTS public.trading_analytics_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id      uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  run_type    text        NOT NULL,
  question    text,
  params      jsonb       NOT NULL DEFAULT '{}',
  result      jsonb       NOT NULL DEFAULT '{}',
  freshness   jsonb       NOT NULL DEFAULT '{}',
  warnings    text[]      NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_analytics_runs_env_created
  ON public.trading_analytics_runs (env_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trading_analytics_runs_type
  ON public.trading_analytics_runs (env_id, run_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trading_analytics_runs_result_gin
  ON public.trading_analytics_runs USING gin (result);

CREATE TABLE IF NOT EXISTS public.trading_memos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id      uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  run_id      uuid        REFERENCES public.trading_analytics_runs(id) ON DELETE SET NULL,
  title       text        NOT NULL,
  question    text        NOT NULL,
  memo_md     text        NOT NULL,
  evidence    jsonb       NOT NULL DEFAULT '{}',
  confidence  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_memos_env_created
  ON public.trading_memos (env_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trading_memos_run
  ON public.trading_memos (run_id)
  WHERE run_id IS NOT NULL;

ALTER TABLE public.trading_market_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_feature_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_analytics_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "env_read_trading_market_series" ON public.trading_market_series;
CREATE POLICY "env_read_trading_market_series"
  ON public.trading_market_series
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "env_read_trading_feature_series" ON public.trading_feature_series;
CREATE POLICY "env_read_trading_feature_series"
  ON public.trading_feature_series
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "env_read_trading_analytics_runs" ON public.trading_analytics_runs;
CREATE POLICY "env_read_trading_analytics_runs"
  ON public.trading_analytics_runs
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "env_read_trading_memos" ON public.trading_memos;
CREATE POLICY "env_read_trading_memos"
  ON public.trading_memos
  FOR SELECT
  USING (true);

COMMENT ON TABLE public.trading_market_series IS
  'Environment-scoped Trading Analytics Copilot market/fundamental series. demo_fixture sources are synthetic interview demo data, not live feeds.';

COMMENT ON TABLE public.trading_feature_series IS
  'Environment-scoped derived features for Trading Analytics Copilot seasonality, regression, scenario, and analog workflows.';

COMMENT ON TABLE public.trading_analytics_runs IS
  'Evidence trail for deterministic Trading Analytics Copilot tool calls and user-triggered analytics actions.';

COMMENT ON TABLE public.trading_memos IS
  'Persisted desk memos generated from Trading Analytics Copilot analytics runs.';
