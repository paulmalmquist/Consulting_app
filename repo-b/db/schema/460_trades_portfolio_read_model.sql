-- 460_trades_portfolio_read_model.sql
-- Portfolio read-model extensions for the BOS trading surface.

ALTER TABLE IF EXISTS app.trade_intents
  ADD COLUMN IF NOT EXISTS top_analog_id uuid,
  ADD COLUMN IF NOT EXISTS scenario_probabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS thesis_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS app.portfolio_positions
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'long',
  ADD COLUMN IF NOT EXISTS entry_price numeric(18,6),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS stop_loss numeric(18,6),
  ADD COLUMN IF NOT EXISTS take_profit numeric(18,6),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS quote_source text,
  ADD COLUMN IF NOT EXISTS quote_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS quote_data_class text,
  ADD COLUMN IF NOT EXISTS quote_freshness_state text,
  ADD COLUMN IF NOT EXISTS forecast_id uuid,
  ADD COLUMN IF NOT EXISTS top_analog_id uuid,
  ADD COLUMN IF NOT EXISTS scenario_probabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS thesis_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS invalidation_condition text,
  ADD COLUMN IF NOT EXISTS seed_input_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mock_input_count integer NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS app.portfolio_positions
  DROP CONSTRAINT IF EXISTS portfolio_positions_direction_check;

ALTER TABLE IF EXISTS app.portfolio_positions
  ADD CONSTRAINT portfolio_positions_direction_check
  CHECK (direction IN ('long', 'short'));

ALTER TABLE IF EXISTS app.portfolio_positions
  DROP CONSTRAINT IF EXISTS portfolio_positions_status_check;

ALTER TABLE IF EXISTS app.portfolio_positions
  ADD CONSTRAINT portfolio_positions_status_check
  CHECK (status IN ('draft', 'open', 'partially_closed', 'closed', 'cancelled'));

CREATE TABLE IF NOT EXISTS app.portfolio_quotes (
  portfolio_quote_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  account_mode            text NOT NULL DEFAULT 'paper' CHECK (account_mode IN ('paper', 'live')),
  symbol                  text NOT NULL,
  asset_class             text,
  source                  text NOT NULL,
  quote_timestamp         timestamptz NOT NULL,
  market_price            numeric(18,6),
  bid_price               numeric(18,6),
  ask_price               numeric(18,6),
  freshness_state         text NOT NULL DEFAULT 'fresh' CHECK (freshness_state IN ('fresh', 'stale', 'unavailable')),
  data_class              text NOT NULL DEFAULT 'live' CHECK (data_class IN ('live', 'delayed', 'seeded', 'derived')),
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_quotes_lookup
  ON app.portfolio_quotes (business_id, account_mode, symbol, quote_timestamp DESC);

CREATE TABLE IF NOT EXISTS app.portfolio_cash_flows (
  portfolio_cash_flow_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  effective_at            timestamptz NOT NULL,
  flow_type               text NOT NULL CHECK (flow_type IN ('deposit', 'withdrawal', 'fee', 'dividend', 'financing')),
  amount                  numeric(18,2) NOT NULL,
  notes                   text,
  source_ref_id           text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_cash_flows_lookup
  ON app.portfolio_cash_flows (business_id, effective_at DESC);

CREATE TABLE IF NOT EXISTS app.portfolio_snapshots (
  portfolio_snapshot_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  account_mode            text NOT NULL DEFAULT 'paper' CHECK (account_mode IN ('paper', 'live')),
  snapshot_time           timestamptz NOT NULL,
  snapshot_granularity    text NOT NULL DEFAULT 'intraday' CHECK (snapshot_granularity IN ('intraday', 'eod')),
  portfolio_value         numeric(18,2) NOT NULL,
  cash                    numeric(18,2) NOT NULL DEFAULT 0,
  gross_exposure          numeric(18,2) NOT NULL DEFAULT 0,
  net_exposure            numeric(18,2) NOT NULL DEFAULT 0,
  realized_pnl            numeric(18,2) NOT NULL DEFAULT 0,
  unrealized_pnl          numeric(18,2) NOT NULL DEFAULT 0,
  day_pnl                 numeric(18,2) NOT NULL DEFAULT 0,
  external_cash_flows     numeric(18,2) NOT NULL DEFAULT 0,
  benchmark_spy           numeric(18,6),
  benchmark_btc           numeric(18,6),
  seed_input_count        integer NOT NULL DEFAULT 0,
  mock_input_count        integer NOT NULL DEFAULT 0,
  freshness_state         text NOT NULL DEFAULT 'fresh' CHECK (freshness_state IN ('fresh', 'stale', 'unavailable')),
  source                  text NOT NULL DEFAULT 'derived',
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_lookup
  ON app.portfolio_snapshots (business_id, account_mode, snapshot_time DESC);

CREATE TABLE IF NOT EXISTS app.portfolio_closed_positions (
  portfolio_closed_position_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                 uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  account_mode                text NOT NULL DEFAULT 'paper' CHECK (account_mode IN ('paper', 'live')),
  symbol                      text NOT NULL,
  asset_class                 text,
  direction                   text NOT NULL DEFAULT 'long' CHECK (direction IN ('long', 'short')),
  quantity                    numeric(18,6) NOT NULL DEFAULT 0,
  entry_price                 numeric(18,6) NOT NULL,
  exit_price                  numeric(18,6) NOT NULL,
  opened_at                   timestamptz,
  closed_at                   timestamptz NOT NULL,
  realized_pnl                numeric(18,2) NOT NULL DEFAULT 0,
  realized_return_pct         numeric(10,4),
  close_reason                text,
  thesis_ref_id               uuid REFERENCES app.trade_intents(trade_intent_id) ON DELETE SET NULL,
  forecast_id                 uuid,
  top_analog_id               uuid,
  scenario_probabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  thesis_snapshot_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  invalidation_condition      text,
  quote_source                text,
  quote_data_class            text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_closed_positions_lookup
  ON app.portfolio_closed_positions (business_id, account_mode, closed_at DESC);
