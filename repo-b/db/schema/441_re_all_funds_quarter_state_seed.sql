-- 441_re_all_funds_quarter_state_seed.sql
-- Seed re_fund_quarter_state for ALL funds in each environment, not just IGF-VII.
--
-- Problem solved: 359_re_quarter_state_seed.sql hardcodes v_fund_igf and only
-- seeds that single fund. Any other fund in the environment has no
-- re_fund_quarter_state rows, so the Fund Portfolio page shows blank IRR/NAV/TVPI
-- for those funds and the NAV-weighted IRR on the KPI strip silently returns "—".
--
-- This migration loops over every fund in every business_id binding and inserts
-- deterministic re_fund_quarter_state rows for all 8 quarters (2025Q1–2026Q4).
-- It skips funds that already have rows for a given quarter (ON CONFLICT DO NOTHING).
--
-- IRR formula: deterministic ramp based on fund row index + 12–16% gross range.
-- This is seed/demo data. Real IRR is computed by the quarter-close engine.
--
-- Depends on: 270 (re_fund_quarter_state), 359 (partner commitments may exist)
-- Idempotent: ON CONFLICT DO NOTHING throughout.

DO $$
DECLARE
  v_quarters  text[] := ARRAY['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2','2026Q3','2026Q4'];
  v_fund      RECORD;
  v_run_id    uuid;
  i           int;
  v_idx       int;  -- fund row index within its business (for IRR variation)

  v_total_nav         numeric;
  v_total_committed   numeric;
  v_total_called      numeric;
  v_total_distributed numeric;
  v_dpi               numeric;
  v_rvpi              numeric;
  v_tvpi              numeric;
  v_weighted_ltv      numeric;
  v_weighted_dscr     numeric;
  v_gross_irr         numeric;
  v_net_irr           numeric;
BEGIN

  -- Loop over every fund that does NOT already have quarter state for 2026Q2
  -- (2026Q2 is the current quarter — if it exists, assume 359 already ran for this fund)
  v_idx := 0;

  FOR v_fund IN
    SELECT
      f.fund_id,
      f.business_id,
      ROW_NUMBER() OVER (PARTITION BY f.business_id ORDER BY f.created_at) AS fund_rank
    FROM repe_fund f
    WHERE NOT EXISTS (
      SELECT 1 FROM re_fund_quarter_state fqs
      WHERE fqs.fund_id = f.fund_id
        AND fqs.quarter = '2026Q2'
        AND fqs.scenario_id IS NULL
    )
  LOOP
    v_idx := v_idx + 1;

    FOR i IN 1..8 LOOP
      v_run_id := gen_random_uuid();

      -- NAV: derive from asset-level rollup if available; else use a size-based estimate.
      SELECT COALESCE(SUM(qs.nav), 0)
      INTO v_total_nav
      FROM re_asset_quarter_state qs
      JOIN repe_asset a ON a.asset_id = qs.asset_id
      JOIN repe_deal d ON d.deal_id = a.deal_id
      WHERE d.fund_id = v_fund.fund_id
        AND qs.quarter = v_quarters[i]
        AND qs.scenario_id IS NULL;

      -- If no asset data, use a placeholder based on fund rank (keeps each fund visually distinct)
      IF v_total_nav = 0 THEN
        v_total_nav := (50000000 + v_fund.fund_rank * 30000000) * (0.9 + i * 0.025);
      END IF;

      -- Total committed from partner commitments; fallback to $200M placeholder
      SELECT COALESCE(SUM(pc.committed_amount), 200000000)
      INTO v_total_committed
      FROM re_partner_commitment pc
      WHERE pc.fund_id = v_fund.fund_id;

      -- Total called: cumulative contributions through this quarter
      SELECT COALESCE(SUM(cle.amount), 0)
      INTO v_total_called
      FROM re_capital_ledger_entry cle
      WHERE cle.fund_id = v_fund.fund_id
        AND cle.entry_type = 'contribution'
        AND cle.quarter <= v_quarters[i];

      -- If no ledger data, estimate: ramp from 60% → 95% call rate over 8 quarters
      IF v_total_called = 0 THEN
        v_total_called := ROUND(v_total_committed * (0.60 + (i - 1) * 0.05), 2);
      END IF;

      -- Total distributed: cumulative distributions through this quarter
      SELECT COALESCE(SUM(cle.amount), 0)
      INTO v_total_distributed
      FROM re_capital_ledger_entry cle
      WHERE cle.fund_id = v_fund.fund_id
        AND cle.entry_type = 'distribution'
        AND cle.quarter <= v_quarters[i];

      -- If no ledger data, estimate: distributions start after quarter 4
      IF v_total_distributed = 0 AND i > 4 THEN
        v_total_distributed := ROUND(v_total_called * 0.04 * (i - 4), 2);
      END IF;

      -- Compute ratios
      IF v_total_called > 0 THEN
        v_dpi  := ROUND(v_total_distributed / v_total_called, 4);
        v_rvpi := ROUND(v_total_nav / v_total_called, 4);
        v_tvpi := ROUND((v_total_distributed + v_total_nav) / v_total_called, 4);
      ELSE
        v_dpi := 0; v_rvpi := 0; v_tvpi := 0;
      END IF;

      -- Weighted LTV / DSCR from asset states if available; else placeholder
      SELECT
        COALESCE(
          SUM(qs.ltv * qs.asset_value) / NULLIF(SUM(qs.asset_value), 0),
          0.55 - (v_fund.fund_rank % 3) * 0.05
        ),
        COALESCE(
          SUM(qs.dscr * qs.asset_value) / NULLIF(SUM(qs.asset_value), 0),
          1.35 + (v_fund.fund_rank % 3) * 0.10
        )
      INTO v_weighted_ltv, v_weighted_dscr
      FROM re_asset_quarter_state qs
      JOIN repe_asset a ON a.asset_id = qs.asset_id
      JOIN repe_deal d ON d.deal_id = a.deal_id
      WHERE d.fund_id = v_fund.fund_id
        AND qs.quarter = v_quarters[i]
        AND qs.scenario_id IS NULL;

      -- Deterministic IRR: ramp from 11%–16% with variation per fund rank
      -- Each fund rank shifts the base by 50bps to keep them visually distinct
      v_gross_irr := ROUND(
        0.11 + (i - 1) * 0.006 + (v_fund.fund_rank % 5) * 0.005 + (v_tvpi - 1.0) * 0.02,
        4
      );
      v_net_irr := ROUND(v_gross_irr - 0.020 - (v_fund.fund_rank % 3) * 0.003, 4);

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
        v_fund.fund_id,
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
        v_gross_irr,
        v_net_irr,
        v_weighted_ltv,
        v_weighted_dscr,
        'seed:fund-all:' || v_fund.fund_id::text || ':' || v_quarters[i],
        now()
      )
      ON CONFLICT DO NOTHING;
    END LOOP;

    RAISE NOTICE '441: seeded fund % (%)', v_fund.fund_id, v_fund.fund_rank;
  END LOOP;

  RAISE NOTICE '441: complete — seeded % fund(s)', v_idx;
END $$;

COMMENT ON TABLE re_fund_quarter_state IS
  'Per-fund quarterly financial snapshot. Populated by the quarter-close engine and '
  'supplemented by seed migrations (359, 441) for demo environments.';
