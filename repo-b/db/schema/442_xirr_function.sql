-- 442_xirr_function.sql
-- PostgreSQL-native XIRR (extended IRR with irregular dates) function.
--
-- Implements Newton-Raphson iteration on irregular cash flow series.
-- Mirrors the cash-flow-engine.ts solveIRR() function so DB-computed
-- IRRs match the TypeScript engine output.
--
-- Returns annual IRR as NUMERIC(18,8), or NULL if:
--   - fewer than 2 cash flows
--   - no negative (investment) flow found
--   - no positive (return) flow found
--   - solver does not converge in 200 iterations
--
-- Usage:
--   SELECT xirr(
--     ARRAY[-500000, 50000, 50000, 600000],
--     ARRAY['2025-01-01', '2025-04-01', '2025-07-01', '2025-10-01']::date[]
--   );
--
-- Also exposes xirr_from_quarterly_ledger(fund_id, through_quarter) as a
-- convenience wrapper that reads re_capital_ledger_entry directly.

-- ─────────────────────────────────────────────────────────────────────────────
-- Core XIRR function (amounts[] + dates[])
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION xirr(
  amounts  numeric[],
  dates    date[]
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n         int := array_length(amounts, 1);
  d_days    float8[];
  rate      float8 := 0.10;     -- initial guess: 10% annual
  npv       float8;
  dnpv      float8;
  delta     float8;
  t_years   float8;
  iter      int;
  i         int;
  t0        date;
  has_neg   bool := false;
  has_pos   bool := false;
BEGIN
  -- Guard: need at least 2 flows
  IF n IS NULL OR n < 2 THEN
    RETURN NULL;
  END IF;

  -- Validate: need at least one negative (capital out) and one positive (return)
  FOR i IN 1..n LOOP
    IF amounts[i] < 0 THEN has_neg := true; END IF;
    IF amounts[i] > 0 THEN has_pos := true; END IF;
  END LOOP;
  IF NOT has_neg OR NOT has_pos THEN
    RETURN NULL;
  END IF;

  -- Convert dates to fractional years from first date
  t0 := dates[1];
  d_days := ARRAY[]::float8[];
  FOR i IN 1..n LOOP
    d_days := d_days || ARRAY[(dates[i] - t0)::float8 / 365.25];
  END LOOP;

  -- Newton-Raphson (200 iterations)
  FOR iter IN 1..200 LOOP
    npv  := 0;
    dnpv := 0;
    FOR i IN 1..n LOOP
      t_years := d_days[i];
      IF (1.0 + rate) <= 0 THEN
        rate := 0.001;
        EXIT;
      END IF;
      npv  := npv  + amounts[i]::float8 / POWER(1.0 + rate, t_years);
      dnpv := dnpv - t_years * amounts[i]::float8 / POWER(1.0 + rate, t_years + 1.0);
    END LOOP;

    IF ABS(dnpv) < 1e-12 THEN
      EXIT;
    END IF;

    delta := npv / dnpv;
    rate  := rate - delta;

    IF ABS(delta) < 1e-10 THEN
      EXIT;
    END IF;
  END LOOP;

  -- Sanity check: rate should be in [-0.99, 10.0]
  IF rate < -0.99 OR rate > 10.0 THEN
    RETURN NULL;
  END IF;

  RETURN ROUND(rate::numeric, 8);
END;
$$;

COMMENT ON FUNCTION xirr(numeric[], date[]) IS
  'Compute XIRR (irregular cash flow IRR) using Newton-Raphson iteration. '
  'Input arrays must be same length. First amount is typically negative (investment). '
  'Returns annual IRR as a decimal (e.g. 0.14 = 14%), or NULL on failure.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Convenience wrapper: compute IRR for a fund from the capital ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION xirr_from_fund_ledger(
  p_fund_id      uuid,
  p_thru_quarter text        -- e.g. '2026Q2'; include NAV as terminal inflow
) RETURNS TABLE(
  gross_irr  numeric,
  net_irr    numeric,
  cf_count   int,
  diagnosis  text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_amounts  numeric[];
  v_dates    date[];
  v_nav      numeric;
  v_fee_rate numeric := 0.015;   -- 1.5% annual mgmt fee (default)
  v_year     int;
  v_q        int;
  v_end_date date;
  r          RECORD;
  v_count    int;
BEGIN
  -- Build the quarter end-date for terminal NAV entry
  v_year := LEFT(p_thru_quarter, 4)::int;
  v_q    := RIGHT(p_thru_quarter, 1)::int;
  v_end_date := (v_year || '-' || LPAD((v_q * 3)::text, 2, '0') || '-28')::date;

  -- Collect capital calls (outflows, negative) and distributions (inflows, positive)
  -- from the capital ledger, ordered by date
  v_amounts := ARRAY[]::numeric[];
  v_dates   := ARRAY[]::date[];
  v_count   := 0;

  FOR r IN
    SELECT
      CASE
        WHEN entry_type IN ('contribution', 'fee') THEN -ABS(amount)
        WHEN entry_type IN ('distribution', 'recallable_dist') THEN ABS(amount)
        ELSE 0
      END AS cf_amount,
      effective_date
    FROM re_capital_ledger_entry
    WHERE fund_id = p_fund_id
      AND entry_type IN ('contribution', 'distribution', 'fee', 'recallable_dist')
      AND quarter <= p_thru_quarter
      AND amount != 0
    ORDER BY effective_date
  LOOP
    IF r.cf_amount != 0 THEN
      v_amounts := v_amounts || r.cf_amount;
      v_dates   := v_dates   || r.effective_date;
      v_count   := v_count + 1;
    END IF;
  END LOOP;

  -- Add current NAV as terminal inflow (unrealized value)
  SELECT portfolio_nav INTO v_nav
  FROM re_fund_quarter_state
  WHERE fund_id = p_fund_id
    AND quarter = p_thru_quarter
    AND scenario_id IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_nav IS NOT NULL AND v_nav > 0 THEN
    v_amounts := v_amounts || v_nav;
    v_dates   := v_dates   || v_end_date;
    v_count   := v_count + 1;
  END IF;

  IF v_count < 2 THEN
    RETURN QUERY SELECT NULL::numeric, NULL::numeric, v_count,
      'Insufficient cash flow data: need capital calls + NAV or distributions'::text;
    RETURN;
  END IF;

  -- Compute gross IRR from raw flows (no fee adjustment)
  DECLARE
    v_gross  numeric;
    v_net_amounts numeric[];
    v_fee_per_period numeric;
    v_committed numeric;
    j int;
  BEGIN
    v_gross := xirr(v_amounts, v_dates);

    -- Net IRR: subtract management fees from each period
    -- Fee = 1.5% annual / 4 quarters applied to each contribution period
    SELECT COALESCE(SUM(committed_amount), 0) INTO v_committed
    FROM re_partner_commitment
    WHERE fund_id = p_fund_id;

    v_fee_per_period := ROUND((v_committed * v_fee_rate / 4)::numeric, 2);
    v_net_amounts := ARRAY[]::numeric[];

    FOR j IN 1..array_length(v_amounts, 1) LOOP
      -- Subtract fee from each outflow period only (contributions are negative)
      IF v_amounts[j] < 0 THEN
        v_net_amounts := v_net_amounts || (v_amounts[j] - v_fee_per_period);
      ELSE
        v_net_amounts := v_net_amounts || v_amounts[j];
      END IF;
    END LOOP;

    RETURN QUERY SELECT
      v_gross,
      xirr(v_net_amounts, v_dates),
      v_count,
      CASE
        WHEN v_gross IS NULL THEN 'IRR solver did not converge'
        ELSE 'OK'
      END::text;
  END;
END;
$$;

COMMENT ON FUNCTION xirr_from_fund_ledger(uuid, text) IS
  'Compute gross and net IRR for a fund by reading re_capital_ledger_entry and '
  're_fund_quarter_state.portfolio_nav (terminal value). Returns NULL if ledger is empty.';
