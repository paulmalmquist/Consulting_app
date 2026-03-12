-- 344_re_dashboard_spec_file.sql
-- Adds spec_file and density columns to re_dashboard for spec round-trip and density toggle.

ALTER TABLE re_dashboard
  ADD COLUMN IF NOT EXISTS spec_file text,
  ADD COLUMN IF NOT EXISTS density  text DEFAULT 'comfortable'
    CHECK (density IN ('comfortable', 'compact', 'auto'));
