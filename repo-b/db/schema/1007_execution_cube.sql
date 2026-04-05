-- 1007_execution_cube.sql
-- Revenue Execution OS: adds deal positioning columns and activity enrichment
-- for auto-computed deal execution status (NeedsAttention / ReadyToAct / Waiting / OnTrack).

-- ─── Deal positioning on crm_opportunity ────────────────────────────────────
ALTER TABLE crm_opportunity
  ADD COLUMN IF NOT EXISTS thesis        text,
  ADD COLUMN IF NOT EXISTS pain          text,
  ADD COLUMN IF NOT EXISTS winston_angle text;

COMMENT ON COLUMN crm_opportunity.thesis IS 'Why this company is a fit — strategic thesis for the deal';
COMMENT ON COLUMN crm_opportunity.pain IS 'Pain category or problem statement driving the opportunity';
COMMENT ON COLUMN crm_opportunity.winston_angle IS 'How Winston/AI-enabled execution replaces the pain';

-- ─── Activity enrichment for status computation ─────────────────────────────
ALTER TABLE crm_activity
  ADD COLUMN IF NOT EXISTS direction  text CHECK (direction IN ('outbound', 'inbound')),
  ADD COLUMN IF NOT EXISTS outcome    text,
  ADD COLUMN IF NOT EXISTS next_step  text;

COMMENT ON COLUMN crm_activity.direction IS 'outbound (we contacted them) or inbound (they contacted us)';
COMMENT ON COLUMN crm_activity.outcome IS 'Free-text outcome of the activity';
COMMENT ON COLUMN crm_activity.next_step IS 'Suggested next step after this activity';

-- ─── Indexes for computed deal status queries ───────────────────────────────
-- Supports LATERAL (SELECT ... FROM crm_activity WHERE crm_opportunity_id = ? ORDER BY activity_at DESC LIMIT 1)
CREATE INDEX IF NOT EXISTS idx_crm_activity_opp_at
  ON crm_activity (crm_opportunity_id, activity_at DESC);

-- Supports LATERAL (SELECT ... FROM cro_next_action WHERE entity_type='opportunity' AND entity_id = ? AND status='pending' ORDER BY due_date LIMIT 1)
CREATE INDEX IF NOT EXISTS idx_cro_next_action_opp_pending
  ON cro_next_action (entity_id, status, due_date)
  WHERE entity_type = 'opportunity' AND status = 'pending';
