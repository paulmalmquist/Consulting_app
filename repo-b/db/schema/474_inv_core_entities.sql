-- 474_inv_core_entities.sql
-- Winston Investment Engine — Phase 1 of 7 — Core Entities.
--
-- Creates the entity hierarchy for the investment engine:
--   inv_fund -> inv_portfolio -> inv_account
--   inv_security  (security master)
--   inv_benchmark (index reference for portfolios)
--
-- Also installs three shared trigger functions used by 474–480:
--   inv_set_updated_at()           — bumps updated_at on UPDATE
--   inv_block_released_mutation()  — used by 478 snapshot tables
--   inv_block_append_only()        — used by 480 audit + mutation tables
--
-- ADRs honored:
--   ADR 001 — inv_fund.lot_relief_method ('fifo' | 'spec_id'), required per fund.
--   ADR 002 — inv_fund.base_currency required; spot_fx_source / period_end_fx_source.
--
-- All tables: env_id + business_id + RLS + COMMENT ON TABLE per project DB rules.
-- Idempotent.
-- Depends on: gen_random_uuid() (extension installed in 000_extensions.sql).

-- ─────────────────────────────────────────────────────────────────────────────
-- SHARED TRIGGER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION inv_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION inv_set_updated_at() IS
    'Bumps updated_at on UPDATE for inv_* tables. Attached as BEFORE UPDATE FOR EACH ROW.';

CREATE OR REPLACE FUNCTION inv_block_released_mutation() RETURNS trigger AS $$
BEGIN
    -- Allow exactly one transition out of released: to superseded.
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'inv: cannot delete row with status=% (table=%)', OLD.status, TG_TABLE_NAME;
    END IF;
    IF OLD.status = 'released' AND NEW.status NOT IN ('released','superseded') THEN
        RAISE EXCEPTION 'inv: cannot transition released row to status=% (table=%, id=%)',
            NEW.status, TG_TABLE_NAME, OLD.id;
    END IF;
    -- Block payload edits while remaining released.
    IF OLD.status = 'released' AND NEW.status = 'released' THEN
        IF NEW.input_versions IS DISTINCT FROM OLD.input_versions THEN
            RAISE EXCEPTION 'inv: cannot edit input_versions on released row (table=%, id=%)',
                TG_TABLE_NAME, OLD.id;
        END IF;
    END IF;
    -- Block edits on superseded rows entirely (history is forever).
    IF OLD.status = 'superseded' THEN
        RAISE EXCEPTION 'inv: cannot mutate superseded row (table=%, id=%)', TG_TABLE_NAME, OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION inv_block_released_mutation() IS
    'Snapshot immutability guard. Attached BEFORE UPDATE OR DELETE on inv_*_snapshot tables. See skills/winston-investment-snapshot.';

CREATE OR REPLACE FUNCTION inv_block_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'inv: % is append-only; % blocked (id=%)', TG_TABLE_NAME, TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION inv_block_append_only() IS
    'Append-only guard for inv_audit_log and inv_mutation_event. Attached BEFORE UPDATE OR DELETE.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_fund — top of the entity hierarchy
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_fund (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    name                    text NOT NULL,
    legal_name              text,
    inception_date          date NOT NULL,
    base_currency           char(3) NOT NULL,                                            -- ADR 002
    lot_relief_method       text NOT NULL CHECK (lot_relief_method IN ('fifo','spec_id')),  -- ADR 001
    spot_fx_source          text NOT NULL DEFAULT 'wm_reuters_4pm',                      -- ADR 002
    period_end_fx_source    text NOT NULL DEFAULT 'derived_from_spot',                   -- ADR 002
    status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','wound_down','draft')),
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_fund_env_name ON inv_fund (env_id, name);
CREATE INDEX IF NOT EXISTS idx_inv_fund_env_status ON inv_fund (env_id, business_id, status);

ALTER TABLE inv_fund ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_fund_env_isolation ON inv_fund;
CREATE POLICY inv_fund_env_isolation ON inv_fund
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_fund_updated_at ON inv_fund;
CREATE TRIGGER trg_inv_fund_updated_at BEFORE UPDATE ON inv_fund
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_fund IS
    'Investment Engine: top of the entity hierarchy. One row per fund. lot_relief_method is required (ADR 001); base_currency is required (ADR 002). Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_benchmark — index reference for portfolios (created before inv_portfolio)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_benchmark (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    code                    text NOT NULL,
    name                    text NOT NULL,
    currency                char(3) NOT NULL,
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_benchmark_env_code ON inv_benchmark (env_id, code);

ALTER TABLE inv_benchmark ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_benchmark_env_isolation ON inv_benchmark;
CREATE POLICY inv_benchmark_env_isolation ON inv_benchmark
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_benchmark_updated_at ON inv_benchmark;
CREATE TRIGGER trg_inv_benchmark_updated_at BEFORE UPDATE ON inv_benchmark
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_benchmark IS
    'Investment Engine: index / benchmark reference (e.g., SPX, AGG, MSCI World). Referenced by inv_portfolio.benchmark_id. Owned by accounting_engine module (also used by risk_engine in Wave 1).';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_portfolio — a fund has one or many portfolios
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_portfolio (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    fund_id                 uuid NOT NULL REFERENCES inv_fund(id),
    name                    text NOT NULL,
    benchmark_id            uuid REFERENCES inv_benchmark(id),
    currency                char(3) NOT NULL,
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_portfolio_env_fund_name ON inv_portfolio (env_id, fund_id, name);
CREATE INDEX IF NOT EXISTS idx_inv_portfolio_fund ON inv_portfolio (env_id, fund_id);

ALTER TABLE inv_portfolio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_portfolio_env_isolation ON inv_portfolio;
CREATE POLICY inv_portfolio_env_isolation ON inv_portfolio
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_portfolio_updated_at ON inv_portfolio;
CREATE TRIGGER trg_inv_portfolio_updated_at BEFORE UPDATE ON inv_portfolio
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_portfolio IS
    'Investment Engine: portfolio within a fund. Each portfolio rolls up to a fund and may have a benchmark. Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_account — custodian / broker accounts (allocation + reconciliation unit)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_account (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                      text NOT NULL,
    business_id                 uuid NOT NULL,
    portfolio_id                uuid NOT NULL REFERENCES inv_portfolio(id),
    name                        text NOT NULL,
    external_account_number     text,
    custodian                   text,
    base_currency               char(3) NOT NULL,
    metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_account_env_portfolio_name ON inv_account (env_id, portfolio_id, name);
CREATE INDEX IF NOT EXISTS idx_inv_account_portfolio ON inv_account (env_id, portfolio_id);
CREATE INDEX IF NOT EXISTS idx_inv_account_external ON inv_account (env_id, external_account_number)
    WHERE external_account_number IS NOT NULL;

ALTER TABLE inv_account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_account_env_isolation ON inv_account;
CREATE POLICY inv_account_env_isolation ON inv_account
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_account_updated_at ON inv_account;
CREATE TRIGGER trg_inv_account_updated_at BEFORE UPDATE ON inv_account
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_account IS
    'Investment Engine: custodian / broker / sleeve account within a portfolio. Allocation and reconciliation unit. Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_security — security master
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_security (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    ticker              text,
    cusip               text,
    isin                text,
    figi                text,
    asset_class         text NOT NULL CHECK (asset_class IN ('equity','fixed_income','derivative','private','cash','other')),
    currency            char(3) NOT NULL,
    issuer              text,
    sector              text,
    country             char(2),
    name                text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Identifier uniqueness: each non-null identifier unique per env (private assets have none of these).
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_security_env_ticker ON inv_security (env_id, ticker)
    WHERE ticker IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_security_env_cusip ON inv_security (env_id, cusip)
    WHERE cusip IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_security_env_isin ON inv_security (env_id, isin)
    WHERE isin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_security_env_figi ON inv_security (env_id, figi)
    WHERE figi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_security_env_class ON inv_security (env_id, asset_class);

ALTER TABLE inv_security ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_security_env_isolation ON inv_security;
CREATE POLICY inv_security_env_isolation ON inv_security
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_security_updated_at ON inv_security;
CREATE TRIGGER trg_inv_security_updated_at BEFORE UPDATE ON inv_security
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_security IS
    'Investment Engine: security master. Equities, fixed income, derivatives, private assets. At least one of ticker/cusip/isin/figi expected for public securities; private assets carry only metadata. Owned by accounting_engine module.';
