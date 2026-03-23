-- 281_re_sale_scenarios.sql
-- Sale scenario modeling + scenario metrics snapshots
-- Depends on: 270_re_institutional_model.sql (re_scenario)

-- ── Sale Assumptions ────────────────────────────────────────────────────────
-- Hypothetical sale overrides for scenario modeling.
-- "What if we sell deal X / asset Y at price Z on date D?"
CREATE TABLE IF NOT EXISTS re_sale_assumption (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fund_id             UUID NOT NULL,
  scenario_id         UUID REFERENCES re_scenario(scenario_id),
  deal_id             UUID NOT NULL,
  asset_id            UUID,
  sale_price          NUMERIC(18,2) NOT NULL,
  sale_date           DATE NOT NULL,
  buyer_costs         NUMERIC(18,2) DEFAULT 0,
  disposition_fee_pct NUMERIC(6,4) DEFAULT 0,
  memo                TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fund_id, scenario_id, deal_id, asset_id)
);

-- ── Scenario Metrics Snapshot ───────────────────────────────────────────────
-- Stores computed metrics per scenario per quarter.
-- NEVER mutates re_fund_metrics_qtr (base metrics remain immutable).
CREATE TABLE IF NOT EXISTS re_scenario_metrics_snapshot (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fund_id             UUID NOT NULL,
  scenario_id         UUID NOT NULL REFERENCES re_scenario(scenario_id),
  quarter             VARCHAR(7) NOT NULL,
  run_id              UUID,
  gross_irr           NUMERIC(18,12),
  net_irr             NUMERIC(18,12),
  gross_tvpi          NUMERIC(18,4),
  net_tvpi            NUMERIC(18,4),
  dpi                 NUMERIC(18,4),
  rvpi                NUMERIC(18,4),
  total_distributed   NUMERIC(18,2),
  portfolio_nav       NUMERIC(18,2),
  carry_estimate      NUMERIC(18,2),
  waterfall_run_id    UUID,
  computed_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fund_id, scenario_id, quarter, run_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_assumption_fund_scenario
  ON re_sale_assumption (fund_id, scenario_id);

CREATE INDEX IF NOT EXISTS idx_scenario_metrics_fund_scenario
  ON re_scenario_metrics_snapshot (fund_id, scenario_id, quarter);
