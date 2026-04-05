-- 1005_ai_observability_tables.sql
-- Additional observability tables for Winston AI: tool calls, UI events,
-- skill candidates, and audit findings.

-- ── ai_tool_calls: individual tool execution records ────────────────
CREATE TABLE IF NOT EXISTS ai_tool_calls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_log_id      uuid REFERENCES ai_gateway_logs(id) ON DELETE SET NULL,
  conversation_id     uuid REFERENCES ai_conversations(conversation_id) ON DELETE SET NULL,
  business_id         uuid NOT NULL,
  env_id              uuid,
  actor               text NOT NULL DEFAULT 'anonymous',

  tool_name           text NOT NULL,
  args_json           jsonb,
  result_json         jsonb,
  success             boolean NOT NULL DEFAULT true,
  error_message       text,
  duration_ms         int,
  is_write            boolean NOT NULL DEFAULT false,
  pending_confirmation boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_tool_calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ai_tool_calls_tenant_isolation ON ai_tool_calls
    USING (business_id = current_setting('app.current_business_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_conversation
  ON ai_tool_calls (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_tool_name
  ON ai_tool_calls (tool_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_failures
  ON ai_tool_calls (tool_name, created_at DESC)
  WHERE success = false;

COMMENT ON TABLE ai_tool_calls IS 'Per-tool-call execution records for debugging and audit. Owned by ai-copilot.';


-- ── ai_ui_events: frontend interaction telemetry ────────────────────
CREATE TABLE IF NOT EXISTS ai_ui_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid REFERENCES ai_conversations(conversation_id) ON DELETE SET NULL,
  business_id         uuid NOT NULL,
  env_id              uuid,
  actor               text NOT NULL DEFAULT 'anonymous',

  event_type          text NOT NULL,                   -- thread_load, suggestion_click, confirmation_outcome, processing_stuck, etc.
  event_data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  surface             text,                            -- drawer, workspace, mobile_nav
  lane                text,                            -- contextual, general

  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_ui_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ai_ui_events_tenant_isolation ON ai_ui_events
    USING (business_id = current_setting('app.current_business_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ai_ui_events_business
  ON ai_ui_events (business_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_ui_events_conversation
  ON ai_ui_events (conversation_id, created_at DESC);

COMMENT ON TABLE ai_ui_events IS 'Frontend interaction telemetry for Winston companion surfaces. Owned by ai-copilot.';


-- ── ai_skill_candidates: emerging skill patterns from user behavior ──
CREATE TABLE IF NOT EXISTS ai_skill_candidates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid,

  pattern_type        text NOT NULL,                   -- repeated_prompt, repeated_toolchain, repeated_failure, confirmation_pattern
  pattern_signature   text NOT NULL,                   -- hash or normalized form of the pattern
  sample_prompts      jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_tool_chains  jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurrence_count    int NOT NULL DEFAULT 1,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),

  -- Promotion tracking
  promoted            boolean NOT NULL DEFAULT false,
  promoted_skill_id   text,
  notes               text,

  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_skill_candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ai_skill_candidates_tenant_isolation ON ai_skill_candidates
    USING (business_id = current_setting('app.current_business_id', true)::uuid
           OR business_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skill_candidates_signature
  ON ai_skill_candidates (pattern_signature);

CREATE INDEX IF NOT EXISTS idx_ai_skill_candidates_pattern
  ON ai_skill_candidates (pattern_type, occurrence_count DESC);

COMMENT ON TABLE ai_skill_candidates IS 'Emerging skill patterns mined from repeated user prompts, toolchains, and failures. Owned by ai-copilot.';


-- ── ai_audit_findings: nightly audit job output ─────────────────────
CREATE TABLE IF NOT EXISTS ai_audit_findings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid,
  audit_run_id        uuid NOT NULL,                   -- groups findings from one audit run
  audit_run_at        timestamptz NOT NULL DEFAULT now(),

  finding_type        text NOT NULL,                   -- unresolved_confirmation, missed_confirmation, processing_stuck, repeated_tool_failure, repeated_missing_param, latency_outlier, skill_candidate
  severity            text NOT NULL DEFAULT 'info'
                      CHECK (severity IN ('info', 'warning', 'critical')),
  title               text NOT NULL,
  detail              jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Affected entities
  conversation_id     uuid,
  pending_action_id   uuid,
  tool_name           text,
  lane                text,

  -- Metrics
  count               int,
  p50_ms              int,
  p95_ms              int,

  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_audit_findings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ai_audit_findings_tenant_isolation ON ai_audit_findings
    USING (business_id = current_setting('app.current_business_id', true)::uuid
           OR business_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ai_audit_findings_run
  ON ai_audit_findings (audit_run_id, finding_type);

CREATE INDEX IF NOT EXISTS idx_ai_audit_findings_type
  ON ai_audit_findings (finding_type, severity, created_at DESC);

COMMENT ON TABLE ai_audit_findings IS 'Nightly audit findings: unresolved confirmations, stuck processing, latency outliers, skill candidates. Owned by ai-copilot.';
