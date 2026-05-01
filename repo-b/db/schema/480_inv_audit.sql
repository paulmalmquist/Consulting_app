-- 480_inv_audit.sql
-- Winston Investment Engine — Phase 1 of 7 — Audit + Lineage.
--
-- Three tables: inv_audit_log, inv_data_version, inv_mutation_event.
--
-- Per project instructions:
--   * audit_log records every mutation with previous_state + new_state, append-only.
--   * data_versions supports input addressing for snapshot reconstruction (ADR 003).
--   * mutation_events is a higher-frequency event stream for state transitions.
--
-- Per the plan doc's risk note: inv_audit_log is partitioned by month on created_at
-- from day one to avoid a painful retrofit at scale. Migration creates the partitioned
-- parent + the current month's partition. A separate cron creates next-month partitions.
--
-- inv_audit_log and inv_mutation_event are both append-only — UPDATE and DELETE blocked
-- via inv_block_append_only() (defined in 474).
--
-- Idempotent. Depends on 474 (shared trigger functions).

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_audit_log — append-only, partitioned by created_at month
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_audit_log (
    id                  uuid NOT NULL DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    entity_type         text NOT NULL,
    entity_id           uuid NOT NULL,
    change_type         text NOT NULL CHECK (change_type IN (
                            'insert','update','delete','release','supersede','void','lock')),
    previous_state      jsonb,                                            -- null on insert
    new_state           jsonb,                                            -- null on delete
    actor               text NOT NULL,                                    -- user id or service identifier
    reason              text,
    correlation_id      text,                                             -- request id for tracing
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)                                          -- partition key must be in PK
) PARTITION BY RANGE (created_at);

-- Default partition for any out-of-range rows (safety net; should be empty).
CREATE TABLE IF NOT EXISTS inv_audit_log_default PARTITION OF inv_audit_log DEFAULT;

-- Current-month partition. Naming convention: inv_audit_log_YYYY_MM.
DO $$
DECLARE
    v_start  date := date_trunc('month', now())::date;
    v_end    date := (date_trunc('month', now()) + interval '1 month')::date;
    v_pname  text := format('inv_audit_log_%s', to_char(v_start, 'YYYY_MM'));
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_pname) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF inv_audit_log FOR VALUES FROM (%L) TO (%L)',
            v_pname, v_start, v_end
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inv_audit_entity
    ON inv_audit_log (env_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_audit_correlation
    ON inv_audit_log (env_id, correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_audit_change_type
    ON inv_audit_log (env_id, change_type, created_at DESC);

ALTER TABLE inv_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_audit_env_isolation ON inv_audit_log;
CREATE POLICY inv_audit_env_isolation ON inv_audit_log
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_audit_append_only ON inv_audit_log;
CREATE TRIGGER trg_inv_audit_append_only BEFORE UPDATE OR DELETE ON inv_audit_log
    FOR EACH ROW EXECUTE FUNCTION inv_block_append_only();

COMMENT ON TABLE inv_audit_log IS
    'Investment Engine: append-only audit log. One row per mutation (insert/update/delete/release/supersede/void/lock). Partitioned by created_at month. RLS-isolated by env_id. Owned by audit module; written by every mutating service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_data_version — input addressing for snapshot reconstruction (ADR 003)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_data_version (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    entity_type         text NOT NULL,                                    -- 'price','fx_rate','lot_relief','trade', etc.
    entity_id           uuid NOT NULL,
    version_token       text NOT NULL,                                    -- usually entity_id, abstract for flexibility
    superseded_by_id    uuid REFERENCES inv_data_version(id),
    effective_from      timestamptz NOT NULL DEFAULT now(),
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_data_version_entity
    ON inv_data_version (env_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_inv_data_version_token
    ON inv_data_version (env_id, version_token);
CREATE INDEX IF NOT EXISTS idx_inv_data_version_current
    ON inv_data_version (env_id, entity_type, entity_id) WHERE superseded_by_id IS NULL;

ALTER TABLE inv_data_version ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_data_version_env_isolation ON inv_data_version;
CREATE POLICY inv_data_version_env_isolation ON inv_data_version
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_data_version_updated_at ON inv_data_version;
CREATE TRIGGER trg_inv_data_version_updated_at BEFORE UPDATE ON inv_data_version
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_data_version IS
    'Investment Engine: explicit input version registry. Used by snapshot reconstruction when an input table doesn''t naturally have a superseded_by_id chain. Most inputs (prices, fx_rates) carry their own supersession; this table is for the rest. Owned by audit module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_mutation_event — higher-frequency state-machine event stream
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_mutation_event (
    id                  uuid NOT NULL DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    entity_type         text NOT NULL,
    entity_id           uuid NOT NULL,
    event_type          text NOT NULL,                                    -- e.g. 'order_approved','snapshot_locked'
    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    correlation_id      text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS inv_mutation_event_default PARTITION OF inv_mutation_event DEFAULT;

DO $$
DECLARE
    v_start  date := date_trunc('month', now())::date;
    v_end    date := (date_trunc('month', now()) + interval '1 month')::date;
    v_pname  text := format('inv_mutation_event_%s', to_char(v_start, 'YYYY_MM'));
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_pname) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF inv_mutation_event FOR VALUES FROM (%L) TO (%L)',
            v_pname, v_start, v_end
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inv_mutation_entity
    ON inv_mutation_event (env_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mutation_event_type
    ON inv_mutation_event (env_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mutation_correlation
    ON inv_mutation_event (env_id, correlation_id) WHERE correlation_id IS NOT NULL;

ALTER TABLE inv_mutation_event ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_mutation_env_isolation ON inv_mutation_event;
CREATE POLICY inv_mutation_env_isolation ON inv_mutation_event
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_mutation_append_only ON inv_mutation_event;
CREATE TRIGGER trg_inv_mutation_append_only BEFORE UPDATE OR DELETE ON inv_mutation_event
    FOR EACH ROW EXECUTE FUNCTION inv_block_append_only();

COMMENT ON TABLE inv_mutation_event IS
    'Investment Engine: append-only event stream for state-machine transitions. Lighter than inv_audit_log (no previous/new state); used for high-frequency events (order lifecycle, snapshot lifecycle). Partitioned by created_at month. Owned by audit module.';
