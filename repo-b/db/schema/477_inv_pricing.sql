-- 477_inv_pricing.sql
-- Winston Investment Engine — Phase 1 of 7 — Pricing.
--
-- Three tables: inv_security_price, inv_fx_rate, inv_curve.
--
-- Per ADR 002:
--   * Prices and FX rates stored in native form. Translated values are NEVER stored
--     on transactional rows; downstream snapshots reference these by id.
--   * Corrections are recorded as new rows with a later published_at. The prior row's
--     superseded_by_id is set, but the row is otherwise immutable.
--   * Partial unique indexes enforce "exactly one current row per (key, source)".
--
-- inv_curve uses jsonb for the points array per project instructions.
--
-- Late FK closure: 475 reserved fx_rate_id_at_open and fx_rate_id_at_relief as uuid
-- columns. We add the FKs to inv_fx_rate(id) here.
--
-- Idempotent. Depends on 474 (inv_security, inv_set_updated_at), 475 (inv_position_lot, inv_position_lot_relief).

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_security_price — daily prices, immutable with supersession chain
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_security_price (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    security_id         uuid NOT NULL REFERENCES inv_security(id),
    price_date          date NOT NULL,
    price_native        numeric(28,8) NOT NULL CHECK (price_native >= 0),
    price_currency      char(3) NOT NULL,
    source              text NOT NULL,
    published_at        timestamptz NOT NULL DEFAULT now(),
    superseded_by_id    uuid REFERENCES inv_security_price(id),
    supersession_reason text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One current row per (security, price_date, source). Supersession chain is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_price_current_unique
    ON inv_security_price (env_id, security_id, price_date, source)
    WHERE superseded_by_id IS NULL;

-- Workload: hot-path snapshot reads load price by (security, date, source).
CREATE INDEX IF NOT EXISTS idx_inv_price_security_date
    ON inv_security_price (env_id, security_id, price_date DESC);

ALTER TABLE inv_security_price ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_price_env_isolation ON inv_security_price;
CREATE POLICY inv_price_env_isolation ON inv_security_price
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_price_updated_at ON inv_security_price;
CREATE TRIGGER trg_inv_price_updated_at BEFORE UPDATE ON inv_security_price
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

-- Block edits to load-bearing fields once a row exists. Only superseded_by_id and
-- supersession_reason may transition (when this row is being marked as superseded).
CREATE OR REPLACE FUNCTION inv_block_price_edit() RETURNS trigger AS $$
BEGIN
    IF NEW.security_id      IS DISTINCT FROM OLD.security_id      OR
       NEW.price_date       IS DISTINCT FROM OLD.price_date       OR
       NEW.price_native     IS DISTINCT FROM OLD.price_native     OR
       NEW.price_currency   IS DISTINCT FROM OLD.price_currency   OR
       NEW.source           IS DISTINCT FROM OLD.source           OR
       NEW.published_at     IS DISTINCT FROM OLD.published_at THEN
        RAISE EXCEPTION 'inv_security_price: load-bearing fields are immutable (id=%); insert a new row and set superseded_by_id', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inv_price_block_edit ON inv_security_price;
CREATE TRIGGER trg_inv_price_block_edit BEFORE UPDATE ON inv_security_price
    FOR EACH ROW EXECUTE FUNCTION inv_block_price_edit();

COMMENT ON TABLE inv_security_price IS
    'Investment Engine: security prices. One current row per (security, price_date, source); corrections via supersession chain (ADR 002 pattern). Load-bearing fields immutable. Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_fx_rate — per ADR 002
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_fx_rate (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    from_ccy            char(3) NOT NULL,
    to_ccy              char(3) NOT NULL,
    rate_date           date NOT NULL,
    rate                numeric(20,10) NOT NULL CHECK (rate > 0),
    source              text NOT NULL,                                    -- 'wm_reuters_4pm','ecb_reference','period_end_2026Q1','manual'
    published_at        timestamptz NOT NULL DEFAULT now(),
    superseded_by_id    uuid REFERENCES inv_fx_rate(id),
    supersession_reason text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_fx_current_unique
    ON inv_fx_rate (env_id, from_ccy, to_ccy, rate_date, source)
    WHERE superseded_by_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_inv_fx_pair_date
    ON inv_fx_rate (env_id, from_ccy, to_ccy, rate_date DESC);

ALTER TABLE inv_fx_rate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_fx_env_isolation ON inv_fx_rate;
CREATE POLICY inv_fx_env_isolation ON inv_fx_rate
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_fx_updated_at ON inv_fx_rate;
CREATE TRIGGER trg_inv_fx_updated_at BEFORE UPDATE ON inv_fx_rate
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

CREATE OR REPLACE FUNCTION inv_block_fx_edit() RETURNS trigger AS $$
BEGIN
    IF NEW.from_ccy     IS DISTINCT FROM OLD.from_ccy     OR
       NEW.to_ccy       IS DISTINCT FROM OLD.to_ccy       OR
       NEW.rate_date    IS DISTINCT FROM OLD.rate_date    OR
       NEW.rate         IS DISTINCT FROM OLD.rate         OR
       NEW.source       IS DISTINCT FROM OLD.source       OR
       NEW.published_at IS DISTINCT FROM OLD.published_at THEN
        RAISE EXCEPTION 'inv_fx_rate: load-bearing fields are immutable (id=%); insert a new row and set superseded_by_id', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inv_fx_block_edit ON inv_fx_rate;
CREATE TRIGGER trg_inv_fx_block_edit BEFORE UPDATE ON inv_fx_rate
    FOR EACH ROW EXECUTE FUNCTION inv_block_fx_edit();

COMMENT ON TABLE inv_fx_rate IS
    'Investment Engine: FX rates (ADR 002). One current row per (from_ccy, to_ccy, rate_date, source); corrections via supersession chain. Source distinguishes spot rates and computed period rates. Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_curve — yield / credit / swap curves (jsonb points per project instructions)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_curve (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    curve_type          text NOT NULL CHECK (curve_type IN ('treasury','credit','swap','custom')),
    curve_date          date NOT NULL,
    currency            char(3) NOT NULL,
    points              jsonb NOT NULL,                                   -- e.g. [{"tenor":"1Y","rate":0.0512}, ...]
    source              text NOT NULL,
    published_at        timestamptz NOT NULL DEFAULT now(),
    superseded_by_id    uuid REFERENCES inv_curve(id),
    supersession_reason text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_curve_current_unique
    ON inv_curve (env_id, curve_type, currency, curve_date, source)
    WHERE superseded_by_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_inv_curve_lookup
    ON inv_curve (env_id, curve_type, currency, curve_date DESC);

ALTER TABLE inv_curve ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_curve_env_isolation ON inv_curve;
CREATE POLICY inv_curve_env_isolation ON inv_curve
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_curve_updated_at ON inv_curve;
CREATE TRIGGER trg_inv_curve_updated_at BEFORE UPDATE ON inv_curve
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_curve IS
    'Investment Engine: yield / credit / swap curves. points jsonb is a tenor→rate array. V1 stores points as jsonb per project instructions; promote to a relational shape if curve interpolation perf demands. Owned by accounting_engine module (consumed by risk_engine in Wave 1).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Late FK closure: link 475's fx_rate_id_at_open / fx_rate_id_at_relief to inv_fx_rate
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inv_position_lot_fx_at_open_fk'
    ) THEN
        ALTER TABLE inv_position_lot
            ADD CONSTRAINT inv_position_lot_fx_at_open_fk
            FOREIGN KEY (fx_rate_id_at_open) REFERENCES inv_fx_rate(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inv_relief_fx_at_relief_fk'
    ) THEN
        ALTER TABLE inv_position_lot_relief
            ADD CONSTRAINT inv_relief_fx_at_relief_fk
            FOREIGN KEY (fx_rate_id_at_relief) REFERENCES inv_fx_rate(id);
    END IF;
END $$;
