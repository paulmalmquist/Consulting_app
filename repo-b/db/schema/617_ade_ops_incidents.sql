-- =============================================================================
-- 617_ade_ops_incidents.sql
-- ADE Ops PR 6B — Incident state machine.
--
-- Governed incident records created from a watcher's degraded / rollback_recommended
-- verdict (PR 6A) or any failed/stale ADE Ops outcome. An incident links to the
-- execution receipt / recommendation / approval / target / evidence, moves through
-- a validated state machine, and CANNOT close without a resolution note + evidence
-- (no silent close). Every transition is receipted. No automatic provider rollback,
-- no production mutation — incidents are records + remediation artifacts only.
-- Owning module: app.services.ade_ops.incidents.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ade_ops_incidents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,

    -- Linkage back to what triggered the incident.
    approval_id         uuid,            -- FK-ish to ade_ops_approvals (nullable; soft link)
    source_verdict      text,            -- the watcher verdict that opened it (degraded|rollback_recommended|…)
    provider            text,
    target_ref          text,
    recommendation_id   text,

    title               text NOT NULL,
    severity            text NOT NULL DEFAULT 'medium'
                            CHECK (severity IN ('low','medium','high','critical')),
    state               text NOT NULL DEFAULT 'detected'
                            CHECK (state IN ('detected','triaged','owner_notified',
                                             'mitigation_planned','resolved','closed')),
    owner               text,
    mitigation_plan     text,
    resolution_note     text,            -- required to reach resolved/closed
    evidence            jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- No silent close: a closed incident must carry a resolution note + evidence.
    CONSTRAINT ade_ops_incidents_close_requires_resolution
        CHECK (state <> 'closed' OR (resolution_note IS NOT NULL AND jsonb_array_length(evidence) > 0)),

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    resolved_at         timestamptz,
    closed_at           timestamptz
);

COMMENT ON TABLE ade_ops_incidents IS
    'ADE Ops incident records (PR 6B): governed state machine over failed/stale/degraded/rollback_recommended outcomes. Links to approval/recommendation/target/evidence; no auto provider rollback; close requires a resolution note + evidence (enforced by CHECK). Owning module: app.services.ade_ops.incidents.';

CREATE INDEX IF NOT EXISTS idx_ade_ops_incidents_env_state
    ON ade_ops_incidents (env_id, business_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ade_ops_incidents_approval
    ON ade_ops_incidents (env_id, business_id, approval_id);

ALTER TABLE ade_ops_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ade_ops_incidents_tenant_isolation ON ade_ops_incidents;
CREATE POLICY ade_ops_incidents_tenant_isolation ON ade_ops_incidents
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );
