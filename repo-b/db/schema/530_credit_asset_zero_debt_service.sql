-- 530_credit_asset_zero_debt_service.sql
-- Zero out debt_service on credit / CMBS asset operating rows.
--
-- Why: credit funds (originating CMBS bridge loans) RECEIVE the borrower's
-- debt service via revenue. They do not pay debt service themselves.
-- Earlier seeds (451_meridian_realistic_variance_seed.sql, possibly 511)
-- copied the equity-property template and populated debt_service on credit
-- assets too, which causes the bottom-up CF builder to subtract a phantom
-- expense and report negative net operating CF.
--
-- This migration touches only re_asset_operating_qtr rows where the parent
-- asset's deal_type = 'debt'. It is idempotent.

BEGIN;

UPDATE re_asset_operating_qtr op
SET debt_service = 0
FROM repe_asset a
JOIN repe_deal d ON d.deal_id = a.deal_id
WHERE op.asset_id = a.asset_id
  AND d.deal_type = 'debt'
  AND op.debt_service IS NOT NULL
  AND op.debt_service <> 0;

-- Audit:
DO $$
DECLARE
    bad_count integer;
BEGIN
    SELECT COUNT(*) INTO bad_count
    FROM re_asset_operating_qtr op
    JOIN repe_asset a ON a.asset_id = op.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    WHERE d.deal_type = 'debt'
      AND op.debt_service IS NOT NULL
      AND op.debt_service > 0;
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration 530 failed: % credit operating rows still have debt_service > 0', bad_count;
    END IF;
END$$;

COMMIT;
