-- 345_re_dashboard_layout_archetypes.sql
-- Expands the saved dashboard archetype constraint for existing databases.

ALTER TABLE re_dashboard
  DROP CONSTRAINT IF EXISTS re_dashboard_layout_archetype_check;

ALTER TABLE re_dashboard
  ADD CONSTRAINT re_dashboard_layout_archetype_check
  CHECK (layout_archetype IN (
    'executive_summary',
    'operating_review',
    'watchlist',
    'market_comparison',
    'custom',
    'monthly_operating_report',
    'fund_quarterly_review',
    'underwriting_dashboard'
  ));
