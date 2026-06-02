-- 10010_telemetry_copilot.sql
-- Phase 6: Test Intelligence Copilot — audit + governance tables.
-- tel_copilot_interactions logs every grounded/fallback/refusal answer (the governance dashboard
-- aggregates from it). tel_copilot_prompt_versions records each copilot policy version (prompt +
-- model + allow-list + refusal rules) so the active behavior is auditable. Public NASA analog data
-- only. Owning module: Telemetry Platform.

-- ── tel_copilot_interactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_copilot_interactions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      uuid NOT NULL,
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    intent          text,                              -- supported intent, or null for refusals
    is_refusal      boolean NOT NULL DEFAULT false,
    null_reason     text,                              -- unsupported_question | insufficient_evidence | ...
    answer_source   text NOT NULL,                     -- live_llm | fallback_template | refusal
    prompt_version  text NOT NULL,
    model           text,
    evidence_count  integer NOT NULL DEFAULT 0,
    tool_trace      jsonb NOT NULL DEFAULT '[]'::jsonb,
    elapsed_ms      integer,
    question        text,
    answer          text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tel_copilot_interactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_copilot_interactions_tenant ON tel_copilot_interactions
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_tel_copilot_interactions_env_created
    ON tel_copilot_interactions (env_id, business_id, created_at DESC);
COMMENT ON TABLE tel_copilot_interactions IS
  'Telemetry Platform: audit log of every Test Intelligence Copilot answer (intent, refusal, null_reason, answer_source, evidence_count, tool_trace, latency). Source for the AI governance dashboard. Owning module: Telemetry Platform.';

-- ── tel_copilot_prompt_versions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_copilot_prompt_versions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    prompt_version      text NOT NULL,                 -- 12-char sha256 over prompt+model+allow-list+rules
    model               text NOT NULL,
    allow_list          jsonb NOT NULL DEFAULT '[]'::jsonb,
    refusal_rules_hash  text,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, prompt_version)
);
ALTER TABLE tel_copilot_prompt_versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_copilot_prompt_versions_tenant ON tel_copilot_prompt_versions
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_copilot_prompt_versions IS
  'Telemetry Platform: copilot policy versions (prompt + model + allow-list + refusal rules) for prompt-version tracking and the active-policy gate. Owning module: Telemetry Platform.';

-- ── verification ─────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_tables
      WHERE schemaname='public'
        AND tablename IN ('tel_copilot_interactions','tel_copilot_prompt_versions')
        AND rowsecurity = true;
    RAISE NOTICE 'copilot tables with RLS: %', n;
    IF n < 2 THEN RAISE EXCEPTION 'copilot migration incomplete: % of 2', n; END IF;
END $$;
