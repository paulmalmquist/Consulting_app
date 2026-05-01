-- 525_execution_board.sql
-- Execution Board: daily-action Kanban for Novendor consulting revenue ops.
-- Tasks must carry a next_action and a why_now. Auto-generators populate Today
-- from open deals, stale outreach, and proof backlog so the board behaves as a
-- pressure engine, not a passive tracker.
-- Depends on: 260_crm_native (crm_opportunity, crm_contact FKs),
--             280_consulting_revenue_os (cro_outreach_log feeds auto-gen),
--             431_consulting_proof_assets_objections (cro_proof_asset feeds auto-gen).

-- ── enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE cro_execution_task_type AS ENUM (
        'outreach', 'product', 'proof_asset', 'research', 'follow_up'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE cro_execution_task_status AS ENUM (
        'today', 'this_week', 'waiting', 'done'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE cro_execution_revenue_tag AS ENUM ('low', 'mid', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE cro_execution_outcome AS ENUM (
        'moved_deal', 'got_response', 'no_effect', 'blocked', 'unknown'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── cro_execution_task ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_execution_task (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    title               text NOT NULL,
    description         text,
    expected_outcome    text,
    next_action         text NOT NULL CHECK (length(trim(next_action)) > 0),
    why_now             text NOT NULL CHECK (length(trim(why_now)) > 0),
    type                cro_execution_task_type NOT NULL,
    status              cro_execution_task_status NOT NULL DEFAULT 'today',
    linked_deal_id      uuid REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE SET NULL,
    linked_contact_id   uuid REFERENCES crm_contact(crm_contact_id) ON DELETE SET NULL,
    impact              smallint NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
    revenue_tag         cro_execution_revenue_tag NOT NULL DEFAULT 'mid',
    due_date            date,
    auto_source         text CHECK (auto_source IN (
        'pipeline_no_next_action', 'pipeline_stale_3d',
        'outreach_no_reply_2d', 'proof_backlog_top',
        'pipeline_no_outreach', 'pipeline_proposal_sent_no_followup',
        'manual', 'ai_generated', 'quick_capture'
    )),
    auto_source_ref     uuid,
    sequence_group      uuid,
    sequence_position   int,
    outcome             cro_execution_outcome,
    outcome_note        text,
    re_engage_at        timestamptz,
    blocked_reason      text,
    completed_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cro_execution_task ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_execution_task_tenant ON cro_execution_task
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_execution_task_env_status
    ON cro_execution_task (env_id, status);

CREATE INDEX IF NOT EXISTS idx_cro_execution_task_env_due
    ON cro_execution_task (env_id, due_date);

CREATE INDEX IF NOT EXISTS idx_cro_execution_task_env_deal
    ON cro_execution_task (env_id, linked_deal_id);

CREATE INDEX IF NOT EXISTS idx_cro_execution_task_auto_lookup
    ON cro_execution_task (env_id, auto_source, auto_source_ref);

-- Dedupe: while an auto-generated task is still open, no second task may be
-- created for the same source row. Once the task is moved to done, a fresh one
-- can be regenerated on the next board load (this is how proof_backlog_top
-- and stale-deal pressure tasks "replace themselves").
CREATE UNIQUE INDEX IF NOT EXISTS uq_cro_execution_task_auto_open
    ON cro_execution_task (env_id, auto_source, auto_source_ref)
    WHERE status <> 'done' AND auto_source IS NOT NULL AND auto_source_ref IS NOT NULL;

COMMENT ON TABLE cro_execution_task IS
    'Daily-action Kanban for the Novendor consulting environment. Owned by consulting module. Auto-generators populate Today from stale deals, missed follow-ups, and proof backlog.';
