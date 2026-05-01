-- 479_inv_reconciliation.sql
-- Winston Investment Engine — Phase 1 of 7 — Reconciliation.
--
-- Three tables: inv_reconciliation_run, inv_source_position, inv_reconciliation_break.
--
-- Per project instructions: "No inline resolution. Only detection and storage."
--   * Breaks are append-only on load-bearing fields (only resolution metadata is mutable).
--   * Multiple sources are stored side by side (inv_source_position) so the comparator
--     can re-run without re-fetching.
--
-- Break types covered (CHECK constraint):
--   quantity_mismatch | price_mismatch | missing_in_a | missing_in_b | stale_data | identifier_unmapped
--
-- Idempotent. Depends on 474 (inv_fund, inv_account, inv_security).

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_reconciliation_run — header for one reconciliation pass
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_reconciliation_run (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    fund_id             uuid NOT NULL REFERENCES inv_fund(id),
    effective_date      date NOT NULL,                                    -- which business date is being reconciled
    source_a            text NOT NULL,
    source_b            text NOT NULL,
    started_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz,
    status              text NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','failed')),
    breaks_count        integer NOT NULL DEFAULT 0,
    initiated_by        text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (source_a <> source_b)
);

CREATE INDEX IF NOT EXISTS idx_inv_recon_run_fund_date
    ON inv_reconciliation_run (env_id, fund_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_recon_run_status
    ON inv_reconciliation_run (env_id, status, started_at DESC);

ALTER TABLE inv_reconciliation_run ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_recon_run_env_isolation ON inv_reconciliation_run;
CREATE POLICY inv_recon_run_env_isolation ON inv_reconciliation_run
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_recon_run_updated_at ON inv_reconciliation_run;
CREATE TRIGGER trg_inv_recon_run_updated_at BEFORE UPDATE ON inv_reconciliation_run
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_reconciliation_run IS
    'Investment Engine: header row for one reconciliation pass over (fund, effective_date, source_a, source_b). breaks_count denormalized for fast UI. Owned by reconciliation module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_source_position — positions as reported by an external source for a given run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_source_position (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                      text NOT NULL,
    business_id                 uuid NOT NULL,
    run_id                      uuid NOT NULL REFERENCES inv_reconciliation_run(id),
    source                      text NOT NULL,
    external_account_number     text,
    security_identifier         text NOT NULL,                            -- ticker / cusip / isin as supplied
    identifier_type             text CHECK (identifier_type IN ('ticker','cusip','isin','figi','custom')),
    qty                         numeric(28,8),
    market_value_native         numeric(28,8),
    currency                    char(3),
    as_reported_at              timestamptz,
    raw_payload                 jsonb NOT NULL,                           -- original source row preserved
    -- Resolved IDs (nullable; populated when mapping succeeds)
    resolved_account_id         uuid REFERENCES inv_account(id),
    resolved_security_id        uuid REFERENCES inv_security(id),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_source_pos_run
    ON inv_source_position (env_id, run_id, source);
CREATE INDEX IF NOT EXISTS idx_inv_source_pos_resolved
    ON inv_source_position (env_id, resolved_account_id, resolved_security_id)
    WHERE resolved_account_id IS NOT NULL;

ALTER TABLE inv_source_position ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_source_pos_env_isolation ON inv_source_position;
CREATE POLICY inv_source_pos_env_isolation ON inv_source_position
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_source_pos_updated_at ON inv_source_position;
CREATE TRIGGER trg_inv_source_pos_updated_at BEFORE UPDATE ON inv_source_position
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_source_position IS
    'Investment Engine: positions as reported by external sources for a reconciliation run. raw_payload preserves the source row verbatim (provenance). resolved_account_id / resolved_security_id populated when identifier mapping succeeds. Owned by reconciliation module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_reconciliation_break — break records, append-only on load-bearing fields
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_reconciliation_break (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    run_id              uuid NOT NULL REFERENCES inv_reconciliation_run(id),
    break_type          text NOT NULL CHECK (break_type IN (
                            'quantity_mismatch','price_mismatch',
                            'missing_in_a','missing_in_b',
                            'stale_data','identifier_unmapped')),
    severity            text NOT NULL DEFAULT 'medium'
                        CHECK (severity IN ('low','medium','high','critical')),
    account_id          uuid REFERENCES inv_account(id),                  -- nullable when account itself is the break
    security_id         uuid REFERENCES inv_security(id),                 -- nullable when security is unmapped
    source_a_value      jsonb,                                            -- disputed value from source A
    source_b_value      jsonb,                                            -- disputed value from source B
    evidence            jsonb NOT NULL DEFAULT '{}'::jsonb,               -- run-time context (rows compared, tolerances)
    -- Resolution metadata (mutable; everything else immutable after insert)
    resolved_at         timestamptz,
    resolved_by         text,
    resolution_note     text,
    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_break_run
    ON inv_reconciliation_break (env_id, run_id);
CREATE INDEX IF NOT EXISTS idx_inv_break_unresolved
    ON inv_reconciliation_break (env_id, severity, break_type)
    WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_break_account_security
    ON inv_reconciliation_break (env_id, account_id, security_id)
    WHERE account_id IS NOT NULL OR security_id IS NOT NULL;

ALTER TABLE inv_reconciliation_break ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_break_env_isolation ON inv_reconciliation_break;
CREATE POLICY inv_break_env_isolation ON inv_reconciliation_break
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_break_updated_at ON inv_reconciliation_break;
CREATE TRIGGER trg_inv_break_updated_at BEFORE UPDATE ON inv_reconciliation_break
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

-- Block edits to load-bearing fields. Only resolution metadata is mutable.
CREATE OR REPLACE FUNCTION inv_block_break_field_edit() RETURNS trigger AS $$
BEGIN
    IF NEW.run_id          IS DISTINCT FROM OLD.run_id          OR
       NEW.break_type      IS DISTINCT FROM OLD.break_type      OR
       NEW.account_id      IS DISTINCT FROM OLD.account_id      OR
       NEW.security_id     IS DISTINCT FROM OLD.security_id     OR
       NEW.source_a_value  IS DISTINCT FROM OLD.source_a_value  OR
       NEW.source_b_value  IS DISTINCT FROM OLD.source_b_value  OR
       NEW.evidence        IS DISTINCT FROM OLD.evidence THEN
        RAISE EXCEPTION 'inv_reconciliation_break: load-bearing fields are immutable (id=%); only resolution metadata may be edited', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inv_break_block_field_edit ON inv_reconciliation_break;
CREATE TRIGGER trg_inv_break_block_field_edit BEFORE UPDATE ON inv_reconciliation_break
    FOR EACH ROW EXECUTE FUNCTION inv_block_break_field_edit();

COMMENT ON TABLE inv_reconciliation_break IS
    'Investment Engine: break records from a reconciliation run. Detection-only; no inline resolution per project instructions. Load-bearing fields immutable; only resolved_at/resolved_by/resolution_note are editable. Owned by reconciliation module.';
