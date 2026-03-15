-- 323_re_capital_events_seed.sql
-- Seed capital calls, distributions, and operating cash flows into
-- re_cash_event and re_capital_ledger_entry so fund-level metrics
-- (TVPI, DPI, IRR) have real data backing.
--
-- Depends on: 278_re_financial_intelligence.sql, 270_re_institutional_model.sql,
--             322_re_debt_seed.sql (for net_cash_flow data)
-- Idempotent: ON CONFLICT DO NOTHING / WHERE NOT EXISTS guards.

-- =============================================================================
-- I. Capital Calls — front-loaded in early quarters
-- =============================================================================

DO $$
DECLARE
  v_env_id text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  v_has_legacy_ledger boolean;
  r RECORD;
BEGIN
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id::uuid
  LIMIT 1;

  IF v_business_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 're_capital_ledger_entry' AND column_name = 'env_id'
  ) INTO v_has_legacy_ledger;

  -- For each fund, seed capital calls
  FOR r IN
    SELECT
      f.fund_id,
      COALESCE(f.target_size, 500000000) AS target_size,
      ROW_NUMBER() OVER (ORDER BY f.fund_id) AS fund_num
    FROM repe_fund f
    LEFT JOIN repe_fund_term ft ON ft.fund_id = f.fund_id
    WHERE f.business_id = v_business_id
  LOOP
    DECLARE
      v_call_pct numeric[] := ARRAY[0.25, 0.20, 0.15, 0.12, 0.08, 0.06, 0.05, 0.04];
      v_quarters text[] := ARRAY['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'];
      v_dates date[] := ARRAY[
        '2025-01-15'::date, '2025-04-15'::date, '2025-07-15'::date, '2025-10-15'::date,
        '2026-01-15'::date, '2026-04-15'::date, '2026-07-15'::date, '2026-10-15'::date
      ];
      i int;
      v_amount numeric;
    BEGIN
      FOR i IN 1..8 LOOP
        v_amount := ROUND(r.target_size * v_call_pct[i], 2);

        INSERT INTO re_cash_event
          (env_id, business_id, fund_id, event_date, event_type, amount, memo)
        SELECT
          v_env_id, v_business_id, r.fund_id, v_dates[i], 'CALL', v_amount,
          'Capital call ' || i || ' - ' || v_quarters[i]
        WHERE NOT EXISTS (
          SELECT 1 FROM re_cash_event ce
          WHERE ce.env_id = v_env_id
            AND ce.fund_id = r.fund_id
            AND ce.event_type = 'CALL'
            AND ce.event_date = v_dates[i]
        );

        -- Also seed capital ledger entry (contribution)
        IF v_has_legacy_ledger THEN
          INSERT INTO re_capital_ledger_entry
            (env_id, business_id, fund_id, event_type, event_date, amount, memo)
          SELECT
            v_env_id::uuid, v_business_id, r.fund_id, 'contribution', v_dates[i], v_amount,
            'LP contribution - call ' || i
          WHERE NOT EXISTS (
            SELECT 1 FROM re_capital_ledger_entry cle
            WHERE cle.env_id = v_env_id::uuid
              AND cle.fund_id = r.fund_id
              AND cle.event_type = 'contribution'
              AND cle.event_date = v_dates[i]
          );
        ELSE
          INSERT INTO re_capital_ledger_entry
            (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo)
          SELECT
            r.fund_id,
            pc.partner_id,
            'contribution',
            v_amount,
            v_amount,
            v_dates[i],
            v_quarters[i],
            'LP contribution - call ' || i
          FROM re_partner_commitment pc
          WHERE pc.fund_id = r.fund_id
            AND NOT EXISTS (
              SELECT 1 FROM re_capital_ledger_entry cle
              WHERE cle.fund_id = r.fund_id
                AND cle.partner_id = pc.partner_id
                AND cle.entry_type = 'contribution'
                AND cle.effective_date = v_dates[i]
            )
          ORDER BY pc.partner_id
          LIMIT 1;
        END IF;
      END LOOP;
    END;
  END LOOP;
END $$;

-- =============================================================================
-- II. Distributions — based on net cash flow from assets
-- =============================================================================

DO $$
DECLARE
  v_env_id text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  v_has_legacy_ledger boolean;
  r RECORD;
BEGIN
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id::uuid
  LIMIT 1;

  IF v_business_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 're_capital_ledger_entry' AND column_name = 'env_id'
  ) INTO v_has_legacy_ledger;

  -- For each fund + quarter, sum net cash flow from assets and distribute ~80%
  FOR r IN
    SELECT
      d.fund_id,
      qr.quarter,
      SUM(GREATEST(qr.net_cash_flow, 0)) AS total_ncf
    FROM re_asset_acct_quarter_rollup qr
    JOIN repe_asset a ON a.asset_id = qr.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE qr.env_id = v_env_id::uuid
      AND f.business_id = v_business_id
      AND qr.net_cash_flow > 0
    GROUP BY d.fund_id, qr.quarter
    HAVING SUM(GREATEST(qr.net_cash_flow, 0)) > 0
  LOOP
    DECLARE
      v_dist_amount numeric;
      v_year int := LEFT(r.quarter, 4)::int;
      v_q int := RIGHT(r.quarter, 1)::int;
      v_dist_date date := (v_year || '-' || LPAD((v_q * 3)::text, 2, '0') || '-28')::date;
    BEGIN
      -- Distribute 80% of net cash flow (retain 20% as reserves)
      v_dist_amount := ROUND(r.total_ncf * 0.80, 2);

      INSERT INTO re_cash_event
        (env_id, business_id, fund_id, event_date, event_type, amount, memo)
      SELECT
        v_env_id, v_business_id, r.fund_id, v_dist_date, 'DIST', v_dist_amount,
        'Operating distribution - ' || r.quarter
      WHERE NOT EXISTS (
        SELECT 1 FROM re_cash_event ce
        WHERE ce.env_id = v_env_id
          AND ce.fund_id = r.fund_id
          AND ce.event_type = 'DIST'
          AND ce.event_date = v_dist_date
      );

      -- Capital ledger distribution entry
      IF v_has_legacy_ledger THEN
        INSERT INTO re_capital_ledger_entry
          (env_id, business_id, fund_id, event_type, event_date, amount, memo)
        SELECT
          v_env_id::uuid, v_business_id, r.fund_id, 'distribution', v_dist_date, v_dist_amount,
          'Operating distribution - ' || r.quarter
        WHERE NOT EXISTS (
          SELECT 1 FROM re_capital_ledger_entry cle
          WHERE cle.env_id = v_env_id::uuid
            AND cle.fund_id = r.fund_id
            AND cle.event_type = 'distribution'
            AND cle.event_date = v_dist_date
        );
      ELSE
        INSERT INTO re_capital_ledger_entry
          (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo)
        SELECT
          r.fund_id,
          pc.partner_id,
          'distribution',
          v_dist_amount,
          v_dist_amount,
          v_dist_date,
          r.quarter,
          'Operating distribution - ' || r.quarter
        FROM re_partner_commitment pc
        WHERE pc.fund_id = r.fund_id
          AND NOT EXISTS (
            SELECT 1 FROM re_capital_ledger_entry cle
            WHERE cle.fund_id = r.fund_id
              AND cle.partner_id = pc.partner_id
              AND cle.entry_type = 'distribution'
              AND cle.effective_date = v_dist_date
          )
        ORDER BY pc.partner_id
        LIMIT 1;
      END IF;
    END;
  END LOOP;
END $$;

-- =============================================================================
-- III. Operating cash flow events (asset-level)
-- =============================================================================

DO $$
DECLARE
  v_env_id text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  r RECORD;
BEGIN
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id::uuid
  LIMIT 1;

  IF v_business_id IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT
      d.fund_id,
      d.deal_id AS investment_id,
      qr.asset_id,
      qr.quarter,
      qr.noi,
      qr.net_cash_flow
    FROM re_asset_acct_quarter_rollup qr
    JOIN repe_asset a ON a.asset_id = qr.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE qr.env_id = v_env_id::uuid
      AND f.business_id = v_business_id
  LOOP
    DECLARE
      v_year int := LEFT(r.quarter, 4)::int;
      v_q int := RIGHT(r.quarter, 1)::int;
      v_date date := (v_year || '-' || LPAD((v_q * 3)::text, 2, '0') || '-15')::date;
    BEGIN
      INSERT INTO re_cash_event
        (env_id, business_id, fund_id, investment_id, asset_id,
         event_date, event_type, amount, memo)
      SELECT
        v_env_id, v_business_id, r.fund_id, r.investment_id, r.asset_id,
        v_date, 'OPERATING_CASH', COALESCE(r.net_cash_flow, 0),
        'Operating cash flow - ' || r.quarter
      WHERE NOT EXISTS (
        SELECT 1 FROM re_cash_event ce
        WHERE ce.env_id = v_env_id
          AND ce.asset_id = r.asset_id
          AND ce.event_type = 'OPERATING_CASH'
          AND ce.event_date = v_date
      );
    END;
  END LOOP;
END $$;

-- =============================================================================
-- IV. Management fee events
-- =============================================================================

DO $$
DECLARE
  v_env_id text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  r RECORD;
BEGIN
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id::uuid
  LIMIT 1;

  IF v_business_id IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT
      f.fund_id,
      COALESCE(ft.management_fee_rate, 0.015) AS fee_rate,
      COALESCE(f.target_size, 500000000) AS target_size
    FROM repe_fund f
    LEFT JOIN repe_fund_term ft ON ft.fund_id = f.fund_id
    WHERE f.business_id = v_business_id
  LOOP
    DECLARE
      v_quarters text[] := ARRAY['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'];
      v_dates date[] := ARRAY[
        '2025-01-31'::date, '2025-04-30'::date, '2025-07-31'::date, '2025-10-31'::date,
        '2026-01-31'::date, '2026-04-30'::date, '2026-07-31'::date, '2026-10-31'::date
      ];
      i int;
      v_fee numeric;
    BEGIN
      v_fee := ROUND(r.target_size * r.fee_rate / 4, 2);

      FOR i IN 1..8 LOOP
        INSERT INTO re_cash_event
          (env_id, business_id, fund_id, event_date, event_type, amount, memo)
        SELECT
          v_env_id, v_business_id, r.fund_id, v_dates[i], 'FEE', v_fee,
          'Management fee - ' || v_quarters[i]
        WHERE NOT EXISTS (
          SELECT 1 FROM re_cash_event ce
          WHERE ce.env_id = v_env_id
            AND ce.fund_id = r.fund_id
            AND ce.event_type = 'FEE'
            AND ce.event_date = v_dates[i]
        );

        -- Fee accrual
        INSERT INTO re_fee_accrual_qtr
          (env_id, business_id, fund_id, quarter, amount)
        SELECT
          v_env_id, v_business_id, r.fund_id, v_quarters[i], v_fee
        WHERE NOT EXISTS (
          SELECT 1 FROM re_fee_accrual_qtr fa
          WHERE fa.env_id = v_env_id
            AND fa.fund_id = r.fund_id
            AND fa.quarter = v_quarters[i]
        );
      END LOOP;
    END;
  END LOOP;
END $$;
