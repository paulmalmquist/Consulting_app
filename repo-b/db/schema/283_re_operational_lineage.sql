-- 283_re_operational_lineage.sql
-- Canonical operational reporting inputs + lineage support columns.

CREATE TABLE IF NOT EXISTS re_asset_operating_qtr (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  quarter             text NOT NULL,
  scenario_id         uuid,
  revenue             numeric(28,12),
  other_income        numeric(28,12),
  opex                numeric(28,12),
  capex               numeric(28,12),
  debt_service        numeric(28,12),
  leasing_costs       numeric(28,12),
  tenant_improvements numeric(28,12),
  free_rent           numeric(28,12),
  occupancy           numeric(18,12),
  cash_balance        numeric(28,12),
  source_type         text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'seed', 'imported_gl', 'derived')),
  inputs_hash         text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_re_asset_operating_qtr_unique
  ON re_asset_operating_qtr(asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE IF EXISTS re_asset_quarter_state
  ADD COLUMN IF NOT EXISTS other_income numeric(28,12),
  ADD COLUMN IF NOT EXISTS leasing_costs numeric(28,12),
  ADD COLUMN IF NOT EXISTS tenant_improvements numeric(28,12),
  ADD COLUMN IF NOT EXISTS free_rent numeric(28,12),
  ADD COLUMN IF NOT EXISTS net_cash_flow numeric(28,12),
  ADD COLUMN IF NOT EXISTS implied_equity_value numeric(28,12),
  ADD COLUMN IF NOT EXISTS ltv numeric(18,12),
  ADD COLUMN IF NOT EXISTS dscr numeric(18,12),
  ADD COLUMN IF NOT EXISTS debt_yield numeric(18,12),
  ADD COLUMN IF NOT EXISTS value_source text;

ALTER TABLE IF EXISTS re_investment_quarter_state
  ADD COLUMN IF NOT EXISTS gross_asset_value numeric(28,12),
  ADD COLUMN IF NOT EXISTS debt_balance numeric(28,12),
  ADD COLUMN IF NOT EXISTS cash_balance numeric(28,12),
  ADD COLUMN IF NOT EXISTS effective_ownership_percent numeric(18,12),
  ADD COLUMN IF NOT EXISTS fund_nav_contribution numeric(28,12);
