-- Migration 426: Winston Execution Layer (paper-first, BOS-owned)
-- Additive only.

CREATE TABLE IF NOT EXISTS app.trade_intents (
  trade_intent_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id                 uuid REFERENCES v1.environments(env_id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL DEFAULT 'system',
  source_type            text NOT NULL,
  source_ref_id          text,
  asset_class            text,
  symbol                 text NOT NULL,
  instrument_type        text NOT NULL DEFAULT 'stock'
    CHECK (instrument_type IN ('stock', 'etf', 'option', 'future', 'crypto')),
  side                   text NOT NULL
    CHECK (side IN ('buy', 'sell', 'short', 'cover')),
  thesis_title           text,
  thesis_summary         text NOT NULL,
  confidence_score       numeric(6,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  time_horizon           text NOT NULL,
  signal_strength        numeric(6,2),
  trap_risk_score        numeric(6,2) NOT NULL CHECK (trap_risk_score BETWEEN 0 AND 100),
  crowding_score         numeric(6,2),
  meta_game_level        text,
  forecast_ref_id        uuid,
  invalidation_condition text NOT NULL,
  invalidation_level     numeric(18,6),
  expected_scenario      text NOT NULL,
  order_type             text NOT NULL DEFAULT 'market'
    CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit')),
  entry_price            numeric(18,6),
  desired_quantity       numeric(18,6),
  desired_notional       numeric(18,2),
  limit_price            numeric(18,6),
  stop_price             numeric(18,6),
  status                 text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_risk', 'blocked', 'approved', 'submitted', 'filled', 'cancelled', 'rejected')),
  approval_notes         text,
  approved_by            text,
  approved_at            timestamptz,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_trade_intents_business_status
  ON app.trade_intents (business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_intents_env
  ON app.trade_intents (env_id, created_at DESC) WHERE env_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_intents_symbol
  ON app.trade_intents (symbol, created_at DESC);

CREATE TABLE IF NOT EXISTS app.trade_risk_checks (
  risk_check_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_intent_id              uuid NOT NULL REFERENCES app.trade_intents(trade_intent_id) ON DELETE CASCADE,
  business_id                  uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  portfolio_exposure_check     text NOT NULL CHECK (portfolio_exposure_check IN ('pass', 'reduce', 'block')),
  concentration_check          text NOT NULL CHECK (concentration_check IN ('pass', 'reduce', 'block')),
  max_loss_check               text NOT NULL CHECK (max_loss_check IN ('pass', 'reduce', 'block')),
  liquidity_check              text NOT NULL CHECK (liquidity_check IN ('pass', 'reduce', 'block')),
  volatility_check             text NOT NULL CHECK (volatility_check IN ('pass', 'reduce', 'block')),
  broker_connectivity_check    text NOT NULL CHECK (broker_connectivity_check IN ('pass', 'reduce', 'block')),
  regime_check                 text NOT NULL CHECK (regime_check IN ('pass', 'reduce', 'block')),
  trap_risk_check              text NOT NULL CHECK (trap_risk_check IN ('pass', 'reduce', 'block')),
  live_gate_check              text NOT NULL CHECK (live_gate_check IN ('pass', 'reduce', 'block')),
  final_decision               text NOT NULL CHECK (final_decision IN ('pass', 'reduce', 'block')),
  adjustment_notes             text,
  size_explanation             text,
  recommended_size             numeric(18,6),
  recommended_notional         numeric(18,2),
  expected_max_loss            numeric(18,2),
  risk_budget_used_pct         numeric(10,4),
  stop_level                   numeric(18,6),
  invalidation_level           numeric(18,6),
  take_profit_framework        text,
  details_json                 jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_trade_risk_checks_trade
  ON app.trade_risk_checks (trade_intent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.execution_orders (
  execution_order_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_intent_id          uuid NOT NULL REFERENCES app.trade_intents(trade_intent_id) ON DELETE CASCADE,
  business_id              uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id                   uuid REFERENCES v1.environments(env_id) ON DELETE SET NULL,
  broker                   text NOT NULL DEFAULT 'ibkr',
  broker_account_mode      text NOT NULL CHECK (broker_account_mode IN ('paper', 'live')),
  broker_order_id          text,
  client_id                text,
  symbol                   text NOT NULL,
  contract_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_type               text NOT NULL CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit')),
  side                     text NOT NULL CHECK (side IN ('buy', 'sell', 'short', 'cover')),
  quantity                 numeric(18,6) NOT NULL,
  limit_price              numeric(18,6),
  stop_price               numeric(18,6),
  tif                      text NOT NULL DEFAULT 'DAY',
  submitted_at             timestamptz,
  last_status              text NOT NULL DEFAULT 'created',
  filled_quantity          numeric(18,6) NOT NULL DEFAULT 0,
  avg_fill_price           numeric(18,6),
  commission_estimate      numeric(18,6),
  raw_broker_response_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_orders_business_status
  ON app.execution_orders (business_id, last_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_orders_trade_intent
  ON app.execution_orders (trade_intent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS app.portfolio_positions (
  portfolio_position_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  broker                text NOT NULL DEFAULT 'ibkr',
  account_mode          text NOT NULL CHECK (account_mode IN ('paper', 'live')),
  symbol                text NOT NULL,
  asset_class           text,
  quantity              numeric(18,6) NOT NULL DEFAULT 0,
  avg_cost              numeric(18,6),
  market_price          numeric(18,6),
  market_value          numeric(18,2),
  unrealized_pnl        numeric(18,2),
  realized_pnl          numeric(18,2),
  risk_bucket           text,
  thesis_ref_id         uuid REFERENCES app.trade_intents(trade_intent_id) ON DELETE SET NULL,
  opened_at             timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, broker, account_mode, symbol)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_positions_business_mode
  ON app.portfolio_positions (business_id, account_mode, updated_at DESC);

CREATE TABLE IF NOT EXISTS app.execution_events (
  execution_event_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  trade_intent_id       uuid REFERENCES app.trade_intents(trade_intent_id) ON DELETE SET NULL,
  execution_order_id    uuid REFERENCES app.execution_orders(execution_order_id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  event_type            text NOT NULL,
  event_message         text NOT NULL,
  severity              text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  broker_payload_json   jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_execution_events_business_created
  ON app.execution_events (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_events_order
  ON app.execution_events (execution_order_id, created_at DESC) WHERE execution_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.risk_limits (
  risk_limit_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  scope          text NOT NULL CHECK (scope IN ('global', 'account', 'strategy', 'symbol', 'asset_class')),
  name           text NOT NULL,
  limit_type     text NOT NULL,
  limit_value    numeric(18,6) NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, scope, name)
);

CREATE INDEX IF NOT EXISTS idx_risk_limits_business_active
  ON app.risk_limits (business_id, active, scope);

CREATE TABLE IF NOT EXISTS app.execution_control_state (
  execution_control_state_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                uuid NOT NULL UNIQUE REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  current_mode               text NOT NULL DEFAULT 'paper'
    CHECK (current_mode IN ('paper', 'live_disabled', 'live_enabled')),
  kill_switch_active         boolean NOT NULL DEFAULT false,
  reason                     text,
  changed_by                 text NOT NULL DEFAULT 'migration:426',
  changed_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.post_trade_reviews (
  post_trade_review_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_intent_id          uuid NOT NULL REFERENCES app.trade_intents(trade_intent_id) ON DELETE CASCADE,
  business_id              uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  env_id                   uuid REFERENCES v1.environments(env_id) ON DELETE SET NULL,
  thesis_quality_score     numeric(6,2),
  timing_quality_score     numeric(6,2),
  sizing_quality_score     numeric(6,2),
  execution_quality_score  numeric(6,2),
  discipline_score         numeric(6,2),
  trap_realized_flag       boolean NOT NULL DEFAULT false,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_trade_reviews_business_created
  ON app.post_trade_reviews (business_id, created_at DESC);

INSERT INTO app.execution_control_state (business_id, current_mode, kill_switch_active, reason, changed_by)
SELECT b.business_id, 'paper', false, 'Seeded by migration 426', 'migration:426'
FROM app.businesses b
ON CONFLICT (business_id) DO NOTHING;

INSERT INTO app.risk_limits (business_id, scope, name, limit_type, limit_value, active)
SELECT b.business_id, seed.scope, seed.name, seed.limit_type, seed.limit_value, true
FROM app.businesses b
CROSS JOIN (
  VALUES
    ('account', 'max_trade_risk_pct', 'percent', 0.5::numeric),
    ('account', 'max_single_position_pct', 'percent', 5.0::numeric),
    ('account', 'max_open_positions', 'count', 20::numeric),
    ('account', 'max_live_orders', 'count', 0::numeric),
    ('account', 'max_daily_loss', 'percent', 1.5::numeric),
    ('account', 'max_correlation_cluster_exposure', 'count', 3::numeric)
) AS seed(scope, name, limit_type, limit_value)
ON CONFLICT (business_id, scope, name) DO NOTHING;
