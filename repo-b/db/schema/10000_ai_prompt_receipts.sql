-- 10000_ai_prompt_receipts.sql
-- Winston AI Gateway — Prompt Strategy / Compilation / Receipt System
--
-- Durable admin-inspectable receipts of the final prompt sent to the model,
-- with section-level token accounting, tool-loop round tracking, and budget
-- enforcement traces. Also adds thread-summary version tracking on
-- ai_conversations, a request_id column on ai_gateway_logs for receipt-to-log
-- linkage, and a policy proposals review queue for the feedback loop.
--
-- See docs in backend/app/services/prompt_strategy.py and
-- backend/app/services/context_compiler.py for how rows are populated.

CREATE TABLE IF NOT EXISTS ai_prompt_receipts (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at                      timestamptz NOT NULL DEFAULT now(),
    -- Linkage
    request_id                      text NOT NULL,
    round_index                     int  NOT NULL DEFAULT 0,
    capture_point                   text NOT NULL DEFAULT 'initial',
    conversation_id                 uuid REFERENCES ai_conversations(conversation_id) ON DELETE SET NULL,
    message_id                      uuid,
    session_id                      text,
    env_id                          uuid,
    business_id                     uuid,
    actor                           text DEFAULT 'anonymous',
    -- Strategy snapshot
    lane                            text,
    intent                          text,
    composition_profile             text,
    model                           text,
    model_encoding                  text,
    composer_version                text,
    strategy_version                text,
    fallback_used                   boolean NOT NULL DEFAULT false,
    skill_id                        text,
    skill_source                    text,
    skill_tokens                    int,
    skill_trimmed                   boolean NOT NULL DEFAULT false,
    lane_policy_json                jsonb,
    composition_profile_json        jsonb,
    -- User message (original + post-deictic-resolution)
    original_user_text              text,
    resolved_user_text              text,
    deictic_rewrites_json           jsonb,
    -- Structured scope sections
    scope_environment_text          text,
    scope_page_text                 text,
    scope_entity_text               text,
    scope_filters_text              text,
    scope_visible_records_text      text,
    -- Other sections
    system_text                     text,
    skill_instructions_text         text,
    thread_goal_text                text,
    thread_summary_text             text,
    rag_text                        text,
    history_json                    jsonb,
    workflow_augmentation_text      text,
    -- Section token counts
    system_tokens                   int,
    skill_instructions_tokens       int,
    thread_goal_tokens              int,
    thread_summary_tokens           int,
    scope_entity_tokens             int,
    scope_page_tokens               int,
    scope_environment_tokens        int,
    scope_filters_tokens            int,
    scope_visible_records_tokens    int,
    rag_tokens                      int,
    history_tokens                  int,
    workflow_augmentation_tokens    int,
    current_user_tokens             int,
    total_prompt_tokens             int,
    total_prompt_tokens_upstream    int,
    -- Budget + enforcement
    total_budget                    int,
    pre_enforcement_tokens          int,
    enforcement_trace_json          jsonb,
    redundancy_filter_json          jsonb,
    -- History / continuity
    history_message_count           int,
    history_message_ids             uuid[],
    history_first_created_at        timestamptz,
    history_last_created_at         timestamptz,
    history_truncated               boolean NOT NULL DEFAULT false,
    truncation_reason               text,
    used_thread_summary             boolean NOT NULL DEFAULT false,
    summary_strategy                text,
    thread_summary_version          int,
    -- Scope / continuity
    active_scope_type               text,
    active_scope_id                 text,
    active_scope_label              text,
    resolved_entity_state_json      jsonb,
    -- Freeform + diagnostic flags
    notes_json                      jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE ai_prompt_receipts IS 'Admin-only durable receipts of the exact prompt sent to the model. One row per tool-loop round. Joins to ai_gateway_logs on request_id. Owned by winston-agentic-build.';
COMMENT ON COLUMN ai_prompt_receipts.created_at IS 'Pre-send capture time (not completion time). Receipts exist even when the model call later fails.';
COMMENT ON COLUMN ai_prompt_receipts.request_id IS 'Stable trace id from x-bm-request-id header (or locally minted). Joins to ai_gateway_logs.request_id.';
COMMENT ON COLUMN ai_prompt_receipts.round_index IS 'Tool-loop round number. 0 is the initial user-facing call; 1..N are follow-up completions after tool calls.';
COMMENT ON COLUMN ai_prompt_receipts.enforcement_trace_json IS 'Ordered list of budget-enforcement actions: which sections were dropped, trimmed, or compressed and by how much.';
COMMENT ON COLUMN ai_prompt_receipts.notes_json IS 'Memory-continuity diagnostics and inline flags: requested_conversation_id, prior_messages_found/included, inherited_entity_id/source, flags=[rag_overuse, history_starvation, ...], section_truncated.';

CREATE INDEX IF NOT EXISTS idx_ai_prompt_receipts_conversation
    ON ai_prompt_receipts (conversation_id, created_at DESC)
    WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_prompt_receipts_request
    ON ai_prompt_receipts (request_id, round_index);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_receipts_env_created
    ON ai_prompt_receipts (env_id, created_at DESC)
    WHERE env_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_prompt_receipts_profile
    ON ai_prompt_receipts (composition_profile, created_at DESC)
    WHERE composition_profile IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_prompt_receipts_version
    ON ai_prompt_receipts (composer_version, strategy_version, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_receipts_created
    ON ai_prompt_receipts (created_at DESC);

ALTER TABLE ai_prompt_receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    CREATE POLICY ai_prompt_receipts_tenant_isolation ON ai_prompt_receipts
        USING (
            env_id::text = current_setting('app.env_id', true)
            OR current_setting('app.env_id', true) IS NULL
            OR current_setting('app.env_id', true) = ''
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Wire thread-summary version tracking on the existing context_summary column (added in 424).
ALTER TABLE ai_conversations
    ADD COLUMN IF NOT EXISTS context_summary_version         int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS context_summary_through_message uuid,
    ADD COLUMN IF NOT EXISTS context_summary_updated_at      timestamptz;

-- ── Fix gateway-log linkage: add request_id so receipts join 1:1 with logs.
ALTER TABLE ai_gateway_logs
    ADD COLUMN IF NOT EXISTS request_id text;

CREATE INDEX IF NOT EXISTS idx_ai_gateway_logs_request
    ON ai_gateway_logs (request_id)
    WHERE request_id IS NOT NULL;

-- ── Feedback loop: policy proposals review queue.
-- v1: autotuner writes proposals; humans review and manually apply policy changes.
-- v2: can add an apply path that mutates a DB-backed lane_policy override table.
CREATE TABLE IF NOT EXISTS ai_prompt_policy_proposals (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    proposed_by     text NOT NULL DEFAULT 'autotuner',
    reason          text NOT NULL,
    signal_window   text,
    signal_metrics  jsonb,
    current_policy  jsonb,
    proposed_policy jsonb,
    status          text NOT NULL DEFAULT 'pending',
    reviewed_by     text,
    reviewed_at     timestamptz,
    applied_at      timestamptz
);

COMMENT ON TABLE ai_prompt_policy_proposals IS 'Policy change proposals emitted by the prompt autotuner. v1 is human-approved; v2 may auto-apply. Owned by winston-agentic-build.';

CREATE INDEX IF NOT EXISTS idx_policy_proposals_status
    ON ai_prompt_policy_proposals (status, created_at DESC);

-- ── Aggregated health view used by the feedback loop admin endpoint.
CREATE OR REPLACE VIEW v_ai_prompt_health AS
SELECT
    env_id,
    composition_profile,
    date_trunc('hour', created_at) AS bucket,
    COUNT(*)                                                                       AS turns,
    AVG(total_prompt_tokens)                                                       AS avg_prompt_tokens,
    AVG(GREATEST(pre_enforcement_tokens - total_prompt_tokens, 0))                 AS avg_cut_tokens,
    AVG(NULLIF(rag_tokens, 0)::float / NULLIF(total_prompt_tokens, 0))             AS avg_rag_share,
    AVG(NULLIF(history_tokens, 0)::float / NULLIF(total_prompt_tokens, 0))         AS avg_history_share,
    SUM(CASE WHEN history_truncated THEN 1 ELSE 0 END)                             AS turns_with_history_trim,
    SUM(CASE WHEN skill_trimmed THEN 1 ELSE 0 END)                                 AS turns_with_skill_trim,
    SUM(CASE WHEN notes_json->'flags' ? 'rag_overuse' THEN 1 ELSE 0 END)           AS rag_overuse_count,
    SUM(CASE WHEN notes_json->'flags' ? 'history_starvation' THEN 1 ELSE 0 END)    AS history_starvation_count,
    SUM(CASE WHEN notes_json->'flags' ? 'context_bloat' THEN 1 ELSE 0 END)         AS context_bloat_count,
    SUM(CASE WHEN notes_json->'flags' ? 'rag_crowded_out_history' THEN 1 ELSE 0 END) AS crowd_out_count,
    SUM(CASE WHEN notes_json->'flags' ? 'redundancy_high' THEN 1 ELSE 0 END)       AS redundancy_count,
    SUM(CASE WHEN notes_json->'flags' ? 'hard_overflow' THEN 1 ELSE 0 END)         AS hard_overflow_count,
    SUM(CASE WHEN notes_json->'flags' ? 'skill_dominance' THEN 1 ELSE 0 END)       AS skill_dominance_count,
    SUM(CASE WHEN notes_json->'flags' ? 'profile_downgrade' THEN 1 ELSE 0 END)     AS profile_downgrade_count
FROM ai_prompt_receipts
WHERE round_index = 0
GROUP BY env_id, composition_profile, bucket;

COMMENT ON VIEW v_ai_prompt_health IS 'Hourly aggregate of prompt receipt diagnostics, keyed by env_id + composition_profile. Drives the /api/admin/ai/prompt-health endpoint.';
