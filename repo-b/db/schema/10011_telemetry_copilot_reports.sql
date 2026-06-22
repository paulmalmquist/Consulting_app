-- 10011_telemetry_copilot_reports.sql
-- Phase 7: Test Report Workflow. Persists assistant-generated DRAFT test-anomaly reports assembled
-- ONLY from real Phase 6 evidence (prediction receipt + champion metadata + labeled anomaly events).
-- Every report carries full provenance and review_status='requires_human_review' — it is draft
-- analysis for a human engineer, never a final disposition. Public NASA analog data only.
-- Owning module: Telemetry Platform.

CREATE TABLE IF NOT EXISTS tel_copilot_reports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- the report receipt
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    run_id          uuid,                                          -- tel_test_runs.id
    run_key         text,
    receipt_id      uuid,                                          -- tel_predictions.id (triggering)
    verdict         text,
    anomaly_score   double precision,
    threshold       double precision,
    champion_model  text,
    model_version   text,
    mlflow_run_id   text,
    prompt_version  text NOT NULL,                                 -- policy hash that produced it
    evidence_payload jsonb NOT NULL DEFAULT '[]'::jsonb,           -- the grounded evidence[] used
    generated_markdown text NOT NULL,                              -- the report body
    review_status   text NOT NULL DEFAULT 'requires_human_review',
    null_reason     text,                                          -- set if assembled fail-closed
    created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tel_copilot_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_copilot_reports_tenant ON tel_copilot_reports
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_tel_copilot_reports_env_created
    ON tel_copilot_reports (env_id, business_id, created_at DESC);
COMMENT ON TABLE tel_copilot_reports IS
  'Telemetry Platform: assistant-generated DRAFT test-anomaly reports (Phase 7), assembled only from real evidence, with full provenance and review_status=requires_human_review. Owning module: Telemetry Platform.';

-- ── verification ─────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_tables
      WHERE schemaname='public' AND tablename='tel_copilot_reports' AND rowsecurity = true;
    IF n <> 1 THEN RAISE EXCEPTION 'tel_copilot_reports migration incomplete'; END IF;
    RAISE NOTICE 'tel_copilot_reports ready (RLS on)';
END $$;
