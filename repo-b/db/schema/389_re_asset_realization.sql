-- 389_re_asset_realization.sql
-- Explicit historical asset realization events for base-scenario and fund return attribution.

CREATE TABLE IF NOT EXISTS re_asset_realization (
  realization_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id              uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  fund_id               uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  deal_id               uuid NOT NULL REFERENCES repe_deal(deal_id) ON DELETE CASCADE,
  realization_type      text NOT NULL DEFAULT 'historical_sale'
    CHECK (realization_type IN ('historical_sale', 'write_down', 'recovery')),
  sale_date             date,
  gross_sale_price      numeric(28,12),
  sale_costs            numeric(28,12) NOT NULL DEFAULT 0,
  debt_payoff           numeric(28,12) NOT NULL DEFAULT 0,
  net_sale_proceeds     numeric(28,12),
  ownership_percent     numeric(18,12),
  attributable_proceeds numeric(28,12),
  source                text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('seed', 'manual', 'imported', 'allocated')),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, realization_type)
);

CREATE INDEX IF NOT EXISTS idx_re_asset_realization_fund
  ON re_asset_realization (fund_id, sale_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_re_asset_realization_deal
  ON re_asset_realization (deal_id, sale_date DESC, created_at DESC);
