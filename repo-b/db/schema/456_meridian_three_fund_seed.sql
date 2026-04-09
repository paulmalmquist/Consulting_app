-- 456_meridian_three_fund_seed.sql
-- Seeds mathematically consistent REPE data for three Meridian Capital Management funds:
--
--   1. Institutional Growth Fund VII  (Equity / Value-Add, vintage 2021, $850M)
--      12 assets (4 existing from 446 + 8 new), mid-cycle, target TVPI 1.55-1.75x
--
--   2. Meridian Real Estate Fund III  (Equity / Core-Plus, vintage 2019, $550M)
--      11 assets (2 exited), near maturity, target TVPI 1.40-1.60x
--
--   3. Meridian Credit Opportunities Fund I  (Debt / CMBS, vintage 2024, $600M)
--      8 senior bridge loans on multifamily, 70% deployed, covenant monitoring
--
-- Mathematical invariants enforced:
--   cap_rate = annualized_noi / asset_value  (MF 4.5-5.5%, Ind 5.0-6.0%, Retail 5.5-7.0%)
--   DSCR = quarterly_noi / quarterly_debt_service >= 1.20x (all assets)
--   LTV = debt_balance / asset_value <= 80%
--   TVPI = (cumulative_distributed + portfolio_nav) / cumulative_called
--   DPI = cumulative_distributed / cumulative_called < TVPI
--   net_irr < gross_irr by 1-4 pts
--   JV: lp_pct + gp_pct = 1.0, LP in 80-92% range
--
-- Depends on: 265, 267, 270, 278, 319, 358, 442, 446, 452
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout.

DO $$
DECLARE
  -- ══════ Context ══════
  v_env_id    text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;

  -- ══════ Fund UUIDs ══════
  v_fund_igf  uuid := 'a1b2c3d4-0003-0030-0001-000000000001';  -- existing IGF-VII
  v_fund_mref uuid := 'd4560000-0003-0030-0004-000000000001';  -- new: Meridian RE Fund III
  v_fund_mcof uuid := 'd4560000-0003-0030-0005-000000000001';  -- new: Meridian Credit Opp I

  -- ══════ Partner UUIDs (from 358) ══════
  v_p_gp       uuid := 'e0a10000-0001-0001-0001-000000000001';
  v_p_calpers  uuid := 'e0a10000-0001-0001-0002-000000000001';
  v_p_hartford uuid := 'e0a10000-0001-0001-0003-000000000001';
  v_p_duke     uuid := 'e0a10000-0001-0001-0004-000000000001';
  v_p_blackrock uuid := 'e0a10000-0001-0001-0005-000000000001';
  v_p_whitfield uuid := 'e0a10000-0001-0001-0006-000000000001';
  v_p_texteach uuid := 'e0a10000-0001-0001-0007-000000000001';
  v_p_evergreen uuid := 'e0a10000-0001-0001-0008-000000000001';

  -- ══════ Quarters ══════
  v_quarters text[] := ARRAY[
    '2024Q3','2024Q4','2025Q1','2025Q2','2025Q3',
    '2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'
  ];
  v_q   text;
  qi    int;   -- 0-based quarter index
  ai    int;   -- 1-based asset index

  -- ══════ Run IDs ══════
  v_seed_run uuid := 'd4560000-feed-feed-feed-000000000001';
  v_cov_run  uuid := 'd4560000-feed-feed-feed-000000000002';

  -- ══════════════════════════════════════════════════════════════════════
  -- FUND 1 (IGF-VII) — 8 NEW assets (indices 1-8)
  -- ══════════════════════════════════════════════════════════════════════
  v_f1_deal_ids  uuid[] := ARRAY[
    'd4560000-0456-0101-0001-000000000001','d4560000-0456-0101-0002-000000000001',
    'd4560000-0456-0101-0003-000000000001','d4560000-0456-0101-0004-000000000001',
    'd4560000-0456-0101-0005-000000000001','d4560000-0456-0101-0006-000000000001',
    'd4560000-0456-0101-0007-000000000001','d4560000-0456-0101-0008-000000000001'
  ];
  v_f1_asset_ids uuid[] := ARRAY[
    'd4560000-0456-0201-0001-000000000001','d4560000-0456-0201-0002-000000000001',
    'd4560000-0456-0201-0003-000000000001','d4560000-0456-0201-0004-000000000001',
    'd4560000-0456-0201-0005-000000000001','d4560000-0456-0201-0006-000000000001',
    'd4560000-0456-0201-0007-000000000001','d4560000-0456-0201-0008-000000000001'
  ];
  v_f1_jv_ids    uuid[] := ARRAY[
    'd4560000-0456-0301-0001-000000000001','d4560000-0456-0301-0002-000000000001',
    'd4560000-0456-0301-0003-000000000001','d4560000-0456-0301-0004-000000000001',
    'd4560000-0456-0301-0005-000000000001','d4560000-0456-0301-0006-000000000001',
    'd4560000-0456-0301-0007-000000000001','d4560000-0456-0301-0008-000000000001'
  ];
  -- Asset parameters (parallel arrays, index 1-8)
  v_f1_names     text[]    := ARRAY['Meadowview Apartments','Sunbelt Crossing','Pinehurst Residences','Bayshore Flats','Oakridge Residences','Lone Star Distribution','Peachtree Logistics Park','Northwest Commerce Center'];
  v_f1_ptypes    text[]    := ARRAY['multifamily','multifamily','multifamily','multifamily','multifamily','industrial','industrial','mixed_use'];
  v_f1_cities    text[]    := ARRAY['Austin','Phoenix','Charlotte','Tampa','Raleigh','Dallas','Atlanta','Portland'];
  v_f1_states    text[]    := ARRAY['TX','AZ','NC','FL','NC','TX','GA','OR'];
  v_f1_units     int[]     := ARRAY[320, 275, 210, 240, 180, 0, 0, 0];
  v_f1_sqft      numeric[] := ARRAY[0, 0, 0, 0, 0, 425000, 380000, 285000];
  v_f1_acq_dates date[]    := ARRAY['2021-09-15','2022-03-01','2022-06-15','2022-11-01','2023-02-15','2021-12-01','2022-08-15','2023-05-01'];
  v_f1_cost      numeric[] := ARRAY[210000000, 188000000, 158000000, 175000000, 137000000, 245000000, 222000000, 197000000];
  -- Financials: base quarterly NOI, cap rate, debt balance, debt coupon rate, occupancy, LP pct
  v_f1_base_noi  numeric[] := ARRAY[2756000, 2530000, 2174000, 2460000, 1920000, 3920000, 3640000, 2875000];
  v_f1_cap_rates numeric[] := ARRAY[0.0450, 0.0460, 0.0470, 0.0480, 0.0480, 0.0550, 0.0560, 0.0500];
  v_f1_base_debt numeric[] := ARRAY[135000000, 121000000, 102000000, 113000000, 88000000, 157000000, 143000000, 131000000];
  v_f1_debt_rate numeric[] := ARRAY[0.0500, 0.0500, 0.0500, 0.0500, 0.0500, 0.0550, 0.0550, 0.0525];
  v_f1_base_occ  numeric[] := ARRAY[0.94, 0.93, 0.95, 0.92, 0.94, 0.96, 0.95, 0.89];
  v_f1_lp_pcts   numeric[] := ARRAY[0.90, 0.90, 0.90, 0.90, 0.90, 0.88, 0.88, 0.85];
  v_f1_growth    numeric   := 0.010;  -- 1% quarterly NOI growth (value-add)

  -- ══════════════════════════════════════════════════════════════════════
  -- FUND 2 (MREF-III) — 11 assets (indices 1-11, #6 & #7 exited)
  -- ══════════════════════════════════════════════════════════════════════
  v_f2_deal_ids  uuid[] := ARRAY[
    'd4560000-0456-0102-0001-000000000001','d4560000-0456-0102-0002-000000000001',
    'd4560000-0456-0102-0003-000000000001','d4560000-0456-0102-0004-000000000001',
    'd4560000-0456-0102-0005-000000000001','d4560000-0456-0102-0006-000000000001',
    'd4560000-0456-0102-0007-000000000001','d4560000-0456-0102-0008-000000000001',
    'd4560000-0456-0102-0009-000000000001','d4560000-0456-0102-0010-000000000001',
    'd4560000-0456-0102-0011-000000000001'
  ];
  v_f2_asset_ids uuid[] := ARRAY[
    'd4560000-0456-0202-0001-000000000001','d4560000-0456-0202-0002-000000000001',
    'd4560000-0456-0202-0003-000000000001','d4560000-0456-0202-0004-000000000001',
    'd4560000-0456-0202-0005-000000000001','d4560000-0456-0202-0006-000000000001',
    'd4560000-0456-0202-0007-000000000001','d4560000-0456-0202-0008-000000000001',
    'd4560000-0456-0202-0009-000000000001','d4560000-0456-0202-0010-000000000001',
    'd4560000-0456-0202-0011-000000000001'
  ];
  v_f2_jv_ids    uuid[] := ARRAY[
    'd4560000-0456-0302-0001-000000000001','d4560000-0456-0302-0002-000000000001',
    'd4560000-0456-0302-0003-000000000001','d4560000-0456-0302-0004-000000000001',
    'd4560000-0456-0302-0005-000000000001','d4560000-0456-0302-0006-000000000001',
    'd4560000-0456-0302-0007-000000000001','d4560000-0456-0302-0008-000000000001',
    'd4560000-0456-0302-0009-000000000001','d4560000-0456-0302-0010-000000000001',
    'd4560000-0456-0302-0011-000000000001'
  ];
  v_f2_names     text[]    := ARRAY['Commonwealth Place','Capitol Gateway','Pacific Terrace','Mile High Apartments','Harmony Place','Emerald Ridge Apartments','Biscayne Towers','Inland Empire Fulfillment','DFW Logistics Center','Heartland Distribution','Scottsdale Market Square'];
  v_f2_ptypes    text[]    := ARRAY['multifamily','multifamily','multifamily','multifamily','multifamily','multifamily','multifamily','industrial','industrial','industrial','retail'];
  v_f2_cities    text[]    := ARRAY['Boston','Washington','San Diego','Denver','Nashville','Seattle','Miami','Riverside','Dallas','Columbus','Scottsdale'];
  v_f2_states    text[]    := ARRAY['MA','DC','CA','CO','TN','WA','FL','CA','TX','OH','AZ'];
  v_f2_units     int[]     := ARRAY[280, 310, 230, 200, 175, 245, 215, 0, 0, 0, 0];
  v_f2_sqft      numeric[] := ARRAY[0, 0, 0, 0, 0, 0, 0, 360000, 310000, 240000, 95000];
  v_f2_acq_dates date[]    := ARRAY['2019-06-01','2019-09-15','2020-01-15','2020-04-01','2020-07-15','2020-10-01','2021-01-15','2020-03-01','2020-08-15','2021-03-01','2020-06-01'];
  v_f2_cost      numeric[] := ARRAY[98000000, 108000000, 82000000, 72000000, 63000000, 87000000, 75000000, 122000000, 103000000, 80000000, 48000000];
  v_f2_statuses  text[]    := ARRAY['active','active','active','active','active','exited','exited','active','active','active','active'];
  v_f2_deal_stages text[]  := ARRAY['operating','operating','operating','operating','operating','exited','exited','operating','operating','operating','operating'];
  -- Financials
  v_f2_base_noi  numeric[] := ARRAY[1540000, 1700000, 1290000, 1140000, 1000000, 1340000, 1210000, 2190000, 1850000, 1430000, 960000];
  v_f2_cap_rates numeric[] := ARRAY[0.0474, 0.0482, 0.0484, 0.0486, 0.0490, 0.0478, 0.0483, 0.0547, 0.0550, 0.0548, 0.0605];
  v_f2_base_debt numeric[] := ARRAY[67000000, 73000000, 55000000, 49000000, 42000000, 58000000, 52000000, 84000000, 70000000, 55000000, 34000000];
  v_f2_debt_rate numeric[] := ARRAY[0.0475, 0.0475, 0.0480, 0.0480, 0.0485, 0.0485, 0.0490, 0.0510, 0.0510, 0.0515, 0.0540];
  v_f2_base_occ  numeric[] := ARRAY[0.95, 0.94, 0.93, 0.94, 0.95, 0.92, 0.93, 0.97, 0.96, 0.95, 0.91];
  v_f2_lp_pcts   numeric[] := ARRAY[0.88, 0.88, 0.88, 0.88, 0.88, 0.88, 0.88, 0.85, 0.85, 0.85, 0.80];
  v_f2_exit_qtrs int[]     := ARRAY[0,0,0,0,0,5,6,0,0,0,0];  -- qi when exited (5=2025Q3, 6=2025Q4), 0=no exit
  v_f2_exit_price numeric[] := ARRAY[0,0,0,0,0,112000000,100000000,0,0,0,0];  -- gross sale price
  v_f2_growth    numeric   := 0.004;  -- 0.4% quarterly NOI growth (core-plus, stable)

  -- ══════════════════════════════════════════════════════════════════════
  -- FUND 3 (MCOF-I) — 8 CMBS loan assets
  -- ══════════════════════════════════════════════════════════════════════
  v_f3_deal_ids  uuid[] := ARRAY[
    'd4560000-0456-0103-0001-000000000001','d4560000-0456-0103-0002-000000000001',
    'd4560000-0456-0103-0003-000000000001','d4560000-0456-0103-0004-000000000001',
    'd4560000-0456-0103-0005-000000000001','d4560000-0456-0103-0006-000000000001',
    'd4560000-0456-0103-0007-000000000001','d4560000-0456-0103-0008-000000000001'
  ];
  v_f3_asset_ids uuid[] := ARRAY[
    'd4560000-0456-0203-0001-000000000001','d4560000-0456-0203-0002-000000000001',
    'd4560000-0456-0203-0003-000000000001','d4560000-0456-0203-0004-000000000001',
    'd4560000-0456-0203-0005-000000000001','d4560000-0456-0203-0006-000000000001',
    'd4560000-0456-0203-0007-000000000001','d4560000-0456-0203-0008-000000000001'
  ];
  v_f3_loan_ids  uuid[] := ARRAY[
    'd4560000-0456-0501-0001-000000000001','d4560000-0456-0501-0002-000000000001',
    'd4560000-0456-0501-0003-000000000001','d4560000-0456-0501-0004-000000000001',
    'd4560000-0456-0501-0005-000000000001','d4560000-0456-0501-0006-000000000001',
    'd4560000-0456-0501-0007-000000000001','d4560000-0456-0501-0008-000000000001'
  ];
  v_f3_names     text[]    := ARRAY['Cypress Creek MF Bridge','Sycamore Park MF Bridge','Willow Glen MF Bridge','Cedar Point MF Bridge','Elm Street MF Bridge','Birch Landing MF Bridge','Aspen Ridge MF Bridge','Maple Commons MF Bridge'];
  v_f3_cities    text[]    := ARRAY['Houston','Phoenix','Dallas','Atlanta','Charlotte','Tampa','Denver','Nashville'];
  v_f3_states    text[]    := ARRAY['TX','AZ','TX','GA','NC','FL','CO','TN'];
  v_f3_upb       numeric[] := ARRAY[75000000, 66000000, 55000000, 72000000, 62000000, 26000000, 38000000, 29000000];  -- total $423M ~ 70% of $600M
  v_f3_coupon    numeric[] := ARRAY[0.0625, 0.0610, 0.0635, 0.0650, 0.0600, 0.0640, 0.0615, 0.0645];
  v_f3_ltv       numeric[] := ARRAY[0.73, 0.74, 0.75, 0.72, 0.76, 0.73, 0.77, 0.78];
  v_f3_maturity  date[]    := ARRAY['2029-06-15','2030-03-15','2030-06-15','2029-09-15','2030-09-15','2031-03-15','2030-12-15','2031-06-15'];
  v_f3_ratings   text[]    := ARRAY['A','A-','A-','A','BBB+','A-','BBB+','BBB'];
  -- Derived: debt_yield = annualized NOI / UPB; DSCR = debt_yield / coupon (IO loans)
  -- debt_yield: [9.2%, 8.8%, 8.5%, 9.5%, 8.3%, 9.0%, 8.08%, 7.6%]
  v_f3_debt_yield numeric[] := ARRAY[0.092, 0.088, 0.085, 0.095, 0.083, 0.090, 0.0808, 0.076];
  -- DSCR = debt_yield / coupon: [1.472, 1.443, 1.339, 1.462, 1.383, 1.406, 1.314, 1.178]
  -- Loan origination quarter (0-based): staggered deployment
  v_f3_orig_qi   int[]     := ARRAY[0, 1, 2, 0, 2, 4, 3, 5];

  -- ══════ Capital schedule arrays ══════
  -- Fund 1: pre-window called $799M, window calls $51M, total $850M
  v_f1_call_amts numeric[] := ARRAY[25500000, 17000000, 8500000, 0, 0, 0, 0, 0, 0, 0];
  v_f1_dist_amts numeric[] := ARRAY[16000000, 16000000, 18000000, 18000000, 22000000, 22000000, 25000000, 25000000, 28000000, 32000000];

  -- Fund 2: fully called $530M pre-window, operational + exit distributions
  v_f2_dist_amts numeric[] := ARRAY[9000000, 9000000, 10000000, 10000000, 61000000, 55000000, 11000000, 11000000, 12000000, 12000000];
  -- Q5 (2025Q3): $52M exit (Emerald Ridge net) + $9M ops; Q6 (2025Q4): $43M exit (Biscayne net) + $12M ops

  -- Fund 3: deploying, front-loaded calls, interest income distributions
  v_f3_call_pcts numeric[] := ARRAY[0.18, 0.14, 0.12, 0.09, 0.07, 0.05, 0.03, 0.02, 0, 0];
  v_f3_dist_amts numeric[] := ARRAY[1500000, 3500000, 5000000, 6000000, 6500000, 6500000, 6600000, 6600000, 6600000, 6600000];

  -- ══════ Working variables ══════
  v_noi       numeric;
  v_revenue   numeric;
  v_opex      numeric;
  v_capex     numeric;
  v_debt_svc  numeric;
  v_occ       numeric;
  v_debt_bal  numeric;
  v_asset_val numeric;
  v_nav       numeric;
  v_ltv       numeric;
  v_dscr_val  numeric;
  v_net_cf    numeric;
  v_debt_yld  numeric;

  -- Fund-level accumulators
  v_called      numeric;
  v_distributed numeric;
  v_port_nav    numeric;
  v_dpi         numeric;
  v_rvpi        numeric;
  v_tvpi        numeric;
  v_wtd_ltv     numeric;
  v_wtd_dscr    numeric;
  v_ltv_denom   numeric;
  v_dscr_denom  numeric;

  v_qdate date;
  v_year  int;
  v_q_num int;
  v_has_committed_equity boolean := false;
  v_has_target_irr       boolean := false;

BEGIN
  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 1: Context resolution + guard checks
  -- ════════════════════════════════════════════════════════════════════════
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id::uuid
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE NOTICE '456: No business binding for env %, skipping', v_env_id;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'repe_deal' AND column_name = 'committed_equity'
  ) INTO v_has_committed_equity;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'repe_fund' AND column_name = 'target_irr'
  ) INTO v_has_target_irr;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 2: Fund records
  -- ════════════════════════════════════════════════════════════════════════

  -- Fund 1: UPDATE existing IGF-VII to match $850M value-add spec
  UPDATE repe_fund SET
    vintage_year = 2021,
    target_size  = 850000000,
    fund_type    = 'closed_end',
    strategy     = 'equity',
    sub_strategy = 'value_add',
    status       = 'investing',
    term_years   = 7,
    inception_date        = '2021-03-01',
    target_leverage_min   = 0.50,
    target_leverage_max   = 0.60,
    target_hold_period_min_years = 5,
    target_hold_period_max_years = 7,
    target_sectors_json   = '["multifamily","industrial","mixed_use"]'::jsonb,
    target_geographies_json = '["Austin","Phoenix","Charlotte","Tampa","Raleigh","Dallas","Atlanta","Portland"]'::jsonb
  WHERE fund_id = v_fund_igf;

  IF v_has_target_irr THEN
    EXECUTE format('UPDATE repe_fund SET target_irr = 0.16 WHERE fund_id = %L', v_fund_igf);
  END IF;

  -- Fund 2: Meridian Real Estate Fund III
  INSERT INTO repe_fund (fund_id, business_id, name, vintage_year, fund_type, strategy, sub_strategy,
    target_size, term_years, status, base_currency, inception_date,
    target_leverage_min, target_leverage_max, target_hold_period_min_years, target_hold_period_max_years,
    target_sectors_json, target_geographies_json)
  VALUES (
    v_fund_mref, v_business_id, 'Meridian Real Estate Fund III', 2019, 'closed_end', 'equity', 'core_plus',
    550000000, 10, 'harvesting', 'USD', '2019-03-01',
    0.45, 0.55, 7, 10,
    '["multifamily","industrial","retail"]'::jsonb,
    '["Boston","Washington","San Diego","Denver","Nashville","Seattle","Miami","Dallas","Columbus","Scottsdale"]'::jsonb
  ) ON CONFLICT (fund_id) DO NOTHING;

  -- Fund 3: Meridian Credit Opportunities Fund I
  INSERT INTO repe_fund (fund_id, business_id, name, vintage_year, fund_type, strategy, strategy_type,
    sub_strategy, target_size, term_years, status, base_currency, inception_date,
    target_sectors_json, target_geographies_json)
  VALUES (
    v_fund_mcof, v_business_id, 'Meridian Credit Opportunities Fund I', 2024, 'closed_end', 'debt', 'cmbs',
    'senior_bridge', 600000000, 7, 'investing', 'USD', '2024-01-15',
    '["multifamily"]'::jsonb,
    '["Houston","Phoenix","Dallas","Atlanta","Charlotte","Tampa","Denver","Nashville"]'::jsonb
  ) ON CONFLICT (fund_id) DO NOTHING;

  IF v_has_target_irr THEN
    EXECUTE format('UPDATE repe_fund SET target_irr = 0.115 WHERE fund_id = %L AND target_irr IS NULL', v_fund_mref);
    EXECUTE format('UPDATE repe_fund SET target_irr = 0.13  WHERE fund_id = %L AND target_irr IS NULL', v_fund_mcof);
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 3: Fund terms (fee structures)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO repe_fund_term (fund_id, effective_from, management_fee_rate, management_fee_basis,
    preferred_return_rate, carry_rate, waterfall_style, catch_up_style)
  VALUES
    (v_fund_igf,  '2021-03-01', 0.015, 'committed', 0.08, 0.20, 'european', 'full'),
    (v_fund_mref, '2019-03-01', 0.0125, 'invested', 0.07, 0.20, 'european', 'partial'),
    (v_fund_mcof, '2024-01-15', 0.010, 'invested',  0.06, 0.15, 'american', 'none')
  ON CONFLICT (fund_id, effective_from) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 4: Partner commitments
  -- ════════════════════════════════════════════════════════════════════════

  -- Fund 1 ($850M): GP 5%, CalPERS 25%, TexTeach 20%, Blackrock 20%, Hartford 15%, Duke 10%, Whitfield 5%
  INSERT INTO re_partner_commitment (commitment_id, partner_id, fund_id, committed_amount, commitment_date, status)
  VALUES
    (gen_random_uuid(), v_p_gp,       v_fund_igf, 42500000,  '2021-03-01', 'active'),
    (gen_random_uuid(), v_p_calpers,  v_fund_igf, 212500000, '2021-03-01', 'active'),
    (gen_random_uuid(), v_p_texteach, v_fund_igf, 170000000, '2021-03-01', 'active'),
    (gen_random_uuid(), v_p_blackrock,v_fund_igf, 170000000, '2021-03-01', 'active'),
    (gen_random_uuid(), v_p_hartford, v_fund_igf, 127500000, '2021-03-01', 'active'),
    (gen_random_uuid(), v_p_duke,     v_fund_igf, 85000000,  '2021-03-01', 'active'),
    (gen_random_uuid(), v_p_whitfield,v_fund_igf, 42500000,  '2021-03-01', 'active')
  ON CONFLICT (partner_id, fund_id) DO NOTHING;

  -- Fund 2 ($550M): GP 3%, CalPERS 28%, Hartford 22%, TexTeach 20%, Blackrock 15%, Evergreen 12%
  INSERT INTO re_partner_commitment (commitment_id, partner_id, fund_id, committed_amount, commitment_date, status)
  VALUES
    (gen_random_uuid(), v_p_gp,       v_fund_mref, 16500000,  '2019-03-01', 'fully_called'),
    (gen_random_uuid(), v_p_calpers,  v_fund_mref, 154000000, '2019-03-01', 'fully_called'),
    (gen_random_uuid(), v_p_hartford, v_fund_mref, 121000000, '2019-03-01', 'fully_called'),
    (gen_random_uuid(), v_p_texteach, v_fund_mref, 110000000, '2019-03-01', 'fully_called'),
    (gen_random_uuid(), v_p_blackrock,v_fund_mref, 82500000,  '2019-03-01', 'fully_called'),
    (gen_random_uuid(), v_p_evergreen,v_fund_mref, 66000000,  '2019-03-01', 'fully_called')
  ON CONFLICT (partner_id, fund_id) DO NOTHING;

  -- Fund 3 ($600M): GP 5%, CalPERS 30%, Duke 20%, Blackrock 20%, Hartford 15%, Whitfield 10%
  INSERT INTO re_partner_commitment (commitment_id, partner_id, fund_id, committed_amount, commitment_date, status)
  VALUES
    (gen_random_uuid(), v_p_gp,       v_fund_mcof, 30000000,  '2024-01-15', 'active'),
    (gen_random_uuid(), v_p_calpers,  v_fund_mcof, 180000000, '2024-01-15', 'active'),
    (gen_random_uuid(), v_p_duke,     v_fund_mcof, 120000000, '2024-01-15', 'active'),
    (gen_random_uuid(), v_p_blackrock,v_fund_mcof, 120000000, '2024-01-15', 'active'),
    (gen_random_uuid(), v_p_hartford, v_fund_mcof, 90000000,  '2024-01-15', 'active'),
    (gen_random_uuid(), v_p_whitfield,v_fund_mcof, 60000000,  '2024-01-15', 'active')
  ON CONFLICT (partner_id, fund_id) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 5: Deals (investments)
  -- ════════════════════════════════════════════════════════════════════════

  -- Fund 1: 8 new deals
  FOR ai IN 1..8 LOOP
    INSERT INTO repe_deal (deal_id, fund_id, name, deal_type, stage, committed_capital, invested_capital)
    VALUES (
      v_f1_deal_ids[ai], v_fund_igf,
      v_f1_names[ai] || ' Acquisition', 'equity', 'operating',
      v_f1_cost[ai], v_f1_cost[ai] * 0.95
    ) ON CONFLICT (deal_id) DO NOTHING;
  END LOOP;

  -- Fund 2: 11 deals (9 operating, 2 exited)
  FOR ai IN 1..11 LOOP
    INSERT INTO repe_deal (deal_id, fund_id, name, deal_type, stage, committed_capital, invested_capital,
      realized_distributions)
    VALUES (
      v_f2_deal_ids[ai], v_fund_mref,
      v_f2_names[ai] || ' Acquisition', 'equity', v_f2_deal_stages[ai],
      v_f2_cost[ai], v_f2_cost[ai] * 0.95,
      CASE WHEN v_f2_exit_qtrs[ai] > 0 THEN v_f2_exit_price[ai] ELSE 0 END
    ) ON CONFLICT (deal_id) DO NOTHING;
  END LOOP;

  -- Fund 3: 8 debt deals
  FOR ai IN 1..8 LOOP
    INSERT INTO repe_deal (deal_id, fund_id, name, deal_type, stage, committed_capital, invested_capital)
    VALUES (
      v_f3_deal_ids[ai], v_fund_mcof,
      v_f3_names[ai] || ' Origination', 'debt', 'operating',
      v_f3_upb[ai], v_f3_upb[ai]
    ) ON CONFLICT (deal_id) DO NOTHING;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 6: Assets
  -- ════════════════════════════════════════════════════════════════════════

  -- Fund 1: 8 property assets
  FOR ai IN 1..8 LOOP
    INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis, asset_status)
    VALUES (v_f1_asset_ids[ai], v_f1_deal_ids[ai], 'property', v_f1_names[ai],
            v_f1_acq_dates[ai], v_f1_cost[ai], 'active')
    ON CONFLICT (asset_id) DO NOTHING;
  END LOOP;

  -- Fund 2: 11 property assets
  FOR ai IN 1..11 LOOP
    INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis, asset_status)
    VALUES (v_f2_asset_ids[ai], v_f2_deal_ids[ai], 'property', v_f2_names[ai],
            v_f2_acq_dates[ai], v_f2_cost[ai], v_f2_statuses[ai])
    ON CONFLICT (asset_id) DO NOTHING;
  END LOOP;

  -- Fund 3: 8 CMBS assets
  FOR ai IN 1..8 LOOP
    INSERT INTO repe_asset (asset_id, deal_id, asset_type, name, acquisition_date, cost_basis, asset_status)
    VALUES (v_f3_asset_ids[ai], v_f3_deal_ids[ai], 'cmbs', v_f3_names[ai],
            v_f3_maturity[ai] - INTERVAL '5 years', v_f3_upb[ai], 'active')  -- inferred: originated ~5yr before maturity
    ON CONFLICT (asset_id) DO NOTHING;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 7: Property asset details (Funds 1 & 2)
  -- ════════════════════════════════════════════════════════════════════════

  FOR ai IN 1..8 LOOP
    INSERT INTO repe_property_asset (asset_id, property_type, city, state, market,
      units, square_feet, occupancy, year_built)
    VALUES (v_f1_asset_ids[ai], v_f1_ptypes[ai], v_f1_cities[ai], v_f1_states[ai],
            v_f1_cities[ai] || ', ' || v_f1_states[ai],
            NULLIF(v_f1_units[ai], 0), NULLIF(v_f1_sqft[ai], 0),
            v_f1_base_occ[ai], 2021 - ai)  -- inferred year_built
    ON CONFLICT (asset_id) DO NOTHING;
  END LOOP;

  FOR ai IN 1..11 LOOP
    INSERT INTO repe_property_asset (asset_id, property_type, city, state, market,
      units, square_feet, occupancy, year_built)
    VALUES (v_f2_asset_ids[ai], v_f2_ptypes[ai], v_f2_cities[ai], v_f2_states[ai],
            v_f2_cities[ai] || ', ' || v_f2_states[ai],
            NULLIF(v_f2_units[ai], 0), NULLIF(v_f2_sqft[ai], 0),
            v_f2_base_occ[ai], 2015 - ai)  -- inferred year_built
    ON CONFLICT (asset_id) DO NOTHING;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 8: CMBS asset details + loan details (Fund 3)
  -- ════════════════════════════════════════════════════════════════════════

  FOR ai IN 1..8 LOOP
    INSERT INTO repe_cmbs_asset (asset_id, tranche, rating, coupon, maturity_date)
    VALUES (v_f3_asset_ids[ai], 'A', v_f3_ratings[ai], v_f3_coupon[ai], v_f3_maturity[ai])
    ON CONFLICT (asset_id) DO NOTHING;

    INSERT INTO re_loan_detail (asset_id, original_balance, current_balance, coupon,
      maturity_date, ltv, dscr)
    VALUES (v_f3_asset_ids[ai], v_f3_upb[ai], v_f3_upb[ai], v_f3_coupon[ai],
            v_f3_maturity[ai], v_f3_ltv[ai],
            ROUND(v_f3_debt_yield[ai] / v_f3_coupon[ai], 3))  -- DSCR = debt_yield / coupon for IO
    ON CONFLICT (asset_id) DO NOTHING;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 9: JV structures (Funds 1 & 2 equity assets)
  -- ════════════════════════════════════════════════════════════════════════

  FOR ai IN 1..8 LOOP
    INSERT INTO re_jv (jv_id, investment_id, legal_name, ownership_percent,
      gp_percent, lp_percent, status)
    VALUES (v_f1_jv_ids[ai], v_f1_deal_ids[ai],
            v_f1_names[ai] || ' JV LLC', 1.0,
            1.0 - v_f1_lp_pcts[ai], v_f1_lp_pcts[ai], 'active')
    ON CONFLICT (jv_id) DO NOTHING;

    -- Link asset to JV
    UPDATE repe_asset SET jv_id = v_f1_jv_ids[ai]
    WHERE asset_id = v_f1_asset_ids[ai] AND jv_id IS NULL;
  END LOOP;

  FOR ai IN 1..11 LOOP
    INSERT INTO re_jv (jv_id, investment_id, legal_name, ownership_percent,
      gp_percent, lp_percent, status)
    VALUES (v_f2_jv_ids[ai], v_f2_deal_ids[ai],
            v_f2_names[ai] || ' JV LLC', 1.0,
            1.0 - v_f2_lp_pcts[ai], v_f2_lp_pcts[ai],
            CASE WHEN v_f2_exit_qtrs[ai] > 0 THEN 'dissolved' ELSE 'active' END)
    ON CONFLICT (jv_id) DO NOTHING;

    UPDATE repe_asset SET jv_id = v_f2_jv_ids[ai]
    WHERE asset_id = v_f2_asset_ids[ai] AND jv_id IS NULL;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 10: Loans
  -- ════════════════════════════════════════════════════════════════════════

  -- Fund 1: senior loans on 8 new equity assets
  FOR ai IN 1..8 LOOP
    INSERT INTO re_loan (id, env_id, business_id, fund_id, asset_id, loan_name,
      upb, rate_type, rate, maturity, amort_type)
    SELECT
      ('d4560000-0456-0401-' || LPAD(ai::text, 4, '0') || '-000000000001')::uuid,
      eb.env_id::text, v_business_id, v_fund_igf, v_f1_asset_ids[ai],
      v_f1_names[ai] || ' Senior Loan',
      v_f1_base_debt[ai],
      CASE WHEN ai <= 5 THEN 'fixed' ELSE 'floating' END,
      v_f1_debt_rate[ai],
      v_f1_acq_dates[ai] + INTERVAL '7 years',
      'interest_only'
    FROM app.env_business_bindings eb
    WHERE eb.business_id = v_business_id
    AND NOT EXISTS (
      SELECT 1 FROM re_loan l WHERE l.asset_id = v_f1_asset_ids[ai]
    )
    LIMIT 1;
  END LOOP;

  -- Fund 2: senior loans on 11 assets (exited loans still in history)
  FOR ai IN 1..11 LOOP
    INSERT INTO re_loan (id, env_id, business_id, fund_id, asset_id, loan_name,
      upb, rate_type, rate, maturity, amort_type)
    SELECT
      ('d4560000-0456-0402-' || LPAD(ai::text, 4, '0') || '-000000000001')::uuid,
      eb.env_id::text, v_business_id, v_fund_mref, v_f2_asset_ids[ai],
      v_f2_names[ai] || ' Senior Loan',
      v_f2_base_debt[ai], 'fixed', v_f2_debt_rate[ai],
      v_f2_acq_dates[ai] + INTERVAL '10 years',
      'interest_only'
    FROM app.env_business_bindings eb
    WHERE eb.business_id = v_business_id
    AND NOT EXISTS (
      SELECT 1 FROM re_loan l WHERE l.asset_id = v_f2_asset_ids[ai]
    )
    LIMIT 1;
  END LOOP;

  -- Fund 3: bridge loans (the assets ARE the loans; also create re_loan records for covenant tracking)
  FOR ai IN 1..8 LOOP
    INSERT INTO re_loan (id, env_id, business_id, fund_id, asset_id, loan_name,
      upb, rate_type, rate, maturity, amort_type)
    SELECT
      v_f3_loan_ids[ai],
      eb.env_id::text, v_business_id, v_fund_mcof, v_f3_asset_ids[ai],
      v_f3_names[ai],
      v_f3_upb[ai], 'fixed', v_f3_coupon[ai],
      v_f3_maturity[ai], 'interest_only'
    FROM app.env_business_bindings eb
    WHERE eb.business_id = v_business_id
    AND NOT EXISTS (
      SELECT 1 FROM re_loan l WHERE l.id = v_f3_loan_ids[ai]
    )
    LIMIT 1;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 11: Covenant definitions (Fund 3, 2 per loan = 16 total)
  -- ════════════════════════════════════════════════════════════════════════

  FOR ai IN 1..8 LOOP
    -- DSCR covenant: >= 1.20x
    INSERT INTO re_loan_covenant_definition (id, env_id, business_id, loan_id,
      covenant_type, comparator, threshold, frequency, cure_days, active)
    SELECT
      ('d4560000-0456-0601-' || LPAD(ai::text, 4, '0') || '-000000000001')::uuid,
      eb.env_id::text, v_business_id, v_f3_loan_ids[ai],
      'DSCR', '>=', 1.20, 'quarterly', 30, true
    FROM app.env_business_bindings eb
    WHERE eb.business_id = v_business_id
    LIMIT 1
    ON CONFLICT DO NOTHING;

    -- Debt yield covenant: >= 8%
    INSERT INTO re_loan_covenant_definition (id, env_id, business_id, loan_id,
      covenant_type, comparator, threshold, frequency, cure_days, active)
    SELECT
      ('d4560000-0456-0602-' || LPAD(ai::text, 4, '0') || '-000000000001')::uuid,
      eb.env_id::text, v_business_id, v_f3_loan_ids[ai],
      'DEBT_YIELD', '>=', 0.08, 'quarterly', 30, true
    FROM app.env_business_bindings eb
    WHERE eb.business_id = v_business_id
    LIMIT 1
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 12: Capital ledger entries
  -- ════════════════════════════════════════════════════════════════════════

  -- Fund 1: pre-window cumulative contribution + distribution
  INSERT INTO re_capital_ledger_entry (entry_id, fund_id, partner_id, entry_type,
    amount, amount_base, effective_date, quarter, memo, source)
  VALUES
    (gen_random_uuid(), v_fund_igf, v_p_gp, 'contribution',
     799000000, 799000000, '2024-06-15', '2024Q2',
     'Pre-2024Q3 cumulative capital calls (vintage 2021)', 'seed'),
    (gen_random_uuid(), v_fund_igf, v_p_gp, 'distribution',
     80000000, 80000000, '2024-06-28', '2024Q2',
     'Pre-2024Q3 cumulative operational distributions', 'seed')
  ON CONFLICT DO NOTHING;

  -- Fund 2: pre-window cumulative
  INSERT INTO re_capital_ledger_entry (entry_id, fund_id, partner_id, entry_type,
    amount, amount_base, effective_date, quarter, memo, source)
  VALUES
    (gen_random_uuid(), v_fund_mref, v_p_gp, 'contribution',
     530000000, 530000000, '2024-06-15', '2024Q2',
     'Fully called capital (vintage 2019)', 'seed'),
    (gen_random_uuid(), v_fund_mref, v_p_gp, 'distribution',
     75000000, 75000000, '2024-06-28', '2024Q2',
     'Pre-2024Q3 cumulative distributions', 'seed')
  ON CONFLICT DO NOTHING;

  -- Quarterly capital entries for all 3 funds
  FOR qi IN 0..9 LOOP
    v_year  := LEFT(v_quarters[qi+1], 4)::int;
    v_q_num := RIGHT(v_quarters[qi+1], 1)::int;
    v_qdate := (v_year || '-' || LPAD((v_q_num * 3 - 2)::text, 2, '0') || '-15')::date;

    -- Fund 1 contributions
    IF v_f1_call_amts[qi+1] > 0 THEN
      INSERT INTO re_capital_ledger_entry (entry_id, fund_id, partner_id, entry_type,
        amount, amount_base, effective_date, quarter, memo, source)
      VALUES (gen_random_uuid(), v_fund_igf, v_p_gp, 'contribution',
              v_f1_call_amts[qi+1], v_f1_call_amts[qi+1], v_qdate, v_quarters[qi+1],
              'Capital call ' || v_quarters[qi+1], 'seed')
      ON CONFLICT DO NOTHING;
    END IF;

    -- Fund 1 distributions
    IF v_f1_dist_amts[qi+1] > 0 THEN
      INSERT INTO re_capital_ledger_entry (entry_id, fund_id, partner_id, entry_type,
        amount, amount_base, effective_date, quarter, memo, source)
      VALUES (gen_random_uuid(), v_fund_igf, v_p_gp, 'distribution',
              v_f1_dist_amts[qi+1], v_f1_dist_amts[qi+1],
              (v_year || '-' || LPAD((v_q_num * 3)::text, 2, '0') || '-28')::date,
              v_quarters[qi+1], 'Distribution ' || v_quarters[qi+1], 'seed')
      ON CONFLICT DO NOTHING;
    END IF;

    -- Fund 2 distributions only (fully called)
    IF v_f2_dist_amts[qi+1] > 0 THEN
      INSERT INTO re_capital_ledger_entry (entry_id, fund_id, partner_id, entry_type,
        amount, amount_base, effective_date, quarter, memo, source)
      VALUES (gen_random_uuid(), v_fund_mref, v_p_gp, 'distribution',
              v_f2_dist_amts[qi+1], v_f2_dist_amts[qi+1],
              (v_year || '-' || LPAD((v_q_num * 3)::text, 2, '0') || '-28')::date,
              v_quarters[qi+1],
              CASE
                WHEN qi = 4 THEN 'Emerald Ridge exit + ops'
                WHEN qi = 5 THEN 'Biscayne Towers exit + ops'
                ELSE 'Operational distribution ' || v_quarters[qi+1]
              END, 'seed')
      ON CONFLICT DO NOTHING;
    END IF;

    -- Fund 3 contributions
    IF v_f3_call_pcts[qi+1] > 0 THEN
      INSERT INTO re_capital_ledger_entry (entry_id, fund_id, partner_id, entry_type,
        amount, amount_base, effective_date, quarter, memo, source)
      VALUES (gen_random_uuid(), v_fund_mcof, v_p_gp, 'contribution',
              ROUND(600000000 * v_f3_call_pcts[qi+1], 2),
              ROUND(600000000 * v_f3_call_pcts[qi+1], 2),
              v_qdate, v_quarters[qi+1],
              'Capital call ' || v_quarters[qi+1] || ' (' || (v_f3_call_pcts[qi+1]*100)::int || '%)',
              'seed')
      ON CONFLICT DO NOTHING;
    END IF;

    -- Fund 3 distributions (interest income)
    IF v_f3_dist_amts[qi+1] > 0 THEN
      INSERT INTO re_capital_ledger_entry (entry_id, fund_id, partner_id, entry_type,
        amount, amount_base, effective_date, quarter, memo, source)
      VALUES (gen_random_uuid(), v_fund_mcof, v_p_gp, 'distribution',
              v_f3_dist_amts[qi+1], v_f3_dist_amts[qi+1],
              (v_year || '-' || LPAD((v_q_num * 3)::text, 2, '0') || '-28')::date,
              v_quarters[qi+1], 'Interest income ' || v_quarters[qi+1], 'seed')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 13: Asset quarter states
  -- ════════════════════════════════════════════════════════════════════════

  -- Fund 1: 8 new equity assets, 10 quarters each
  -- Growth: 1.0% quarterly NOI growth (value-add)
  FOR ai IN 1..8 LOOP
    FOR qi IN 0..9 LOOP
      v_noi      := ROUND(v_f1_base_noi[ai] * power(1 + v_f1_growth, qi), 2);
      v_revenue  := ROUND(v_noi * 1.42, 2);                       -- revenue/NOI ratio ~1.42
      v_opex     := v_revenue - v_noi;
      v_capex    := ROUND(v_noi * 0.06, 2);                       -- ~6% of NOI
      v_debt_svc := ROUND(v_f1_base_debt[ai] * v_f1_debt_rate[ai] / 4.0, 2);  -- quarterly IO
      v_occ      := LEAST(v_f1_base_occ[ai] + qi * 0.003, 0.98);  -- occupancy improving
      v_debt_bal := v_f1_base_debt[ai] - qi * 200000;             -- slow amortization
      v_asset_val:= ROUND((v_noi * 4.0) / v_f1_cap_rates[ai], 2); -- cap rate valuation
      v_nav      := v_asset_val - v_debt_bal;
      v_ltv      := ROUND(v_debt_bal / v_asset_val, 4);
      v_dscr_val := ROUND(v_noi / v_debt_svc, 3);
      v_net_cf   := v_noi - v_debt_svc - v_capex;

      INSERT INTO re_asset_quarter_state (
        asset_id, quarter, run_id,
        noi, revenue, opex, capex, debt_service, occupancy,
        debt_balance, asset_value, nav, ltv, dscr,
        net_cash_flow, valuation_method, value_source, source, inputs_hash
      ) VALUES (
        v_f1_asset_ids[ai], v_quarters[qi+1], v_seed_run,
        v_noi, v_revenue, v_opex, v_capex, v_debt_svc, v_occ,
        v_debt_bal, v_asset_val, v_nav, v_ltv, v_dscr_val,
        v_net_cf, 'cap_rate', 'seed', 'seed',
        'seed:456:f1:' || ai || ':' || v_quarters[qi+1]
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Fund 2: 11 assets; exited assets stop at exit quarter
  FOR ai IN 1..11 LOOP
    FOR qi IN 0..9 LOOP
      -- Skip quarters after exit
      IF v_f2_exit_qtrs[ai] > 0 AND qi > v_f2_exit_qtrs[ai] THEN
        CONTINUE;
      END IF;

      v_noi      := ROUND(v_f2_base_noi[ai] * power(1 + v_f2_growth, qi), 2);
      v_revenue  := ROUND(v_noi * 1.42, 2);
      v_opex     := v_revenue - v_noi;
      v_capex    := ROUND(v_noi * 0.05, 2);
      v_debt_svc := ROUND(v_f2_base_debt[ai] * v_f2_debt_rate[ai] / 4.0, 2);
      v_occ      := LEAST(v_f2_base_occ[ai] + qi * 0.002, 0.98);
      v_debt_bal := v_f2_base_debt[ai] - qi * 150000;
      v_asset_val:= ROUND((v_noi * 4.0) / v_f2_cap_rates[ai], 2);
      v_nav      := v_asset_val - v_debt_bal;
      v_ltv      := ROUND(v_debt_bal / v_asset_val, 4);
      v_dscr_val := ROUND(v_noi / v_debt_svc, 3);
      v_net_cf   := v_noi - v_debt_svc - v_capex;

      INSERT INTO re_asset_quarter_state (
        asset_id, quarter, run_id,
        noi, revenue, opex, capex, debt_service, occupancy,
        debt_balance, asset_value, nav, ltv, dscr,
        net_cash_flow, valuation_method, value_source, source, inputs_hash
      ) VALUES (
        v_f2_asset_ids[ai], v_quarters[qi+1], v_seed_run,
        v_noi, v_revenue, v_opex, v_capex, v_debt_svc, v_occ,
        v_debt_bal, v_asset_val, v_nav, v_ltv, v_dscr_val,
        v_net_cf, 'cap_rate', 'seed', 'seed',
        'seed:456:f2:' || ai || ':' || v_quarters[qi+1]
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Fund 3: 8 CMBS loan assets; appear when originated (v_f3_orig_qi)
  FOR ai IN 1..8 LOOP
    FOR qi IN 0..9 LOOP
      -- Skip quarters before origination
      IF qi < v_f3_orig_qi[ai] THEN
        CONTINUE;
      END IF;

      -- For debt fund: asset_value = UPB, NAV = UPB with slight accretion
      v_asset_val := ROUND(v_f3_upb[ai] * (1 + 0.001 * (qi - v_f3_orig_qi[ai])), 2);
      v_nav       := v_asset_val;  -- no debt on the loan asset itself
      v_noi       := ROUND(v_f3_upb[ai] * v_f3_coupon[ai] / 4.0, 2);  -- quarterly interest income
      v_debt_yld  := v_f3_debt_yield[ai];
      v_dscr_val  := ROUND(v_debt_yld / v_f3_coupon[ai], 3);
      v_ltv       := v_f3_ltv[ai];

      INSERT INTO re_asset_quarter_state (
        asset_id, quarter, run_id,
        noi, revenue, opex, debt_service, occupancy,
        debt_balance, asset_value, nav, ltv, dscr, debt_yield,
        valuation_method, value_source, source, inputs_hash
      ) VALUES (
        v_f3_asset_ids[ai], v_quarters[qi+1], v_seed_run,
        v_noi, v_noi, 0, 0, 1.0,  -- debt assets: revenue = interest, no opex/debt_svc
        0, v_asset_val, v_nav, v_ltv, v_dscr_val, v_debt_yld,
        'loan_mark', 'seed', 'seed',
        'seed:456:f3:' || ai || ':' || v_quarters[qi+1]
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 14: Fund quarter states (computed from capital accumulators)
  -- ════════════════════════════════════════════════════════════════════════

  -- ── Fund 1 (IGF-VII) ──
  v_called      := 799000000;   -- pre-window called
  v_distributed := 80000000;    -- pre-window distributed
  FOR qi IN 0..9 LOOP
    v_called      := v_called + v_f1_call_amts[qi+1];
    v_distributed := v_distributed + v_f1_dist_amts[qi+1];

    -- Compute portfolio NAV from new assets (existing 4 not included — acceptable tolerance)
    v_port_nav := 0;
    v_wtd_ltv  := 0; v_ltv_denom := 0;
    v_wtd_dscr := 0; v_dscr_denom := 0;
    FOR ai IN 1..8 LOOP
      v_noi      := ROUND(v_f1_base_noi[ai] * power(1 + v_f1_growth, qi), 2);
      v_debt_bal := v_f1_base_debt[ai] - qi * 200000;
      v_asset_val:= ROUND((v_noi * 4.0) / v_f1_cap_rates[ai], 2);
      v_nav      := v_asset_val - v_debt_bal;
      v_port_nav := v_port_nav + v_nav;
      v_ltv      := v_debt_bal / v_asset_val;
      v_dscr_val := v_noi / ROUND(v_f1_base_debt[ai] * v_f1_debt_rate[ai] / 4.0, 2);
      v_wtd_ltv  := v_wtd_ltv + v_ltv * v_asset_val;
      v_ltv_denom:= v_ltv_denom + v_asset_val;
      v_wtd_dscr := v_wtd_dscr + v_dscr_val * v_asset_val;
      v_dscr_denom := v_dscr_denom + v_asset_val;
    END LOOP;

    -- Add estimated NAV contribution from existing 4 IGF assets (~$65M + growth)
    v_port_nav := v_port_nav + 65000000 + qi * 3500000;  -- inferred: existing assets contribute ~$65M base + growth

    IF v_called > 0 THEN
      v_dpi  := ROUND(v_distributed / v_called, 4);
      v_rvpi := ROUND(v_port_nav / v_called, 4);
      v_tvpi := ROUND((v_distributed + v_port_nav) / v_called, 4);
    ELSE
      v_dpi := 0; v_rvpi := 0; v_tvpi := 0;
    END IF;

    INSERT INTO re_fund_quarter_state (
      id, fund_id, quarter, scenario_id, run_id,
      portfolio_nav, total_committed, total_called, total_distributed,
      dpi, rvpi, tvpi, gross_irr, net_irr,
      weighted_ltv, weighted_dscr,
      data_status, source, inputs_hash
    ) VALUES (
      gen_random_uuid(), v_fund_igf, v_quarters[qi+1], NULL, v_seed_run,
      v_port_nav, 850000000, v_called, v_distributed,
      v_dpi, v_rvpi, v_tvpi,
      0.162, 0.128,  -- hardcoded: gross 16.2%, net 12.8%
      ROUND(v_wtd_ltv / NULLIF(v_ltv_denom, 0), 4),
      ROUND(v_wtd_dscr / NULLIF(v_dscr_denom, 0), 4),
      'seed', 'seed', 'seed:456:f1:fqs:' || v_quarters[qi+1]
    ) ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      portfolio_nav    = EXCLUDED.portfolio_nav,
      total_committed  = EXCLUDED.total_committed,
      total_called     = EXCLUDED.total_called,
      total_distributed = EXCLUDED.total_distributed,
      dpi = EXCLUDED.dpi, rvpi = EXCLUDED.rvpi, tvpi = EXCLUDED.tvpi,
      gross_irr = EXCLUDED.gross_irr, net_irr = EXCLUDED.net_irr,
      weighted_ltv = EXCLUDED.weighted_ltv, weighted_dscr = EXCLUDED.weighted_dscr,
      inputs_hash = EXCLUDED.inputs_hash;
  END LOOP;

  -- ── Fund 2 (MREF-III) ──
  v_called      := 530000000;   -- fully called pre-window
  v_distributed := 75000000;    -- pre-window distributions
  FOR qi IN 0..9 LOOP
    v_distributed := v_distributed + v_f2_dist_amts[qi+1];

    -- Compute portfolio NAV from active assets only
    v_port_nav := 0;
    v_wtd_ltv  := 0; v_ltv_denom := 0;
    v_wtd_dscr := 0; v_dscr_denom := 0;
    FOR ai IN 1..11 LOOP
      -- Skip exited assets after exit quarter
      IF v_f2_exit_qtrs[ai] > 0 AND qi > v_f2_exit_qtrs[ai] THEN
        CONTINUE;
      END IF;
      v_noi      := ROUND(v_f2_base_noi[ai] * power(1 + v_f2_growth, qi), 2);
      v_debt_bal := v_f2_base_debt[ai] - qi * 150000;
      v_asset_val:= ROUND((v_noi * 4.0) / v_f2_cap_rates[ai], 2);
      v_nav      := v_asset_val - v_debt_bal;
      v_port_nav := v_port_nav + v_nav;
      v_ltv      := v_debt_bal / v_asset_val;
      v_dscr_val := v_noi / ROUND(v_f2_base_debt[ai] * v_f2_debt_rate[ai] / 4.0, 2);
      v_wtd_ltv  := v_wtd_ltv + v_ltv * v_asset_val;
      v_ltv_denom:= v_ltv_denom + v_asset_val;
      v_wtd_dscr := v_wtd_dscr + v_dscr_val * v_asset_val;
      v_dscr_denom := v_dscr_denom + v_asset_val;
    END LOOP;

    v_dpi  := ROUND(v_distributed / v_called, 4);
    v_rvpi := ROUND(v_port_nav / v_called, 4);
    v_tvpi := ROUND((v_distributed + v_port_nav) / v_called, 4);

    INSERT INTO re_fund_quarter_state (
      id, fund_id, quarter, scenario_id, run_id,
      portfolio_nav, total_committed, total_called, total_distributed,
      dpi, rvpi, tvpi, gross_irr, net_irr,
      weighted_ltv, weighted_dscr,
      data_status, source, inputs_hash
    ) VALUES (
      gen_random_uuid(), v_fund_mref, v_quarters[qi+1], NULL, v_seed_run,
      v_port_nav, 550000000, v_called, v_distributed,
      v_dpi, v_rvpi, v_tvpi,
      0.115, 0.092,  -- hardcoded: gross 11.5%, net 9.2%
      ROUND(v_wtd_ltv / NULLIF(v_ltv_denom, 0), 4),
      ROUND(v_wtd_dscr / NULLIF(v_dscr_denom, 0), 4),
      'seed', 'seed', 'seed:456:f2:fqs:' || v_quarters[qi+1]
    ) ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      portfolio_nav    = EXCLUDED.portfolio_nav,
      total_committed  = EXCLUDED.total_committed,
      total_called     = EXCLUDED.total_called,
      total_distributed = EXCLUDED.total_distributed,
      dpi = EXCLUDED.dpi, rvpi = EXCLUDED.rvpi, tvpi = EXCLUDED.tvpi,
      gross_irr = EXCLUDED.gross_irr, net_irr = EXCLUDED.net_irr,
      weighted_ltv = EXCLUDED.weighted_ltv, weighted_dscr = EXCLUDED.weighted_dscr,
      inputs_hash = EXCLUDED.inputs_hash;
  END LOOP;

  -- ── Fund 3 (MCOF-I) ──
  v_called      := 0;
  v_distributed := 0;
  FOR qi IN 0..9 LOOP
    v_called      := v_called + ROUND(600000000 * v_f3_call_pcts[qi+1], 2);
    v_distributed := v_distributed + v_f3_dist_amts[qi+1];

    -- NAV = sum of active loan values
    v_port_nav := 0;
    v_wtd_ltv  := 0; v_ltv_denom := 0;
    v_wtd_dscr := 0; v_dscr_denom := 0;
    FOR ai IN 1..8 LOOP
      IF qi >= v_f3_orig_qi[ai] THEN
        v_asset_val := ROUND(v_f3_upb[ai] * (1 + 0.001 * (qi - v_f3_orig_qi[ai])), 2);
        v_port_nav  := v_port_nav + v_asset_val;
        v_dscr_val  := v_f3_debt_yield[ai] / v_f3_coupon[ai];
        v_wtd_ltv   := v_wtd_ltv + v_f3_ltv[ai] * v_asset_val;
        v_ltv_denom := v_ltv_denom + v_asset_val;
        v_wtd_dscr  := v_wtd_dscr + v_dscr_val * v_asset_val;
        v_dscr_denom:= v_dscr_denom + v_asset_val;
      END IF;
    END LOOP;

    IF v_called > 0 THEN
      v_dpi  := ROUND(v_distributed / v_called, 4);
      v_rvpi := ROUND(v_port_nav / v_called, 4);
      v_tvpi := ROUND((v_distributed + v_port_nav) / v_called, 4);
    ELSE
      v_dpi := 0; v_rvpi := 0; v_tvpi := 0;
    END IF;

    INSERT INTO re_fund_quarter_state (
      id, fund_id, quarter, scenario_id, run_id,
      portfolio_nav, total_committed, total_called, total_distributed,
      dpi, rvpi, tvpi, gross_irr, net_irr,
      weighted_ltv, weighted_dscr,
      data_status, source, inputs_hash
    ) VALUES (
      gen_random_uuid(), v_fund_mcof, v_quarters[qi+1], NULL, v_seed_run,
      v_port_nav, 600000000, v_called, v_distributed,
      v_dpi, v_rvpi, v_tvpi,
      0.128, 0.103,  -- hardcoded: gross 12.8%, net 10.3%
      ROUND(v_wtd_ltv / NULLIF(v_ltv_denom, 0), 4),
      ROUND(v_wtd_dscr / NULLIF(v_dscr_denom, 0), 4),
      'seed', 'seed', 'seed:456:f3:fqs:' || v_quarters[qi+1]
    ) ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      portfolio_nav    = EXCLUDED.portfolio_nav,
      total_committed  = EXCLUDED.total_committed,
      total_called     = EXCLUDED.total_called,
      total_distributed = EXCLUDED.total_distributed,
      dpi = EXCLUDED.dpi, rvpi = EXCLUDED.rvpi, tvpi = EXCLUDED.tvpi,
      gross_irr = EXCLUDED.gross_irr, net_irr = EXCLUDED.net_irr,
      weighted_ltv = EXCLUDED.weighted_ltv, weighted_dscr = EXCLUDED.weighted_dscr,
      inputs_hash = EXCLUDED.inputs_hash;
  END LOOP;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 15: Covenant run + results + alerts (Fund 3)
  -- ════════════════════════════════════════════════════════════════════════

  -- Create covenant test run record
  INSERT INTO re_run (id, env_id, business_id, fund_id, quarter, run_type, status, input_hash)
  SELECT
    v_cov_run, eb.env_id::text, v_business_id, v_fund_mcof, '2026Q1',
    'COVENANT_TEST', 'completed', 'seed:456:cov'
  FROM app.env_business_bindings eb
  WHERE eb.business_id = v_business_id
  LIMIT 1
  ON CONFLICT DO NOTHING;

  -- Covenant test results (latest quarter: 2026Q1)
  FOR ai IN 1..8 LOOP
    INSERT INTO re_loan_covenant_result_qtr (
      id, run_id, env_id, business_id, fund_id, loan_id, quarter,
      dscr, ltv, debt_yield, pass, headroom, breached
    )
    SELECT
      gen_random_uuid(), v_cov_run, eb.env_id::text, v_business_id, v_fund_mcof,
      v_f3_loan_ids[ai], '2026Q1',
      ROUND(v_f3_debt_yield[ai] / v_f3_coupon[ai], 3),  -- DSCR
      v_f3_ltv[ai],
      v_f3_debt_yield[ai],
      CASE WHEN ai <= 6 THEN true WHEN ai = 7 THEN true ELSE false END,  -- loan 8 fails
      CASE WHEN ai = 8 THEN -0.022 ELSE ROUND(v_f3_debt_yield[ai] / v_f3_coupon[ai] - 1.20, 3) END,
      CASE WHEN ai = 8 THEN true ELSE false END
    FROM app.env_business_bindings eb
    WHERE eb.business_id = v_business_id
    LIMIT 1
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Covenant alerts
  -- Loan 7 (Aspen Ridge): WATCH — debt yield barely above 8% (headroom 0.08%)
  INSERT INTO re_covenant_alert (id, env_id, business_id, fund_id, loan_id, asset_id,
    quarter, run_id, metric, current_value, threshold, comparator, headroom, severity)
  SELECT
    'd4560000-0456-0701-0007-000000000001'::uuid,
    eb.env_id::text, v_business_id, v_fund_mcof, v_f3_loan_ids[7], v_f3_asset_ids[7],
    '2026Q1', v_cov_run, 'DEBT_YIELD', 0.0808, 0.08, '>=', 0.0008, 'warning'
  FROM app.env_business_bindings eb
  WHERE eb.business_id = v_business_id
  LIMIT 1
  ON CONFLICT DO NOTHING;

  -- Loan 8 (Maple Commons): BREACH — DSCR below 1.20x
  INSERT INTO re_covenant_alert (id, env_id, business_id, fund_id, loan_id, asset_id,
    quarter, run_id, metric, current_value, threshold, comparator, headroom, severity)
  SELECT
    'd4560000-0456-0701-0008-000000000001'::uuid,
    eb.env_id::text, v_business_id, v_fund_mcof, v_f3_loan_ids[8], v_f3_asset_ids[8],
    '2026Q1', v_cov_run, 'DSCR', 1.178, 1.20, '>=', -0.022, 'breach'
  FROM app.env_business_bindings eb
  WHERE eb.business_id = v_business_id
  LIMIT 1
  ON CONFLICT DO NOTHING;

  -- Loan 8: BREACH — debt yield below 8%
  INSERT INTO re_covenant_alert (id, env_id, business_id, fund_id, loan_id, asset_id,
    quarter, run_id, metric, current_value, threshold, comparator, headroom, severity)
  SELECT
    'd4560000-0456-0701-0018-000000000001'::uuid,
    eb.env_id::text, v_business_id, v_fund_mcof, v_f3_loan_ids[8], v_f3_asset_ids[8],
    '2026Q1', v_cov_run, 'DEBT_YIELD', 0.076, 0.08, '>=', -0.004, 'breach'
  FROM app.env_business_bindings eb
  WHERE eb.business_id = v_business_id
  LIMIT 1
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════════
  -- SECTION 16: Verification assertions
  -- ════════════════════════════════════════════════════════════════════════
  DECLARE
    v_check_count int;
    v_check_val   numeric;
    v_check_name  text;
  BEGIN
    -- 1. Fund 1 TVPI in range 1.55-1.75x at 2026Q4
    SELECT tvpi INTO v_check_val FROM re_fund_quarter_state
    WHERE fund_id = v_fund_igf AND quarter = '2026Q4' AND scenario_id IS NULL;
    IF v_check_val IS NOT NULL AND v_check_val BETWEEN 1.40 AND 1.80 THEN
      RAISE NOTICE '456 OK: Fund 1 TVPI = % (target 1.55-1.75x)', v_check_val;
    ELSE
      RAISE WARNING '456 WARN: Fund 1 TVPI = % (target 1.55-1.75x)', v_check_val;
    END IF;

    -- 2. Fund 2 TVPI in range 1.40-1.60x
    SELECT tvpi INTO v_check_val FROM re_fund_quarter_state
    WHERE fund_id = v_fund_mref AND quarter = '2026Q4' AND scenario_id IS NULL;
    IF v_check_val IS NOT NULL AND v_check_val BETWEEN 1.30 AND 1.70 THEN
      RAISE NOTICE '456 OK: Fund 2 TVPI = % (target 1.40-1.60x)', v_check_val;
    ELSE
      RAISE WARNING '456 WARN: Fund 2 TVPI = % (target 1.40-1.60x)', v_check_val;
    END IF;

    -- 3. All funds have net_irr < gross_irr
    SELECT COUNT(*) INTO v_check_count
    FROM re_fund_quarter_state
    WHERE fund_id IN (v_fund_igf, v_fund_mref, v_fund_mcof)
      AND quarter = '2026Q4' AND scenario_id IS NULL
      AND net_irr IS NOT NULL AND gross_irr IS NOT NULL
      AND net_irr >= gross_irr;
    IF v_check_count = 0 THEN
      RAISE NOTICE '456 OK: All funds have net_irr < gross_irr';
    ELSE
      RAISE WARNING '456 FAIL: % fund(s) have net_irr >= gross_irr', v_check_count;
    END IF;

    -- 4. DPI < TVPI for all funds
    SELECT COUNT(*) INTO v_check_count
    FROM re_fund_quarter_state
    WHERE fund_id IN (v_fund_igf, v_fund_mref, v_fund_mcof)
      AND quarter = '2026Q4' AND scenario_id IS NULL
      AND dpi >= tvpi;
    IF v_check_count = 0 THEN
      RAISE NOTICE '456 OK: DPI < TVPI for all funds';
    ELSE
      RAISE WARNING '456 FAIL: % fund(s) have DPI >= TVPI', v_check_count;
    END IF;

    -- 5. All equity asset DSCRs >= 1.20 at latest quarter
    SELECT COUNT(*) INTO v_check_count
    FROM re_asset_quarter_state qs
    WHERE qs.quarter = '2026Q4'
      AND qs.asset_id = ANY(v_f1_asset_ids || v_f2_asset_ids[1:5] || v_f2_asset_ids[8:11])
      AND qs.dscr < 1.20;
    IF v_check_count = 0 THEN
      RAISE NOTICE '456 OK: All equity asset DSCRs >= 1.20x';
    ELSE
      RAISE WARNING '456 FAIL: % equity asset(s) have DSCR < 1.20x', v_check_count;
    END IF;

    -- 6. All asset LTVs <= 85%
    SELECT COUNT(*) INTO v_check_count
    FROM re_asset_quarter_state qs
    WHERE qs.quarter = '2026Q4'
      AND qs.asset_id = ANY(v_f1_asset_ids || v_f2_asset_ids)
      AND qs.ltv > 0.85;
    IF v_check_count = 0 THEN
      RAISE NOTICE '456 OK: All asset LTVs <= 85%%';
    ELSE
      RAISE WARNING '456 FAIL: % asset(s) have LTV > 85%%', v_check_count;
    END IF;

    -- 7. Fund 3 weighted DSCR in 1.30-1.45x range
    SELECT weighted_dscr INTO v_check_val FROM re_fund_quarter_state
    WHERE fund_id = v_fund_mcof AND quarter = '2026Q1' AND scenario_id IS NULL;
    IF v_check_val BETWEEN 1.30 AND 1.45 THEN
      RAISE NOTICE '456 OK: Fund 3 weighted DSCR = % (target 1.30-1.45x)', v_check_val;
    ELSE
      RAISE WARNING '456 WARN: Fund 3 weighted DSCR = % (target 1.30-1.45x)', v_check_val;
    END IF;

    -- 8. Fund 3 weighted LTV in 72-78% range
    SELECT weighted_ltv INTO v_check_val FROM re_fund_quarter_state
    WHERE fund_id = v_fund_mcof AND quarter = '2026Q1' AND scenario_id IS NULL;
    IF v_check_val BETWEEN 0.72 AND 0.78 THEN
      RAISE NOTICE '456 OK: Fund 3 weighted LTV = % (target 72-78%%)', v_check_val;
    ELSE
      RAISE WARNING '456 WARN: Fund 3 weighted LTV = % (target 72-78%%)', v_check_val;
    END IF;

    -- 9. Exactly 1 warning + 2 breach alerts for Fund 3
    SELECT COUNT(*) INTO v_check_count
    FROM re_covenant_alert WHERE fund_id = v_fund_mcof AND NOT resolved;
    IF v_check_count = 3 THEN
      RAISE NOTICE '456 OK: Fund 3 has 3 covenant alerts (1 warning + 2 breach)';
    ELSE
      RAISE WARNING '456 WARN: Fund 3 has % covenant alerts (expected 3)', v_check_count;
    END IF;

    -- 10. Fund 1 total asset count = 12 (4 existing + 8 new)
    SELECT COUNT(DISTINCT a.asset_id) INTO v_check_count
    FROM repe_asset a
    JOIN repe_deal d ON d.deal_id = a.deal_id
    WHERE d.fund_id = v_fund_igf AND a.asset_status = 'active';
    IF v_check_count >= 12 THEN
      RAISE NOTICE '456 OK: Fund 1 has % active assets (target >= 12)', v_check_count;
    ELSE
      RAISE WARNING '456 WARN: Fund 1 has % active assets (target >= 12)', v_check_count;
    END IF;

    -- 11. JV LP + GP = 100% for all new JVs
    SELECT COUNT(*) INTO v_check_count
    FROM re_jv
    WHERE jv_id = ANY(v_f1_jv_ids || v_f2_jv_ids)
      AND ABS((COALESCE(gp_percent,0) + COALESCE(lp_percent,0)) - 1.0) > 0.001;
    IF v_check_count = 0 THEN
      RAISE NOTICE '456 OK: All JVs have LP + GP = 100%%';
    ELSE
      RAISE WARNING '456 FAIL: % JV(s) have LP + GP != 100%%', v_check_count;
    END IF;
  END;

  RAISE NOTICE '456: Meridian three-fund seed complete — 27 assets, 10 quarters, 3 funds';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run manually after migration)
-- ════════════════════════════════════════════════════════════════════════
-- SELECT f.name, fqs.quarter, fqs.portfolio_nav, fqs.total_committed, fqs.total_called,
--        fqs.total_distributed, fqs.tvpi, fqs.dpi, fqs.gross_irr, fqs.net_irr,
--        fqs.weighted_ltv, fqs.weighted_dscr
-- FROM re_fund_quarter_state fqs
-- JOIN repe_fund f ON f.fund_id = fqs.fund_id
-- WHERE fqs.quarter = '2026Q4' AND fqs.scenario_id IS NULL
-- ORDER BY f.name;
--
-- SELECT f.name, COUNT(DISTINCT a.asset_id) AS asset_count, SUM(qs.nav) AS total_nav
-- FROM repe_fund f
-- JOIN repe_deal d ON d.fund_id = f.fund_id
-- JOIN repe_asset a ON a.deal_id = d.deal_id AND a.asset_status = 'active'
-- LEFT JOIN re_asset_quarter_state qs ON qs.asset_id = a.asset_id AND qs.quarter = '2026Q4'
-- GROUP BY f.name ORDER BY f.name;
--
-- SELECT severity, COUNT(*) FROM re_covenant_alert
-- WHERE fund_id = 'd4560000-0003-0030-0005-000000000001' AND NOT resolved
-- GROUP BY severity;
--
-- -- Cap rate verification by property type:
-- SELECT pa.property_type,
--        ROUND(AVG(qs.noi * 4 / NULLIF(qs.asset_value, 0)) * 100, 2) AS avg_cap_rate_pct
-- FROM re_asset_quarter_state qs
-- JOIN repe_property_asset pa ON pa.asset_id = qs.asset_id
-- WHERE qs.quarter = '2026Q4'
-- GROUP BY pa.property_type ORDER BY pa.property_type;
