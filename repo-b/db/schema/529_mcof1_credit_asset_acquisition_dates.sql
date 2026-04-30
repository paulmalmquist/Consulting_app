-- 529_mcof1_credit_asset_acquisition_dates.sql
-- Backfill acquisition_date on MCOF I (Meridian Credit Opportunities Fund I)
-- credit / CMBS assets so the bottom-up CF builder can book their loan
-- origination as the initial outflow.
--
-- Why: prior calibrated seeds (511_repe_calibrated_asset_seed.sql,
-- 451_meridian_realistic_variance_seed.sql) populated cost_basis (loan
-- principal), operating CFs (interest income, servicing opex), and
-- exit_event rows for the credit-fund bridge loans, but did not populate
-- repe_asset.acquisition_date. The builder
-- backend/app/services/bottom_up_cashflow.py:build_asset_cf_series
-- treats acquisition_date as a hard requirement (line 402:
-- "if ctx.get('acquisition_date') and ctx.get('cost_basis') is not None").
-- Without it, no acquisition cash-out is booked, the IRR engine sees a
-- pure inflow stream, and compute_asset_irr returns null_reason
-- 'missing_acquisition'.
--
-- For credit / debt assets, "acquisition" is the loan funding event:
-- principal disbursed at origination. Operating data starts in 2024Q4 for
-- all 8 MCOF I assets, so we set acquisition_date to the first day of
-- 2024Q4 (2024-10-01) for any MCOF I asset where it is currently NULL.
--
-- Idempotent: only updates rows where acquisition_date IS NULL.

BEGIN;

UPDATE repe_asset
SET acquisition_date = '2024-10-01'::date
WHERE asset_id IN (
    SELECT a.asset_id
    FROM repe_asset a
    JOIN repe_deal d ON d.deal_id = a.deal_id
    WHERE d.fund_id = 'a1b2c3d4-0002-0020-0001-000000000001'::uuid
      AND a.acquisition_date IS NULL
      AND a.cost_basis IS NOT NULL
);

-- Audit: every MCOF I credit asset must now have acquisition_date set.
DO $$
DECLARE
    missing_count integer;
BEGIN
    SELECT COUNT(*) INTO missing_count
    FROM repe_asset a
    JOIN repe_deal d ON d.deal_id = a.deal_id
    WHERE d.fund_id = 'a1b2c3d4-0002-0020-0001-000000000001'::uuid
      AND a.cost_basis IS NOT NULL
      AND a.acquisition_date IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Migration 529 failed: % MCOF I assets still missing acquisition_date', missing_count;
    END IF;
END$$;

COMMIT;
