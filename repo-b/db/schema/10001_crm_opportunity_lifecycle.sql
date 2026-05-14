-- Extend deal lifecycle states and add disposition tracking

-- Extend status check — bad_fit is a reason, not a state; keep states clean
ALTER TABLE crm_opportunity
  DROP CONSTRAINT IF EXISTS crm_opportunity_status_check;

ALTER TABLE crm_opportunity
  ADD CONSTRAINT crm_opportunity_status_check
  CHECK (status IN ('open','won','lost','on_hold','cold_hold','archived'));

-- New columns for disposition tracking and hygiene
ALTER TABLE crm_opportunity
  ADD COLUMN IF NOT EXISTS disposition_reason  text,
  ADD COLUMN IF NOT EXISTS last_touch_at       timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at           timestamptz;

-- Index on status for efficient closed-deal filtering
CREATE INDEX IF NOT EXISTS idx_crm_opportunity_status ON crm_opportunity(business_id, status);
