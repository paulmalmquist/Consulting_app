-- 10020_nv_analysis_sessions.sql
-- Investigation Session backend for the ADE governed fabric (plan PR 6).
-- Streaming, pausable, steerable, DETERMINISTIC-FIRST analysis sessions.
--
-- Every numeric claim traces to a real queried source (audit_dashboard.summary,
-- intelligence_cards.list_cards [called defensively], metrics_semantic.query_metrics)
-- via inline source_refs, or the section is "not available - reason" (fail closed).
-- No session may complete with a fabricated numeric claim.
--
-- Postgres holds HOT operational state + the verifiable numbers INLINE. Large
-- bodies/reports are object-storage POINTERS (Supabase Storage seam, fail-closed).
-- Full event history target is BigQuery (manual fail-closed mirror:
-- scripts/export_sessions_to_bq.py). Events retain a 90-day hot window in Postgres;
-- cleanup (scripts/cleanup_analysis_session_events.py) only deletes events whose
-- BigQuery export is confirmed - never delete-without-mirror.
--
-- Approved prefix: nv_. Owning module: backend/app/services/analysis_sessions.py.

CREATE TABLE IF NOT EXISTS nv_analysis_sessions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                 text NOT NULL,
    business_id            uuid NOT NULL,
    parent_session_id      uuid REFERENCES nv_analysis_sessions(id) ON DELETE SET NULL,  -- fork lineage
    title                  text NOT NULL,
    objective              text,                                   -- redacted question under investigation
    status                 text NOT NULL DEFAULT 'created'
                           CHECK (status IN ('created','running','paused',
                                             'completed','error','interrupted','canceled')),
    -- HONEST PAUSE: the running stream re-reads active_run_token each checkpoint; pause
    -- rotates it to NULL (capturing the old token into invalidated_run_tokens); resume
    -- mints a new uuid. A generator whose minted token != active_run_token aborts.
    active_run_token       uuid,
    invalidated_run_tokens uuid[] NOT NULL DEFAULT '{}',           -- tokens killed by a pause (pause-resume eval reads this)
    last_completed_section text,                                   -- resume checkpoint
    plan                   jsonb NOT NULL DEFAULT '{}'::jsonb,     -- {plan_version, sections:[{key,title,sources}]}
    plan_version           int  NOT NULL DEFAULT 1 CHECK (plan_version >= 1),
    sections               jsonb NOT NULL DEFAULT '[]'::jsonb,     -- finalized blobs: claims+source_refs INLINE, body via pointer
    narration_text         text,                                   -- ALWAYS NULL in PR6 (deterministic-first); reserved
    deliverable_card_id    uuid,                                   -- intel card from finalize (best-effort)
    artifact_pointers      jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{bucket,key,kind,bytes,sha256,artifact_status}]
    confidence             numeric(4,3),                           -- NULL until completed; NULL = deterministic-only
    null_reasons           jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{section,reason}]
    latency_ms             integer,
    cost_estimate          numeric(10,4),                          -- NULL = no LLM ran (NEVER coerce to 0.0)
    error_message          text,
    created_by             text NOT NULL DEFAULT 'system',
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    resumed_at             timestamptz,
    completed_at           timestamptz
);
ALTER TABLE nv_analysis_sessions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    CREATE POLICY nv_analysis_sessions_tenant ON nv_analysis_sessions
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
-- Workload: list endpoint, env+business newest-first.
CREATE INDEX IF NOT EXISTS ix_nv_analysis_sessions_env_time
    ON nv_analysis_sessions (env_id, business_id, created_at DESC);
-- Workload: reconnect/resume looks up active sessions for a tenant.
CREATE INDEX IF NOT EXISTS ix_nv_analysis_sessions_active
    ON nv_analysis_sessions (env_id, business_id, status) WHERE status IN ('running', 'paused');
COMMENT ON TABLE nv_analysis_sessions IS
    'Investigation session hot state (plan PR 6). Deterministic-first: numbers inline in '
    'sections[].claims with source_refs; bodies/reports are object-storage pointers. '
    'active_run_token gates the stream for honest pause. Owning module: analysis_sessions.py.';

-- Append-only lifecycle event log. Hot window only (90 days); durable history -> BigQuery
-- via scripts/export_sessions_to_bq.py. Cleanup gates deletion on confirmed export.
CREATE TABLE IF NOT EXISTS nv_analysis_session_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    session_id      uuid NOT NULL REFERENCES nv_analysis_sessions(id) ON DELETE CASCADE,
    seq             bigint NOT NULL,                 -- monotonic per session; powers Last-Event-ID replay
    run_token       uuid,                            -- token in force when emitted; NULL on terminal control frames
    event_type      text NOT NULL,                   -- session.created ... session.completed (12 lifecycle types)
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    audit_event_id  uuid,                            -- link to app.audit_events (audit eval verifies presence)
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, seq)
);
ALTER TABLE nv_analysis_session_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    CREATE POLICY nv_analysis_session_events_tenant ON nv_analysis_session_events
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
-- Workload: stream replay + reconnect reads events for one session in seq order.
CREATE INDEX IF NOT EXISTS ix_nv_analysis_session_events_session_seq
    ON nv_analysis_session_events (session_id, seq);
-- Workload: BigQuery mirror reads by created_at; cleanup prunes by created_at.
CREATE INDEX IF NOT EXISTS ix_nv_analysis_session_events_created
    ON nv_analysis_session_events (created_at);
COMMENT ON TABLE nv_analysis_session_events IS
    'Append-only session lifecycle log (plan PR 6). HOT window: ~90 days in Postgres. '
    'Durable history -> BigQuery winston_ops.analysis_session_events_bq (manual fail-closed '
    'mirror). Cleanup deletes only after export is confirmed. Owning module: analysis_sessions.py.';

-- Hot eval results. Each of the 8 categories is a real deterministic pass/fail check
-- derived from persisted session data; never a hardcoded pass. Trend history -> BigQuery.
CREATE TABLE IF NOT EXISTS nv_analysis_session_eval_results (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id        text NOT NULL,
    business_id   uuid NOT NULL,
    session_id    uuid NOT NULL REFERENCES nv_analysis_sessions(id) ON DELETE CASCADE,
    eval_category text NOT NULL
                  CHECK (eval_category IN ('grounding','dashboard-consistency','driver-quality',
                                           'pause-resume','steering','latency','fail-closed','audit')),
    passed        boolean,                           -- NULL = not measurable (fail closed, never a fake pass)
    score         numeric(5,4),
    detail        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {checked, failures, evidence}
    evaluated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, eval_category)
);
ALTER TABLE nv_analysis_session_eval_results ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    CREATE POLICY nv_analysis_session_eval_results_tenant ON nv_analysis_session_eval_results
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
CREATE INDEX IF NOT EXISTS ix_nv_analysis_session_eval_results_session
    ON nv_analysis_session_eval_results (session_id);
COMMENT ON TABLE nv_analysis_session_eval_results IS
    'Per-session eval verdicts (plan PR 6), 8 categories, each a real check over persisted '
    'data. passed=NULL means not-measurable (fail closed). Owning module: analysis_evals.py.';
