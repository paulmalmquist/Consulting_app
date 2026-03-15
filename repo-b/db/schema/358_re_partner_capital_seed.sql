-- 358_re_partner_capital_seed.sql
-- Expand partner/LP universe, fix capital ledger LIMIT 1 bug from 323,
-- seed waterfall for Granite Peak fund, seed pro-rata capital entries.
--
-- Depends on: 270 (partner/ledger schema), 265 (fund schema), 323 (cash events)
-- Idempotent: ON CONFLICT DO NOTHING throughout + deterministic UUIDs.

DO $$
DECLARE
  v_business_id uuid;
  v_fund_igf uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;
  v_fund_granite uuid;

  -- Existing partner UUIDs (if any exist from Python seed)
  v_existing_partner_count int;

  -- New partner UUIDs
  v_p1 uuid := 'e0a10000-0001-0001-0001-000000000001'::uuid;  -- GP (Meridian Capital)
  v_p2 uuid := 'e0a10000-0001-0001-0002-000000000001'::uuid;  -- CalPERS (pension)
  v_p3 uuid := 'e0a10000-0001-0001-0003-000000000001'::uuid;  -- Hartford Insurance
  v_p4 uuid := 'e0a10000-0001-0001-0004-000000000001'::uuid;  -- Duke Endowment
  v_p5 uuid := 'e0a10000-0001-0001-0005-000000000001'::uuid;  -- Blackrock RE FOF
  v_p6 uuid := 'e0a10000-0001-0001-0006-000000000001'::uuid;  -- Whitfield Family Office
  v_p7 uuid := 'e0a10000-0001-0001-0007-000000000001'::uuid;  -- Texas Teachers Retirement
  v_p8 uuid := 'e0a10000-0001-0001-0008-000000000001'::uuid;  -- Evergreen Realty Co-Invest

  -- Commitment amounts for IGF-VII ($500M target)
  -- GP: $25M (5%), CalPERS: $125M (25%), Hartford: $75M (15%),
  -- Duke: $50M (10%), Blackrock: $100M (20%), Whitfield: $50M (10%),
  -- Texas Teachers: $50M (10%), Evergreen: $25M (5%)
  v_igf_target numeric := 500000000;

  -- Capital call schedule (from 323 pattern)
  v_call_pct numeric[] := ARRAY[0.25, 0.20, 0.15, 0.12, 0.08, 0.06, 0.05, 0.04];
  v_quarters text[] := ARRAY['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'];
  v_call_dates date[] := ARRAY[
    '2025-01-15'::date, '2025-04-15'::date, '2025-07-15'::date, '2025-10-15'::date,
    '2026-01-15'::date, '2026-04-15'::date, '2026-07-15'::date, '2026-10-15'::date
  ];
  v_dist_dates date[] := ARRAY[
    '2025-03-28'::date, '2025-06-28'::date, '2025-09-28'::date, '2025-12-28'::date,
    '2026-03-28'::date, '2026-06-28'::date, '2026-09-28'::date, '2026-12-28'::date
  ];

  i int;
  p RECORD;
  v_partner_commitment numeric;
  v_call_amount numeric;
  v_total_dist_per_qtr numeric;
  v_dist_amount numeric;
  v_pct numeric;
BEGIN
  -- Resolve business_id from IGF VII fund
  SELECT f.business_id INTO v_business_id
  FROM repe_fund f
  WHERE f.fund_id = v_fund_igf;

  IF v_business_id IS NULL THEN
    RAISE NOTICE '358: IGF VII fund not found, skipping';
    RETURN;
  END IF;

  -- Find Granite Peak fund (by name pattern)
  SELECT f.fund_id INTO v_fund_granite
  FROM repe_fund f
  WHERE f.business_id = v_business_id
    AND f.name ILIKE '%%Granite%%'
  LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- I. SEED PARTNERS
  -- ═══════════════════════════════════════════════════════════════════════

  INSERT INTO re_partner (partner_id, business_id, name, partner_type)
  VALUES
    (v_p1, v_business_id, 'Meridian Capital Management GP',       'gp'),
    (v_p2, v_business_id, 'CalPERS Real Estate',                  'lp'),
    (v_p3, v_business_id, 'Hartford Insurance Group',             'lp'),
    (v_p4, v_business_id, 'Duke University Endowment',            'lp'),
    (v_p5, v_business_id, 'BlackRock Real Estate Fund of Funds',  'lp'),
    (v_p6, v_business_id, 'Whitfield Family Office',              'lp'),
    (v_p7, v_business_id, 'Texas Teachers Retirement System',     'lp'),
    (v_p8, v_business_id, 'Evergreen Realty Co-Invest',           'co_invest')
  ON CONFLICT (partner_id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════
  -- II. SEED COMMITMENTS — IGF VII ($500M)
  -- ═══════════════════════════════════════════════════════════════════════

  INSERT INTO re_partner_commitment (partner_id, fund_id, committed_amount, commitment_date, status)
  VALUES
    (v_p1, v_fund_igf,  25000000, '2024-06-01', 'active'),  -- GP 5%
    (v_p2, v_fund_igf, 125000000, '2024-07-15', 'active'),  -- CalPERS 25%
    (v_p3, v_fund_igf,  75000000, '2024-08-01', 'active'),  -- Hartford 15%
    (v_p4, v_fund_igf,  50000000, '2024-08-15', 'active'),  -- Duke 10%
    (v_p5, v_fund_igf, 100000000, '2024-09-01', 'active'),  -- BlackRock 20%
    (v_p6, v_fund_igf,  50000000, '2024-09-15', 'active'),  -- Whitfield 10%
    (v_p7, v_fund_igf,  50000000, '2024-10-01', 'active'),  -- Texas Teachers 10%
    (v_p8, v_fund_igf,  25000000, '2024-10-15', 'active')   -- Evergreen 5%
  ON CONFLICT (partner_id, fund_id) DO NOTHING;

  -- ═══════════════════════════════════════════════════════════════════════
  -- III. SEED COMMITMENTS — Granite Peak ($350M, if fund exists)
  -- ═══════════════════════════════════════════════════════════════════════

  IF v_fund_granite IS NOT NULL THEN
    INSERT INTO re_partner_commitment (partner_id, fund_id, committed_amount, commitment_date, status)
    VALUES
      (v_p1, v_fund_granite,  17500000, '2023-03-01', 'active'),  -- GP 5%
      (v_p2, v_fund_granite,  87500000, '2023-04-01', 'active'),  -- CalPERS 25%
      (v_p3, v_fund_granite,  52500000, '2023-04-15', 'active'),  -- Hartford 15%
      (v_p5, v_fund_granite,  70000000, '2023-05-01', 'active'),  -- BlackRock 20%
      (v_p7, v_fund_granite,  52500000, '2023-05-15', 'active'),  -- Texas Teachers 15%
      (v_p6, v_fund_granite,  35000000, '2023-06-01', 'active'),  -- Whitfield 10%
      (v_p4, v_fund_granite,  35000000, '2023-06-15', 'active')   -- Duke 10%
    ON CONFLICT (partner_id, fund_id) DO NOTHING;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- IV. CAPITAL LEDGER — Pro-rata contributions for IGF VII (ALL partners)
  -- ═══════════════════════════════════════════════════════════════════════
  -- This fixes the LIMIT 1 bug in 323_re_capital_events_seed.sql

  FOR i IN 1..8 LOOP
    -- Total call amount for this quarter
    v_call_amount := ROUND(v_igf_target * v_call_pct[i], 2);

    -- Insert contribution for each partner pro-rata by commitment
    FOR p IN
      SELECT pc.partner_id, pc.committed_amount,
             pc.committed_amount / v_igf_target AS pct
      FROM re_partner_commitment pc
      WHERE pc.fund_id = v_fund_igf
    LOOP
      INSERT INTO re_capital_ledger_entry
        (fund_id, partner_id, entry_type, amount, amount_base,
         effective_date, quarter, memo, source)
      SELECT
        v_fund_igf,
        p.partner_id,
        'contribution',
        ROUND(v_call_amount * p.pct, 2),
        ROUND(v_call_amount * p.pct, 2),
        v_call_dates[i],
        v_quarters[i],
        'Capital call ' || i || ' - ' || v_quarters[i] || ' (pro-rata ' || ROUND(p.pct * 100, 1) || '%%)',
        'generated'
      WHERE NOT EXISTS (
        SELECT 1 FROM re_capital_ledger_entry cle
        WHERE cle.fund_id = v_fund_igf
          AND cle.partner_id = p.partner_id
          AND cle.entry_type = 'contribution'
          AND cle.effective_date = v_call_dates[i]
      );
    END LOOP;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- V. CAPITAL LEDGER — Pro-rata distributions for IGF VII
  -- ═══════════════════════════════════════════════════════════════════════
  -- Distribute based on net cash flow from assets (80% of NCF, like 323)

  FOR i IN 1..8 LOOP
    -- Get total distribution for this quarter from re_cash_event
    SELECT COALESCE(SUM(ce.amount), 0) INTO v_total_dist_per_qtr
    FROM re_cash_event ce
    WHERE ce.fund_id = v_fund_igf
      AND ce.event_type = 'DIST'
      AND ce.event_date = v_dist_dates[i];

    -- If no cash event dist, estimate from rollup NCF
    IF v_total_dist_per_qtr = 0 THEN
      SELECT COALESCE(SUM(GREATEST(qr.net_cash_flow, 0)) * 0.80, 0)
      INTO v_total_dist_per_qtr
      FROM re_asset_acct_quarter_rollup qr
      JOIN repe_asset a ON a.asset_id = qr.asset_id
      JOIN repe_deal d ON d.deal_id = a.deal_id
      WHERE d.fund_id = v_fund_igf
        AND qr.quarter = v_quarters[i];
    END IF;

    IF v_total_dist_per_qtr > 0 THEN
      FOR p IN
        SELECT pc.partner_id, pc.committed_amount,
               pc.committed_amount / v_igf_target AS pct
        FROM re_partner_commitment pc
        WHERE pc.fund_id = v_fund_igf
      LOOP
        INSERT INTO re_capital_ledger_entry
          (fund_id, partner_id, entry_type, amount, amount_base,
           effective_date, quarter, memo, source)
        SELECT
          v_fund_igf,
          p.partner_id,
          'distribution',
          ROUND(v_total_dist_per_qtr * p.pct, 2),
          ROUND(v_total_dist_per_qtr * p.pct, 2),
          v_dist_dates[i],
          v_quarters[i],
          'Operating distribution - ' || v_quarters[i] || ' (pro-rata ' || ROUND(p.pct * 100, 1) || '%%)',
          'generated'
        WHERE NOT EXISTS (
          SELECT 1 FROM re_capital_ledger_entry cle
          WHERE cle.fund_id = v_fund_igf
            AND cle.partner_id = p.partner_id
            AND cle.entry_type = 'distribution'
            AND cle.effective_date = v_dist_dates[i]
        );
      END LOOP;
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- VI. WATERFALL DEFINITION — Granite Peak (if fund exists)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Value-add fund: 8% pref, 50% catch-up, 80/20 split

  IF v_fund_granite IS NOT NULL THEN
    INSERT INTO re_waterfall_definition (definition_id, fund_id, name, waterfall_type, version, is_active)
    VALUES (
      'e0b10000-0001-0001-0001-000000000001'::uuid,
      v_fund_granite,
      'Default',
      'european',
      1,
      true
    ) ON CONFLICT DO NOTHING;

    -- Tier 1: Return of Capital
    INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type,
      hurdle_rate, split_gp, split_lp, catch_up_percent, notes)
    SELECT
      'e0b10000-0002-0001-0001-000000000001'::uuid,
      d.definition_id, 1, 'return_of_capital',
      NULL, 0.0, 1.0, NULL,
      'Return all contributed capital to LPs'
    FROM re_waterfall_definition d
    WHERE d.definition_id = 'e0b10000-0001-0001-0001-000000000001'::uuid
    ON CONFLICT DO NOTHING;

    -- Tier 2: 8% Preferred Return
    INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type,
      hurdle_rate, split_gp, split_lp, catch_up_percent, notes)
    SELECT
      'e0b10000-0002-0001-0002-000000000001'::uuid,
      d.definition_id, 2, 'preferred_return',
      0.08, 0.0, 1.0, NULL,
      '8% compounding preferred return'
    FROM re_waterfall_definition d
    WHERE d.definition_id = 'e0b10000-0001-0001-0001-000000000001'::uuid
    ON CONFLICT DO NOTHING;

    -- Tier 3: 50% GP Catch-Up
    INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type,
      hurdle_rate, split_gp, split_lp, catch_up_percent, notes)
    SELECT
      'e0b10000-0002-0001-0003-000000000001'::uuid,
      d.definition_id, 3, 'catch_up',
      NULL, 1.0, 0.0, 0.20,
      '50%% GP catch-up until GP has 20%% of profits'
    FROM re_waterfall_definition d
    WHERE d.definition_id = 'e0b10000-0001-0001-0001-000000000001'::uuid
    ON CONFLICT DO NOTHING;

    -- Tier 4: 80/20 Residual Split
    INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type,
      hurdle_rate, split_gp, split_lp, catch_up_percent, notes)
    SELECT
      'e0b10000-0002-0001-0004-000000000001'::uuid,
      d.definition_id, 4, 'split',
      NULL, 0.20, 0.80, NULL,
      'Standard 80/20 carried interest split'
    FROM re_waterfall_definition d
    WHERE d.definition_id = 'e0b10000-0001-0001-0001-000000000001'::uuid
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE '358: Partners, commitments, capital ledger, and waterfall seeded';
END $$;
