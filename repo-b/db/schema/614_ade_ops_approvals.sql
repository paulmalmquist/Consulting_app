-- =============================================================================
-- 614_ade_ops_approvals.sql
-- ADE Ops PR 5A — Approval Escrow + Execution Preflight.
--
-- The durable escrow for the ADE Ops approval/execution-control spine. A row is
-- created when an AdeOpsRecommendation (PR 4) is escrowed for human approval;
-- it carries the approval token + TTL, the human approval state, and the latest
-- preflight result. PR 5A NEVER executes a provider write: `executed` is always
-- false here and there is no provider-write path. PR 5B adds simulated execution;
-- PR 5C adds one real, fully-gated provider write.
-- Owning module: app.services.ade_ops.approvals.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ade_ops_approvals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,

    -- Link back to the PR 4 recommendation artifact this escrow governs.
    recommendation_id   text NOT NULL,
    command_name        text NOT NULL,
    category            text,
    provider            text,
    target_ref          text,
    target_type         text,
    risk_tier           int NOT NULL DEFAULT 1,

    -- Approval escrow: opaque token + TTL + human state.
    approval_token      text NOT NULL,
    state               text NOT NULL DEFAULT 'pending'
                            CHECK (state IN ('pending','approved','expired','blocked')),
    requested_by        text,
    approver            text,           -- human actor who approved
    approved_at         timestamptz,
    expires_at          timestamptz NOT NULL,

    -- Preflight: required-evidence gate. Execution stays blocked unless passed.
    rollback_plan       text,
    observation_window  text,
    preflight_passed    boolean NOT NULL DEFAULT false,
    preflight_missing   jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Hard invariant for PR 5A: nothing executes here.
    executed            boolean NOT NULL DEFAULT false,
    null_reason         text,
    evidence            jsonb NOT NULL DEFAULT '[]'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    -- PR 5A guard at the schema level: this table cannot record an execution.
    CONSTRAINT ade_ops_approvals_no_execution_pr5a CHECK (executed = false)
);

COMMENT ON TABLE ade_ops_approvals IS
    'ADE Ops approval escrow (PR 5A): human approval state + TTL + preflight result for a PR-4 recommendation artifact. No provider write executes from this layer in PR 5A (executed is forced false by CHECK). Owning module: app.services.ade_ops.approvals.';

CREATE INDEX IF NOT EXISTS idx_ade_ops_approvals_env_state
    ON ade_ops_approvals (env_id, business_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ade_ops_approvals_recommendation
    ON ade_ops_approvals (env_id, business_id, recommendation_id);

ALTER TABLE ade_ops_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ade_ops_approvals_tenant_isolation ON ade_ops_approvals;
CREATE POLICY ade_ops_approvals_tenant_isolation ON ade_ops_approvals
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );
