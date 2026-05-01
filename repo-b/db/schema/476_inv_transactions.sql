-- 476_inv_transactions.sql
-- Winston Investment Engine — Phase 1 of 7 — Transactions.
--
-- Three tables: inv_trade, inv_cash_movement, inv_accrual.
--
-- Per ADR 002: every monetary amount stored in native currency with currency_code.
--              No translated values stored on transactional rows.
-- Per ADR 003: every row carries effective_date (business date) AND booking_date
--              (recordkeeping date). corrects_id supports late-arriving corrections
--              without mutation of the original row.
--
-- inv_trade.selected_lot_ids carries the explicit lot selection for sell-side spec_id
-- relief (ADR 001). Service layer enforces "required when fund.lot_relief_method='spec_id'
-- and side='sell'".
--
-- Late FK closure: 475 reserved inv_position_lot.open_event_id and
-- inv_position_lot_relief.relief_event_id as uuid columns. We add the FKs to inv_trade(id)
-- here once inv_trade exists.
--
-- Idempotent. Depends on 474 (inv_account, inv_security), 475 (inv_position_lot, inv_position_lot_relief).

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_trade — buy / sell / transfer events. Authoritative source for lot opens/reliefs.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_trade (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    account_id          uuid NOT NULL REFERENCES inv_account(id),
    security_id         uuid NOT NULL REFERENCES inv_security(id),
    side                text NOT NULL CHECK (side IN ('buy','sell','transfer_in','transfer_out')),
    qty                 numeric(28,8) NOT NULL CHECK (qty > 0),
    price_native        numeric(28,8) NOT NULL,                          -- per unit, native ccy
    price_currency      char(3) NOT NULL,
    fees_native         numeric(28,8) NOT NULL DEFAULT 0,
    fees_currency       char(3),
    effective_date      date NOT NULL,                                    -- ADR 003
    booking_date        date NOT NULL,                                    -- ADR 003
    selected_lot_ids    uuid[],                                           -- ADR 001 (spec_id sells)
    corrects_id         uuid REFERENCES inv_trade(id),                    -- ADR 003
    external_ref        text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_trade_account_effective
    ON inv_trade (env_id, account_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_inv_trade_security_effective
    ON inv_trade (env_id, security_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_inv_trade_booking
    ON inv_trade (env_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_inv_trade_external
    ON inv_trade (env_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_trade_corrects
    ON inv_trade (env_id, corrects_id) WHERE corrects_id IS NOT NULL;

ALTER TABLE inv_trade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_trade_env_isolation ON inv_trade;
CREATE POLICY inv_trade_env_isolation ON inv_trade
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_trade_updated_at ON inv_trade;
CREATE TRIGGER trg_inv_trade_updated_at BEFORE UPDATE ON inv_trade
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_trade IS
    'Investment Engine: trade events (buy / sell / transfer). Source for inv_position_lot opens (buy/transfer_in) and inv_position_lot_relief reliefs (sell/transfer_out). selected_lot_ids required when fund.lot_relief_method=spec_id (ADR 001). corrects_id supports bi-temporal corrections (ADR 003). Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Late FK closure: link inv_position_lot.open_event_id and inv_position_lot_relief.relief_event_id to inv_trade
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inv_position_lot_open_event_fk'
    ) THEN
        ALTER TABLE inv_position_lot
            ADD CONSTRAINT inv_position_lot_open_event_fk
            FOREIGN KEY (open_event_id) REFERENCES inv_trade(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inv_relief_event_fk'
    ) THEN
        ALTER TABLE inv_position_lot_relief
            ADD CONSTRAINT inv_relief_event_fk
            FOREIGN KEY (relief_event_id) REFERENCES inv_trade(id);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_cash_movement — non-trade cash events
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_cash_movement (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    account_id          uuid NOT NULL REFERENCES inv_account(id),
    movement_type       text NOT NULL CHECK (movement_type IN (
                            'contribution','distribution','fee','dividend',
                            'interest','tax_withholding','other')),
    amount_native       numeric(28,8) NOT NULL,                          -- sign matters: positive=in, negative=out
    currency            char(3) NOT NULL,
    effective_date      date NOT NULL,
    booking_date        date NOT NULL,
    counterparty        text,
    corrects_id         uuid REFERENCES inv_cash_movement(id),
    external_ref        text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_cash_account_effective
    ON inv_cash_movement (env_id, account_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_inv_cash_type
    ON inv_cash_movement (env_id, movement_type, effective_date);
CREATE INDEX IF NOT EXISTS idx_inv_cash_corrects
    ON inv_cash_movement (env_id, corrects_id) WHERE corrects_id IS NOT NULL;

ALTER TABLE inv_cash_movement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_cash_env_isolation ON inv_cash_movement;
CREATE POLICY inv_cash_env_isolation ON inv_cash_movement
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_cash_updated_at ON inv_cash_movement;
CREATE TRIGGER trg_inv_cash_updated_at BEFORE UPDATE ON inv_cash_movement
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_cash_movement IS
    'Investment Engine: non-trade cash events — contributions, distributions, fees, dividends received, interest, tax withholding. Sign on amount_native carries direction. corrects_id supports bi-temporal corrections (ADR 003). Owned by accounting_engine module.';

-- ─────────────────────────────────────────────────────────────────────────────
-- inv_accrual — booked but not yet paid (interest, dividends, fees)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_accrual (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    account_id          uuid NOT NULL REFERENCES inv_account(id),
    security_id         uuid REFERENCES inv_security(id),                 -- nullable for fund-level fees
    accrual_type        text NOT NULL CHECK (accrual_type IN (
                            'interest','dividend','management_fee',
                            'incentive_fee','expense','other')),
    amount_native       numeric(28,8) NOT NULL,
    currency            char(3) NOT NULL,
    effective_date      date NOT NULL,                                    -- when the accrual pertains to
    booking_date        date NOT NULL,
    paid_movement_id    uuid REFERENCES inv_cash_movement(id),            -- nullable; settled via this cash movement
    corrects_id         uuid REFERENCES inv_accrual(id),
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_accrual_account_effective
    ON inv_accrual (env_id, account_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_inv_accrual_unpaid
    ON inv_accrual (env_id, account_id, effective_date) WHERE paid_movement_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_accrual_security
    ON inv_accrual (env_id, security_id) WHERE security_id IS NOT NULL;

ALTER TABLE inv_accrual ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_accrual_env_isolation ON inv_accrual;
CREATE POLICY inv_accrual_env_isolation ON inv_accrual
    USING (env_id = current_setting('app.env_id', true));

DROP TRIGGER IF EXISTS trg_inv_accrual_updated_at ON inv_accrual;
CREATE TRIGGER trg_inv_accrual_updated_at BEFORE UPDATE ON inv_accrual
    FOR EACH ROW EXECUTE FUNCTION inv_set_updated_at();

COMMENT ON TABLE inv_accrual IS
    'Investment Engine: booked-but-unpaid amounts (interest, dividends, fees, expenses). paid_movement_id links to the cash settlement when realized. corrects_id supports bi-temporal corrections (ADR 003). Owned by accounting_engine module.';
