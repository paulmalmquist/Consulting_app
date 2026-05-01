-- 475_inv_positions.sql
-- Winston Investment Engine — Phase 1 of 7 — Positions (lots + reliefs).
--
-- Per ADR 001:
--   * Lots are immutable rows in inv_position_lot (open_qty_initial never updated).
--   * Closes are recorded as separate rows in inv_position_lot_relief.
--   * Current open quantity is derived via inv_position_current view.
--   * Spec-ID requires explicit selected_lot_ids on the relief side (enforced in service layer + checked here).
--   * FIFO selection is deterministic — service layer orders by (open_event_date ASC, lot_id ASC).
--
-- Per ADR 002: cost basis stored in native currency with fx_rate_id_at_open reference.
-- Per ADR 003: open_event_date is the business effective date.
--
-- Trigger: block_lot_relief_overdraw raises if a relief would push lot's net qty below zero.
--
-- Idempotent. Depends on 474 (inv_account, inv_security, inv_set_updated_at).
-- Foreign key to inv_fx_rate is added in 477; deferred reference here.

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_position_lot — immutable lot opens
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_position_lot (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    account_id              uuid NOT NULL REFERENCES inv_account(id),
    security_id             uuid NOT NULL REFERENCES inv_security(id),
    open_event_id           uuid NOT NULL,                                 -- inv_trade.id (FK declared in 476)
    open_event_date         date NOT NULL,
    open_qty_initial        numeric(28,8) NOT NULL CHECK (open_qty_initial > 0),
    cost_basis_native       numeric(28,8) NOT NULL,                        -- per-unit × qty in native ccy
    cost_basis_currency     char(3) NOT NULL,
    fx_rate_id_at_open      uuid,                                          -- FK to inv_fx_rate added in 477
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Workload: position rollups by account+security; FIFO ordering by open_event_date
CREATE INDEX IF NOT EXISTS idx_inv_lot_account_security_date
    ON inv_position_lot (env_id, account_id, security_id, open_event_date, id);
CREATE INDEX IF NOT EXISTS idx_inv_lot_security
    ON inv_position_lot (env_id, security_id);
CREATE INDEX IF NOT EXISTS idx_inv_lot_open_event
    ON inv_position_lot (env_id, open_event_id);

ALTER TABLE inv_position_lot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_position_lot_env_isolation ON inv_position_lot;
CREATE POLICY inv_position_lot_env_isolation ON inv_position_lot
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_position_lot_updated_at ON inv_position_lot;
CREATE TRIGGER trg_inv_position_lot_updated_at BEFORE UPDATE ON inv_position_lot
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

-- Lot rows are effectively immutable except for cost-basis corrections via the corrects pattern in inv_trade.
-- We do NOT install an immutability trigger here so that operational fixes (typo in metadata, etc.)
-- remain possible — but open_qty_initial edits should be blocked.
CREATE OR REPLACE FUNCTION inv_block_lot_qty_edit() RETURNS trigger AS $$
BEGIN
    IF NEW.open_qty_initial IS DISTINCT FROM OLD.open_qty_initial THEN
        RAISE EXCEPTION 'inv_position_lot: open_qty_initial is immutable (id=%)', OLD.id;
    END IF;
    IF NEW.security_id IS DISTINCT FROM OLD.security_id THEN
        RAISE EXCEPTION 'inv_position_lot: security_id is immutable (id=%)', OLD.id;
    END IF;
    IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
        RAISE EXCEPTION 'inv_position_lot: account_id is immutable (id=%)', OLD.id;
    END IF;
    IF NEW.open_event_date IS DISTINCT FROM OLD.open_event_date THEN
        RAISE EXCEPTION 'inv_position_lot: open_event_date is immutable (id=%)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inv_position_lot_block_qty_edit ON inv_position_lot;
CREATE TRIGGER trg_inv_position_lot_block_qty_edit BEFORE UPDATE ON inv_position_lot
    FOR EACH ROW EXECUTE FUNCTION inv_block_lot_qty_edit();

COMMENT ON TABLE inv_position_lot IS
    'Investment Engine: immutable lot opens (ADR 001). One row per buy / transfer-in. open_qty_initial constant for the row''s lifetime. Reliefs recorded in inv_position_lot_relief. Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_position_lot_relief — close events
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_position_lot_relief (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                      text NOT NULL,
    business_id                 uuid NOT NULL,
    lot_id                      uuid NOT NULL REFERENCES inv_position_lot(id),
    qty_relieved                numeric(28,8) NOT NULL CHECK (qty_relieved > 0),
    relief_event_id             uuid NOT NULL,                              -- inv_trade.id (FK declared in 476)
    relief_event_date           date NOT NULL,
    relief_method               text NOT NULL CHECK (relief_method IN ('fifo','spec_id')),
    realized_pnl_native         numeric(28,8) NOT NULL,
    realized_pnl_currency       char(3) NOT NULL,
    fx_rate_id_at_relief        uuid,                                       -- FK to inv_fx_rate added in 477
    voided_by_id                uuid REFERENCES inv_position_lot_relief(id),
    void_reason                 text,
    metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_relief_lot
    ON inv_position_lot_relief (env_id, lot_id) WHERE voided_by_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_relief_date
    ON inv_position_lot_relief (env_id, relief_event_date);
CREATE INDEX IF NOT EXISTS idx_inv_relief_event
    ON inv_position_lot_relief (env_id, relief_event_id);

ALTER TABLE inv_position_lot_relief ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_relief_env_isolation ON inv_position_lot_relief;
CREATE POLICY inv_relief_env_isolation ON inv_position_lot_relief
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_relief_updated_at ON inv_position_lot_relief;
CREATE TRIGGER trg_inv_relief_updated_at BEFORE UPDATE ON inv_position_lot_relief
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

-- Overdraw guard: a relief cannot exceed the lot's remaining open_qty (sum of non-voided prior reliefs).
CREATE OR REPLACE FUNCTION inv_block_lot_relief_overdraw() RETURNS trigger AS $$
DECLARE
    v_open_qty_initial  numeric(28,8);
    v_already_relieved  numeric(28,8);
BEGIN
    SELECT open_qty_initial INTO v_open_qty_initial
        FROM inv_position_lot WHERE id = NEW.lot_id;
    IF v_open_qty_initial IS NULL THEN
        RAISE EXCEPTION 'inv_position_lot_relief: lot_id=% not found', NEW.lot_id;
    END IF;
    SELECT COALESCE(SUM(qty_relieved), 0) INTO v_already_relieved
        FROM inv_position_lot_relief
        WHERE lot_id = NEW.lot_id
          AND voided_by_id IS NULL
          AND id IS DISTINCT FROM NEW.id;  -- exclude self on UPDATE
    IF v_already_relieved + NEW.qty_relieved > v_open_qty_initial THEN
        RAISE EXCEPTION 'inv_position_lot_relief: overdraw on lot=% (open=%, already_relieved=%, attempted=%)',
            NEW.lot_id, v_open_qty_initial, v_already_relieved, NEW.qty_relieved;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inv_relief_block_overdraw ON inv_position_lot_relief;
CREATE TRIGGER trg_inv_relief_block_overdraw BEFORE INSERT OR UPDATE ON inv_position_lot_relief
    FOR EACH ROW EXECUTE FUNCTION inv_block_lot_relief_overdraw();

COMMENT ON TABLE inv_position_lot_relief IS
    'Investment Engine: lot close events (ADR 001). One row per partial or full relief of a lot. relief_method records FIFO vs spec_id selection. voided_by_id supports correction without mutation. Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_position_current — derived current state (regular view in V1)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW inv_position_current AS
SELECT
    l.env_id,
    l.business_id,
    l.account_id,
    l.security_id,
    SUM(l.open_qty_initial)
        - COALESCE(SUM(r.qty_relieved) FILTER (WHERE r.voided_by_id IS NULL), 0)
        AS open_qty,
    SUM(l.cost_basis_native)
        AS gross_cost_basis_native,        -- gross of reliefs; service layer computes cost remaining
    MIN(l.open_event_date)                  AS earliest_open_date,
    MAX(l.open_event_date)                  AS latest_open_date,
    COUNT(DISTINCT l.id)                    AS lot_count
FROM inv_position_lot l
LEFT JOIN inv_position_lot_relief r ON r.lot_id = l.id
GROUP BY l.env_id, l.business_id, l.account_id, l.security_id;

COMMENT ON VIEW inv_position_current IS
    'Investment Engine: derived current state per (account, security). Computed from inv_position_lot ⨝ inv_position_lot_relief. V1 ships as a regular view; promote to materialized view if read load demands.';
