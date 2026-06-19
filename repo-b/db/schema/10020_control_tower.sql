-- 10020_control_tower.sql
-- Test Telemetry Go/No-Go Control Tower (MVP vertical slice).
--
-- Composes existing pieces (telemetry verdict + ai_dispatch router + governance audit) into a single
-- governed flow: telemetry verdict -> sensitivity-routed triage -> ENFORCED human go/no-go gate ->
-- Ed25519-signed, hash-chained decision receipt. Plus a Gemma private-tier lifecycle state/job model so
-- the self-hosted (in-boundary) inference tier can be warmed before a demo and torn down after without
-- leaving a GPU billing overnight.
--
-- Tables use the approved `tel_` prefix (Telemetry Platform module) per ARCHITECTURE.md — `ct` is only a
-- sub-namespace within `tel_`. Full RLS + env_id required, matching the other tel_* tables. The backend
-- role bypasses RLS and enforces tenant scope in application SQL (every query filters env_id+business_id);
-- the RLS policies are defense-in-depth for any direct DB client. NASA/public analog data only.
-- Owning module: Telemetry Platform (backend/app/services/control_tower/).

-- ── tel_ct_decision ──────────────────────────────────────────────────────────
-- One row per orchestration run. Holds the verdict, the routing decision, and the human-gate state.
CREATE TABLE IF NOT EXISTS tel_ct_decision (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id             text NOT NULL,
    business_id        uuid NOT NULL,
    run_key            text NOT NULL,
    channel_name       text NOT NULL,
    -- Verdict (from telemetry_serving.score_window): GO | REVIEW | NO_GO | NOT_AVAILABLE
    verdict            text NOT NULL,
    anomaly_score      double precision,
    threshold          double precision,
    -- Soft reference to tel_predictions.id (the persisted verdict receipt). Not an FK to avoid
    -- migration-order coupling, consistent with the other tel_* cross-references.
    tel_prediction_id  uuid,
    -- Sensitivity-routed triage trace (component 1).
    triage_summary     text,
    privacy            text,                              -- sensitive | internal | public (tier requested)
    itar_tagged        boolean NOT NULL DEFAULT false,    -- demo flag; an ITAR-AWARE posture, not a compliance claim
    dispatch_request_id text,
    dispatch_provider  text,                              -- openai | anthropic | gemma_gcp | null
    dispatch_model     text,
    dispatch_status    text,                              -- success | degraded | blocked | unavailable
    routing_reason     text,
    routing_rejected   jsonb NOT NULL DEFAULT '{}'::jsonb,-- {provider: reason} — why each provider lost
    triage_cost_usd    double precision,                  -- per-token cost estimate (0 for self-hosted Gemma)
    -- Gate state machine. GO short-circuits to auto_pass (no human gate); REVIEW/NO_GO open the gate.
    status             text NOT NULL DEFAULT 'pending_approval',
        -- pending_approval | approved | rejected | needs_more_evidence | expired | failed | auto_pass
    human_decision     text,                              -- approve | reject | request_more_evidence
    human_rationale    text,
    requested_evidence text,                              -- set when human_decision = request_more_evidence
    resolved_by        text,
    resolved_at        timestamptz,
    signed_receipt_id  uuid,                              -- -> tel_ct_receipt.id (set on approve/reject)
    expires_at         timestamptz,                       -- TTL for abandoned pending_approval rows
    created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tel_ct_decision ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_ct_decision_tenant ON tel_ct_decision
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_tel_ct_decision_env_created
    ON tel_ct_decision (env_id, business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tel_ct_decision_env_status
    ON tel_ct_decision (env_id, business_id, status);
COMMENT ON TABLE tel_ct_decision IS
  'Telemetry Control Tower: one row per go/no-go orchestration run — verdict, sensitivity-routing decision (provider + rejected map), and the enforced human-gate state (approve/reject/request_more_evidence). Owning module: Telemetry Platform / control_tower.';

-- ── tel_ct_receipt ───────────────────────────────────────────────────────────
-- Ed25519-signed, SHA-256 hash-chained decision receipt. One per resolved (approve/reject) decision.
-- chain_seq + UNIQUE(env_id, chain_seq) is the hard backstop against parallel chain forks; the writer
-- additionally takes a pg_advisory_xact_lock on the env so two receipts cannot read the same chain head.
CREATE TABLE IF NOT EXISTS tel_ct_receipt (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id            text NOT NULL,
    business_id       uuid NOT NULL,
    decision_id       uuid NOT NULL,                      -- -> tel_ct_decision.id
    chain_seq         bigint NOT NULL,                    -- 1-based per-env monotonic sequence
    prev_receipt_hash text,                               -- payload_hash of chain_seq-1 (null for genesis)
    payload_hash      text NOT NULL,                      -- sha256 hex over payload_canonical
    payload           jsonb NOT NULL,                     -- receipt payload (for display / inspection)
    payload_canonical text NOT NULL,                      -- exact canonical JSON string that was signed
                                                          --   (avoids any jsonb float round-trip drift)
    signature         text NOT NULL,                      -- hex ed25519 signature over payload_canonical bytes
    public_key_id     text NOT NULL,                      -- pinned-key fingerprint (sha256 of pubkey, 16 hex)
    algo              text NOT NULL DEFAULT 'ed25519',
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, chain_seq)
);
ALTER TABLE tel_ct_receipt ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_ct_receipt_tenant ON tel_ct_receipt
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_tel_ct_receipt_env_seq
    ON tel_ct_receipt (env_id, business_id, chain_seq);
CREATE INDEX IF NOT EXISTS idx_tel_ct_receipt_decision
    ON tel_ct_receipt (decision_id);
COMMENT ON TABLE tel_ct_receipt IS
  'Telemetry Control Tower: tamper-evident go/no-go decision receipts — Ed25519-signed and SHA-256 hash-chained per env (chain_seq, prev_receipt_hash). Signed server-side outside the agent trust boundary. Owning module: Telemetry Platform / control_tower.';

-- ── tel_ct_gemma_state ───────────────────────────────────────────────────────
-- Singleton-per-(env,business) cache of the Gemma private-tier lifecycle. Vertex deployedModels is the
-- source of truth for billing state; this row holds the polled status, timestamps, and the idle timer.
CREATE TABLE IF NOT EXISTS tel_ct_gemma_state (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id               text NOT NULL,
    business_id          uuid NOT NULL,
    status               text NOT NULL DEFAULT 'cold',
        -- cold | warming_requested | warming | live | teardown_requested | tearing_down
        -- | torn_down | failed | unavailable
    endpoint_id          text,
    dedicated_dns        text,
    region               text,
    project_id           text,
    model_id             text,
    active_job_id        uuid,                             -- -> tel_ct_gemma_job.id (in-flight job)
    deployed_model_count integer NOT NULL DEFAULT 0,       -- from Vertex endpoint.deployedModels (truth)
    teardown_verification text,                            -- pending | verified | failed
    est_active_cost_usd  double precision NOT NULL DEFAULT 0,
    last_warmed_at       timestamptz,
    last_teardown_at     timestamptz,
    last_probe_at        timestamptz,
    idle_since           timestamptz,
    last_error           text,
    updated_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id)
);
ALTER TABLE tel_ct_gemma_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_ct_gemma_state_tenant ON tel_ct_gemma_state
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_ct_gemma_state IS
  'Telemetry Control Tower: cached Gemma-on-Vertex private-tier lifecycle state (cold/warming/live/torn_down/...). Vertex endpoint.deployedModels is authoritative for billing; this is the polled view + idle timer. Owning module: Telemetry Platform / control_tower.';

-- ── tel_ct_gemma_job ─────────────────────────────────────────────────────────
-- Async lifecycle jobs. Warm/teardown create a job and return immediately; the UI polls. The background
-- worker (operator-sweep/lifespan pattern) advances status. Never run 6-20 min Vertex work inline.
CREATE TABLE IF NOT EXISTS tel_ct_gemma_job (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id        text NOT NULL,
    business_id   uuid NOT NULL,
    action        text NOT NULL,                          -- warm | teardown
    status        text NOT NULL DEFAULT 'queued',         -- queued | running | succeeded | failed
    requested_by  text,
    detail        jsonb NOT NULL DEFAULT '{}'::jsonb,      -- progress log / result summary (redacted)
    error         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tel_ct_gemma_job ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_ct_gemma_job_tenant ON tel_ct_gemma_job
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_tel_ct_gemma_job_env_created
    ON tel_ct_gemma_job (env_id, business_id, created_at DESC);
COMMENT ON TABLE tel_ct_gemma_job IS
  'Telemetry Control Tower: async Gemma-on-Vertex lifecycle jobs (warm/teardown) so long Vertex calls never block a request path; the UI polls job status. Owning module: Telemetry Platform / control_tower.';

-- ── verification ───────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_tables
      WHERE schemaname='public'
        AND tablename IN ('tel_ct_decision','tel_ct_receipt','tel_ct_gemma_state','tel_ct_gemma_job')
        AND rowsecurity = true;
    RAISE NOTICE 'control tower tables with RLS: %', n;
    IF n < 4 THEN RAISE EXCEPTION 'control tower migration incomplete: % of 4', n; END IF;
END $$;
