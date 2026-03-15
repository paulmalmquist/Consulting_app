-- 362_re_integrity_checks.sql
-- SQL integrity check functions for REPE data coherence.
-- Each function returns TABLE(check_name text, passed boolean, detail text).
-- Call: SELECT * FROM re_check_*();
--
-- Depends on: 265 (core schema), 270 (institutional model), 285 (rollup),
--             299 (pipeline), 347 (leases)

-- ═══════════════════════════════════════════════════════════════════════
-- REFERENTIAL INTEGRITY CHECKS
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION re_check_orphaned_assets()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
BEGIN
  RETURN QUERY
  SELECT
    'orphaned_assets'::text,
    COUNT(*) = 0,
    CASE WHEN COUNT(*) = 0
      THEN 'All assets have valid deal references'
      ELSE COUNT(*) || ' assets reference nonexistent deals'
    END
  FROM repe_asset a
  LEFT JOIN repe_deal d ON d.deal_id = a.deal_id
  WHERE d.deal_id IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_assets_without_property_detail()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
BEGIN
  RETURN QUERY
  SELECT
    'assets_without_property_detail'::text,
    COUNT(*) = 0,
    CASE WHEN COUNT(*) = 0
      THEN 'All property assets have repe_property_asset rows'
      ELSE COUNT(*) || ' property assets missing repe_property_asset detail'
    END
  FROM repe_asset a
  LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  WHERE a.asset_type = 'property' AND pa.asset_id IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_funds_without_investments()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
BEGIN
  RETURN QUERY
  SELECT
    'funds_without_investments'::text,
    COUNT(*) = 0,
    CASE WHEN COUNT(*) = 0
      THEN 'All non-fundraising funds have at least one investment'
      ELSE COUNT(*) || ' non-fundraising funds have zero investments (deals): ' ||
        string_agg(f.name, ', ')
    END
  FROM repe_fund f
  LEFT JOIN repe_deal d ON d.fund_id = f.fund_id
  WHERE d.deal_id IS NULL
    AND f.status NOT IN ('fundraising');  -- fundraising funds legitimately have no investments
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_pipeline_completeness()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_missing_coords int;
  v_missing_type int;
BEGIN
  SELECT COUNT(*) INTO v_missing_coords
  FROM re_pipeline_deal pd
  JOIN re_pipeline_property pp ON pp.deal_id = pd.deal_id
  WHERE pp.lat IS NULL OR pp.lon IS NULL;

  SELECT COUNT(*) INTO v_missing_type
  FROM re_pipeline_deal pd
  WHERE pd.property_type IS NULL;

  RETURN QUERY
  SELECT
    'pipeline_completeness'::text,
    v_missing_coords = 0 AND v_missing_type = 0,
    CASE
      WHEN v_missing_coords = 0 AND v_missing_type = 0
        THEN 'All pipeline deals have coordinates and property type'
      ELSE v_missing_coords || ' deals missing coords, ' ||
        v_missing_type || ' missing property_type'
    END;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- FINANCIAL CONSISTENCY CHECKS
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION re_check_noi_equals_rev_minus_opex()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_violations int;
BEGIN
  SELECT COUNT(*) INTO v_violations
  FROM re_asset_acct_quarter_rollup qr
  WHERE qr.revenue > 0
    AND ABS(qr.noi - (qr.revenue - qr.opex)) > qr.revenue * 0.01;

  RETURN QUERY
  SELECT
    'noi_equals_rev_minus_opex'::text,
    v_violations = 0,
    CASE WHEN v_violations = 0
      THEN 'NOI = revenue - opex within 1% for all rollup rows'
      ELSE v_violations || ' rollup rows where NOI != revenue - opex (>1% tolerance)'
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_ncf_waterfall()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_violations int;
BEGIN
  SELECT COUNT(*) INTO v_violations
  FROM re_asset_acct_quarter_rollup qr
  WHERE qr.noi > 0
    AND qr.net_cash_flow IS NOT NULL
    AND qr.debt_service IS NOT NULL
    AND ABS(qr.net_cash_flow -
      (qr.noi - COALESCE(qr.capex, 0) - qr.debt_service
       - COALESCE(qr.ti_lc, 0) - COALESCE(qr.reserves, 0))
    ) > qr.noi * 0.02;

  RETURN QUERY
  SELECT
    'ncf_waterfall'::text,
    v_violations = 0,
    CASE WHEN v_violations = 0
      THEN 'NCF = NOI - capex - debt_service - TI/LC - reserves within 2%'
      ELSE v_violations || ' rows where NCF waterfall is inconsistent'
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_occupancy_bounds()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_violations int;
BEGIN
  SELECT COUNT(*) INTO v_violations
  FROM re_asset_occupancy_quarter oq
  WHERE oq.occupancy < 0 OR oq.occupancy > 100;

  RETURN QUERY
  SELECT
    'occupancy_bounds'::text,
    v_violations = 0,
    CASE WHEN v_violations = 0
      THEN 'All occupancy values within [0%, 100%]'
      ELSE v_violations || ' occupancy rows outside [0%, 100%] range'
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_cap_rate_bounds()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_violations int;
BEGIN
  -- Implied cap rate = annualized NOI / asset value
  SELECT COUNT(*) INTO v_violations
  FROM re_asset_quarter_state qs
  WHERE qs.asset_value > 0
    AND qs.noi > 0
    AND ((qs.noi * 4) / qs.asset_value < 0.03
      OR (qs.noi * 4) / qs.asset_value > 0.15);

  RETURN QUERY
  SELECT
    'cap_rate_bounds'::text,
    v_violations = 0,
    CASE WHEN v_violations = 0
      THEN 'All implied cap rates within [3%, 15%]'
      ELSE v_violations || ' assets with cap rates outside [3%, 15%]'
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_dpi_tvpi_consistency()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_violations int;
BEGIN
  SELECT COUNT(*) INTO v_violations
  FROM re_fund_quarter_state fqs
  WHERE fqs.dpi IS NOT NULL
    AND fqs.rvpi IS NOT NULL
    AND fqs.tvpi IS NOT NULL
    AND ABS(fqs.tvpi - (fqs.dpi + fqs.rvpi)) > 0.05;

  RETURN QUERY
  SELECT
    'dpi_tvpi_consistency'::text,
    v_violations = 0,
    CASE WHEN v_violations = 0
      THEN 'TVPI = DPI + RVPI within tolerance for all fund quarters'
      ELSE v_violations || ' fund quarter rows where TVPI != DPI + RVPI'
    END;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- COVERAGE COMPLETENESS CHECKS
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION re_check_all_assets_have_rollup()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_missing int;
  v_total int;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id;

  SELECT COUNT(*) INTO v_missing
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  WHERE NOT EXISTS (
    SELECT 1 FROM re_asset_acct_quarter_rollup qr
    WHERE qr.asset_id = a.asset_id
  );

  RETURN QUERY
  SELECT
    'all_assets_have_rollup'::text,
    v_missing = 0,
    CASE WHEN v_missing = 0
      THEN 'All ' || v_total || ' assets have rollup data'
      ELSE v_missing || ' of ' || v_total || ' assets missing rollup data'
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_pipeline_density()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_count int;
  v_metro_count int;
  v_type_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM re_pipeline_deal;

  SELECT COUNT(DISTINCT pp.city) INTO v_metro_count
  FROM re_pipeline_property pp;

  SELECT COUNT(DISTINCT pd.property_type) INTO v_type_count
  FROM re_pipeline_deal pd;

  RETURN QUERY
  SELECT
    'pipeline_density'::text,
    v_count >= 25 AND v_metro_count >= 8 AND v_type_count >= 6,
    v_count || ' deals across ' || v_metro_count || ' metros and ' ||
      v_type_count || ' property types (min: 25 deals, 8 metros, 6 types)';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_lease_coverage()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(DISTINCT l.asset_id) INTO v_count
  FROM re_lease l;

  RETURN QUERY
  SELECT
    'lease_coverage'::text,
    v_count >= 4,
    v_count || ' assets have lease data (minimum: 4)';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION re_check_partner_ledger_coverage()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
DECLARE
  v_missing int;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM re_partner_commitment pc
  WHERE pc.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM re_capital_ledger_entry cle
      WHERE cle.partner_id = pc.partner_id
        AND cle.fund_id = pc.fund_id
    );

  RETURN QUERY
  SELECT
    'partner_ledger_coverage'::text,
    v_missing = 0,
    CASE WHEN v_missing = 0
      THEN 'All active partner commitments have capital ledger entries'
      ELSE v_missing || ' active commitments have no capital ledger entries'
    END;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- MASTER CHECK RUNNER
-- Runs all checks and returns unified results
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION re_run_all_integrity_checks()
RETURNS TABLE(check_name text, passed boolean, detail text) AS $$
BEGIN
  RETURN QUERY SELECT * FROM re_check_orphaned_assets();
  RETURN QUERY SELECT * FROM re_check_assets_without_property_detail();
  RETURN QUERY SELECT * FROM re_check_funds_without_investments();
  RETURN QUERY SELECT * FROM re_check_pipeline_completeness();
  RETURN QUERY SELECT * FROM re_check_noi_equals_rev_minus_opex();
  RETURN QUERY SELECT * FROM re_check_ncf_waterfall();
  RETURN QUERY SELECT * FROM re_check_occupancy_bounds();
  RETURN QUERY SELECT * FROM re_check_cap_rate_bounds();
  RETURN QUERY SELECT * FROM re_check_dpi_tvpi_consistency();
  RETURN QUERY SELECT * FROM re_check_all_assets_have_rollup();
  RETURN QUERY SELECT * FROM re_check_pipeline_density();
  RETURN QUERY SELECT * FROM re_check_lease_coverage();
  RETURN QUERY SELECT * FROM re_check_partner_ledger_coverage();
END;
$$ LANGUAGE plpgsql;
