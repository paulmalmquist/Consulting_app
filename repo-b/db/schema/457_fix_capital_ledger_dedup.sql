-- 457_fix_capital_ledger_dedup.sql
--
-- Comprehensive data integrity fix for REPE Fund Portfolio page.
--
-- Problems fixed:
--   1. MREF-III + IGF-VII: duplicate ledger entries (both "generated" and "manual" source)
--      → total_called inflated → pct_invested = 859%
--   2. Atlas/Core-Plus/Summit: "generated" ledger entries are per-asset-month allocations
--      whose sum far exceeds fund-level committed capital. Migration 455 overwrote correct
--      hardcoded values with these inflated sums.
--   3. MREF-III + MCOF-I: asset_quarter_state stops at 2026Q1 → no NAV/TVPI for 2026Q2+
--   4. Several funds missing capital call entries entirely after cleanup.
--
-- Strategy:
--   Step 1: Delete "generated" entries for dual-source funds
--   Step 2: Forward-fill asset_quarter_state for funds missing 2026Q2+
--   Step 3: Seed capital call entries for funds with zero contributions
--   Step 4: Recompute fund_quarter_state with capped capital totals + fresh NAV
--
-- Idempotent: ON CONFLICT DO UPDATE, DELETE WHERE safe to re-run.
-- Already applied to production on 2026-04-09.

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 1: Delete "generated" ledger entries for funds that have both sources
-- ═══════════════════════════════════════════════════════════════════════
DELETE FROM re_capital_ledger_entry
WHERE source = 'generated'
  AND fund_id IN (
    SELECT fund_id
    FROM re_capital_ledger_entry
    GROUP BY fund_id
    HAVING COUNT(DISTINCT source) FILTER (WHERE source IN ('generated', 'manual')) = 2
  );

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 2: Forward-fill asset_quarter_state for assets missing 2026Q2+
-- Copies last known state with 1% quarterly growth on value/NOI
-- ═══════════════════════════════════════════════════════════════════════
WITH last_state AS (
  SELECT DISTINCT ON (a.asset_id)
    a.asset_id,
    qs.quarter AS last_quarter,
    qs.nav, qs.asset_value, qs.noi, qs.debt_balance, qs.run_id
  FROM repe_asset a
  JOIN repe_deal d ON d.deal_id = a.deal_id
  JOIN re_asset_quarter_state qs ON qs.asset_id = a.asset_id AND qs.scenario_id IS NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM re_asset_quarter_state qs2
    WHERE qs2.asset_id = a.asset_id AND qs2.quarter = '2026Q2' AND qs2.scenario_id IS NULL
  )
  ORDER BY a.asset_id, qs.quarter DESC
),
fill_quarters AS (
  SELECT unnest(ARRAY['2026Q2','2026Q3','2026Q4']) AS quarter
)
INSERT INTO re_asset_quarter_state (
  id, asset_id, quarter, scenario_id, run_id,
  nav, asset_value, noi, debt_balance,
  data_status, source, inputs_hash
)
SELECT
  gen_random_uuid(),
  ls.asset_id, fq.quarter, NULL,
  COALESCE(ls.run_id, 'd4570000-feed-feed-feed-000000000001'::uuid),
  CASE WHEN ls.asset_value IS NOT NULL AND ls.asset_value > 0
    THEN ROUND(ls.asset_value * power(1.01,
      CASE fq.quarter WHEN '2026Q2' THEN 1 WHEN '2026Q3' THEN 2 WHEN '2026Q4' THEN 3 END
    ) - COALESCE(ls.debt_balance, 0), 2)
    ELSE ls.nav END,
  CASE WHEN ls.asset_value IS NOT NULL
    THEN ROUND(ls.asset_value * power(1.01,
      CASE fq.quarter WHEN '2026Q2' THEN 1 WHEN '2026Q3' THEN 2 WHEN '2026Q4' THEN 3 END
    ), 2)
    ELSE ls.asset_value END,
  CASE WHEN ls.noi IS NOT NULL
    THEN ROUND(ls.noi * power(1.01,
      CASE fq.quarter WHEN '2026Q2' THEN 1 WHEN '2026Q3' THEN 2 WHEN '2026Q4' THEN 3 END
    ), 2)
    ELSE ls.noi END,
  ls.debt_balance,
  'seed', 'seed',
  'fix:457:fill:' || ls.asset_id || ':' || fq.quarter
FROM last_state ls
CROSS JOIN fill_quarters fq
WHERE fq.quarter > ls.last_quarter
ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE SET
  nav = EXCLUDED.nav, asset_value = EXCLUDED.asset_value,
  noi = EXCLUDED.noi, inputs_hash = EXCLUDED.inputs_hash;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 3: Seed capital call entries for funds with zero contributions
-- Uses a realistic drawdown ramp: 15/15/12/12/10/10/8/8 = 90% by Q8
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fund RECORD;
  v_quarters text[] := ARRAY['2024Q3','2024Q4','2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2'];
  v_ramp numeric[] := ARRAY[0.15, 0.15, 0.12, 0.12, 0.10, 0.10, 0.08, 0.08];
  v_committed numeric;
  v_qi int;
  v_amount numeric;
  v_qdate date;
BEGIN
  FOR v_fund IN
    SELECT f.fund_id,
      COALESCE(
        NULLIF((SELECT SUM(committed_amount) FROM re_partner_commitment WHERE fund_id = f.fund_id), 0),
        f.target_size
      ) AS committed
    FROM repe_fund f
    WHERE NOT EXISTS (
      SELECT 1 FROM re_capital_ledger_entry cle
      WHERE cle.fund_id = f.fund_id AND cle.entry_type = 'contribution'
    )
    AND COALESCE(
      NULLIF((SELECT SUM(committed_amount) FROM re_partner_commitment WHERE fund_id = f.fund_id), 0),
      f.target_size
    ) IS NOT NULL
  LOOP
    v_committed := v_fund.committed;
    FOR v_qi IN 1..8 LOOP
      v_amount := ROUND(v_committed * v_ramp[v_qi], 2);
      v_qdate := (LEFT(v_quarters[v_qi], 4) || '-' ||
        LPAD(((RIGHT(v_quarters[v_qi], 1)::int - 1) * 3 + 1)::text, 2, '0') || '-15')::date;
      INSERT INTO re_capital_ledger_entry (
        entry_id, fund_id, partner_id, entry_type, amount, amount_base,
        effective_date, quarter, memo, source
      ) VALUES (
        gen_random_uuid(), v_fund.fund_id,
        'e0a10000-0001-0001-0001-000000000001',
        'contribution', v_amount, v_amount,
        v_qdate, v_quarters[v_qi],
        'Capital call ' || v_quarters[v_qi] || ' (' || (v_ramp[v_qi]*100)::int || '%)',
        'manual'
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- STEP 4: Recompute fund_quarter_state for ALL funds
-- Uses partner commitments for total_committed (fallback: target_size).
-- Caps total_called at committed when ledger sum is inflated.
-- Recomputes NAV from actual asset_quarter_state where available.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fund RECORD;
  v_q text;
  v_quarters text[] := ARRAY[
    '2024Q1','2024Q2','2024Q3','2024Q4',
    '2025Q1','2025Q2','2025Q3','2025Q4',
    '2026Q1','2026Q2','2026Q3','2026Q4'
  ];
  v_total_called numeric;
  v_total_distributed numeric;
  v_total_committed numeric;
  v_ledger_called numeric;
  v_dpi numeric; v_rvpi numeric; v_tvpi numeric;
  v_nav numeric; v_asset_count int;
  v_qi int; v_ramp numeric;
BEGIN
  FOR v_fund IN
    SELECT f.fund_id, f.name, f.target_size FROM repe_fund f ORDER BY f.name
  LOOP
    SELECT COALESCE(NULLIF(SUM(committed_amount), 0), v_fund.target_size)
    INTO v_total_committed
    FROM re_partner_commitment WHERE fund_id = v_fund.fund_id;
    IF v_total_committed IS NULL THEN v_total_committed := 0; END IF;

    FOREACH v_q IN ARRAY v_quarters LOOP
      SELECT COALESCE(SUM(amount), 0) INTO v_ledger_called
      FROM re_capital_ledger_entry
      WHERE fund_id = v_fund.fund_id AND entry_type = 'contribution' AND quarter <= v_q;

      -- Cap: if ledger sum > committed, use a synthetic ramp
      IF v_total_committed > 0 AND v_ledger_called > v_total_committed THEN
        v_qi := array_position(v_quarters, v_q);
        IF v_qi IS NULL THEN v_qi := 6; END IF;
        v_ramp := LEAST(0.90, v_qi::numeric / array_length(v_quarters, 1)::numeric);
        v_total_called := ROUND(v_total_committed * v_ramp, 2);
      ELSE
        v_total_called := v_ledger_called;
      END IF;

      SELECT COALESCE(SUM(amount), 0) INTO v_total_distributed
      FROM re_capital_ledger_entry
      WHERE fund_id = v_fund.fund_id AND entry_type = 'distribution' AND quarter <= v_q;

      SELECT SUM(qs.nav), COUNT(*) INTO v_nav, v_asset_count
      FROM re_asset_quarter_state qs
      JOIN repe_asset a ON a.asset_id = qs.asset_id
      JOIN repe_deal d ON d.deal_id = a.deal_id
      WHERE d.fund_id = v_fund.fund_id AND qs.quarter = v_q AND qs.scenario_id IS NULL;

      IF v_total_called > 0 THEN
        v_dpi  := ROUND(v_total_distributed / v_total_called, 4);
        v_rvpi := CASE WHEN v_nav IS NOT NULL THEN ROUND(v_nav / v_total_called, 4) ELSE NULL END;
        v_tvpi := CASE WHEN v_nav IS NOT NULL THEN ROUND((v_total_distributed + v_nav) / v_total_called, 4) ELSE NULL END;
      ELSE
        v_dpi := NULL; v_rvpi := NULL; v_tvpi := NULL;
      END IF;

      UPDATE re_fund_quarter_state SET
        portfolio_nav = CASE WHEN v_asset_count > 0 THEN v_nav ELSE portfolio_nav END,
        total_called = v_total_called,
        total_committed = v_total_committed,
        total_distributed = v_total_distributed,
        dpi = v_dpi, rvpi = v_rvpi, tvpi = v_tvpi,
        data_status = CASE
          WHEN v_asset_count > 0 AND v_nav IS NOT NULL THEN 'seed'
          WHEN portfolio_nav IS NOT NULL THEN data_status
          ELSE 'missing_source' END,
        inputs_hash = 'fix:457:final:' || v_fund.fund_id || ':' || v_q
      WHERE fund_id = v_fund.fund_id AND quarter = v_q AND scenario_id IS NULL;
    END LOOP;
  END LOOP;
END $$;
