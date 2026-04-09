-- 443_re_multi_fund_differentiated_seed.sql
-- Seed three distinct fund archetypes with fully differentiated financial profiles.
--
-- Problem solved: All existing fund-level metrics use the same formula approximation
-- for IRR/DPI/TVPI. This migration replaces formula-derived IRRs with values computed
-- from actual cash flow series, and ensures each fund archetype has distinct operating
-- characteristics, leverage, vintage, and return profile.
--
-- Fund archetypes seeded:
--
-- 1. IGF-VII  (Core Plus, vintage 2024, low leverage, steady cash flows)
--    - Target IRR: ~12–14% gross
--    - Strategy: Core-plus office/industrial, moderate leverage (50% LTV)
--    - Capital call: front-loaded, early distributions from operations
--
-- 2. Granite Peak Value-Add Fund I  (Value-Add, vintage 2023, higher leverage)
--    - Target IRR: ~17–20% gross
--    - Strategy: Multifamily repositioning, 65% LTV, back-loaded returns
--    - Capital call: gradual draw-down, minimal early distributions, exit-heavy
--
-- 3. Meridian Debt Income Fund II  (Debt/Mezzanine, vintage 2024, low equity risk)
--    - Target IRR: ~10–12% gross, high DPI (current pay)
--    - Strategy: First-lien + mezzanine lending, quarterly interest distributions
--    - Capital call: immediate full draw, steady income, low terminal appreciation
--
-- Each fund gets:
--   - Distinct re_fund_quarter_state rows for 2025Q1–2026Q4
--   - Capital ledger entries (contributions + distributions) matching strategy
--   - IRR values computed from those cash flows via xirr_from_fund_ledger()
--   - Integrity assertions verifying all funds have unique IRR
--
-- Depends on: 270, 358, 359, 441, 442 (xirr function)
-- Idempotent: ON CONFLICT DO NOTHING throughout.

DO $$
DECLARE
  v_env_id      uuid := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;

  -- Fund UUIDs (IGF-VII already exists from prior seeds)
  v_fund_igf     uuid := 'a1b2c3d4-0003-0030-0001-000000000001';
  v_fund_granite uuid;
  v_fund_meridian_debt uuid := 'a1b2c3d4-0003-0030-0003-000000000001'::uuid;

  -- Partners for the two new funds (re-use existing where possible)
  v_p_gp  uuid := 'e0a10000-0001-0001-0001-000000000001';  -- GP
  v_p2    uuid := 'e0a10000-0001-0001-0002-000000000001';  -- CalPERS
  v_p3    uuid := 'e0a10000-0001-0001-0003-000000000001';  -- Hartford
  v_p5    uuid := 'e0a10000-0001-0001-0005-000000000001';  -- Blackrock
  v_p7    uuid := 'e0a10000-0001-0001-0007-000000000001';  -- Texas Teachers

  v_quarters  text[] := ARRAY['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'];

  -- ── Granite Peak call schedule (value-add: gradual 8-quarter draw, exits late)
  -- Contributions: 10%, 15%, 20%, 20%, 15%, 10%, 5%, 5% of $350M
  v_gp_committed  numeric := 350000000;
  v_gp_call_pcts  numeric[] := ARRAY[0.10, 0.15, 0.20, 0.20, 0.15, 0.10, 0.05, 0.05];
  v_gp_dist_pcts  numeric[] := ARRAY[0.00, 0.00, 0.01, 0.01, 0.02, 0.03, 0.08, 0.20];

  -- ── Meridian Debt call schedule (debt fund: immediate full draw, quarterly income)
  -- Contributions: 40%, 30%, 20%, 10% drawn; rest is immediate deployment
  v_md_committed  numeric := 200000000;
  v_md_call_pcts  numeric[] := ARRAY[0.40, 0.30, 0.20, 0.10, 0.00, 0.00, 0.00, 0.00];
  v_md_dist_pcts  numeric[] := ARRAY[0.025, 0.025, 0.025, 0.025, 0.030, 0.030, 0.030, 0.030];
  -- ~10–12% annualized income yield

  i           int;
  v_run_id    uuid;
  v_qdate     date;
  v_year      int;
  v_q_num     int;

  -- Granite Peak state variables
  v_gp_called      numeric := 0;
  v_gp_distributed numeric := 0;
  v_gp_nav         numeric;
  v_gp_nav_mult    numeric[] := ARRAY[1.05, 1.10, 1.18, 1.25, 1.35, 1.42, 1.55, 1.68];

  -- Meridian Debt state variables
  v_md_called      numeric := 0;
  v_md_distributed numeric := 0;
  v_md_nav         numeric;

  -- IRR results
  v_irr_result RECORD;
  v_gp_gross_irr  numeric;
  v_gp_net_irr    numeric;
  v_md_gross_irr  numeric;
  v_md_net_irr    numeric;
  v_igf_gross_irr numeric;
  v_igf_net_irr   numeric;

  v_dpi    numeric;
  v_rvpi   numeric;
  v_tvpi   numeric;
BEGIN
  -- ── 0. Resolve context ──────────────────────────────────────────────────
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE NOTICE '443: No business binding for %, skipping', v_env_id;
    RETURN;
  END IF;

  -- Guard: skip if repe_fund doesn't have expected columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'repe_fund' AND column_name = 'target_irr'
  ) THEN
    RAISE NOTICE '443: repe_fund.target_irr not present, skipping differentiated seed';
    RETURN;
  END IF;

  -- Resolve Granite Peak fund_id (may exist from 358; use deterministic UUID)
  SELECT fund_id INTO v_fund_granite
  FROM repe_fund
  WHERE business_id = v_business_id
    AND LOWER(name) LIKE '%%granite%%peak%%'
  LIMIT 1;

  -- If Granite Peak does not exist, create it
  IF v_fund_granite IS NULL THEN
    v_fund_granite := 'a1b2c3d4-0003-0030-0002-000000000001'::uuid;

    INSERT INTO repe_fund (fund_id, business_id, name, strategy, vintage_year, target_irr, status, created_at)
    VALUES (
      v_fund_granite,
      v_business_id,
      'Granite Peak Value-Add Fund I',
      'value_add',
      2023,
      0.18,
      'active',
      now()
    )
    ON CONFLICT (fund_id) DO NOTHING;

    RAISE NOTICE '443: Created Granite Peak fund %', v_fund_granite;
  END IF;

  -- Create Meridian Debt Income Fund II if it does not exist
  INSERT INTO repe_fund (fund_id, business_id, name, strategy, vintage_year, target_irr, status, created_at)
  VALUES (
    v_fund_meridian_debt,
    v_business_id,
    'Meridian Debt Income Fund II',
    'debt',
    2024,
    0.11,
    'active',
    now()
  )
  ON CONFLICT (fund_id) DO NOTHING;

  -- ── 1. Granite Peak: partner commitments ───────────────────────────────
  -- GP (5%), CalPERS (30%), Texas Teachers (25%), Blackrock (25%), Hartford (15%)
  INSERT INTO re_partner_commitment (commitment_id, partner_id, fund_id, committed_amount, commitment_date, status, created_at)
  VALUES
    (gen_random_uuid(), v_p_gp, v_fund_granite, v_gp_committed * 0.05, '2023-06-01', 'active', now()),
    (gen_random_uuid(), v_p2,   v_fund_granite, v_gp_committed * 0.30, '2023-06-01', 'active', now()),
    (gen_random_uuid(), v_p7,   v_fund_granite, v_gp_committed * 0.25, '2023-06-01', 'active', now()),
    (gen_random_uuid(), v_p5,   v_fund_granite, v_gp_committed * 0.25, '2023-06-01', 'active', now()),
    (gen_random_uuid(), v_p3,   v_fund_granite, v_gp_committed * 0.15, '2023-06-01', 'active', now())
  ON CONFLICT (partner_id, fund_id) DO NOTHING;

  -- ── 2. Meridian Debt: partner commitments ──────────────────────────────
  -- GP (10%), CalPERS (40%), Hartford (30%), Texas Teachers (20%)
  INSERT INTO re_partner_commitment (commitment_id, partner_id, fund_id, committed_amount, commitment_date, status, created_at)
  VALUES
    (gen_random_uuid(), v_p_gp, v_fund_meridian_debt, v_md_committed * 0.10, '2024-01-15', 'active', now()),
    (gen_random_uuid(), v_p2,   v_fund_meridian_debt, v_md_committed * 0.40, '2024-01-15', 'active', now()),
    (gen_random_uuid(), v_p3,   v_fund_meridian_debt, v_md_committed * 0.30, '2024-01-15', 'active', now()),
    (gen_random_uuid(), v_p7,   v_fund_meridian_debt, v_md_committed * 0.20, '2024-01-15', 'active', now())
  ON CONFLICT (partner_id, fund_id) DO NOTHING;

  -- ── 3. Capital ledger — Granite Peak ───────────────────────────────────
  FOR i IN 1..8 LOOP
    v_year  := LEFT(v_quarters[i], 4)::int;
    v_q_num := RIGHT(v_quarters[i], 1)::int;
    v_qdate := (v_year || '-' || LPAD((v_q_num * 3 - 2)::text, 2, '0') || '-15')::date;

    -- Capital call
    IF v_gp_call_pcts[i] > 0 THEN
      INSERT INTO re_capital_ledger_entry (
        entry_id, fund_id, entry_type, amount, amount_base, effective_date, quarter, memo, run_id
      )
      VALUES (
        gen_random_uuid(), v_fund_granite, 'contribution',
        ROUND(v_gp_committed * v_gp_call_pcts[i], 2),
        ROUND(v_gp_committed * v_gp_call_pcts[i], 2),
        v_qdate, v_quarters[i],
        'Capital call Q' || v_q_num || ' (' || (v_gp_call_pcts[i]*100)::int || '% draw)',
        gen_random_uuid()
      )
      ON CONFLICT DO NOTHING;

      v_gp_called := v_gp_called + ROUND(v_gp_committed * v_gp_call_pcts[i], 2);
    END IF;

    -- Distribution (end of quarter)
    v_qdate := (v_year || '-' || LPAD((v_q_num * 3)::text, 2, '0') || '-28')::date;
    IF v_gp_dist_pcts[i] > 0 THEN
      INSERT INTO re_capital_ledger_entry (
        entry_id, fund_id, entry_type, amount, amount_base, effective_date, quarter, memo, run_id
      )
      VALUES (
        gen_random_uuid(), v_fund_granite, 'distribution',
        ROUND(v_gp_committed * v_gp_dist_pcts[i], 2),
        ROUND(v_gp_committed * v_gp_dist_pcts[i], 2),
        v_qdate, v_quarters[i],
        'Distribution Q' || v_q_num,
        gen_random_uuid()
      )
      ON CONFLICT DO NOTHING;

      v_gp_distributed := v_gp_distributed + ROUND(v_gp_committed * v_gp_dist_pcts[i], 2);
    END IF;
  END LOOP;

  -- ── 4. Capital ledger — Meridian Debt ──────────────────────────────────
  FOR i IN 1..8 LOOP
    v_year  := LEFT(v_quarters[i], 4)::int;
    v_q_num := RIGHT(v_quarters[i], 1)::int;
    v_qdate := (v_year || '-' || LPAD((v_q_num * 3 - 2)::text, 2, '0') || '-15')::date;

    IF v_md_call_pcts[i] > 0 THEN
      INSERT INTO re_capital_ledger_entry (
        entry_id, fund_id, entry_type, amount, amount_base, effective_date, quarter, memo, run_id
      )
      VALUES (
        gen_random_uuid(), v_fund_meridian_debt, 'contribution',
        ROUND(v_md_committed * v_md_call_pcts[i], 2),
        ROUND(v_md_committed * v_md_call_pcts[i], 2),
        v_qdate, v_quarters[i],
        'Debt fund draw Q' || v_q_num,
        gen_random_uuid()
      )
      ON CONFLICT DO NOTHING;

      v_md_called := v_md_called + ROUND(v_md_committed * v_md_call_pcts[i], 2);
    END IF;

    -- Debt fund: income distributions quarterly from called capital
    IF v_md_called > 0 THEN
      v_qdate := (v_year || '-' || LPAD((v_q_num * 3)::text, 2, '0') || '-28')::date;
      INSERT INTO re_capital_ledger_entry (
        entry_id, fund_id, entry_type, amount, amount_base, effective_date, quarter, memo, run_id
      )
      VALUES (
        gen_random_uuid(), v_fund_meridian_debt, 'distribution',
        ROUND(v_md_called * v_md_dist_pcts[i], 2),
        ROUND(v_md_called * v_md_dist_pcts[i], 2),
        v_qdate, v_quarters[i],
        'Interest income Q' || v_q_num,
        gen_random_uuid()
      )
      ON CONFLICT DO NOTHING;

      v_md_distributed := v_md_distributed + ROUND(v_md_called * v_md_dist_pcts[i], 2);
    END IF;
  END LOOP;

  -- ── 5. Fund quarter state — Granite Peak ───────────────────────────────
  -- NAV ramps up with repositioning progress; exits start 2026Q3
  v_gp_called      := 0;
  v_gp_distributed := 0;
  FOR i IN 1..8 LOOP
    v_gp_called      := v_gp_called + ROUND(v_gp_committed * v_gp_call_pcts[i], 2);
    v_gp_distributed := v_gp_distributed + ROUND(v_gp_committed * v_gp_dist_pcts[i], 2);
    v_gp_nav         := ROUND(v_gp_called * v_gp_nav_mult[i], 2);

    IF v_gp_called > 0 THEN
      v_dpi  := ROUND(v_gp_distributed / v_gp_called, 4);
      v_rvpi := ROUND(v_gp_nav / v_gp_called, 4);
      v_tvpi := ROUND((v_gp_distributed + v_gp_nav) / v_gp_called, 4);
    ELSE
      v_dpi := 0; v_rvpi := 0; v_tvpi := 0;
    END IF;

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
      gen_random_uuid(), v_fund_granite, v_quarters[i], NULL, v_run_id,
      v_gp_nav, v_gp_committed, v_gp_called, v_gp_distributed,
      v_dpi, v_rvpi, v_tvpi,
      -- Placeholder IRRs: replaced below after ledger is built
      NULL, NULL,
      0.62, 1.28,
      'seed:granite:' || v_quarters[i], now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── 6. Fund quarter state — Meridian Debt ──────────────────────────────
  v_md_called      := 0;
  v_md_distributed := 0;
  FOR i IN 1..8 LOOP
    v_md_called      := v_md_called + ROUND(v_md_committed * v_md_call_pcts[i], 2);
    v_md_distributed := v_md_distributed + ROUND(v_md_committed * v_md_dist_pcts[i] * v_md_called, 2);

    -- Debt fund NAV ≈ par (principal is senior secured, minimal appreciation)
    v_md_nav := ROUND(v_md_called * (1.0 + 0.005 * i), 2);  -- slight accretion

    IF v_md_called > 0 THEN
      v_dpi  := ROUND(v_md_distributed / v_md_called, 4);
      v_rvpi := ROUND(v_md_nav / v_md_called, 4);
      v_tvpi := ROUND((v_md_distributed + v_md_nav) / v_md_called, 4);
    ELSE
      v_dpi := 0; v_rvpi := 0; v_tvpi := 0;
    END IF;

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
      gen_random_uuid(), v_fund_meridian_debt, v_quarters[i], NULL, v_run_id,
      v_md_nav, v_md_committed, v_md_called, v_md_distributed,
      v_dpi, v_rvpi, v_tvpi,
      NULL, NULL,
      0.45, 1.80,
      'seed:meridian-debt:' || v_quarters[i], now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── 7. Compute and backfill IRRs from ledger using xirr_from_fund_ledger ──
  -- This replaces all NULL and formula-approximated gross_irr / net_irr values
  -- with values computed from the actual re_capital_ledger_entry series.

  -- IGF-VII
  FOR v_irr_result IN
    SELECT gross_irr, net_irr, cf_count, diagnosis
    FROM xirr_from_fund_ledger(v_fund_igf, '2026Q4')
  LOOP
    v_igf_gross_irr := v_irr_result.gross_irr;
    v_igf_net_irr   := v_irr_result.net_irr;
    RAISE NOTICE '443: IGF-VII IRR — gross=% net=% (% CFs, %)',
      v_igf_gross_irr, v_igf_net_irr, v_irr_result.cf_count, v_irr_result.diagnosis;
  END LOOP;

  IF v_igf_gross_irr IS NOT NULL THEN
    UPDATE re_fund_quarter_state
    SET
      gross_irr = v_igf_gross_irr,
      net_irr   = COALESCE(v_igf_net_irr, v_igf_gross_irr - 0.020)
    WHERE fund_id = v_fund_igf
      AND scenario_id IS NULL
      AND (gross_irr IS NULL
        OR ABS(gross_irr - 0.120) < 0.001  -- old formula base value 0.12
      );
  END IF;

  -- Granite Peak
  FOR v_irr_result IN
    SELECT gross_irr, net_irr, cf_count, diagnosis
    FROM xirr_from_fund_ledger(v_fund_granite, '2026Q4')
  LOOP
    v_gp_gross_irr := v_irr_result.gross_irr;
    v_gp_net_irr   := v_irr_result.net_irr;
    RAISE NOTICE '443: Granite Peak IRR — gross=% net=% (% CFs, %)',
      v_gp_gross_irr, v_gp_net_irr, v_irr_result.cf_count, v_irr_result.diagnosis;
  END LOOP;

  IF v_gp_gross_irr IS NOT NULL THEN
    UPDATE re_fund_quarter_state
    SET
      gross_irr = v_gp_gross_irr,
      net_irr   = COALESCE(v_gp_net_irr, v_gp_gross_irr - 0.025)
    WHERE fund_id = v_fund_granite
      AND scenario_id IS NULL;
  END IF;

  -- Meridian Debt
  FOR v_irr_result IN
    SELECT gross_irr, net_irr, cf_count, diagnosis
    FROM xirr_from_fund_ledger(v_fund_meridian_debt, '2026Q4')
  LOOP
    v_md_gross_irr := v_irr_result.gross_irr;
    v_md_net_irr   := v_irr_result.net_irr;
    RAISE NOTICE '443: Meridian Debt IRR — gross=% net=% (% CFs, %)',
      v_md_gross_irr, v_md_net_irr, v_irr_result.cf_count, v_irr_result.diagnosis;
  END LOOP;

  IF v_md_gross_irr IS NOT NULL THEN
    UPDATE re_fund_quarter_state
    SET
      gross_irr = v_md_gross_irr,
      net_irr   = COALESCE(v_md_net_irr, v_md_gross_irr - 0.015)
    WHERE fund_id = v_fund_meridian_debt
      AND scenario_id IS NULL;
  END IF;

  -- ── 8. Integrity assertions ─────────────────────────────────────────────
  -- Warn (don't fail) if any two funds have identical gross IRR at 2026Q2
  DECLARE
    v_dupe_count int;
  BEGIN
    SELECT COUNT(*) INTO v_dupe_count
    FROM (
      SELECT gross_irr
      FROM re_fund_quarter_state
      WHERE quarter = '2026Q2'
        AND scenario_id IS NULL
        AND gross_irr IS NOT NULL
      GROUP BY gross_irr
      HAVING COUNT(*) > 1
    ) dupes;

    IF v_dupe_count > 0 THEN
      RAISE WARNING '443: INTEGRITY WARNING — % fund(s) share identical gross IRR at 2026Q2. '
        'Verify that cash flow series are differentiated.', v_dupe_count;
    ELSE
      RAISE NOTICE '443: Integrity OK — all funds have distinct gross IRR at 2026Q2';
    END IF;
  END;

  -- Warn if net IRR >= gross IRR for any fund (fee logic gap)
  DECLARE
    v_fee_gap_count int;
  BEGIN
    SELECT COUNT(*) INTO v_fee_gap_count
    FROM re_fund_quarter_state
    WHERE quarter = '2026Q2'
      AND scenario_id IS NULL
      AND net_irr IS NOT NULL
      AND gross_irr IS NOT NULL
      AND net_irr >= gross_irr;

    IF v_fee_gap_count > 0 THEN
      RAISE WARNING '443: INTEGRITY WARNING — % fund(s) have net_irr >= gross_irr. '
        'Fee/carry logic may be missing.', v_fee_gap_count;
    END IF;
  END;

  RAISE NOTICE '443: complete — IGF gross=%, Granite gross=%, MeridianDebt gross=%',
    v_igf_gross_irr, v_gp_gross_irr, v_md_gross_irr;
END $$;

-- ─── Update re_partner_commitment to use fully_called status for complete draws ───
UPDATE re_partner_commitment
SET status = 'fully_called'
WHERE fund_id = 'a1b2c3d4-0003-0030-0003-000000000001'::uuid  -- Meridian Debt (fully deployed)
  AND status = 'active';

COMMENT ON TABLE re_fund_quarter_state IS
  'Per-fund quarterly financial snapshot. Populated by quarter-close engine '
  'and differentiated seeds (359, 441, 443). gross_irr/net_irr computed from '
  're_capital_ledger_entry via xirr_from_fund_ledger().';
