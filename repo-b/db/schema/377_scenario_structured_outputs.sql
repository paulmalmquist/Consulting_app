-- 377_scenario_structured_outputs.sql
-- Structured output tables for deterministic scenario execution results.
-- Links to re_model_run(id) for run tracking.

-- Per-asset, per-period projected cashflows
CREATE TABLE IF NOT EXISTS scenario_asset_cashflows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES re_model_run(id) ON DELETE CASCADE,
  asset_id      uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  period_date   date NOT NULL,
  revenue       numeric(28,12) DEFAULT 0,
  expenses      numeric(28,12) DEFAULT 0,
  noi           numeric(28,12) DEFAULT 0,
  capex         numeric(28,12) DEFAULT 0,
  debt_service  numeric(28,12) DEFAULT 0,
  net_cash_flow numeric(28,12) DEFAULT 0,
  sale_proceeds numeric(28,12) DEFAULT 0,
  equity_cash_flow numeric(28,12) DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (run_id, asset_id, period_date)
);

-- Fund-level cash flow rollup by period
CREATE TABLE IF NOT EXISTS scenario_fund_cashflows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES re_model_run(id) ON DELETE CASCADE,
  fund_id       uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  period_date   date NOT NULL,
  capital_calls   numeric(28,12) DEFAULT 0,
  distributions   numeric(28,12) DEFAULT 0,
  net_cash_flow   numeric(28,12) DEFAULT 0,
  ending_nav      numeric(28,12) DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (run_id, fund_id, period_date)
);

-- Waterfall distribution breakdown per run
CREATE TABLE IF NOT EXISTS scenario_waterfall_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES re_model_run(id) ON DELETE CASCADE,
  fund_id         uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  period_date     date NOT NULL,
  lp_distribution   numeric(28,12) DEFAULT 0,
  gp_distribution   numeric(28,12) DEFAULT 0,
  carry             numeric(28,12) DEFAULT 0,
  return_of_capital numeric(28,12) DEFAULT 0,
  pref_paid         numeric(28,12) DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (run_id, fund_id, period_date)
);

-- Summary return metrics per run, scoped to fund or asset
CREATE TABLE IF NOT EXISTS scenario_return_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES re_model_run(id) ON DELETE CASCADE,
  scope_type      text NOT NULL CHECK (scope_type IN ('fund', 'asset')),
  scope_id        uuid NOT NULL,
  gross_irr       numeric(12,6),
  net_irr         numeric(12,6),
  gross_moic      numeric(12,4),
  net_moic        numeric(12,4),
  dpi             numeric(12,4),
  rvpi            numeric(12,4),
  tvpi            numeric(12,4),
  ending_nav      numeric(28,2),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (run_id, scope_type, scope_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_scenario_asset_cf_run ON scenario_asset_cashflows(run_id);
CREATE INDEX IF NOT EXISTS idx_scenario_asset_cf_asset ON scenario_asset_cashflows(asset_id);
CREATE INDEX IF NOT EXISTS idx_scenario_fund_cf_run ON scenario_fund_cashflows(run_id);
CREATE INDEX IF NOT EXISTS idx_scenario_return_metrics_run ON scenario_return_metrics(run_id);
CREATE INDEX IF NOT EXISTS idx_scenario_waterfall_run ON scenario_waterfall_results(run_id);
