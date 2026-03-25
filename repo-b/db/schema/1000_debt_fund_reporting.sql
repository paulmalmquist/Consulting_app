-- =============================================================================
-- Debt Fund Reporting Hierarchy — Fund-Level Aggregations
-- =============================================================================

-- Add debt-specific columns to re_fund_quarter_state for holistic debt metrics
-- These columns track fund-level debt portfolio health and maturity profile
ALTER TABLE re_fund_quarter_state
  ADD COLUMN IF NOT EXISTS total_upb numeric(28,12)
    COMMENT 'Total Unpaid Principal Balance across all loans in fund (debt funds)',
  ADD COLUMN IF NOT EXISTS weighted_avg_coupon numeric(18,12)
    COMMENT 'UPB-weighted average coupon across loan book (debt funds)',
  ADD COLUMN IF NOT EXISTS watchlist_count integer DEFAULT 0
    COMMENT 'Count of active covenant alerts in fund (debt funds)',
  ADD COLUMN IF NOT EXISTS io_exposure_pct numeric(18,12)
    COMMENT 'Percentage of UPB in interest-only period (debt funds)';

-- No index changes needed; existing unique index on (fund_id, quarter, scenario_id) unchanged.
-- These columns are NULL for equity funds; non-NULL for debt funds only.
