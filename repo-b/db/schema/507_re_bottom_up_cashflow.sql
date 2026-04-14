-- 507_re_bottom_up_cashflow.sql
-- Bottom-up REPE cash flow engine: property-level CF series -> investment -> fund.
--
-- IRR becomes a derived output of quarterly property cash flows aggregated through
-- ownership %, not a top-down input. See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md
-- and /Users/paulmalmquist/.claude/plans/floating-baking-cerf.md for the contract.

CREATE TABLE IF NOT EXISTS re_asset_exit_event (
  exit_event_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            text NOT NULL,
  business_id       uuid NOT NULL REFERENCES business(business_id),
  asset_id          uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  revision_at       timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL CHECK (status IN ('underwritten', 'projected', 'realized')),
  exit_quarter      text NOT NULL,
  exit_date         date,
  gross_sale_price  numeric(28,12),
  selling_costs     numeric(28,12) DEFAULT 0,
  debt_payoff       numeric(28,12) DEFAULT 0,
  net_proceeds      numeric(28,12),
  projected_cap_rate numeric(18,12),
  notes             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, revision_at)
);

CREATE INDEX IF NOT EXISTS idx_re_asset_exit_event_asset
  ON re_asset_exit_event (asset_id, revision_at DESC);
CREATE INDEX IF NOT EXISTS idx_re_asset_exit_event_business
  ON re_asset_exit_event (business_id, env_id);

ALTER TABLE re_asset_exit_event ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 're_asset_exit_event'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON re_asset_exit_event
      USING (env_id = NULLIF(current_setting('app.env_id', true), ''))
      WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), ''));
  END IF;
END $$;

COMMENT ON TABLE re_asset_exit_event IS
  'Revision history of exit assumptions per asset (underwritten -> projected -> realized). Bottom-up CF engine reads latest row by asset to determine exit quarter + proceeds. Owning module: bottom_up_cashflow.';

CREATE TABLE IF NOT EXISTS re_asset_cf_projection (
  cf_projection_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                   text NOT NULL,
  business_id              uuid NOT NULL REFERENCES business(business_id),
  asset_id                 uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  quarter                  text NOT NULL,
  source                   text NOT NULL CHECK (source IN ('underwriting', 'model_run', 'manual')),
  run_id                   uuid,
  revenue                  numeric(28,12),
  opex                     numeric(28,12),
  capex                    numeric(28,12),
  debt_service_interest    numeric(28,12),
  debt_service_principal   numeric(28,12),
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, quarter, source)
);

CREATE INDEX IF NOT EXISTS idx_re_asset_cf_projection_asset
  ON re_asset_cf_projection (asset_id, quarter);

ALTER TABLE re_asset_cf_projection ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 're_asset_cf_projection'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON re_asset_cf_projection
      USING (env_id = NULLIF(current_setting('app.env_id', true), ''))
      WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), ''));
  END IF;
END $$;

COMMENT ON TABLE re_asset_cf_projection IS
  'Quarterly projected revenue/opex/capex/debt-service per asset. Consumed by bottom_up_cashflow after the last-closed quarter cutoff to extend the CF series out to exit.';

CREATE TABLE IF NOT EXISTS re_asset_cf_series_mat (
  asset_id             uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  quarter              text NOT NULL,
  env_id               text NOT NULL,
  business_id          uuid NOT NULL REFERENCES business(business_id),
  as_of_quarter        text NOT NULL,
  quarter_end_date     date NOT NULL,
  cash_flow_base       numeric(28,12) NOT NULL,
  component_breakdown  jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_actual           boolean NOT NULL DEFAULT false,
  has_projection       boolean NOT NULL DEFAULT false,
  has_exit             boolean NOT NULL DEFAULT false,
  has_terminal_value   boolean NOT NULL DEFAULT false,
  warnings             jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_hash          text NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, as_of_quarter, quarter)
);

CREATE INDEX IF NOT EXISTS idx_re_asset_cf_series_mat_lookup
  ON re_asset_cf_series_mat (asset_id, as_of_quarter, quarter_end_date);

ALTER TABLE re_asset_cf_series_mat ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 're_asset_cf_series_mat'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON re_asset_cf_series_mat
      USING (env_id = NULLIF(current_setting('app.env_id', true), ''))
      WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), ''));
  END IF;
END $$;

COMMENT ON TABLE re_asset_cf_series_mat IS
  'Materialized per-asset quarterly cash flow series for a given as_of_quarter. One row per (asset, as_of_quarter, quarter). Rebuilt by bottom_up_cashflow.refresh_asset_cf_series on source change; readers never recompute inline.';

CREATE TABLE IF NOT EXISTS re_investment_cf_series_mat (
  investment_id        uuid NOT NULL REFERENCES repe_deal(deal_id) ON DELETE CASCADE,
  quarter              text NOT NULL,
  env_id               text NOT NULL,
  business_id          uuid NOT NULL REFERENCES business(business_id),
  as_of_quarter        text NOT NULL,
  quarter_end_date     date NOT NULL,
  cash_flow_base       numeric(28,12) NOT NULL,
  asset_contributions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ownership_applied    jsonb NOT NULL DEFAULT '{}'::jsonb,
  has_terminal_value   boolean NOT NULL DEFAULT false,
  warnings             jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_hash          text NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (investment_id, as_of_quarter, quarter)
);

CREATE INDEX IF NOT EXISTS idx_re_investment_cf_series_mat_lookup
  ON re_investment_cf_series_mat (investment_id, as_of_quarter, quarter_end_date);

ALTER TABLE re_investment_cf_series_mat ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 're_investment_cf_series_mat'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON re_investment_cf_series_mat
      USING (env_id = NULLIF(current_setting('app.env_id', true), ''))
      WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), ''));
  END IF;
END $$;

COMMENT ON TABLE re_investment_cf_series_mat IS
  'Materialized per-investment quarterly CF series, built by summing ownership-scaled rows from re_asset_cf_series_mat. Owning module: bottom_up_cashflow.';
