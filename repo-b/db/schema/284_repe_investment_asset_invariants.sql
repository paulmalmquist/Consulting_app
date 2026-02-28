-- 284_repe_investment_asset_invariants.sql
-- Backfill placeholder assets for any legacy investments missing children and
-- reinforce canonical lookup performance.

CREATE INDEX IF NOT EXISTS idx_repe_asset_deal_id
  ON repe_asset(deal_id);

WITH missing_deals AS (
  SELECT d.deal_id, d.name, d.deal_type
  FROM repe_deal d
  LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
  GROUP BY d.deal_id, d.name, d.deal_type
  HAVING COUNT(a.asset_id) = 0
),
inserted_assets AS (
  INSERT INTO repe_asset (asset_id, deal_id, asset_type, name)
  SELECT
    gen_random_uuid(),
    md.deal_id,
    CASE WHEN md.deal_type = 'debt' THEN 'cmbs' ELSE 'property' END,
    md.name || ' - Placeholder Asset'
  FROM missing_deals md
  RETURNING asset_id, deal_id, asset_type
)
INSERT INTO repe_property_asset (asset_id, property_type, units, market, current_noi, occupancy)
SELECT a.asset_id, 'unspecified', 1, 'TBD', 0, 0
FROM repe_asset a
JOIN repe_deal d ON d.deal_id = a.deal_id
LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
WHERE a.name = d.name || ' - Placeholder Asset'
  AND a.asset_type = 'property'
  AND pa.asset_id IS NULL
ON CONFLICT (asset_id) DO NOTHING;

INSERT INTO repe_cmbs_asset (asset_id, tranche, rating, coupon, collateral_summary_json)
SELECT a.asset_id, 'TBD', 'NR', 0, '{}'::jsonb
FROM repe_asset a
JOIN repe_deal d ON d.deal_id = a.deal_id
LEFT JOIN repe_cmbs_asset ca ON ca.asset_id = a.asset_id
WHERE a.name = d.name || ' - Placeholder Asset'
  AND a.asset_type = 'cmbs'
  AND ca.asset_id IS NULL
ON CONFLICT (asset_id) DO NOTHING;
