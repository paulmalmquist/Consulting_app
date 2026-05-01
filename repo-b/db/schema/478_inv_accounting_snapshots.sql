-- 478_inv_accounting_snapshots.sql
-- Winston Investment Engine — Phase 1 of 7 — Accounting Snapshots.
--
-- Three snapshot tables: inv_nav_snapshot, inv_pnl_snapshot, inv_position_valuation.
-- All three follow the snapshot shape defined by skills/winston-investment-snapshot:
--   universal cols (id, env_id, business_id, created_at, updated_at)
--   + bi-temporal cols (effective_date, as_of_date)
--   + lifecycle cols (status, version, superseded_by_id, superseded_reason)
--   + reproducibility col (input_versions jsonb, ADR 003)
--   + provenance cols (produced_by, produced_at)
--   + payload (table-specific)
--   + indexes: partial unique on released, "as of" composite, status filter
--   + immutability trigger inv_block_released_mutation (defined in 474)
--
-- Per project instructions:
--   nav_snapshots includes fund_id, period_end_date, nav, total_assets, total_liabilities, status
--   UNIQUE (fund_id, period_end_date, status='released')
-- We map period_end_date → effective_date and treat fund_id as entity_id with entity_type='fund'.
--
-- Per ADR 002: every translated monetary value carries the fx_rate_id used.
--
-- Idempotent. Depends on 474–477.

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_nav_snapshot — fund-level NAV
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_nav_snapshot (
    -- Identity
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                      text NOT NULL,
    business_id                 uuid NOT NULL,
    -- Bi-temporal (ADR 003)
    entity_type                 text NOT NULL DEFAULT 'fund' CHECK (entity_type = 'fund'),
    entity_id                   uuid NOT NULL REFERENCES inv_fund(id),
    effective_date              date NOT NULL,                            -- period_end_date
    as_of_date                  timestamptz NOT NULL,
    -- Lifecycle
    status                      text NOT NULL CHECK (status IN ('draft','locked','released','superseded')),
    version                     integer NOT NULL CHECK (version > 0),
    superseded_by_id            uuid REFERENCES inv_nav_snapshot(id),
    superseded_reason           text,
    -- Reproducibility
    input_versions              jsonb NOT NULL,
    -- Provenance
    produced_by                 text NOT NULL,
    produced_at                 timestamptz NOT NULL DEFAULT now(),
    -- Payload (native + fx_rate_id per ADR 002)
    total_assets_native         numeric(28,8),
    total_assets_currency       char(3),
    total_assets_fx_rate_id     uuid REFERENCES inv_fx_rate(id),
    total_liabilities_native    numeric(28,8),
    total_liabilities_currency  char(3),
    total_liabilities_fx_rate_id uuid REFERENCES inv_fx_rate(id),
    nav_native                  numeric(28,8),
    nav_currency                char(3),
    nav_base                    numeric(28,8),                            -- translated to fund.base_currency
    nav_base_fx_rate_id         uuid REFERENCES inv_fx_rate(id),
    share_count                 numeric(28,8),
    nav_per_share               numeric(28,8),
    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Snapshot skill required indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_nav_released_unique
    ON inv_nav_snapshot (entity_id, effective_date)
    WHERE status = 'released';
CREATE INDEX IF NOT EXISTS idx_inv_nav_as_of
    ON inv_nav_snapshot (env_id, entity_id, effective_date, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_nav_status_period
    ON inv_nav_snapshot (env_id, status, effective_date);

ALTER TABLE inv_nav_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_nav_env_isolation ON inv_nav_snapshot;
CREATE POLICY inv_nav_env_isolation ON inv_nav_snapshot
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_nav_updated_at ON inv_nav_snapshot;
CREATE TRIGGER trg_inv_nav_updated_at BEFORE UPDATE ON inv_nav_snapshot
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

DROP TRIGGER IF EXISTS trg_inv_nav_block_released ON inv_nav_snapshot;
CREATE TRIGGER trg_inv_nav_block_released BEFORE UPDATE OR DELETE ON inv_nav_snapshot
    FOR EACH ROW EXECUTE FUNCTION inv_block_released_mutation();

COMMENT ON TABLE inv_nav_snapshot IS
    'Investment Engine: authoritative fund NAV (skills/winston-investment-snapshot). Bi-temporal (ADR 003). Released rows immutable except for transition to superseded. Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_pnl_snapshot — fund-level P&L for a period
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_pnl_snapshot (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                      text NOT NULL,
    business_id                 uuid NOT NULL,
    entity_type                 text NOT NULL DEFAULT 'fund' CHECK (entity_type = 'fund'),
    entity_id                   uuid NOT NULL REFERENCES inv_fund(id),
    effective_date              date NOT NULL,                            -- period end
    period_start_date           date NOT NULL,
    as_of_date                  timestamptz NOT NULL,
    status                      text NOT NULL CHECK (status IN ('draft','locked','released','superseded')),
    version                     integer NOT NULL CHECK (version > 0),
    superseded_by_id            uuid REFERENCES inv_pnl_snapshot(id),
    superseded_reason           text,
    input_versions              jsonb NOT NULL,
    produced_by                 text NOT NULL,
    produced_at                 timestamptz NOT NULL DEFAULT now(),
    -- Payload
    realized_pnl_native         numeric(28,8),
    unrealized_pnl_native       numeric(28,8),
    fx_pnl_native               numeric(28,8),
    income_native               numeric(28,8),                            -- dividends + interest + accrual
    fees_native                 numeric(28,8),
    total_pnl_native            numeric(28,8),
    pnl_currency                char(3),
    total_pnl_base              numeric(28,8),                            -- translated to fund.base_currency
    pnl_base_fx_rate_id         uuid REFERENCES inv_fx_rate(id),
    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CHECK (period_start_date <= effective_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_pnl_released_unique
    ON inv_pnl_snapshot (entity_id, effective_date, period_start_date)
    WHERE status = 'released';
CREATE INDEX IF NOT EXISTS idx_inv_pnl_as_of
    ON inv_pnl_snapshot (env_id, entity_id, effective_date, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_pnl_status_period
    ON inv_pnl_snapshot (env_id, status, effective_date);

ALTER TABLE inv_pnl_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_pnl_env_isolation ON inv_pnl_snapshot;
CREATE POLICY inv_pnl_env_isolation ON inv_pnl_snapshot
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_pnl_updated_at ON inv_pnl_snapshot;
CREATE TRIGGER trg_inv_pnl_updated_at BEFORE UPDATE ON inv_pnl_snapshot
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

DROP TRIGGER IF EXISTS trg_inv_pnl_block_released ON inv_pnl_snapshot;
CREATE TRIGGER trg_inv_pnl_block_released BEFORE UPDATE OR DELETE ON inv_pnl_snapshot
    FOR EACH ROW EXECUTE FUNCTION inv_block_released_mutation();

COMMENT ON TABLE inv_pnl_snapshot IS
    'Investment Engine: authoritative fund P&L for a period (period_start_date → effective_date). Realized + unrealized + FX + income + fees. Bi-temporal. Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_position_valuation — per-position snapshot
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_position_valuation (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                      text NOT NULL,
    business_id                 uuid NOT NULL,
    entity_type                 text NOT NULL DEFAULT 'account_position' CHECK (entity_type = 'account_position'),
    entity_id                   uuid NOT NULL,                            -- synthetic; the (account_id, security_id) pair
    effective_date              date NOT NULL,
    as_of_date                  timestamptz NOT NULL,
    status                      text NOT NULL CHECK (status IN ('draft','locked','released','superseded')),
    version                     integer NOT NULL CHECK (version > 0),
    superseded_by_id            uuid REFERENCES inv_position_valuation(id),
    superseded_reason           text,
    input_versions              jsonb NOT NULL,
    produced_by                 text NOT NULL,
    produced_at                 timestamptz NOT NULL DEFAULT now(),
    -- Payload
    account_id                  uuid NOT NULL REFERENCES inv_account(id),
    security_id                 uuid NOT NULL REFERENCES inv_security(id),
    qty                         numeric(28,8) NOT NULL,
    price_native                numeric(28,8) NOT NULL,
    price_currency              char(3) NOT NULL,
    price_id                    uuid REFERENCES inv_security_price(id),
    market_value_native         numeric(28,8),
    market_value_base           numeric(28,8),
    mv_base_fx_rate_id          uuid REFERENCES inv_fx_rate(id),
    cost_basis_native           numeric(28,8),
    unrealized_pnl_native       numeric(28,8),
    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_position_val_released_unique
    ON inv_position_valuation (account_id, security_id, effective_date)
    WHERE status = 'released';
CREATE INDEX IF NOT EXISTS idx_inv_position_val_as_of
    ON inv_position_valuation (env_id, account_id, security_id, effective_date, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_position_val_status_period
    ON inv_position_valuation (env_id, status, effective_date);
CREATE INDEX IF NOT EXISTS idx_inv_position_val_security
    ON inv_position_valuation (env_id, security_id, effective_date) WHERE status = 'released';

ALTER TABLE inv_position_valuation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_position_val_env_isolation ON inv_position_valuation;
CREATE POLICY inv_position_val_env_isolation ON inv_position_valuation
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_position_val_updated_at ON inv_position_valuation;
CREATE TRIGGER trg_inv_position_val_updated_at BEFORE UPDATE ON inv_position_valuation
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

DROP TRIGGER IF EXISTS trg_inv_position_val_block_released ON inv_position_valuation;
CREATE TRIGGER trg_inv_position_val_block_released BEFORE UPDATE OR DELETE ON inv_position_valuation
    FOR EACH ROW EXECUTE FUNCTION inv_block_released_mutation();

COMMENT ON TABLE inv_position_valuation IS
    'Investment Engine: per-(account, security) position valuation snapshot. Released rows immutable. Sources: inv_position_current (qty), inv_security_price (price), inv_fx_rate (translation). Owned by accounting_engine module.';
