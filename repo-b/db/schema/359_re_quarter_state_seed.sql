-- 359_re_quarter_state_seed.sql
-- Seed deterministic quarterly snapshots for fund, investment, and asset levels.
--
-- Depends on: 355 (size-aware financials), 358 (partners/capital), 322 (debt)
-- Idempotent: ON CONFLICT DO NOTHING throughout.

DO $$
DECLARE
  v_env_id uuid := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  v_fund_igf uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;

  v_quarters text[] := ARRAY['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'];
  v_run_id uuid;
  i int;
  r RECORD;
  v_total_nav numeric;
  v_total_committed numeric;
  v_total_called numeric;
  v_total_distributed numeric;
  v_dpi numeric;
  v_rvpi numeric;
  v_tvpi numeric;
  v_weighted_ltv numeric;
  v_weighted_dscr numeric;
BEGIN
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE NOTICE '359: No business binding, skipping';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- I. ASSET QUARTER STATE — derive from re_asset_acct_quarter_rollup
  -- ═══════════════════════════════════════════════════════════════════════
  -- Ensures ALL IGF-VII assets have re_asset_quarter_state rows
  -- (349 only seeded Meridian Office Tower)

  FOR r IN
    SELECT
      a.asset_id,
      qr.quarter,
      qr.noi,
      qr.revenue,
      qr.opex,
      qr.capex,
      qr.debt_service,
      COALESCE(oq.occupancy, 90) / 100.0 AS occupancy,
      COALESCE(l.upb, 0) AS debt_balance,
      -- Asset value = annualized NOI / implied cap rate (5.5% default)
      CASE WHEN qr.noi > 0 THEN ROUND(qr.noi * 4 / 0.055, 2) ELSE 0 END AS asset_value
    FROM repe_asset a
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    JOIN re_asset_acct_quarter_rollup qr ON qr.asset_id = a.asset_id AND qr.env_id = v_env_id
    LEFT JOIN re_asset_occupancy_quarter oq ON oq.asset_id = a.asset_id AND oq.quarter = qr.quarter AND oq.env_id = v_env_id
    LEFT JOIN re_loan l ON l.asset_id = a.asset_id
    WHERE f.fund_id = v_fund_igf
  LOOP
    v_run_id := gen_random_uuid();

    INSERT INTO re_asset_quarter_state (
      id, asset_id, quarter, scenario_id,
      noi, revenue, opex, capex, debt_service, occupancy,
      debt_balance, asset_value, nav,
      valuation_method, inputs_hash, run_id, created_at
    )
    VALUES (
      gen_random_uuid(),
      r.asset_id,
      r.quarter,
      NULL,
      r.noi,
      r.revenue,
      r.opex,
      r.capex,
      r.debt_service,
      r.occupancy,
      r.debt_balance,
      r.asset_value,
      r.asset_value - r.debt_balance,  -- NAV = value - debt
      'cap_rate',
      'seed:' || r.asset_id::text || ':' || r.quarter,
      v_run_id,
      now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- II. INVESTMENT QUARTER STATE — rollup from assets per deal
  -- ═══════════════════════════════════════════════════════════════════════

  FOR r IN
    SELECT
      d.deal_id AS investment_id,
      qs.quarter,
      SUM(COALESCE(qs.nav, 0)) AS nav,
      COALESCE(d.invested_capital, SUM(COALESCE(qs.asset_value, 0)) * 0.40) AS invested_capital,
      COALESCE(d.realized_distributions, 0) AS realized_distributions,
      AVG(COALESCE(qs.occupancy, 0.90)) AS avg_occupancy,
      -- Implied equity multiple
      CASE WHEN COALESCE(d.invested_capital, 1) > 0
        THEN (SUM(COALESCE(qs.nav, 0)) + COALESCE(d.realized_distributions, 0))
             / GREATEST(COALESCE(d.invested_capital, SUM(COALESCE(qs.asset_value, 0)) * 0.40), 1)
        ELSE 1.0
      END AS equity_multiple
    FROM repe_deal d
    JOIN repe_asset a ON a.deal_id = d.deal_id
    JOIN re_asset_quarter_state qs ON qs.asset_id = a.asset_id AND qs.scenario_id IS NULL
    WHERE d.fund_id = v_fund_igf
    GROUP BY d.deal_id, qs.quarter, d.invested_capital, d.realized_distributions
  LOOP
    v_run_id := gen_random_uuid();

    INSERT INTO re_investment_quarter_state (
      id, investment_id, quarter, scenario_id, run_id,
      nav, invested_capital, realized_distributions, unrealized_value,
      gross_irr, net_irr, equity_multiple, inputs_hash, created_at
    )
    VALUES (
      gen_random_uuid(),
      r.investment_id,
      r.quarter,
      NULL,
      v_run_id,
      r.nav,
      r.invested_capital,
      r.realized_distributions,
      r.nav,  -- unrealized = current NAV
      -- Gross IRR: scaled by equity multiple and quarter index
      ROUND(0.08 + (r.equity_multiple - 1.0) * 0.06, 4),
      -- Net IRR: gross - ~200bps
      ROUND(0.06 + (r.equity_multiple - 1.0) * 0.05, 4),
      ROUND(r.equity_multiple, 4),
      'seed:' || r.investment_id::text || ':' || r.quarter,
      now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- III. FUND QUARTER STATE — rollup from investments
  -- ═══════════════════════════════════════════════════════════════════════

  FOR i IN 1..8 LOOP
    -- Portfolio NAV = sum of investment NAVs
    SELECT COALESCE(SUM(iqs.nav), 0)
    INTO v_total_nav
    FROM re_investment_quarter_state iqs
    JOIN repe_deal d ON d.deal_id = iqs.investment_id
    WHERE d.fund_id = v_fund_igf
      AND iqs.quarter = v_quarters[i]
      AND iqs.scenario_id IS NULL;

    -- If no investment state data, fall back to asset rollup
    IF v_total_nav = 0 THEN
      SELECT COALESCE(SUM(
        CASE WHEN qr.noi > 0 THEN qr.noi * 4 / 0.055 ELSE 0 END
        - COALESCE(l.upb, 0)
      ), 0)
      INTO v_total_nav
      FROM re_asset_acct_quarter_rollup qr
      JOIN repe_asset a ON a.asset_id = qr.asset_id
      JOIN repe_deal d ON d.deal_id = a.deal_id
      LEFT JOIN re_loan l ON l.asset_id = a.asset_id
      WHERE d.fund_id = v_fund_igf
        AND qr.quarter = v_quarters[i]
        AND qr.env_id = v_env_id;
    END IF;

    -- Total committed from partner commitments
    SELECT COALESCE(SUM(pc.committed_amount), 500000000)
    INTO v_total_committed
    FROM re_partner_commitment pc
    WHERE pc.fund_id = v_fund_igf;

    -- Total called = cumulative contributions through this quarter
    SELECT COALESCE(SUM(cle.amount), 0)
    INTO v_total_called
    FROM re_capital_ledger_entry cle
    WHERE cle.fund_id = v_fund_igf
      AND cle.entry_type = 'contribution'
      AND cle.quarter <= v_quarters[i];

    -- Total distributed = cumulative distributions through this quarter
    SELECT COALESCE(SUM(cle.amount), 0)
    INTO v_total_distributed
    FROM re_capital_ledger_entry cle
    WHERE cle.fund_id = v_fund_igf
      AND cle.entry_type = 'distribution'
      AND cle.quarter <= v_quarters[i];

    -- Compute ratios
    IF v_total_called > 0 THEN
      v_dpi := ROUND(v_total_distributed / v_total_called, 4);
      v_rvpi := ROUND(v_total_nav / v_total_called, 4);
      v_tvpi := ROUND((v_total_distributed + v_total_nav) / v_total_called, 4);
    ELSE
      v_dpi := 0; v_rvpi := 0; v_tvpi := 0;
    END IF;

    -- Weighted LTV from assets
    SELECT COALESCE(
      SUM(COALESCE(l.upb, 0)) /
      NULLIF(SUM(CASE WHEN qr.noi > 0 THEN qr.noi * 4 / 0.055 ELSE 0 END), 0)
    , 0)
    INTO v_weighted_ltv
    FROM re_asset_acct_quarter_rollup qr
    JOIN repe_asset a ON a.asset_id = qr.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    LEFT JOIN re_loan l ON l.asset_id = a.asset_id
    WHERE d.fund_id = v_fund_igf
      AND qr.quarter = v_quarters[i]
      AND qr.env_id = v_env_id;

    -- Weighted DSCR
    SELECT COALESCE(
      SUM(qr.noi) / NULLIF(SUM(COALESCE(qr.debt_service, 0)), 0)
    , 0)
    INTO v_weighted_dscr
    FROM re_asset_acct_quarter_rollup qr
    JOIN repe_asset a ON a.asset_id = qr.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    WHERE d.fund_id = v_fund_igf
      AND qr.quarter = v_quarters[i]
      AND qr.env_id = v_env_id;

    v_run_id := gen_random_uuid();

    INSERT INTO re_fund_quarter_state (
      id, fund_id, quarter, scenario_id, run_id,
      portfolio_nav, total_committed, total_called, total_distributed,
      dpi, rvpi, tvpi,
      gross_irr, net_irr,
      weighted_ltv, weighted_dscr,
      inputs_hash, created_at
    )
    VALUES (
      gen_random_uuid(),
      v_fund_igf,
      v_quarters[i],
      NULL,
      v_run_id,
      v_total_nav,
      v_total_committed,
      v_total_called,
      v_total_distributed,
      v_dpi,
      v_rvpi,
      v_tvpi,
      -- Gross IRR: ramps from 12% to 16% over 8 quarters
      ROUND(0.12 + (i - 1) * 0.005 + (v_tvpi - 1.0) * 0.02, 4),
      -- Net IRR: gross - ~250bps
      ROUND(0.095 + (i - 1) * 0.004 + (v_tvpi - 1.0) * 0.015, 4),
      v_weighted_ltv,
      v_weighted_dscr,
      'seed:fund:' || v_fund_igf::text || ':' || v_quarters[i],
      now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IV. PARTNER QUARTER METRICS — for IGF-VII partners
  -- ═══════════════════════════════════════════════════════════════════════

  FOR i IN 1..8 LOOP
    FOR r IN
      SELECT
        pc.partner_id,
        pc.committed_amount,
        pc.committed_amount / v_total_committed AS pct
      FROM re_partner_commitment pc
      WHERE pc.fund_id = v_fund_igf
    LOOP
      DECLARE
        v_p_contributed numeric;
        v_p_distributed numeric;
        v_p_nav numeric;
        v_p_dpi numeric;
        v_p_tvpi numeric;
      BEGIN
        -- Partner's cumulative contribution
        SELECT COALESCE(SUM(cle.amount), 0)
        INTO v_p_contributed
        FROM re_capital_ledger_entry cle
        WHERE cle.fund_id = v_fund_igf
          AND cle.partner_id = r.partner_id
          AND cle.entry_type = 'contribution'
          AND cle.quarter <= v_quarters[i];

        -- Partner's cumulative distribution
        SELECT COALESCE(SUM(cle.amount), 0)
        INTO v_p_distributed
        FROM re_capital_ledger_entry cle
        WHERE cle.fund_id = v_fund_igf
          AND cle.partner_id = r.partner_id
          AND cle.entry_type = 'distribution'
          AND cle.quarter <= v_quarters[i];

        -- Partner's NAV share = portfolio NAV * partner pct
        v_p_nav := ROUND(v_total_nav * r.pct, 2);

        IF v_p_contributed > 0 THEN
          v_p_dpi := ROUND(v_p_distributed / v_p_contributed, 4);
          v_p_tvpi := ROUND((v_p_distributed + v_p_nav) / v_p_contributed, 4);
        ELSE
          v_p_dpi := 0; v_p_tvpi := 0;
        END IF;

        v_run_id := gen_random_uuid();

        INSERT INTO re_partner_quarter_metrics (
          partner_id, fund_id, quarter, scenario_id, run_id,
          contributed_to_date, distributed_to_date, nav,
          dpi, tvpi, irr, created_at
        )
        VALUES (
          r.partner_id,
          v_fund_igf,
          v_quarters[i],
          NULL,
          v_run_id,
          v_p_contributed,
          v_p_distributed,
          v_p_nav,
          v_p_dpi,
          v_p_tvpi,
          ROUND(0.095 + (i - 1) * 0.004 + (v_p_tvpi - 1.0) * 0.015, 4),
          now()
        )
        ON CONFLICT DO NOTHING;
      END;
    END LOOP;

    -- Also get total_nav for next iteration from fund state
    SELECT fqs.portfolio_nav INTO v_total_nav
    FROM re_fund_quarter_state fqs
    WHERE fqs.fund_id = v_fund_igf AND fqs.quarter = v_quarters[i]
    LIMIT 1;

    -- Get total_committed for partner pct calc
    SELECT COALESCE(SUM(pc.committed_amount), 500000000)
    INTO v_total_committed
    FROM re_partner_commitment pc
    WHERE pc.fund_id = v_fund_igf;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- V. CASHFLOW LEDGER — operating CF entries per asset
  -- ═══════════════════════════════════════════════════════════════════════

  FOR r IN
    SELECT
      d.fund_id,
      a.asset_id,
      qr.quarter,
      qr.noi,
      qr.net_cash_flow
    FROM re_asset_acct_quarter_rollup qr
    JOIN repe_asset a ON a.asset_id = qr.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    WHERE d.fund_id = v_fund_igf
      AND qr.env_id = v_env_id
  LOOP
    DECLARE
      v_year int := LEFT(r.quarter, 4)::int;
      v_q int := RIGHT(r.quarter, 1)::int;
      v_date date := (v_year || '-' || LPAD((v_q * 3)::text, 2, '0') || '-15')::date;
    BEGIN
      INSERT INTO re_cashflow_ledger_entry (
        fund_id, asset_id, cashflow_type, amount_base,
        effective_date, quarter, memo, run_id
      )
      SELECT
        r.fund_id, r.asset_id, 'operating_cf',
        COALESCE(r.net_cash_flow, r.noi),
        v_date, r.quarter,
        'Operating CF - ' || r.quarter,
        gen_random_uuid()
      WHERE NOT EXISTS (
        SELECT 1 FROM re_cashflow_ledger_entry cfl
        WHERE cfl.asset_id = r.asset_id
          AND cfl.quarter = r.quarter
          AND cfl.cashflow_type = 'operating_cf'
      );
    END;
  END LOOP;

  RAISE NOTICE '359: Quarter state seeded for fund %, investments, assets, partners, cashflows', v_fund_igf;
END $$;
