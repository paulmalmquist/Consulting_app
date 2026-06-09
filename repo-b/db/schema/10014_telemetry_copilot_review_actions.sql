-- 10014_telemetry_copilot_review_actions.sql
-- Track B (Operator Usefulness): one row per HUMAN disposition of a draft report, in a within-reviewer
-- paired A/B protocol (arm = 'assisted' vs 'unassisted'). Captures the six usefulness measures DIRECTLY
-- (time-to-verdict, agreement-vs-label, override + precision, confidence, evidence-open) so the panel
-- reports REAL outcomes, never self-reported. No auth: reviewer identity is an opaque label only;
-- tenant scope is env_id+business_id. Public NASA analog data only. Owning module: Telemetry Platform.

CREATE TABLE IF NOT EXISTS tel_copilot_review_actions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id             text NOT NULL,
    business_id        uuid NOT NULL,
    report_id          uuid REFERENCES tel_copilot_reports(id) ON DELETE CASCADE,
    run_key            text,                            -- denormalized for the labeled-truth join
    fire_tick          integer,                         -- tick the verdict fired (for label overlap)
    arm                text NOT NULL,                   -- 'assisted' | 'unassisted'
    model_verdict      text,                            -- copied from the report at disposition time
    human_verdict      text NOT NULL,                   -- 'GO' | 'NO_GO' | 'DEFER'
    is_override        boolean NOT NULL DEFAULT false,  -- human_verdict != model_verdict AND not DEFER
    confidence         smallint,                        -- 1..5, nullable
    time_to_verdict_ms integer,                         -- client-measured (start->submit)
    evidence_opened    integer NOT NULL DEFAULT 0,      -- count of evidence cards expanded
    reviewer_label     text,                            -- opaque, optional; NOT real auth identity
    pair_id            uuid,                            -- links the assisted+unassisted pair (same case)
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tel_cra_arm_chk   CHECK (arm IN ('assisted','unassisted')),
    CONSTRAINT tel_cra_conf_chk  CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5),
    CONSTRAINT tel_cra_human_chk CHECK (human_verdict IN ('GO','NO_GO','DEFER'))
);
ALTER TABLE tel_copilot_review_actions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_copilot_review_actions_tenant ON tel_copilot_review_actions
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Query path: usefulness_summary filters (env_id, business_id) then GROUP BY arm.
CREATE INDEX IF NOT EXISTS idx_tel_cra_env_arm
    ON tel_copilot_review_actions (env_id, business_id, arm);
COMMENT ON TABLE tel_copilot_review_actions IS
  'Telemetry Platform: one human disposition per draft report in a within-reviewer paired A/B (assisted vs unassisted). Source for the operator-usefulness panel: time-to-verdict, agreement-vs-label, override + precision, confidence, evidence-open — measured directly, not self-reported. Owning module: Telemetry Platform.';

-- ── verification ─────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_tables
      WHERE schemaname='public' AND tablename='tel_copilot_review_actions' AND rowsecurity = true;
    IF n <> 1 THEN RAISE EXCEPTION 'tel_copilot_review_actions migration incomplete'; END IF;
    RAISE NOTICE 'tel_copilot_review_actions ready (RLS on)';
END $$;
