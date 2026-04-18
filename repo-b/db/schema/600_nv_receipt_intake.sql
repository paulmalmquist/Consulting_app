-- 600_nv_receipt_intake.sql
-- Novendor Receipt Intake — ingest, parse, normalize, classify, match, review.
--
-- Core use case: Apple-billed subscriptions (Apple One, iCloud+, App Store
-- billed services like ChatGPT) where the billing platform (Apple) must be
-- separated from the underlying vendor (e.g. OpenAI). Ambiguous cases route
-- to a review queue with a specific next_action.
--
-- All tables are env_id + business_id scoped with RLS enabled.
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

-- =============================================================================
-- I. nv_receipt_intake — one row per ingested file
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_receipt_intake (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    source_type         text NOT NULL
                        CHECK (source_type IN ('upload','email','apple_export','recurring_inferred','transaction_only','bulk_upload')),
    source_ref          text,
    file_hash           text NOT NULL,
    storage_path        text,
    original_filename   text,
    mime_type           text,
    file_size_bytes     int,
    ingest_status       text NOT NULL DEFAULT 'pending'
                        CHECK (ingest_status IN ('pending','parsed','failed','duplicate')),
    uploaded_by         text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, file_hash)
);

COMMENT ON TABLE nv_receipt_intake IS
    'Novendor Accounting — ingested receipt files (upload/email/apple_export). Deduped per env+business by SHA256 file_hash.';

CREATE INDEX IF NOT EXISTS idx_nv_receipt_intake_env_status
    ON nv_receipt_intake (env_id, business_id, ingest_status, created_at DESC);

ALTER TABLE nv_receipt_intake ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_receipt_intake_tenant_isolation ON nv_receipt_intake;
CREATE POLICY nv_receipt_intake_tenant_isolation ON nv_receipt_intake
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- II. nv_receipt_parse_result — one row per extraction attempt
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_receipt_parse_result (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    intake_id               uuid NOT NULL REFERENCES nv_receipt_intake(id) ON DELETE CASCADE,
    parser_source           text NOT NULL
                            CHECK (parser_source IN ('tesseract','claude','hybrid','manual')),
    parser_version          text,
    merchant_raw            text,
    billing_platform        text,
    service_name_guess      text,
    vendor_normalized       text,
    transaction_date        date,
    billing_period_start    date,
    billing_period_end      date,
    subtotal                numeric(14,4),
    tax                     numeric(14,4),
    total                   numeric(14,4),
    currency                text DEFAULT 'USD',
    apple_document_ref      text,
    line_items              jsonb NOT NULL DEFAULT '[]'::jsonb,
    payment_method_hints    text,
    renewal_language        text,
    confidence_overall      numeric(5,4) DEFAULT 0,
    confidence_vendor       numeric(5,4) DEFAULT 0,
    confidence_service      numeric(5,4) DEFAULT 0,
    raw_extraction          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE nv_receipt_parse_result IS
    'Novendor Accounting — parsed/normalized fields from a receipt. billing_platform is independent from vendor_normalized (Apple-as-intermediary pattern).';

CREATE INDEX IF NOT EXISTS idx_nv_parse_intake ON nv_receipt_parse_result (intake_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_parse_vendor ON nv_receipt_parse_result (env_id, business_id, vendor_normalized, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_nv_parse_platform ON nv_receipt_parse_result (env_id, business_id, billing_platform, transaction_date DESC);

ALTER TABLE nv_receipt_parse_result ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_receipt_parse_result_tenant_isolation ON nv_receipt_parse_result;
CREATE POLICY nv_receipt_parse_result_tenant_isolation ON nv_receipt_parse_result
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- III. nv_subscription_ledger — recurring software subscriptions
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_subscription_ledger (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    vendor_normalized       text,
    service_name            text NOT NULL,
    billing_platform        text,
    cadence                 text NOT NULL DEFAULT 'unknown'
                            CHECK (cadence IN ('monthly','quarterly','annual','unknown')),
    expected_amount         numeric(14,4),
    currency                text DEFAULT 'USD',
    category                text,
    business_relevance      text DEFAULT 'medium'
                            CHECK (business_relevance IN ('high','medium','low','personal','unknown')),
    is_active               boolean NOT NULL DEFAULT true,
    last_seen_date          date,
    next_expected_date      date,
    last_receipt_id         uuid REFERENCES nv_receipt_intake(id) ON DELETE SET NULL,
    documentation_complete  boolean NOT NULL DEFAULT false,
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, service_name, billing_platform)
);

COMMENT ON TABLE nv_subscription_ledger IS
    'Novendor Accounting — recurring subscription ledger independent of raw expenses. Carries forward classification between months.';

CREATE INDEX IF NOT EXISTS idx_nv_sub_active ON nv_subscription_ledger (env_id, business_id, is_active, next_expected_date);

ALTER TABLE nv_subscription_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_subscription_ledger_tenant_isolation ON nv_subscription_ledger;
CREATE POLICY nv_subscription_ledger_tenant_isolation ON nv_subscription_ledger
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- IV. nv_receipt_match_candidate — potential receipt↔transaction matches
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_receipt_match_candidate (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    intake_id       uuid NOT NULL REFERENCES nv_receipt_intake(id) ON DELETE CASCADE,
    transaction_id  uuid,
    match_score     numeric(5,4) NOT NULL DEFAULT 0,
    match_reason    jsonb NOT NULL DEFAULT '{}'::jsonb,
    match_status    text NOT NULL DEFAULT 'suggested'
                    CHECK (match_status IN ('suggested','confirmed','rejected','manual','unmatched')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE nv_receipt_match_candidate IS
    'Novendor Accounting — candidate matches between a receipt intake and a bank/CC transaction. transaction_id is nullable until transaction import exists.';

CREATE INDEX IF NOT EXISTS idx_nv_match_intake ON nv_receipt_match_candidate (intake_id, match_score DESC);

ALTER TABLE nv_receipt_match_candidate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_receipt_match_candidate_tenant_isolation ON nv_receipt_match_candidate;
CREATE POLICY nv_receipt_match_candidate_tenant_isolation ON nv_receipt_match_candidate
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- V. nv_receipt_review_item — open action items for the review queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_receipt_review_item (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    intake_id       uuid NOT NULL REFERENCES nv_receipt_intake(id) ON DELETE CASCADE,
    reason          text NOT NULL
                    CHECK (reason IN (
                        'low_confidence','apple_ambiguous','unmatched','uncategorized',
                        'suspected_duplicate','missing_transaction','possibly_personal',
                        'price_increased','cadence_changed'
                    )),
    next_action     text NOT NULL,
    status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','resolved','deferred')),
    resolved_at     timestamptz,
    resolved_by     text,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE nv_receipt_review_item IS
    'Novendor Accounting — review-queue items produced when a receipt cannot be fully resolved automatically.';

CREATE INDEX IF NOT EXISTS idx_nv_review_open
    ON nv_receipt_review_item (env_id, business_id, status, created_at DESC);

ALTER TABLE nv_receipt_review_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_receipt_review_item_tenant_isolation ON nv_receipt_review_item;
CREATE POLICY nv_receipt_review_item_tenant_isolation ON nv_receipt_review_item
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- VI. nv_receipt_classification_rule — JSONB rules engine
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_receipt_classification_rule (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    priority                int NOT NULL DEFAULT 100,
    match_when              jsonb NOT NULL,
    set_category            text,
    set_business_relevance  text CHECK (set_business_relevance IN ('high','medium','low','personal','unknown')),
    set_vendor_normalized   text,
    is_active               boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE nv_receipt_classification_rule IS
    'Novendor Accounting — declarative classification rules keyed on parse fields (billing_platform, service contains, etc.).';

CREATE INDEX IF NOT EXISTS idx_nv_rule_env ON nv_receipt_classification_rule (env_id, business_id, is_active, priority);

ALTER TABLE nv_receipt_classification_rule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_receipt_classification_rule_tenant_isolation ON nv_receipt_classification_rule;
CREATE POLICY nv_receipt_classification_rule_tenant_isolation ON nv_receipt_classification_rule
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- VII. nv_expense_draft — draft expenses ready for confirmation
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_expense_draft (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    source_receipt_id       uuid REFERENCES nv_receipt_intake(id) ON DELETE SET NULL,
    vendor_normalized       text,
    service_name            text,
    category                text,
    amount                  numeric(14,4),
    currency                text DEFAULT 'USD',
    transaction_date        date,
    is_recurring            boolean NOT NULL DEFAULT false,
    linked_subscription_id  uuid REFERENCES nv_subscription_ledger(id) ON DELETE SET NULL,
    linked_transaction_id   uuid,
    entity_linkage          text CHECK (entity_linkage IN (
                                'winston','novendor_ops','client_engagement',
                                'research','product','marketing','personal'
                            )),
    status                  text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','confirmed','rejected')),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE nv_expense_draft IS
    'Novendor Accounting — draft expenses auto-created from parsed receipts, pending confirmation.';

CREATE INDEX IF NOT EXISTS idx_nv_expense_env
    ON nv_expense_draft (env_id, business_id, status, transaction_date DESC);

ALTER TABLE nv_expense_draft ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_expense_draft_tenant_isolation ON nv_expense_draft;
CREATE POLICY nv_expense_draft_tenant_isolation ON nv_expense_draft
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );
