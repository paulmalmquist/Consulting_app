-- Migration 005: Private Equity Real Estate JV waterfall model (v1)
-- Deterministic + auditable schema for deal/scenario/run/output lifecycle.
-- Idempotent by construction.

-- ─────────────────────────────────────────────────────────────
-- Catalog alignment: finance department + capability
-- ─────────────────────────────────────────────────────────────
INSERT INTO app.departments (key, label, icon, sort_order)
VALUES ('finance', 'Finance', 'dollar-sign', 15)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id,
       'jv-waterfall-model',
       'JV Waterfall Model',
       'dashboard',
       15,
       '{}'::jsonb
FROM app.departments d
WHERE d.key = 'finance'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label,
  kind = EXCLUDED.kind,
  sort_order = EXCLUDED.sort_order,
  metadata_json = EXCLUDED.metadata_json;

INSERT INTO app.business_departments (business_id, department_id, enabled)
SELECT b.business_id, d.department_id, true
FROM app.businesses b
JOIN app.departments d ON d.key = 'finance'
ON CONFLICT (business_id, department_id) DO UPDATE SET enabled = true;

INSERT INTO app.business_capabilities (business_id, capability_id, enabled)
SELECT b.business_id, c.capability_id, true
FROM app.businesses b
JOIN app.departments d ON d.key = 'finance'
JOIN app.capabilities c ON c.department_id = d.department_id AND c.key = 'jv-waterfall-model'
ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true;

-- ─────────────────────────────────────────────────────────────
-- Core entities
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.investment_fund (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.investment_deal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES app.investment_fund(id) ON DELETE CASCADE,
  name text NOT NULL,
  strategy text NULL,
  start_date date NOT NULL,
  default_scenario_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, name)
);

CREATE TABLE IF NOT EXISTS app.investment_property (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES app.investment_deal(id) ON DELETE CASCADE,
  name text NOT NULL,
  address_line1 text NULL,
  address_line2 text NULL,
  city text NULL,
  state text NULL,
  postal_code text NULL,
  country text NULL DEFAULT 'US',
  property_type text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- Partners + ownership
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.partner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('GP', 'LP', 'JV_PARTNER')),
  tax_type text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.deal_partner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES app.investment_deal(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES app.partner(id) ON DELETE CASCADE,
  commitment_amount numeric(20,2) NOT NULL DEFAULT 0,
  ownership_pct numeric(12,8) NOT NULL DEFAULT 0,
  has_promote boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, partner_id)
);

-- ─────────────────────────────────────────────────────────────
-- Waterfall definition
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.waterfall (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES app.investment_deal(id) ON DELETE CASCADE,
  name text NOT NULL,
  distribution_frequency text NOT NULL DEFAULT 'monthly' CHECK (distribution_frequency IN ('monthly', 'quarterly')),
  promote_structure_type text NOT NULL DEFAULT 'american' CHECK (promote_structure_type IN ('american', 'european')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, name)
);

CREATE TABLE IF NOT EXISTS app.waterfall_tier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waterfall_id uuid NOT NULL REFERENCES app.waterfall(id) ON DELETE CASCADE,
  tier_order int NOT NULL,
  tier_type text NOT NULL CHECK (tier_type IN ('return_of_capital', 'preferred_return', 'catch_up', 'split')),
  hurdle_irr numeric(18,8) NULL,
  hurdle_multiple numeric(18,8) NULL,
  pref_rate numeric(18,8) NULL,
  catch_up_pct numeric(18,8) NULL,
  split_lp numeric(18,8) NULL,
  split_gp numeric(18,8) NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (waterfall_id, tier_order)
);

-- ─────────────────────────────────────────────────────────────
-- Scenario + assumptions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.scenario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES app.investment_deal(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  as_of_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, name)
);

CREATE TABLE IF NOT EXISTS app.scenario_assumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES app.scenario(id) ON DELETE CASCADE,
  key text NOT NULL,
  value_num numeric(24,8) NULL,
  value_text text NULL,
  value_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'app'
      AND table_name = 'investment_deal'
      AND constraint_name = 'investment_deal_default_scenario_fk'
  ) THEN
    ALTER TABLE app.investment_deal
      ADD CONSTRAINT investment_deal_default_scenario_fk
      FOREIGN KEY (default_scenario_id)
      REFERENCES app.scenario(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Cashflow events
-- Signed convention: positive amounts are cash inflows to the deal;
-- negative amounts are cash outflows from the deal.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.cashflow_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES app.investment_deal(id) ON DELETE CASCADE,
  property_id uuid NULL REFERENCES app.investment_property(id) ON DELETE SET NULL,
  date date NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'capital_call',
      'operating_cf',
      'capex',
      'debt_service',
      'refinance_proceeds',
      'sale_proceeds',
      'fee'
    )
  ),
  amount numeric(20,6) NOT NULL,
  scenario_id uuid NOT NULL REFERENCES app.scenario(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cashflow_event_scenario_date_idx
  ON app.cashflow_event (scenario_id, date);

CREATE INDEX IF NOT EXISTS cashflow_event_deal_date_idx
  ON app.cashflow_event (deal_id, date);

-- ─────────────────────────────────────────────────────────────
-- Engine runs + outputs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.model_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES app.investment_deal(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES app.scenario(id) ON DELETE CASCADE,
  waterfall_id uuid NOT NULL REFERENCES app.waterfall(id) ON DELETE CASCADE,
  run_hash text NOT NULL,
  engine_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  error_message text NULL
);

CREATE INDEX IF NOT EXISTS model_run_deal_scenario_idx
  ON app.model_run (deal_id, scenario_id, waterfall_id, started_at DESC);

CREATE INDEX IF NOT EXISTS model_run_run_hash_idx
  ON app.model_run (run_hash);

CREATE TABLE IF NOT EXISTS app.model_run_output_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_run_id uuid NOT NULL REFERENCES app.model_run(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  value_num numeric(24,8) NOT NULL,
  UNIQUE (model_run_id, metric_key)
);

CREATE TABLE IF NOT EXISTS app.model_run_distribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_run_id uuid NOT NULL REFERENCES app.model_run(id) ON DELETE CASCADE,
  date date NOT NULL,
  tier_id uuid NULL REFERENCES app.waterfall_tier(id) ON DELETE SET NULL,
  partner_id uuid NOT NULL REFERENCES app.partner(id) ON DELETE CASCADE,
  distribution_amount numeric(20,6) NOT NULL,
  distribution_type text NOT NULL CHECK (distribution_type IN ('roc', 'pref', 'catchup', 'promote', 'split', 'other')),
  lineage_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS app.model_run_tier_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_run_id uuid NOT NULL REFERENCES app.model_run(id) ON DELETE CASCADE,
  as_of_date date NULL,
  tier_id uuid NOT NULL REFERENCES app.waterfall_tier(id) ON DELETE CASCADE,
  cumulative_lp_distributed numeric(20,6) NOT NULL DEFAULT 0,
  cumulative_gp_distributed numeric(20,6) NOT NULL DEFAULT 0,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS model_run_output_summary_model_run_idx
  ON app.model_run_output_summary (model_run_id);

CREATE INDEX IF NOT EXISTS model_run_distribution_model_run_idx
  ON app.model_run_distribution (model_run_id);

CREATE INDEX IF NOT EXISTS model_run_distribution_model_run_date_idx
  ON app.model_run_distribution (model_run_id, date);

CREATE INDEX IF NOT EXISTS model_run_tier_ledger_model_run_idx
  ON app.model_run_tier_ledger (model_run_id);

-- ─────────────────────────────────────────────────────────────
-- Seeded v1 deal: Sunset Commons JV
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fund_id uuid;
  v_deal_id uuid;
  v_property_id uuid;
  v_lp_id uuid;
  v_gp_id uuid;
  v_waterfall_id uuid;
  v_scenario_base_id uuid;
  v_scenario_downside_id uuid;
  v_scenario_upside_id uuid;
  v_month_idx int;
  v_date date;
  v_amount numeric(20,6);
  v_scenario_id uuid;
BEGIN
  INSERT INTO app.investment_fund (name, currency)
  VALUES ('Sunset Growth Fund I', 'USD')
  ON CONFLICT (name) DO UPDATE SET currency = EXCLUDED.currency
  RETURNING id INTO v_fund_id;

  INSERT INTO app.investment_deal (fund_id, name, strategy, start_date)
  VALUES (v_fund_id, 'Sunset Commons JV', 'Value-Add Multifamily', DATE '2024-01-15')
  ON CONFLICT (fund_id, name) DO UPDATE SET
    strategy = EXCLUDED.strategy,
    start_date = EXCLUDED.start_date
  RETURNING id INTO v_deal_id;

  INSERT INTO app.investment_property (
    deal_id,
    name,
    address_line1,
    city,
    state,
    postal_code,
    country,
    property_type
  )
  VALUES (
    v_deal_id,
    'Sunset Commons',
    '1200 Sunset Blvd',
    'Austin',
    'TX',
    '78701',
    'US',
    'multifamily'
  )
  ON CONFLICT (deal_id, name) DO UPDATE SET
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    postal_code = EXCLUDED.postal_code,
    property_type = EXCLUDED.property_type
  RETURNING id INTO v_property_id;

  INSERT INTO app.partner (name, role, tax_type)
  VALUES ('Blue Oak Capital', 'LP', 'partnership')
  ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role
  RETURNING id INTO v_lp_id;

  INSERT INTO app.partner (name, role, tax_type)
  VALUES ('Winston Sponsor', 'GP', 'llc')
  ON CONFLICT (name) DO UPDATE SET role = EXCLUDED.role
  RETURNING id INTO v_gp_id;

  INSERT INTO app.deal_partner (
    deal_id,
    partner_id,
    commitment_amount,
    ownership_pct,
    has_promote
  )
  VALUES
    (v_deal_id, v_lp_id, 9000000, 0.90, false),
    (v_deal_id, v_gp_id, 1000000, 0.10, true)
  ON CONFLICT (deal_id, partner_id) DO UPDATE SET
    commitment_amount = EXCLUDED.commitment_amount,
    ownership_pct = EXCLUDED.ownership_pct,
    has_promote = EXCLUDED.has_promote;

  INSERT INTO app.waterfall (
    deal_id,
    name,
    distribution_frequency,
    promote_structure_type
  )
  VALUES (
    v_deal_id,
    'Sunset Standard Waterfall',
    'monthly',
    'american'
  )
  ON CONFLICT (deal_id, name) DO UPDATE SET
    distribution_frequency = EXCLUDED.distribution_frequency,
    promote_structure_type = EXCLUDED.promote_structure_type
  RETURNING id INTO v_waterfall_id;

  INSERT INTO app.waterfall_tier (
    waterfall_id,
    tier_order,
    tier_type,
    pref_rate,
    catch_up_pct,
    hurdle_irr,
    split_lp,
    split_gp,
    notes
  ) VALUES
    (v_waterfall_id, 1, 'return_of_capital', NULL, NULL, NULL, 0.90, 0.10, 'Return capital pro-rata to contributed capital'),
    (v_waterfall_id, 2, 'preferred_return', 0.08, NULL, NULL, 1.00, 0.00, '8% simple pref to LP'),
    (v_waterfall_id, 3, 'catch_up', NULL, 0.50, NULL, 0.50, 0.50, '50/50 GP catch-up until promote target'),
    (v_waterfall_id, 4, 'split', NULL, NULL, 0.14, 0.80, 0.20, '80/20 split until LP 14% IRR'),
    (v_waterfall_id, 5, 'split', NULL, NULL, NULL, 0.70, 0.30, '70/30 split above LP 14% IRR')
  ON CONFLICT (waterfall_id, tier_order) DO UPDATE SET
    tier_type = EXCLUDED.tier_type,
    pref_rate = EXCLUDED.pref_rate,
    catch_up_pct = EXCLUDED.catch_up_pct,
    hurdle_irr = EXCLUDED.hurdle_irr,
    split_lp = EXCLUDED.split_lp,
    split_gp = EXCLUDED.split_gp,
    notes = EXCLUDED.notes;

  INSERT INTO app.scenario (deal_id, name, description, as_of_date)
  VALUES
    (v_deal_id, 'Base', 'Base case underwriting assumptions', DATE '2024-01-15'),
    (v_deal_id, 'Downside', 'Lower NOI growth and lower sale price', DATE '2024-01-15'),
    (v_deal_id, 'Upside', 'Higher NOI growth and stronger exit', DATE '2024-01-15')
  ON CONFLICT (deal_id, name) DO UPDATE SET
    description = EXCLUDED.description,
    as_of_date = EXCLUDED.as_of_date;

  SELECT id INTO v_scenario_base_id
  FROM app.scenario
  WHERE deal_id = v_deal_id AND name = 'Base';

  SELECT id INTO v_scenario_downside_id
  FROM app.scenario
  WHERE deal_id = v_deal_id AND name = 'Downside';

  SELECT id INTO v_scenario_upside_id
  FROM app.scenario
  WHERE deal_id = v_deal_id AND name = 'Upside';

  UPDATE app.investment_deal
  SET default_scenario_id = v_scenario_base_id
  WHERE id = v_deal_id;

  -- Scenario assumptions
  INSERT INTO app.scenario_assumption (scenario_id, key, value_num, value_text, value_json)
  VALUES
    (v_scenario_base_id, 'sale_price', 18000000, NULL, NULL),
    (v_scenario_base_id, 'exit_date', NULL, '2028-12-31', NULL),
    (v_scenario_base_id, 'exit_cap_rate', 0.0525, NULL, NULL),
    (v_scenario_base_id, 'noi_growth', 0.025, NULL, NULL),
    (v_scenario_base_id, 'acquisition_price', 25000000, NULL, NULL),
    (v_scenario_base_id, 'capex_budget', 1250000, NULL, NULL),
    (v_scenario_base_id, 'refinance_date', NULL, '2026-06-30', NULL),
    (v_scenario_base_id, 'refinance_proceeds', 3000000, NULL, NULL),
    (v_scenario_base_id, 'asset_mgmt_fee', 60000, NULL, NULL),
    (v_scenario_base_id, 'disposition_fee', 0.01, NULL, NULL),

    (v_scenario_downside_id, 'sale_price', 16500000, NULL, NULL),
    (v_scenario_downside_id, 'exit_date', NULL, '2029-06-30', NULL),
    (v_scenario_downside_id, 'exit_cap_rate', 0.0580, NULL, NULL),
    (v_scenario_downside_id, 'noi_growth', 0.015, NULL, NULL),
    (v_scenario_downside_id, 'asset_mgmt_fee', 65000, NULL, NULL),

    (v_scenario_upside_id, 'sale_price', 21000000, NULL, NULL),
    (v_scenario_upside_id, 'exit_date', NULL, '2028-06-30', NULL),
    (v_scenario_upside_id, 'exit_cap_rate', 0.0480, NULL, NULL),
    (v_scenario_upside_id, 'noi_growth', 0.0325, NULL, NULL),
    (v_scenario_upside_id, 'asset_mgmt_fee', 60000, NULL, NULL)
  ON CONFLICT (scenario_id, key) DO UPDATE SET
    value_num = EXCLUDED.value_num,
    value_text = EXCLUDED.value_text,
    value_json = EXCLUDED.value_json;

  -- Core seeded cashflow stream for each scenario.
  FOREACH v_scenario_id IN ARRAY ARRAY[v_scenario_base_id, v_scenario_downside_id, v_scenario_upside_id]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM app.cashflow_event c
      WHERE c.scenario_id = v_scenario_id
        AND c.metadata ->> 'seed' = 'sunset_commons_v1'
    ) THEN
      -- Initial equity call
      INSERT INTO app.cashflow_event (deal_id, property_id, date, event_type, amount, scenario_id, metadata)
      VALUES (
        v_deal_id,
        v_property_id,
        DATE '2024-01-15',
        'capital_call',
        10000000,
        v_scenario_id,
        jsonb_build_object('seed', 'sunset_commons_v1', 'memo', 'Initial equity contribution')
      );

      -- Monthly operating cash flow with ~2.5% annualized growth
      FOR v_month_idx IN 0..58 LOOP
        v_date := (DATE '2024-02-01' + (v_month_idx || ' month')::interval)::date;
        v_amount := round((90000 * power(1.025, v_month_idx / 12.0))::numeric, 6);

        INSERT INTO app.cashflow_event (deal_id, property_id, date, event_type, amount, scenario_id, metadata)
        VALUES (
          v_deal_id,
          v_property_id,
          v_date,
          'operating_cf',
          v_amount,
          v_scenario_id,
          jsonb_build_object('seed', 'sunset_commons_v1', 'memo', 'Projected NOI net operating CF')
        );
      END LOOP;

      -- Quarterly asset management fees
      FOR v_date IN
        SELECT generate_series(DATE '2024-03-31', DATE '2028-12-31', INTERVAL '3 month')::date
      LOOP
        INSERT INTO app.cashflow_event (deal_id, property_id, date, event_type, amount, scenario_id, metadata)
        VALUES (
          v_deal_id,
          v_property_id,
          v_date,
          'fee',
          -15000,
          v_scenario_id,
          jsonb_build_object('seed', 'sunset_commons_v1', 'memo', 'Quarterly asset management fee')
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
