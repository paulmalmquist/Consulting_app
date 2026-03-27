-- 311_crm_next_actions.sql
-- Next Action Engine: every lead/account/opportunity gets mandatory next actions.
-- Pipeline stage enforcement and enhanced lead scoring breakdown.

-- ─── 1. Next Action Table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_next_action (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    -- Polymorphic entity link
    entity_type         text NOT NULL CHECK (entity_type IN ('account','contact','opportunity','lead')),
    entity_id           uuid NOT NULL,
    -- Action details
    action_type         text NOT NULL CHECK (action_type IN ('email','call','meeting','research','follow_up','proposal','linkedin','task','other')),
    description         text NOT NULL,
    due_date            date NOT NULL,
    owner               text,  -- actor name or email
    status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped')),
    completed_at        timestamptz,
    -- Priority and notes
    priority            text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cro_next_action_entity ON cro_next_action(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_cro_next_action_due ON cro_next_action(business_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_cro_next_action_env ON cro_next_action(env_id, business_id);

-- ─── 2. Lead Scoring Breakdown ──────────────────────────────────────────────────

ALTER TABLE cro_lead_profile ADD COLUMN IF NOT EXISTS score_breakdown jsonb DEFAULT '{}';
ALTER TABLE cro_lead_profile ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'research';
ALTER TABLE cro_lead_profile ADD COLUMN IF NOT EXISTS next_action_type text;
ALTER TABLE cro_lead_profile ADD COLUMN IF NOT EXISTS next_action_date date;

-- Backfill: all leads without a pipeline_stage get 'research'
UPDATE cro_lead_profile SET pipeline_stage = 'research' WHERE pipeline_stage IS NULL;
