-- 604_cro_execution_task_re_engage.sql
-- Adds re_engage_at and blocked_reason to cro_execution_task so WAITING isn't a
-- graveyard. The waiting_re_engage_due auto-pass returns these to TODAY when
-- their date hits. Also extends the auto_source CHECK to register the three
-- new pressure passes.
-- Depends on: 525_execution_board.

ALTER TABLE cro_execution_task
    ADD COLUMN IF NOT EXISTS re_engage_at   timestamptz,
    ADD COLUMN IF NOT EXISTS blocked_reason text;

CREATE INDEX IF NOT EXISTS idx_cro_execution_task_re_engage
    ON cro_execution_task (env_id, business_id, re_engage_at)
    WHERE status = 'waiting' AND re_engage_at IS NOT NULL;

-- Replace the auto_source CHECK to include the new passes. The waiting auto
-- pass moves rows but doesn't insert, so it doesn't need its own auto_source.
DO $$ BEGIN
    ALTER TABLE cro_execution_task DROP CONSTRAINT IF EXISTS cro_execution_task_auto_source_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE cro_execution_task
    ADD CONSTRAINT cro_execution_task_auto_source_check
    CHECK (auto_source IS NULL OR auto_source IN (
        'pipeline_no_next_action',
        'pipeline_stale_3d',
        'pipeline_no_outreach',
        'pipeline_proposal_sent_no_followup',
        'outreach_no_reply_2d',
        'email_inbound_reply',
        'proof_backlog_top',
        'quick_capture',
        'manual',
        'ai_generated'
    ));

COMMENT ON COLUMN cro_execution_task.re_engage_at IS
    'When a waiting task should auto-return to TODAY. Set at drag-to-WAITING; cleared on auto-promote.';
COMMENT ON COLUMN cro_execution_task.blocked_reason IS
    'Why the task is in WAITING (free text or chip code: waiting_on_reply / waiting_on_info / waiting_on_decision / waiting_on_deliverable / other).';
