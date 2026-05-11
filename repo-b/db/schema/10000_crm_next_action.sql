-- Migration 10000: Add next_action fields to crm_opportunity
-- Purpose: Every open deal must have a next action and due date.
--          Required by the Command Center "Deals Needing Action Today" widget
--          and the pipeline board triage view.
-- Owning module: crm

ALTER TABLE crm_opportunity
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS next_action_date DATE;

COMMENT ON COLUMN crm_opportunity.next_action IS
  'Short description of the next concrete step for this deal (e.g. "Send follow-up email", "Schedule discovery call").';

COMMENT ON COLUMN crm_opportunity.next_action_date IS
  'Date by which the next_action should be completed. NULL = no scheduled action (treated as overdue in Command Center).';

-- Index for the Command Center query: open deals where action is due
CREATE INDEX IF NOT EXISTS idx_crm_opportunity_next_action_date
  ON crm_opportunity (business_id, next_action_date)
  WHERE status = 'open';
