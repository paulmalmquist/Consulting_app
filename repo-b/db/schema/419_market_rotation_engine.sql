-- ============================================================
-- 419 — Market Rotation Engine
-- Tables: market_segments, market_segment_intel_brief,
--         trading_feature_cards, ml_models, ml_predictions
-- Applied: 2026-03-22
-- ============================================================

-- 1. market_segments — 34 tracked market segments across equities/crypto/derivatives/macro
CREATE TABLE IF NOT EXISTS public.market_segments (
  segment_id     TEXT PRIMARY KEY,
  tenant_id      UUID NOT NULL DEFAULT 'bd1615b0-ecce-4f59-bdda-e24d99f6adfa',
  business_id    UUID NOT NULL DEFAULT '86a14dc1-bd54-4b63-8783-eadbc10e19ca',
  category       TEXT NOT NULL CHECK (category IN ('equities','crypto','derivatives','macro')),
  subcategory    TEXT NOT NULL,
  segment_name   TEXT NOT NULL,
  tickers        JSONB NOT NULL DEFAULT '[]',
  tier           INT NOT NULL CHECK (tier BETWEEN 1 AND 3),
  rotation_cadence_days INT NOT NULL DEFAULT 7,
  last_rotated_at TIMESTAMPTZ,
  rotation_priority_score NUMERIC(5,2) DEFAULT 0,
  heat_triggers  JSONB NOT NULL DEFAULT '[]',
  research_protocol TEXT NOT NULL DEFAULT '1A',
  cross_vertical JSONB NOT NULL DEFAULT '{}',
  research_runs  JSONB NOT NULL DEFAULT '[]',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. market_segment_intel_brief — Phase 1 research output per rotation
CREATE TABLE IF NOT EXISTS public.market_segment_intel_brief (
  brief_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id     TEXT NOT NULL REFERENCES public.market_segments(segment_id),
  tenant_id      UUID NOT NULL DEFAULT 'bd1615b0-ecce-4f59-bdda-e24d99f6adfa',
  run_date       DATE NOT NULL,
  regime_tag     TEXT CHECK (regime_tag IN (
    'RISK_ON_MOMENTUM','RISK_ON_BROADENING',
    'RISK_OFF_DEFENSIVE','RISK_OFF_PANIC',
    'TRANSITION_UP','TRANSITION_DOWN','RANGE_BOUND'
  )),
  signals        JSONB NOT NULL DEFAULT '{}',
  composite_score NUMERIC(5,2),
  key_findings   JSONB NOT NULL DEFAULT '[]',
  feature_gaps_identified JSONB NOT NULL DEFAULT '[]',
  cross_vertical_insights JSONB NOT NULL DEFAULT '{}',
  raw_sources    JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(segment_id, run_date)
);

-- 3. trading_feature_cards — Phase 2 gap-to-feature cards
CREATE TABLE IF NOT EXISTS public.trading_feature_cards (
  card_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL DEFAULT 'bd1615b0-ecce-4f59-bdda-e24d99f6adfa',
  business_id    UUID NOT NULL DEFAULT '86a14dc1-bd54-4b63-8783-eadbc10e19ca',
  segment_id     TEXT REFERENCES public.market_segments(segment_id),
  brief_id       UUID REFERENCES public.market_segment_intel_brief(brief_id),
  gap_category   TEXT NOT NULL CHECK (gap_category IN (
    'data_source','calculation','screening','visualization',
    'backtesting','risk_model','alert','cross_vertical'
  )),
  title          TEXT NOT NULL,
  description    TEXT,
  priority_score NUMERIC(5,2) DEFAULT 0,
  cross_vertical_flag BOOLEAN DEFAULT FALSE,
  spec_json      JSONB NOT NULL DEFAULT '{}',
  meta_prompt    TEXT,
  status         TEXT NOT NULL DEFAULT 'identified' CHECK (status IN (
    'identified','spec_ready','in_progress','shipped','deferred'
  )),
  target_module  TEXT,
  lineage_note   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ml_models — ML Signal Engine model registry
CREATE TABLE IF NOT EXISTS public.ml_models (
  model_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL DEFAULT 'bd1615b0-ecce-4f59-bdda-e24d99f6adfa',
  model_name     TEXT NOT NULL,
  pillar         TEXT NOT NULL CHECK (pillar IN (
    'momentum','mean_reversion','fundamental','volatility_surface',
    'onchain','sentiment','behavioral','ensemble'
  )),
  version        TEXT NOT NULL DEFAULT '0.1.0',
  hyperparameters JSONB NOT NULL DEFAULT '{}',
  training_metadata JSONB NOT NULL DEFAULT '{}',
  performance_metrics JSONB NOT NULL DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  trained_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. ml_predictions — Walk-forward prediction log
CREATE TABLE IF NOT EXISTS public.ml_predictions (
  prediction_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id       UUID REFERENCES public.ml_models(model_id),
  segment_id     TEXT REFERENCES public.market_segments(segment_id),
  run_date       DATE NOT NULL,
  prediction     JSONB NOT NULL DEFAULT '{}',
  confidence     NUMERIC(5,4),
  actual_outcome JSONB,
  evaluation     JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_market_segments_category ON public.market_segments(category);
CREATE INDEX IF NOT EXISTS idx_market_segments_tier ON public.market_segments(tier);
CREATE INDEX IF NOT EXISTS idx_market_segments_active ON public.market_segments(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_market_intel_segment_date ON public.market_segment_intel_brief(segment_id, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_trading_cards_status ON public.trading_feature_cards(status) WHERE status != 'deferred';
CREATE INDEX IF NOT EXISTS idx_trading_cards_segment ON public.trading_feature_cards(segment_id);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_segment_date ON public.ml_predictions(segment_id, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_model ON public.ml_predictions(model_id);
