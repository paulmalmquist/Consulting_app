-- 510_repe_asset_strategy_column.sql
-- Asset-level strategy tag. Required by the calibrated bottom-up CF engine so
-- each asset can be traced to a named value driver (core / value-add /
-- opportunistic / distressed / lease-up). Backfilled from fund.sub_strategy
-- where possible; the calibrated seed (511) sets it explicitly per asset.

ALTER TABLE repe_asset
  ADD COLUMN IF NOT EXISTS strategy text
    CHECK (strategy IS NULL OR strategy IN (
      'core',
      'core_plus',
      'value_add',
      'opportunistic',
      'distressed',
      'development',
      'lease_up',
      'credit'
    ));

-- Backfill from fund sub_strategy when explicit strategy is null. Best-effort;
-- the calibrated asset seed overrides per-asset.
UPDATE repe_asset a
SET strategy = COALESCE(a.strategy,
  CASE
    WHEN f.sub_strategy IN ('core', 'core_plus', 'value_add', 'opportunistic',
                            'distressed', 'development', 'lease_up', 'credit')
      THEN f.sub_strategy
    WHEN f.sub_strategy = 'cmbs' THEN 'credit'
    ELSE NULL
  END)
FROM repe_deal d
JOIN repe_fund f ON f.fund_id = d.fund_id
WHERE a.deal_id = d.deal_id
  AND a.strategy IS NULL;

COMMENT ON COLUMN repe_asset.strategy IS
  'Asset-level investment strategy tag. Populated by the calibrated seed (511) so every asset has a traceable value driver; falls back to fund.sub_strategy when unknown.';
