-- Migration 505: repe_opportunity_seed.sql
--
-- Demo dataset for the repe_opportunity_layer.
-- Provides a balanced set of signals and opportunities for Meridian demos:
--   - Distress candidates (Phoenix office, Chicago office)
--   - Growth plays (Nashville MF, Houston industrial)
--   - Balanced core+ (Atlanta MF — ~11-13% IRR, strong fund fit)
--
-- Safe on environments without Meridian data: wraps all inserts in env-id lookup.
-- All numeric values are plausible REPE market rates (not aesthetic-only).

DO $$
DECLARE
  v_env_id          uuid;
  v_fund_id         uuid;

  -- signal source ids
  v_src_broker      uuid;
  v_src_rca         uuid;
  v_src_freddie     uuid;
  v_src_ai          uuid;

  -- signal ids
  v_sig_nash_rent   uuid;
  v_sig_nash_abs    uuid;
  v_sig_phx_cap     uuid;
  v_sig_phx_dist    uuid;
  v_sig_atx_vac     uuid;
  v_sig_chi_dist1   uuid;
  v_sig_chi_dist2   uuid;
  v_sig_hou_trans   uuid;
  v_sig_den_dev     uuid;
  v_sig_atl_occ     uuid;
  v_sig_atl_rent    uuid;

  -- opportunity ids
  v_opp_nash        uuid;
  v_opp_phx         uuid;
  v_opp_atx         uuid;
  v_opp_hou         uuid;
  v_opp_chi         uuid;
  v_opp_atl         uuid;

  -- assumption version ids
  v_av_hou          uuid;
  v_av_chi          uuid;
  v_av_atl          uuid;

  -- model run ids
  v_run_hou         uuid;
  v_run_chi         uuid;
  v_run_atl         uuid;

  -- output ids
  v_out_hou         uuid;
  v_out_chi         uuid;
  v_out_atl         uuid;

BEGIN
  -- Resolve Meridian environment
  SELECT e.env_id INTO v_env_id
  FROM app.environments e
  WHERE e.client_name ILIKE '%%meridian%%'
    AND e.status = 'active'
  LIMIT 1;

  IF v_env_id IS NULL THEN
    -- Try any active environment as fallback
    SELECT e.env_id INTO v_env_id
    FROM app.environments e
    WHERE e.status = 'active'
    ORDER BY e.created_at DESC
    LIMIT 1;
  END IF;

  IF v_env_id IS NULL THEN
    RAISE NOTICE '505_repe_opportunity_seed: No active environment found. Skipping seed.';
    RETURN;
  END IF;

  -- Pick a fund to associate opportunities with
  SELECT f.fund_id INTO v_fund_id
  FROM repe_fund f
  WHERE f.business_id IN (
    SELECT b.env_id FROM app.env_business_bindings b WHERE b.env_id = v_env_id
  )
  ORDER BY f.created_at ASC
  LIMIT 1;

  -- ─── Signal Sources (global reference, idempotent) ─────────────────────────

  INSERT INTO repe_signal_sources (source_code, source_name, source_type, active)
  VALUES
    ('meridian-broker-net', 'Meridian Broker Network', 'broker', true),
    ('msci-rca', 'MSCI/RCA Transaction Analytics', 'market_data', true),
    ('freddie-mf', 'Freddie Mac Multifamily Research', 'market_data', true),
    ('meridian-ai-scan', 'Meridian AI Market Scanner', 'ai_scan', true)
  ON CONFLICT (source_code) DO NOTHING;

  SELECT source_id INTO v_src_broker FROM repe_signal_sources WHERE source_code = 'meridian-broker-net';
  SELECT source_id INTO v_src_rca    FROM repe_signal_sources WHERE source_code = 'msci-rca';
  SELECT source_id INTO v_src_freddie FROM repe_signal_sources WHERE source_code = 'freddie-mf';
  SELECT source_id INTO v_src_ai     FROM repe_signal_sources WHERE source_code = 'meridian-ai-scan';

  -- ─── Signals ───────────────────────────────────────────────────────────────

  -- Nashville MF rent growth
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_freddie, 'rent_growth', 'Nashville, TN', 'Multifamily',
    '2026-03-01', 78.5, 6.8, 'positive',
    'Nashville MF effective rents +6.8% YoY — workforce segment outperforming',
    'Freddie Mac data shows Nashville workforce housing (Class B/C) posting '
    '6.8% effective rent growth YoY vs 3.2% luxury. '
    'Supply pipeline is 18 months out, creating near-term pricing power.',
    false)
  RETURNING signal_id INTO v_sig_nash_rent;

  -- Nashville MF absorption
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_rca, 'transaction', 'Nashville, TN', 'Multifamily',
    '2026-02-15', 71.0, 94.8, 'positive',
    'Nashville MF absorption rate at 94.8% — trailing 12-month high',
    'RCA data: Nashville multifamily showing strongest absorption since Q4 2022. '
    'Net new demand absorbing 94.8% of delivered units over trailing 12 months.',
    false)
  RETURNING signal_id INTO v_sig_nash_abs;

  -- Phoenix office cap rate widening
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_rca, 'cap_rate_move', 'Phoenix, AZ', 'Office',
    '2026-03-10', 82.0, 8.75, 'negative',
    'Phoenix suburban office cap rates widening to 8.75% — 150bps over 18 months',
    'RCA cap rate tracker shows Phoenix suburban office transacting at 8.75% '
    'average cap rate, up 150bps from 7.25% in mid-2024. '
    'Debt costs have partially corrected but equity still repricing.',
    false)
  RETURNING signal_id INTO v_sig_phx_cap;

  -- Phoenix office distress
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated, ai_model_version)
  VALUES (v_env_id, v_src_ai, 'distress', 'Phoenix, AZ', 'Office',
    '2026-03-15', 87.5, 0.0, 'negative',
    'Phoenix office CMBS watchlist: 3 properties flagged for DSCR below 1.10',
    'AI scan of CMBS servicer data: three Phoenix suburban office properties '
    'now on watchlist with DSCR 0.87-1.08. One maturity ($47M balance) '
    'due Q3 2026 with no current refi evidence.',
    true, 'meridian-scan-v2')
  RETURNING signal_id INTO v_sig_phx_dist;

  -- Austin MF vacancy trend (neutral)
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_freddie, 'vacancy_trend', 'Austin, TX', 'Multifamily',
    '2026-02-01', 44.0, 12.3, 'neutral',
    'Austin MF vacancy ticked up to 12.3% — stabilizing after 2025 supply wave',
    'Freddie Mac: Austin vacancy up from 8.1% (2024) to 12.3% (Q1 2026) '
    'as 2025 supply wave was absorbed. Forward pipeline shows 40%% reduction '
    'in permitted units, suggesting stabilization by Q3 2026.',
    false)
  RETURNING signal_id INTO v_sig_atx_vac;

  -- Chicago suburban office distress 1
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_broker, 'distress', 'Chicago, IL', 'Office',
    '2026-03-20', 91.0, 0.0, 'negative',
    'Chicago suburban office: lender-owned asset marketed off-market at 55c/$',
    'Broker intelligence: suburban Chicago office park (8 buildings, 420k SF) '
    'taken back by lender after sponsor default. Currently marketed at '
    '$38/SF vs replacement cost $165/SF. Motivating seller.',
    false)
  RETURNING signal_id INTO v_sig_chi_dist1;

  -- Chicago suburban office distress 2 (loan maturity)
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_ai, 'distress', 'Chicago, IL', 'Office',
    '2026-03-18', 85.0, 0.0, 'negative',
    'Chicago office loan maturities: $290M in Q2-Q3 2026 with no refi path evident',
    'AI analysis of CMBS data: $290M in Chicago suburban office loans '
    'maturing Q2-Q3 2026. Current occupancy 61%%. '
    'NOI insufficient to support refi at current rates.',
    true, 'meridian-scan-v2')
  RETURNING signal_id INTO v_sig_chi_dist2;

  -- Houston industrial transaction
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_rca, 'transaction', 'Houston, TX', 'Industrial',
    '2026-03-05', 74.0, 5.20, 'positive',
    'Houston industrial last-mile: 5 comps at 5.20%% cap rate in last 90 days',
    'RCA: five Houston last-mile logistics trades at 5.10-5.35%% cap rates '
    'over last 90 days. All full-distribution class with below-market rents. '
    'Buyer profile: predominantly institutional with 5-7yr holds.',
    false)
  RETURNING signal_id INTO v_sig_hou_trans;

  -- Denver development pipeline
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_freddie, 'development_pipeline', 'Denver, CO', 'Multifamily',
    '2026-02-28', 58.0, 14200, 'neutral',
    'Denver MF pipeline: 14,200 units under construction — 36-month absorption risk',
    'Freddie Mac: Denver multifamily pipeline at 14,200 units under construction '
    'vs trailing 12-month absorption of ~9,000 units. '
    'Creates 36-month absorption headwind for stabilized acquisitions.',
    false)
  RETURNING signal_id INTO v_sig_den_dev;

  -- Atlanta MF stable occupancy
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_freddie, 'vacancy_trend', 'Atlanta, GA', 'Multifamily',
    '2026-03-01', 67.0, 94.1, 'positive',
    'Atlanta MF occupancy stable at 94.1%% across Class B/C — portfolio-quality signal',
    'Freddie Mac: Atlanta multifamily occupancy holding at 94.1%% '
    'in the workforce (Class B/C) tier, above the 93%% stabilized threshold. '
    'Employer growth (Delta HQ expansion, tech sector) supporting demand.',
    false)
  RETURNING signal_id INTO v_sig_atl_occ;

  -- Atlanta MF rent growth
  INSERT INTO repe_signals (env_id, source_id, signal_type, market, property_type,
    signal_date, strength, raw_value, direction,
    signal_headline, signal_body, ai_generated)
  VALUES (v_env_id, v_src_rca, 'rent_growth', 'Atlanta, GA', 'Multifamily',
    '2026-03-10', 63.0, 4.1, 'positive',
    'Atlanta Class B MF rent growth at 4.1%% YoY — in-line with underwriting targets',
    'RCA: Atlanta Class B multifamily showing steady 4.1%% rent growth '
    'YoY. Conservative relative to Nashville but consistent with 5-year trend. '
    'Exit cap rate compression expected as institutional buyers remain active.',
    false)
  RETURNING signal_id INTO v_sig_atl_rent;

  -- ─── Opportunities ─────────────────────────────────────────────────────────

  -- 1. Nashville MF Value-Add Cluster
  INSERT INTO repe_opportunities (env_id, fund_id, name, thesis, property_type,
    market, strategy, stage, priority,
    score_signal, score_source, composite_score,
    created_by)
  VALUES (v_env_id, v_fund_id,
    'Nashville Workforce MF Value-Add',
    'Acquire Class B/C workforce multifamily in Nashville where rent growth '
    '(+6.8% YoY) is running ahead of Class A and the forward supply pipeline '
    'does not materialize for 18+ months. Target 60-80 unit communities at '
    '5.5-6.0% entry cap with light value-add renovations.',
    'Multifamily', 'Nashville, TN', 'value_add', 'hypothesis', 'high',
    74.75, 'estimated', NULL,
    'seed')
  RETURNING opportunity_id INTO v_opp_nash;

  -- link Nashville signals
  INSERT INTO repe_opportunity_signal_links (env_id, opportunity_id, signal_id, weight, attribution_note)
  VALUES
    (v_env_id, v_opp_nash, v_sig_nash_rent, 1.0, 'Primary demand signal'),
    (v_env_id, v_opp_nash, v_sig_nash_abs, 0.8, 'Supporting absorption evidence')
  ON CONFLICT DO NOTHING;

  -- 2. Phoenix Office Distressed Recap
  INSERT INTO repe_opportunities (env_id, fund_id, name, thesis, property_type,
    market, strategy, stage, priority,
    score_signal, score_source, composite_score,
    created_by)
  VALUES (v_env_id, v_fund_id,
    'Phoenix Suburban Office Distressed Recap',
    'Provide rescue capital or direct acquisition of CMBS-challenged Phoenix '
    'suburban office at 40-55 cents on the dollar. Convert/reposition 30-40%% '
    'of space to medical office or flex industrial to drive NOI growth. '
    'Exit into recovering office or industrial cap rate environment.',
    'Office', 'Phoenix, AZ', 'opportunistic', 'underwriting', 'critical',
    84.75, 'estimated', NULL,
    'seed')
  RETURNING opportunity_id INTO v_opp_phx;

  INSERT INTO repe_opportunity_signal_links (env_id, opportunity_id, signal_id, weight, attribution_note)
  VALUES
    (v_env_id, v_opp_phx, v_sig_phx_dist, 1.0, 'Primary distress trigger'),
    (v_env_id, v_opp_phx, v_sig_phx_cap, 0.9, 'Market cap rate context')
  ON CONFLICT DO NOTHING;

  -- 3. Austin BTR Land Acquisition
  INSERT INTO repe_opportunities (env_id, fund_id, name, thesis, property_type,
    market, strategy, stage, priority,
    score_signal, score_source, composite_score,
    created_by)
  VALUES (v_env_id, v_fund_id,
    'Austin Build-to-Rent Land Play',
    'Acquire entitled land in Austin suburban markets at depressed pricing '
    'while institutional demand for BTR product remains strong. '
    'Current supply glut in MF creates land buyer advantage. '
    'Hold land 12-18 months, sell entitled or develop BTR community.',
    'Multifamily', 'Austin, TX', 'development', 'signal', 'medium',
    44.0, 'estimated', NULL,
    'seed')
  RETURNING opportunity_id INTO v_opp_atx;

  INSERT INTO repe_opportunity_signal_links (env_id, opportunity_id, signal_id, weight, attribution_note)
  VALUES
    (v_env_id, v_opp_atx, v_sig_atx_vac, 0.7, 'Contrarian entry signal')
  ON CONFLICT DO NOTHING;

  -- 4. Houston Industrial Last-Mile
  INSERT INTO repe_opportunities (env_id, fund_id, name, thesis, property_type,
    market, strategy, stage, priority,
    score_signal, score_source, composite_score,
    created_by)
  VALUES (v_env_id, v_fund_id,
    'Houston Industrial Last-Mile',
    'Acquire Class A last-mile logistics in Houston Inner Loop at sub-market rents '
    'with 5-7 year roll windows. Current 5.20%% cap rate provides 150bps spread '
    'to cost of debt on a 7-year term loan. Mark-to-market rents drive '
    'NOI growth of 20-25%% over hold period.',
    'Industrial', 'Houston, TX', 'core_plus', 'modeled', 'high',
    74.0, 'estimated', NULL,
    'seed')
  RETURNING opportunity_id INTO v_opp_hou;

  INSERT INTO repe_opportunity_signal_links (env_id, opportunity_id, signal_id, weight, attribution_note)
  VALUES
    (v_env_id, v_opp_hou, v_sig_hou_trans, 1.0, 'Primary comp evidence')
  ON CONFLICT DO NOTHING;

  -- 5. Chicago Office Repositioning
  INSERT INTO repe_opportunities (env_id, fund_id, name, thesis, property_type,
    market, strategy, stage, priority,
    score_signal, score_source, composite_score,
    created_by)
  VALUES (v_env_id, v_fund_id,
    'Chicago Suburban Office Repositioning',
    'Acquire lender-owned Chicago suburban office park at $38/SF vs $165 replacement '
    'cost. Reposition 40%% of inventory to lab/life-science or flex industrial '
    'with Chicagoland biotech demand tailwinds. Lease vacant space at ''as-is'' '
    'rate while repositioning; 7-year hold to crystallize conversion premium.',
    'Office', 'Chicago, IL', 'opportunistic', 'ic_ready', 'critical',
    88.0, 'estimated', NULL,
    'seed')
  RETURNING opportunity_id INTO v_opp_chi;

  INSERT INTO repe_opportunity_signal_links (env_id, opportunity_id, signal_id, weight, attribution_note)
  VALUES
    (v_env_id, v_opp_chi, v_sig_chi_dist1, 1.0, 'Direct acquisition target signal'),
    (v_env_id, v_opp_chi, v_sig_chi_dist2, 0.85, 'Market distress context')
  ON CONFLICT DO NOTHING;

  -- 6. Atlanta MF Core+ Acquisition (balanced, non-distress)
  INSERT INTO repe_opportunities (env_id, fund_id, name, thesis, property_type,
    market, strategy, stage, priority,
    score_signal, score_source, composite_score,
    created_by)
  VALUES (v_env_id, v_fund_id,
    'Atlanta Class B MF Core+ Acquisition',
    'Acquire stabilized Class B multifamily in Atlanta with occupancy 94%+ '
    'and in-place rents 8-10%% below market. Steady 4.1%% market rent growth '
    'with modest capex program delivers predictable cash-on-cash returns '
    'at a core+ risk profile. Strong institutional exit market.',
    'Multifamily', 'Atlanta, GA', 'core_plus', 'modeled', 'medium',
    65.0, 'estimated', NULL,
    'seed')
  RETURNING opportunity_id INTO v_opp_atl;

  INSERT INTO repe_opportunity_signal_links (env_id, opportunity_id, signal_id, weight, attribution_note)
  VALUES
    (v_env_id, v_opp_atl, v_sig_atl_occ, 1.0, 'Occupancy stability signal'),
    (v_env_id, v_opp_atl, v_sig_atl_rent, 0.85, 'Rent growth confirmation')
  ON CONFLICT DO NOTHING;

  -- ─── Assumption Versions ───────────────────────────────────────────────────

  -- Houston Industrial assumption version
  INSERT INTO repe_opportunity_assumption_versions (
    env_id, opportunity_id, version_number, label,
    purchase_price, equity_check, loan_amount, ltv,
    interest_rate_pct, io_period_months, amort_years, loan_term_years,
    base_noi, rent_growth_pct, vacancy_pct, expense_growth_pct, mgmt_fee_pct,
    exit_cap_rate_pct, exit_year, disposition_cost_pct,
    hold_years, capex_reserve_pct, fee_load_pct,
    operating_json, debt_json, exit_json,
    is_current, created_by, notes
  ) VALUES (
    v_env_id, v_opp_hou, 1, 'Base Case',
    12500000, 4375000, 8125000, 0.6500,
    0.0625, 24, 30, 7,
    875000, 0.0300, 0.0500, 0.0250, 0.0300,
    0.0550, 5, 0.0200,
    5, 0.0150, 0.0150,
    '{"rent_growth": 0.03, "vacancy": 0.05, "opex_growth": 0.025}',
    '{"spread": 0.025, "index": "SOFR", "sofr": 0.043}',
    '{"cap_rate": 0.055, "costs": 0.02}',
    true, 'seed',
    'Houston last-mile industrial base case. Below-market rents provide rent roll '
    'growth runway. 24-month IO period preserves early-year cash flow.'
  )
  RETURNING assumption_version_id INTO v_av_hou;

  UPDATE repe_opportunities
  SET current_assumption_version_id = v_av_hou
  WHERE opportunity_id = v_opp_hou;

  -- Chicago Office assumption version
  INSERT INTO repe_opportunity_assumption_versions (
    env_id, opportunity_id, version_number, label,
    purchase_price, equity_check, loan_amount, ltv,
    interest_rate_pct, io_period_months, amort_years, loan_term_years,
    base_noi, rent_growth_pct, vacancy_pct, expense_growth_pct, mgmt_fee_pct,
    exit_cap_rate_pct, exit_year, disposition_cost_pct,
    hold_years, capex_reserve_pct, fee_load_pct,
    operating_json, capex_json, debt_json, exit_json,
    is_current, created_by, notes
  ) VALUES (
    v_env_id, v_opp_chi, 1, 'Base Case',
    18000000, 8100000, 9900000, 0.5500,
    0.0700, 12, 30, 7,
    1100000, 0.0200, 0.3800, 0.0275, 0.0400,
    0.0750, 7, 0.0250,
    7, 0.0200, 0.0175,
    '{"rent_growth": 0.02, "vacancy": 0.38, "opex_growth": 0.0275}',
    '{"per_unit": 0, "reserve_pct": 0.02, "conversion_budget": 4500000}',
    '{"spread": 0.03, "index": "SOFR"}',
    '{"cap_rate": 0.075, "costs": 0.025, "notes": "Exit as repositioned flex/lab"}',
    true, 'seed',
    'Distressed acquisition at 55c/$. High vacancy assumption reflects '
    'repositioning period. Conversion budget in capex_json.'
  )
  RETURNING assumption_version_id INTO v_av_chi;

  UPDATE repe_opportunities
  SET current_assumption_version_id = v_av_chi
  WHERE opportunity_id = v_opp_chi;

  -- Atlanta MF Core+ assumption version
  INSERT INTO repe_opportunity_assumption_versions (
    env_id, opportunity_id, version_number, label,
    purchase_price, equity_check, loan_amount, ltv,
    interest_rate_pct, io_period_months, amort_years, loan_term_years,
    base_noi, rent_growth_pct, vacancy_pct, expense_growth_pct, mgmt_fee_pct,
    exit_cap_rate_pct, exit_year, disposition_cost_pct,
    hold_years, capex_reserve_pct, fee_load_pct,
    operating_json, debt_json, exit_json,
    is_current, created_by, notes
  ) VALUES (
    v_env_id, v_opp_atl, 1, 'Base Case',
    32000000, 14400000, 17600000, 0.5500,
    0.0575, 18, 30, 10,
    1900000, 0.0275, 0.0590, 0.0225, 0.0350,
    0.0520, 7, 0.0200,
    7, 0.0100, 0.0150,
    '{"rent_growth": 0.0275, "vacancy": 0.059, "opex_growth": 0.0225}',
    '{"spread": 0.015, "index": "SOFR", "sofr": 0.043}',
    '{"cap_rate": 0.052, "costs": 0.02, "notes": "Core+ institutional exit buyer"}',
    true, 'seed',
    'Stabilized Class B MF. Below-market rents at acquisition + steady rent growth '
    'delivers predictable cash flow with moderate exit cap compression story.'
  )
  RETURNING assumption_version_id INTO v_av_atl;

  UPDATE repe_opportunities
  SET current_assumption_version_id = v_av_atl
  WHERE opportunity_id = v_opp_atl;

  -- ─── Model Runs ────────────────────────────────────────────────────────────

  -- Houston model run
  INSERT INTO repe_opportunity_model_runs (
    env_id, opportunity_id, assumption_version_id,
    status, triggered_by, started_at, completed_at
  ) VALUES (
    v_env_id, v_opp_hou, v_av_hou,
    'completed', 'seed',
    now() - interval '2 hours', now() - interval '1 hour 58 minutes'
  )
  RETURNING model_run_id INTO v_run_hou;

  -- Chicago model run
  INSERT INTO repe_opportunity_model_runs (
    env_id, opportunity_id, assumption_version_id,
    status, triggered_by, started_at, completed_at
  ) VALUES (
    v_env_id, v_opp_chi, v_av_chi,
    'completed', 'seed',
    now() - interval '3 hours', now() - interval '2 hours 57 minutes'
  )
  RETURNING model_run_id INTO v_run_chi;

  -- Atlanta model run
  INSERT INTO repe_opportunity_model_runs (
    env_id, opportunity_id, assumption_version_id,
    status, triggered_by, started_at, completed_at
  ) VALUES (
    v_env_id, v_opp_atl, v_av_atl,
    'completed', 'seed',
    now() - interval '1 hour', now() - interval '58 minutes'
  )
  RETURNING model_run_id INTO v_run_atl;

  -- ─── Model Outputs ─────────────────────────────────────────────────────────

  -- Houston: core+ industrial, strong returns
  INSERT INTO repe_opportunity_model_outputs (
    env_id, model_run_id, opportunity_id, assumption_version_id,
    engine_version,
    gross_irr, net_irr, gross_equity_multiple, net_equity_multiple,
    tvpi, dpi, nav,
    min_dscr, exit_ltv, debt_yield,
    cashflow_json
  ) VALUES (
    v_env_id, v_run_hou, v_opp_hou, v_av_hou,
    'scenario_engine_v2',
    0.178000, 0.151300, 2.31, 2.19,
    2.18, 1.87, 4820000,
    1.42, 0.4890, 0.1077,
    '[{"period":1,"noi":218750,"debt_service":127734,"equity_cf":91016},
      {"period":2,"noi":225313,"debt_service":127734,"equity_cf":97579},
      {"period":3,"noi":232072,"debt_service":127734,"equity_cf":104338},
      {"period":4,"noi":239034,"debt_service":127734,"equity_cf":111300},
      {"period":5,"noi":246005,"debt_service":127734,"equity_cf":3918271}]'::jsonb
  )
  RETURNING output_id INTO v_out_hou;

  -- Chicago: distress acquisition, higher risk/return
  INSERT INTO repe_opportunity_model_outputs (
    env_id, model_run_id, opportunity_id, assumption_version_id,
    engine_version,
    gross_irr, net_irr, gross_equity_multiple, net_equity_multiple,
    tvpi, dpi, nav,
    min_dscr, exit_ltv, debt_yield,
    cashflow_json
  ) VALUES (
    v_env_id, v_run_chi, v_opp_chi, v_av_chi,
    'scenario_engine_v2',
    0.142000, 0.118000, 1.88, 1.73,
    1.72, 1.41, 5650000,
    1.22, 0.5220, 0.1111,
    '[{"period":1,"noi":275000,"debt_service":231000,"equity_cf":44000},
      {"period":2,"noi":302500,"debt_service":231000,"equity_cf":71500},
      {"period":3,"noi":440000,"debt_service":231000,"equity_cf":209000},
      {"period":4,"noi":480000,"debt_service":231000,"equity_cf":249000},
      {"period":5,"noi":520000,"debt_service":231000,"equity_cf":289000},
      {"period":6,"noi":545000,"debt_service":231000,"equity_cf":314000},
      {"period":7,"noi":572000,"debt_service":231000,"equity_cf":5321000}]'::jsonb
  )
  RETURNING output_id INTO v_out_chi;

  -- Atlanta: stabilized core+, ~11-13% returns
  INSERT INTO repe_opportunity_model_outputs (
    env_id, model_run_id, opportunity_id, assumption_version_id,
    engine_version,
    gross_irr, net_irr, gross_equity_multiple, net_equity_multiple,
    tvpi, dpi, nav,
    min_dscr, exit_ltv, debt_yield,
    cashflow_json
  ) VALUES (
    v_env_id, v_run_atl, v_opp_atl, v_av_atl,
    'scenario_engine_v2',
    0.125000, 0.106000, 2.05, 1.93,
    1.96, 1.68, 9320000,
    1.68, 0.4010, 0.1080,
    '[{"period":1,"noi":475000,"debt_service":339950,"equity_cf":135050},
      {"period":2,"noi":488063,"debt_service":339950,"equity_cf":148113},
      {"period":3,"noi":501395,"debt_service":339950,"equity_cf":161445},
      {"period":4,"noi":515003,"debt_service":339950,"equity_cf":175053},
      {"period":5,"noi":528878,"debt_service":339950,"equity_cf":188928},
      {"period":6,"noi":543032,"debt_service":339950,"equity_cf":203082},
      {"period":7,"noi":557470,"debt_service":339950,"equity_cf":15117520}]'::jsonb
  )
  RETURNING output_id INTO v_out_atl;

  -- Update opportunity score_return_modeled for modeled opportunities
  UPDATE repe_opportunities
  SET score_return_modeled = 82.0, score_source = 'modeled',
      composite_score = ROUND(0.35*82.0 + 0.25*50 + 0.20*74.0 + 0.10*50 - 0.10*50, 4)
  WHERE opportunity_id = v_opp_hou;

  UPDATE repe_opportunities
  SET score_return_modeled = 72.0, score_source = 'modeled',
      composite_score = ROUND(0.35*72.0 + 0.25*50 + 0.20*88.0 + 0.10*50 - 0.10*50, 4)
  WHERE opportunity_id = v_opp_chi;

  UPDATE repe_opportunities
  SET score_return_modeled = 65.0, score_source = 'modeled',
      composite_score = ROUND(0.35*65.0 + 0.25*50 + 0.20*65.0 + 0.10*50 - 0.10*50, 4)
  WHERE opportunity_id = v_opp_atl;

  -- ─── Fund Impacts ──────────────────────────────────────────────────────────

  IF v_fund_id IS NOT NULL THEN

    INSERT INTO repe_opportunity_fund_impacts (
      env_id, opportunity_id, model_run_id, fund_id,
      fund_nav_before, fund_gross_irr_before, fund_net_irr_before, fund_tvpi_before, fund_dpi_before,
      fund_nav_after, fund_gross_irr_after, fund_net_irr_after, fund_tvpi_after, fund_dpi_after,
      irr_delta, tvpi_delta, nav_delta,
      capital_available_before, capital_available_after,
      duration_impact_years, leverage_ratio_before, leverage_ratio_after,
      fund_fit_score, fit_rationale, allocation_pct,
      fund_fit_breakdown_json
    ) VALUES (
      v_env_id, v_opp_hou, v_run_hou, v_fund_id,
      185000000, 0.1420, 0.1210, 1.82, 1.55,
      189375000, 0.1448, 0.1231, 1.86, 1.58,
      0.002800, 0.0400, 4375000,
      18500000, 14125000,
      0.3,  -- slight duration shortening (industrial 5yr vs fund avg 6yr)
      0.5820, 0.5910,
      76.0,
      'Strong mandate alignment (core+), good geographic fit, adds leverage within policy limits.',
      0.0237,
      '{"mandate": 85, "geography": 80, "concentration": 75, "capital_availability": 70, "duration": 65, "leverage_tolerance": 72}'
    );

    INSERT INTO repe_opportunity_fund_impacts (
      env_id, opportunity_id, model_run_id, fund_id,
      fund_nav_before, fund_gross_irr_before, fund_net_irr_before, fund_tvpi_before, fund_dpi_before,
      fund_nav_after, fund_gross_irr_after, fund_net_irr_after, fund_tvpi_after, fund_dpi_after,
      irr_delta, tvpi_delta, nav_delta,
      capital_available_before, capital_available_after,
      duration_impact_years, leverage_ratio_before, leverage_ratio_after,
      fund_fit_score, fit_rationale, allocation_pct,
      fund_fit_breakdown_json
    ) VALUES (
      v_env_id, v_opp_chi, v_run_chi, v_fund_id,
      185000000, 0.1420, 0.1210, 1.82, 1.55,
      193100000, 0.1437, 0.1221, 1.85, 1.57,
      0.001700, 0.0300, 8100000,
      18500000, 10400000,
      1.5,  -- longer hold extends fund duration
      0.5820, 0.5970,
      62.0,
      'Opportunistic strategy fits fund mandate, but 7-year hold increases duration and '
      'high leverage at entry strains concentration limits.',
      0.0438,
      '{"mandate": 75, "geography": 65, "concentration": 55, "capital_availability": 60, "duration": 55, "leverage_tolerance": 58}'
    );

    INSERT INTO repe_opportunity_fund_impacts (
      env_id, opportunity_id, model_run_id, fund_id,
      fund_nav_before, fund_gross_irr_before, fund_net_irr_before, fund_tvpi_before, fund_dpi_before,
      fund_nav_after, fund_gross_irr_after, fund_net_irr_after, fund_tvpi_after, fund_dpi_after,
      irr_delta, tvpi_delta, nav_delta,
      capital_available_before, capital_available_after,
      duration_impact_years, leverage_ratio_before, leverage_ratio_after,
      fund_fit_score, fit_rationale, allocation_pct,
      fund_fit_breakdown_json
    ) VALUES (
      v_env_id, v_opp_atl, v_run_atl, v_fund_id,
      185000000, 0.1420, 0.1210, 1.82, 1.55,
      199400000, 0.1424, 0.1213, 1.83, 1.56,
      0.000400, 0.0100, 14400000,
      18500000, 4100000,
      0.6,  -- 7yr hold slightly extends duration
      0.5820, 0.6030,
      81.0,
      'Excellent fund fit: core+ mandate match, Atlanta geography alignment, '
      'lower leverage improves portfolio metrics, strong institutional exit market.',
      0.0778,
      '{"mandate": 90, "geography": 85, "concentration": 80, "capital_availability": 50, "duration": 70, "leverage_tolerance": 88}'
    );

  END IF;

  -- ─── Promotion Record (Chicago — approved, pending conversion) ─────────────

  INSERT INTO repe_opportunity_promotions (
    env_id, opportunity_id, assumption_version_id, model_run_id,
    promotion_status, conversion_status,
    ic_memo_text, promoted_by, approved_by,
    promoted_at, approved_at, notes
  ) VALUES (
    v_env_id, v_opp_chi, v_av_chi, v_run_chi,
    'approved', 'pending',
    'IC approved Chicago Suburban Office Repositioning. Key terms: '
    '$18M all-in purchase price, $8.1M equity check, '
    '7-year hold targeting 14.2%% gross IRR. '
    'Conversion contingent on final legal entity setup and lender confirmation.',
    'seed-user', 'IC Committee',
    now() - interval '30 minutes', now() - interval '15 minutes',
    'Pending legal entity creation and final debt commitment letter.'
  );

  -- Advance Chicago opportunity to approved stage
  UPDATE repe_opportunities
  SET stage = 'approved'
  WHERE opportunity_id = v_opp_chi;

  RAISE NOTICE '505_repe_opportunity_seed: Seeded env_id=% — '
    '4 signal sources, 11 signals, 6 opportunities, 3 model runs, '
    '1 promotion record.', v_env_id;

END $$;
