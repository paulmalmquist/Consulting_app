-- 603_nv_accounting_core.sql
-- Accounting Command Desk core tables — invoices + bank transactions.
--
-- Complements the receipt-intake stack (600/602). The Command Desk surfaces
-- invoices, transactions, AR aging, KPIs, and trends alongside the receipt
-- intake queue + subscription ledger.
--
-- Tables:
--   - nv_invoice           (issued invoices, AR state)
--   - nv_bank_transaction  (card/bank charge ledger; matched to receipts and invoices)
--
-- Idempotent.

-- =============================================================================
-- I. nv_invoice — issued invoices
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_invoice (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    invoice_number          text NOT NULL,
    client                  text NOT NULL,
    engagement_id           text,
    issued_date             date NOT NULL,
    due_date                date NOT NULL,
    amount_cents            bigint NOT NULL,
    paid_cents              bigint NOT NULL DEFAULT 0,
    currency                text NOT NULL DEFAULT 'USD',
    state                   text NOT NULL
                            CHECK (state IN ('draft','sent','overdue','paid','void')),
    last_reminded_at        timestamptz,
    last_reminded_channel   text
                            CHECK (last_reminded_channel IN ('email','sms') OR last_reminded_channel IS NULL),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, invoice_number)
);

COMMENT ON TABLE nv_invoice IS
    'Issued invoices for the Novendor Accounting Command Desk — AR state and reminder history. Owned by nv_invoices service.';

CREATE INDEX IF NOT EXISTS idx_nv_invoice_state
    ON nv_invoice (env_id, business_id, state, due_date);
CREATE INDEX IF NOT EXISTS idx_nv_invoice_client
    ON nv_invoice (env_id, business_id, client);
CREATE INDEX IF NOT EXISTS idx_nv_invoice_issued
    ON nv_invoice (env_id, business_id, issued_date DESC);

ALTER TABLE nv_invoice ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_invoice_tenant_isolation ON nv_invoice;
CREATE POLICY nv_invoice_tenant_isolation ON nv_invoice
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- II. nv_bank_transaction — card/bank charge ledger
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_bank_transaction (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    external_id         text NOT NULL,
    posted_at           timestamptz NOT NULL,
    account_label       text NOT NULL,
    description         text NOT NULL,
    amount_cents        bigint NOT NULL,                       -- signed: negative = outflow
    currency            text NOT NULL DEFAULT 'USD',
    category            text,
    match_state         text NOT NULL DEFAULT 'unreviewed'
                        CHECK (match_state IN ('unreviewed','categorized','reconciled','split')),
    match_receipt_id    uuid REFERENCES nv_receipt_intake(id) ON DELETE SET NULL,
    match_invoice_id    uuid REFERENCES nv_invoice(id) ON DELETE SET NULL,
    match_hint          text,
    parent_txn_id       uuid REFERENCES nv_bank_transaction(id) ON DELETE SET NULL,
    split_memo          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, external_id)
);

COMMENT ON TABLE nv_bank_transaction IS
    'Bank/card transaction ledger. Amount is signed (negative = outflow). Matches to receipts and invoices track reconciliation state. Split children reference parent_txn_id.';

CREATE INDEX IF NOT EXISTS idx_nv_txn_posted
    ON nv_bank_transaction (env_id, business_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_txn_match_state
    ON nv_bank_transaction (env_id, business_id, match_state);
CREATE INDEX IF NOT EXISTS idx_nv_txn_receipt
    ON nv_bank_transaction (match_receipt_id);
CREATE INDEX IF NOT EXISTS idx_nv_txn_invoice
    ON nv_bank_transaction (match_invoice_id);

ALTER TABLE nv_bank_transaction ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_bank_transaction_tenant_isolation ON nv_bank_transaction;
CREATE POLICY nv_bank_transaction_tenant_isolation ON nv_bank_transaction
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- III. nv_expense_draft.linked_transaction_id → nv_bank_transaction (retroactive FK)
-- =============================================================================
--
-- 600_nv_receipt_intake.sql defines nv_expense_draft.linked_transaction_id
-- as a plain uuid because the transaction table did not exist yet. Now that
-- it does, add the FK constraint (ON DELETE SET NULL) without breaking
-- existing rows.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nv_expense_draft'
          AND column_name = 'linked_transaction_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'nv_expense_draft'
          AND constraint_name = 'nv_expense_draft_linked_txn_fk'
    ) THEN
        ALTER TABLE nv_expense_draft
            ADD CONSTRAINT nv_expense_draft_linked_txn_fk
            FOREIGN KEY (linked_transaction_id)
            REFERENCES nv_bank_transaction(id)
            ON DELETE SET NULL;
    END IF;
END $$;
