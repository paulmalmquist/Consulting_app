-- Migration 423: Winston Trading Lab — Core Schema
-- Transforms Market Intelligence Engine into a stateful decision system.
-- Additive only — no existing tables modified.
--
-- Entity graph:
--   themes → signals → hypotheses → positions → performance
--   research_notes attach to any entity via polymorphic FK
--   daily_briefs are standalone snapshots

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. THEMES — macro narratives that group signals
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trading_themes (
  theme_id        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  name            text         NOT NULL,
  description     text,
  category        text         NOT NULL DEFAULT 'macro'
    CHECK (category IN ('macro', 'sector', 'technical', 'fundamental', 'geopolitical', 'structural')),
  status          text         NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'watching', 'invalidated', 'archived')),
  confidence      numeric(5,2) DEFAULT 50.0 CHECK (confidence BETWEEN 0 AND 100),
  tags            text[]       DEFAULT '{}',
  cross_vertical  jsonb        NOT NULL DEFAULT '{}',
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_themes_status ON public.trading_themes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_themes_tenant ON public.trading_themes (tenant_id, status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. SIGNALS — observable market events with direction and strength
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trading_signals (
  signal_id       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  theme_id        uuid         REFERENCES public.trading_themes(theme_id),
  name            text         NOT NULL,
  description     text,
  category        text         NOT NULL DEFAULT 'macro'
    CHECK (category IN ('macro', 'sector', 'technical', 'alt_data', 'fundamental', 'sentiment', 'onchain')),
  direction       text         NOT NULL DEFAULT 'neutral'
    CHECK (direction IN ('bullish', 'bearish', 'neutral')),
  strength        numeric(5,2) NOT NULL DEFAULT 50.0
    CHECK (strength BETWEEN 0 AND 100),
  source          text         NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'model', 'ingestion', 'ai_generated')),
  asset_class     text,
  tickers         text[]       DEFAULT '{}',
  evidence        jsonb        NOT NULL DEFAULT '{}',
  decay_rate      numeric(5,4) DEFAULT 0.02,
  hit_count       int          DEFAULT 0,
  miss_count      int          DEFAULT 0,
  status          text         NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fading', 'expired', 'invalidated')),
  expires_at      timestamptz,
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_status ON public.trading_signals (status, strength DESC);
CREATE INDEX IF NOT EXISTS idx_signals_category ON public.trading_signals (category, status);
CREATE INDEX IF NOT EXISTS idx_signals_tenant ON public.trading_signals (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_signals_theme ON public.trading_signals (theme_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. HYPOTHESES — explicit beliefs derived from signals
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trading_hypotheses (
  hypothesis_id   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  thesis          text         NOT NULL,
  rationale       text,
  expected_outcome text,
  timeframe       text         DEFAULT '1-4 weeks'
    CHECK (timeframe IN ('intraday', '1-5 days', '1-4 weeks', '1-3 months', '3-12 months', '1y+')),
  confidence      numeric(5,2) NOT NULL DEFAULT 50.0
    CHECK (confidence BETWEEN 0 AND 100),
  proves_right    text,
  proves_wrong    text,
  invalidation_level text,
  status          text         NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'partially_confirmed', 'confirmed', 'invalidated', 'expired')),
  outcome_notes   text,
  outcome_score   numeric(5,2) CHECK (outcome_score BETWEEN -100 AND 100),
  tags            text[]       DEFAULT '{}',
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON public.trading_hypotheses (status, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_hypotheses_tenant ON public.trading_hypotheses (tenant_id, status);

-- Junction: hypothesis ↔ signals (many-to-many)
CREATE TABLE IF NOT EXISTS public.hypothesis_signals (
  hypothesis_id   uuid NOT NULL REFERENCES public.trading_hypotheses(hypothesis_id) ON DELETE CASCADE,
  signal_id       uuid NOT NULL REFERENCES public.trading_signals(signal_id) ON DELETE CASCADE,
  PRIMARY KEY (hypothesis_id, signal_id)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. POSITIONS — paper trades linked to hypotheses
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trading_positions (
  position_id     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  hypothesis_id   uuid         REFERENCES public.trading_hypotheses(hypothesis_id),
  ticker          text         NOT NULL,
  asset_name      text,
  asset_class     text         DEFAULT 'equity'
    CHECK (asset_class IN ('equity', 'etf', 'index', 'crypto', 'bond', 'commodity', 'option', 'reit', 'other')),
  direction       text         NOT NULL DEFAULT 'long'
    CHECK (direction IN ('long', 'short')),
  entry_price     numeric(16,6) NOT NULL,
  current_price   numeric(16,6),
  exit_price      numeric(16,6),
  size            numeric(16,6) NOT NULL DEFAULT 100,
  notional        numeric(16,2),
  unrealized_pnl  numeric(16,2),
  realized_pnl    numeric(16,2),
  return_pct      numeric(10,4),
  stop_loss       numeric(16,6),
  take_profit     numeric(16,6),
  notes           text,
  status          text         NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'stopped_out')),
  entry_at        timestamptz  NOT NULL DEFAULT now(),
  exit_at         timestamptz,
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_positions_status ON public.trading_positions (status, entry_at DESC);
CREATE INDEX IF NOT EXISTS idx_positions_ticker ON public.trading_positions (ticker, status);
CREATE INDEX IF NOT EXISTS idx_positions_tenant ON public.trading_positions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_positions_hypothesis ON public.trading_positions (hypothesis_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. POSITION PRICE SNAPSHOTS — daily mark-to-market
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.position_price_snapshots (
  snapshot_id     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id     uuid         NOT NULL REFERENCES public.trading_positions(position_id) ON DELETE CASCADE,
  snapshot_date   date         NOT NULL,
  price           numeric(16,6) NOT NULL,
  unrealized_pnl  numeric(16,2),
  return_pct      numeric(10,4),
  created_at      timestamptz  DEFAULT now(),
  UNIQUE (position_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_pos ON public.position_price_snapshots (position_id, snapshot_date DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. PERFORMANCE SNAPSHOTS — daily portfolio-level metrics
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trading_performance_snapshots (
  perf_id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  snapshot_date   date         NOT NULL,
  total_pnl       numeric(16,2) DEFAULT 0,
  unrealized_pnl  numeric(16,2) DEFAULT 0,
  realized_pnl    numeric(16,2) DEFAULT 0,
  open_positions  int          DEFAULT 0,
  closed_positions int         DEFAULT 0,
  win_count       int          DEFAULT 0,
  loss_count      int          DEFAULT 0,
  win_rate        numeric(5,2),
  avg_win         numeric(16,2),
  avg_loss        numeric(16,2),
  best_trade_pnl  numeric(16,2),
  worst_trade_pnl numeric(16,2),
  equity_value    numeric(16,2) DEFAULT 100000,
  metadata        jsonb        NOT NULL DEFAULT '{}',
  created_at      timestamptz  DEFAULT now(),
  UNIQUE (tenant_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_perf_snapshots ON public.trading_performance_snapshots (snapshot_date DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. RESEARCH NOTES — polymorphic attachment to any entity
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trading_research_notes (
  note_id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  title           text,
  content         text         NOT NULL,
  note_type       text         NOT NULL DEFAULT 'observation'
    CHECK (note_type IN ('observation', 'analysis', 'thesis_update', 'trade_journal', 'market_comment', 'lesson')),
  -- Polymorphic references (at most one set)
  signal_id       uuid         REFERENCES public.trading_signals(signal_id),
  hypothesis_id   uuid         REFERENCES public.trading_hypotheses(hypothesis_id),
  position_id     uuid         REFERENCES public.trading_positions(position_id),
  theme_id        uuid         REFERENCES public.trading_themes(theme_id),
  ticker          text,
  tags            text[]       DEFAULT '{}',
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_notes_type ON public.trading_research_notes (note_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_notes_tenant ON public.trading_research_notes (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_notes_signal ON public.trading_research_notes (signal_id) WHERE signal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_notes_hypothesis ON public.trading_research_notes (hypothesis_id) WHERE hypothesis_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_notes_position ON public.trading_research_notes (position_id) WHERE position_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. DAILY BRIEFS — AI-generated or manual daily market summaries
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trading_daily_briefs (
  brief_id        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  brief_date      date         NOT NULL,
  regime_label    text,
  regime_change   boolean      DEFAULT false,
  market_summary  text,
  key_moves       jsonb        NOT NULL DEFAULT '[]',
  signals_fired   jsonb        NOT NULL DEFAULT '[]',
  hypotheses_at_risk jsonb     NOT NULL DEFAULT '[]',
  position_pnl_summary jsonb   NOT NULL DEFAULT '{}',
  what_changed    text,
  top_risks       text,
  recommended_actions jsonb    NOT NULL DEFAULT '[]',
  created_at      timestamptz  DEFAULT now(),
  UNIQUE (tenant_id, brief_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_briefs ON public.trading_daily_briefs (brief_date DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. WATCHLIST — tracked assets
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trading_watchlist (
  watchlist_id    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  ticker          text         NOT NULL,
  asset_name      text,
  asset_class     text         DEFAULT 'equity',
  current_price   numeric(16,6),
  price_change_1d numeric(10,4),
  price_change_1w numeric(10,4),
  notes           text,
  alert_above     numeric(16,6),
  alert_below     numeric(16,6),
  is_active       boolean      DEFAULT true,
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now(),
  UNIQUE (tenant_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_tenant ON public.trading_watchlist (tenant_id, is_active);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS — tenant-scoped read for all tables
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trading_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hypothesis_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_research_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_daily_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_themes" ON public.trading_themes FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
CREATE POLICY "tenant_read_signals" ON public.trading_signals FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
CREATE POLICY "tenant_read_hypotheses" ON public.trading_hypotheses FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
CREATE POLICY "tenant_read_hypothesis_signals" ON public.hypothesis_signals FOR SELECT USING (true);
CREATE POLICY "tenant_read_positions" ON public.trading_positions FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
CREATE POLICY "tenant_read_price_snapshots" ON public.position_price_snapshots FOR SELECT USING (true);
CREATE POLICY "tenant_read_perf_snapshots" ON public.trading_performance_snapshots FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
CREATE POLICY "tenant_read_research_notes" ON public.trading_research_notes FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
CREATE POLICY "tenant_read_daily_briefs" ON public.trading_daily_briefs FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
CREATE POLICY "tenant_read_watchlist" ON public.trading_watchlist FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.trading_themes IS 'Macro narratives that group related signals. Part of Winston Trading Lab (migration 423).';
COMMENT ON TABLE public.trading_signals IS 'Observable market events with direction, strength, and decay. Linked to themes and hypotheses.';
COMMENT ON TABLE public.trading_hypotheses IS 'Explicit beliefs derived from signals. Must define proves_right and proves_wrong conditions.';
COMMENT ON TABLE public.trading_positions IS 'Paper trades (and later real-trade journal entries) linked to hypotheses. Tracks PnL.';
COMMENT ON TABLE public.trading_performance_snapshots IS 'Daily portfolio-level performance metrics for equity curve and win rate tracking.';
COMMENT ON TABLE public.trading_research_notes IS 'Polymorphic research notes attachable to signals, hypotheses, positions, or themes.';
COMMENT ON TABLE public.trading_daily_briefs IS 'Daily AI-generated or manual market summaries answering: what happened, what matters, what changed.';
COMMENT ON TABLE public.trading_watchlist IS 'Tracked assets with optional price alerts.';
