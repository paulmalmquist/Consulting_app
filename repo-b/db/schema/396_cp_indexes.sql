-- 396_cp_indexes.sql
-- Performance indexes for Capital Projects tables.

-- Daily logs
CREATE INDEX IF NOT EXISTS idx_cp_daily_log_project
  ON cp_daily_log (project_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_cp_daily_log_env
  ON cp_daily_log (env_id, business_id, created_at DESC);

-- Meetings
CREATE INDEX IF NOT EXISTS idx_cp_meeting_project
  ON cp_meeting (project_id, meeting_date DESC);

CREATE INDEX IF NOT EXISTS idx_cp_meeting_env
  ON cp_meeting (env_id, business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cp_meeting_item_meeting
  ON cp_meeting_item (meeting_id, item_number);

CREATE INDEX IF NOT EXISTS idx_cp_meeting_item_status
  ON cp_meeting_item (status, due_date)
  WHERE status IN ('open', 'in_progress');

-- Drawings
CREATE INDEX IF NOT EXISTS idx_cp_drawing_project
  ON cp_drawing (project_id, discipline, sheet_number);

CREATE INDEX IF NOT EXISTS idx_cp_drawing_env
  ON cp_drawing (env_id, business_id, created_at DESC);

-- Pay applications
CREATE INDEX IF NOT EXISTS idx_cp_pay_app_project
  ON cp_pay_app (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cp_pay_app_contract
  ON cp_pay_app (contract_id, pay_app_number)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cp_pay_app_env
  ON cp_pay_app (env_id, business_id, created_at DESC);

-- Extended PDS column indexes
CREATE INDEX IF NOT EXISTS idx_pds_projects_region
  ON pds_projects (region, market)
  WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pds_punch_items_trade
  ON pds_punch_items (project_id, trade, status)
  WHERE trade IS NOT NULL;
