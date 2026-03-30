-- 432_re_golden_path_seed.sql
-- GOLDEN PATH TEST DATASET — one clean asset → JV → investment → fund chain
-- with fully reconcilable, locked-period operating history and a terminal sale event.
--
-- Asset:      Gateway Industrial Center  (100K SF, Austin TX, NNN lease)
-- JV:         Gateway Industrial JV LLC  (80% fund / 20% operating partner)
-- Investment: Gateway Industrial Center Acquisition
-- Fund:       IGF-VII  (a1b2c3d4-0003-0030-0001-000000000001)
--
-- Golden-path UUIDs all use the f0000000-9001-* prefix so they are
-- unambiguous in any query or debug session.
--
-- Financial model:
--   • 8 quarterly periods: 2025Q1 – 2026Q4
--   • Interest-only loan at 5.25% (no principal amortization during hold)
--   • NOI grows 0.5% per quarter off a $142,500 Q1 base
--   • Terminal sale in 2026Q4 at a 5.00% exit cap rate
--   • Every line-item is hardcoded — NO derived / heuristic values
--
-- Reconciliation identities that MUST hold (validated by chain-validation API):
--   NOI = revenue − opex
--   NCF = NOI − capex − reserves − debt_service
--   fund_cf = NCF × jv_ownership_pct  (0.80)
--   sale_net = gross_price − costs − debt_payoff
--   TVPI = (operating_ncf_total + sale_net) / equity_invested
--
-- Idempotent: ON CONFLICT DO NOTHING throughout.
-- Depends on: 265 (object model), 270 (institutional model), 358 (partners), 389 (realization)

DO $$
DECLARE
  -- Environment / business
  v_env_id      uuid := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  v_fund_id     uuid := 'a1b2c3d4-0003-0030-0001-000000000001';

  -- Golden-path entity UUIDs
  v_deal_id  uuid := 'f0000000-9001-0001-0001-000000000001';
  v_jv_id    uuid := 'f0000000-9001-0002-0001-000000000001';
  v_asset_id uuid := 'f0000000-9001-0003-0001-000000000001';
  v_loan_id  uuid := 'f0000000-9001-0004-0001-000000000001';

  -- Acquisition economics
  v_purchase_price  numeric := 10400000;  -- $10.4M
  v_loan_amount     numeric := 6760000;   -- 65% LTV
  v_equity_amount   numeric := 3640000;   -- 35% equity
  v_jv_fund_pct     numeric := 0.80;      -- fund owns 80% of JV
  v_jv_partner_pct  numeric := 0.20;      -- operating partner 20%
  v_loan_rate       numeric := 0.0525;    -- 5.25% IO
  v_io_quarterly    numeric := 88725;     -- $6,760,000 × 5.25% / 4

  -- Sale economics (2026Q4 terminal event)
  v_gross_sale_price   numeric := 11804800;  -- NOI×4/5.00% exit cap
  v_sale_costs         numeric := 354144;    -- 3% of gross price
  v_debt_payoff        numeric := 6760000;   -- IO, unchanged
  v_net_sale_proceeds  numeric := 4690656;   -- gross - costs - payoff

  -- Per-quarter locked data arrays (8 entries: Q1=index 1)
  -- quarters: 2025Q1, 2025Q2, 2025Q3, 2025Q4, 2026Q1, 2026Q2, 2026Q3, 2026Q4
  v_quarters    text[]    := ARRAY['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'];
  v_dates       date[]    := ARRAY['2025-03-31','2025-06-30','2025-09-30','2025-12-31','2026-03-31','2026-06-30','2026-09-30','2026-12-31'];
  v_revenue     numeric[] := ARRAY[150000, 150750, 151503, 152260, 153021, 153786, 154554, 155327];
  v_opex        numeric[] := ARRAY[  7500,   7538,   7575,   7613,   7651,   7689,   7728,   7766];
  v_noi         numeric[] := ARRAY[142500, 143213, 143928, 144648, 145370, 146097, 146827, 147560];
  v_capex       numeric[] := ARRAY[ 10000,  10000,  10000,  10000,  10000,  10000,  10000,  10000];
  v_ti_lc       numeric[] := ARRAY[     0,      0,      0,      0,      0,      0,      0,      0];  -- NNN, no TI
  v_reserves    numeric[] := ARRAY[  4500,   4500,   4500,   4500,   4500,   4500,   4500,   4500];
  v_debt_svc    numeric[] := ARRAY[ 88725,  88725,  88725,  88725,  88725,  88725,  88725,  88725];  -- IO
  v_interest    numeric[] := ARRAY[ 88725,  88725,  88725,  88725,  88725,  88725,  88725,  88725];
  v_principal   numeric[] := ARRAY[     0,      0,      0,      0,      0,      0,      0,      0];  -- IO
  -- NCF = NOI - capex - ti_lc - reserves - debt_svc
  v_ncf         numeric[] := ARRAY[ 39275,  39988,  40703,  41423,  42145,  42872,  43602,  44335];
  v_debt_bal    numeric[] := ARRAY[6760000,6760000,6760000,6760000,6760000,6760000,6760000,      0];  -- 0 after sale/payoff
  -- asset_val = NOI×4/0.055 for Q1-Q7, then exit price for Q8
  v_asset_val   numeric[] := ARRAY[10363636,10415491,10467491,10519855,10572364,10625091,10678327,11804800];
  v_nav         numeric[] := ARRAY[ 3603636, 3655491, 3707491, 3759855, 3812364, 3865091, 3918327,11804800];
  v_occupancy   numeric[] := ARRAY[    1.00,    1.00,    1.00,    1.00,    1.00,    1.00,    1.00,    1.00];  -- 100% (single NNN tenant)

  i int;
BEGIN
  -- Resolve business_id
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE NOTICE '432: No business binding for env %, skipping', v_env_id;
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- I. DEAL (investment)
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO repe_deal (
    deal_id, fund_id, name, deal_type, status,
    committed_capital, invested_capital, realized_distributions,
    acquisition_date
  )
  VALUES (
    v_deal_id, v_fund_id,
    'Gateway Industrial Center Acquisition',
    'equity', 'operating',
    v_equity_amount,   -- committed = equity invested
    v_equity_amount,
    0,
    '2025-01-01'
  )
  ON CONFLICT (deal_id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════
  -- II. JV
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO re_jv (
    jv_id, investment_id, legal_name, ownership_percent,
    gp_percent, lp_percent, status
  )
  VALUES (
    v_jv_id, v_deal_id,
    'Gateway Industrial JV LLC',
    1.0,             -- JV owns 100% of the asset
    v_jv_partner_pct,  -- 20% GP (operating partner)
    v_jv_fund_pct,     -- 80% LP (fund)
    'active'
  )
  ON CONFLICT (jv_id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════
  -- III. ASSET
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO repe_asset (
    asset_id, deal_id, jv_id, name, asset_type, status,
    acquisition_date, cost_basis
  )
  VALUES (
    v_asset_id, v_deal_id, v_jv_id,
    'Gateway Industrial Center',
    'property', 'active',
    '2025-01-01',
    v_purchase_price
  )
  ON CONFLICT (asset_id) DO NOTHING;

  INSERT INTO repe_property_asset (
    asset_id, property_type, market, city, state, msa,
    square_feet, current_noi, occupancy
  )
  VALUES (
    v_asset_id, 'industrial',
    'Austin-Round Rock-Georgetown', 'Austin', 'TX',
    'Austin-Round Rock-Georgetown',
    100000,      -- 100K SF
    570000,      -- annualized Q1 NOI
    1.00
  )
  ON CONFLICT (asset_id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════
  -- IV. LOAN — Interest-only, $6.76M @ 5.25%
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO re_loan (
    id, env_id, business_id, fund_id, investment_id, asset_id,
    loan_name, upb, rate_type, rate, amort_type, maturity
  )
  VALUES (
    v_loan_id,
    v_env_id::text,
    v_business_id,
    v_fund_id,
    v_deal_id,
    v_asset_id,
    'Gateway Industrial Center Mortgage',
    v_loan_amount,
    'fixed',
    v_loan_rate,
    'interest_only',
    '2032-01-01'   -- 7-year IO term
  )
  ON CONFLICT (id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════
  -- V. QUARTERLY ROLLUP — locked, deterministic per-period financials
  -- ═══════════════════════════════════════════════════════════════
  -- These are the IMMUTABLE source records. Every downstream
  -- reconciliation check must trace back to these rows.
  FOR i IN 1..8 LOOP
    -- re_asset_acct_quarter_rollup (GL rollup layer)
    INSERT INTO re_asset_acct_quarter_rollup (
      id, env_id, business_id, asset_id, quarter,
      revenue, opex, noi, capex,
      debt_service, ti_lc, reserves, net_cash_flow,
      source
    )
    VALUES (
      gen_random_uuid(),
      v_env_id, v_business_id, v_asset_id,
      v_quarters[i],
      v_revenue[i], v_opex[i], v_noi[i], v_capex[i],
      v_debt_svc[i], v_ti_lc[i], v_reserves[i], v_ncf[i],
      'golden_path'
    )
    ON CONFLICT (env_id, asset_id, quarter) DO NOTHING;

    -- re_asset_quarter_state (valuation + snapshot layer)
    INSERT INTO re_asset_quarter_state (
      id, asset_id, quarter, scenario_id,
      noi, revenue, opex, capex, debt_service, occupancy,
      debt_balance, asset_value, nav,
      valuation_method, inputs_hash, run_id, created_at
    )
    VALUES (
      gen_random_uuid(),
      v_asset_id, v_quarters[i], NULL,
      v_noi[i], v_revenue[i], v_opex[i], v_capex[i],
      v_debt_svc[i], v_occupancy[i],
      v_debt_bal[i], v_asset_val[i], v_nav[i],
      CASE WHEN i = 8 THEN 'market' ELSE 'cap_rate' END,
      'golden_path:' || v_asset_id::text || ':' || v_quarters[i],
      gen_random_uuid(),
      now()
    )
    ON CONFLICT DO NOTHING;

    -- re_investment_quarter_state (deal-level rollup)
    INSERT INTO re_investment_quarter_state (
      id, investment_id, quarter, scenario_id, run_id,
      nav, invested_capital, realized_distributions, unrealized_value,
      gross_irr, net_irr, equity_multiple,
      inputs_hash, created_at
    )
    VALUES (
      gen_random_uuid(),
      v_deal_id, v_quarters[i], NULL, gen_random_uuid(),
      v_nav[i] * v_jv_fund_pct,     -- fund's 80% share of JV NAV
      v_equity_amount * v_jv_fund_pct,  -- fund's equity
      CASE WHEN i < 8 THEN 0 ELSE v_net_sale_proceeds * v_jv_fund_pct END,
      v_nav[i] * v_jv_fund_pct,
      0.18, 0.15,   -- gross/net IRR estimates
      CASE WHEN i < 8
        THEN ROUND((v_nav[i] * v_jv_fund_pct) / (v_equity_amount * v_jv_fund_pct), 4)
        ELSE ROUND((v_net_sale_proceeds * v_jv_fund_pct) / (v_equity_amount * v_jv_fund_pct), 4)
      END,
      'golden_path:' || v_deal_id::text || ':' || v_quarters[i],
      now()
    )
    ON CONFLICT DO NOTHING;

    -- re_cashflow_ledger_entry — operating CF per quarter
    INSERT INTO re_cashflow_ledger_entry (
      fund_id, asset_id, cashflow_type, amount_base,
      effective_date, quarter, memo, run_id
    )
    SELECT
      v_fund_id, v_asset_id, 'operating_cf',
      v_ncf[i],
      v_dates[i], v_quarters[i],
      'Golden path operating CF — ' || v_quarters[i],
      gen_random_uuid()
    WHERE NOT EXISTS (
      SELECT 1 FROM re_cashflow_ledger_entry cfl
      WHERE cfl.asset_id = v_asset_id
        AND cfl.quarter = v_quarters[i]
        AND cfl.cashflow_type = 'operating_cf'
    );
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════
  -- VI. SALE / REALIZATION EVENT (Q8 terminal)
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO re_asset_realization (
    asset_id, fund_id, deal_id,
    realization_type, sale_date,
    gross_sale_price, sale_costs, debt_payoff, net_sale_proceeds,
    ownership_percent, attributable_proceeds,
    source, notes
  )
  VALUES (
    v_asset_id, v_fund_id, v_deal_id,
    'historical_sale', '2026-12-31',
    v_gross_sale_price, v_sale_costs, v_debt_payoff, v_net_sale_proceeds,
    v_jv_fund_pct,                             -- fund's 80% ownership
    v_net_sale_proceeds * v_jv_fund_pct,        -- $3,752,525
    'seed',
    'Golden path terminal sale. Exit cap 5.00%. Gross $11,804,800. Costs $354,144. Payoff $6,760,000. Net to equity $4,690,656.'
  )
  ON CONFLICT (asset_id, realization_type) DO NOTHING;

  -- Q8 sale CF ledger entry
  INSERT INTO re_cashflow_ledger_entry (
    fund_id, asset_id, cashflow_type, amount_base,
    effective_date, quarter, memo, run_id
  )
  SELECT
    v_fund_id, v_asset_id, 'sale_proceeds',
    v_net_sale_proceeds,
    '2026-12-31', '2026Q4',
    'Golden path terminal sale proceeds',
    gen_random_uuid()
  WHERE NOT EXISTS (
    SELECT 1 FROM re_cashflow_ledger_entry cfl
    WHERE cfl.asset_id = v_asset_id
      AND cfl.cashflow_type = 'sale_proceeds'
  );

  -- ═══════════════════════════════════════════════════════════════
  -- VII. CAPITAL LEDGER — fund capital call for this deal
  -- ═══════════════════════════════════════════════════════════════
  -- Single capital call on 2025-01-01 (closing)
  -- Uses GP partner (v_p1) for simplicity; real fund model uses pro-rata
  INSERT INTO re_capital_ledger_entry (
    fund_id, partner_id, entry_type,
    amount, amount_base,
    effective_date, quarter, memo, source
  )
  SELECT
    v_fund_id,
    'e0a10000-0001-0001-0001-000000000001'::uuid,  -- Meridian GP partner
    'contribution',
    v_equity_amount * v_jv_fund_pct,  -- $2,912,000 fund equity
    v_equity_amount * v_jv_fund_pct,
    '2025-01-01', '2025Q1',
    'Golden path capital call — Gateway Industrial Center acquisition',
    'golden_path'
  WHERE NOT EXISTS (
    SELECT 1 FROM re_capital_ledger_entry cle
    WHERE cle.fund_id = v_fund_id
      AND cle.memo = 'Golden path capital call — Gateway Industrial Center acquisition'
  );

  -- Q8 sale distribution back to fund
  INSERT INTO re_capital_ledger_entry (
    fund_id, partner_id, entry_type,
    amount, amount_base,
    effective_date, quarter, memo, source
  )
  SELECT
    v_fund_id,
    'e0a10000-0001-0001-0001-000000000001'::uuid,
    'distribution',
    v_net_sale_proceeds * v_jv_fund_pct,  -- $3,752,525
    v_net_sale_proceeds * v_jv_fund_pct,
    '2026-12-31', '2026Q4',
    'Golden path terminal sale distribution — Gateway Industrial Center',
    'golden_path'
  WHERE NOT EXISTS (
    SELECT 1 FROM re_capital_ledger_entry cle
    WHERE cle.fund_id = v_fund_id
      AND cle.memo = 'Golden path terminal sale distribution — Gateway Industrial Center'
  );

  RAISE NOTICE '432: Golden path seeded — asset %, deal %, jv %, fund %',
    v_asset_id, v_deal_id, v_jv_id, v_fund_id;
  RAISE NOTICE '432: Economics — equity $%, loan $%, IO qtrly $%, exit net $%',
    v_equity_amount, v_loan_amount, v_io_quarterly, v_net_sale_proceeds;

END $$;

-- ═══════════════════════════════════════════════════════════════
-- GOLDEN PATH CONSTANTS VIEW
-- Reference table consumed by the chain-validation API.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW re_golden_path_constants AS
SELECT
  'f0000000-9001-0003-0001-000000000001'::uuid AS asset_id,
  'f0000000-9001-0001-0001-000000000001'::uuid AS deal_id,
  'f0000000-9001-0002-0001-000000000001'::uuid AS jv_id,
  'f0000000-9001-0004-0001-000000000001'::uuid AS loan_id,
  'a1b2c3d4-0003-0030-0001-000000000001'::uuid AS fund_id,
  10400000::numeric  AS purchase_price,
  6760000::numeric   AS loan_amount,
  3640000::numeric   AS equity_amount,
  0.80::numeric      AS jv_fund_pct,
  0.20::numeric      AS jv_partner_pct,
  88725::numeric     AS io_quarterly,
  11804800::numeric  AS gross_sale_price,
  354144::numeric    AS sale_costs,
  6760000::numeric   AS debt_payoff,
  4690656::numeric   AS net_sale_proceeds,
  -- Derived totals (sum of 8 locked quarterly NCFs)
  -- Q1..Q8: 39275+39988+40703+41423+42145+42872+43602+44335 = 334343
  334343::numeric    AS total_operating_ncf,
  -- Fund's 80% share of operating NCF
  267474::numeric    AS fund_operating_ncf,
  -- Fund's 80% share of sale net proceeds
  3752525::numeric   AS fund_sale_proceeds,
  -- Total equity distributions (all periods, 100% asset level)
  5024999::numeric   AS total_equity_distributions,
  -- TVPI = total_equity_distributions / equity_amount
  ROUND(5024999::numeric / 3640000::numeric, 4) AS tvpi
;

COMMENT ON VIEW re_golden_path_constants IS
  'Deterministic constants for the golden-path end-to-end validation harness. '
  'Asset: Gateway Industrial Center, 100K SF industrial, Austin TX. '
  '8-quarter hold 2025Q1-2026Q4 with IO debt and terminal sale. '
  'All values are locked; any deviation in the validation API is a bug.';
