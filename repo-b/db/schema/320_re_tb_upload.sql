-- 320_re_tb_upload.sql
-- Trial balance upload workflow: batch tracking, parsed rows, mapping templates.
--
-- Depends on: 278_re_financial_intelligence.sql (acct_chart_of_accounts, acct_mapping_rule)
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS

-- =============================================================================
-- I. Upload Batch — tracks each TB file upload through its lifecycle
-- =============================================================================

CREATE TABLE IF NOT EXISTS acct_upload_batch (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    asset_id            uuid,
    period_month        date NOT NULL,
    filename            text NOT NULL,
    file_hash           text NOT NULL,
    file_size_bytes     int,
    row_count           int DEFAULT 0,
    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','mapped','validated','committed','failed','superseded')),
    mapping_template_id uuid,
    supersedes_batch_id uuid,
    validation_summary  jsonb,
    committed_at        timestamptz,
    uploaded_by         text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_batch_env
    ON acct_upload_batch (env_id, business_id, asset_id, period_month);

CREATE INDEX IF NOT EXISTS idx_upload_batch_status
    ON acct_upload_batch (env_id, status);

-- =============================================================================
-- II. Upload Rows — individual parsed lines from the TB file
-- =============================================================================

CREATE TABLE IF NOT EXISTS acct_upload_row (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id            uuid NOT NULL REFERENCES acct_upload_batch(id) ON DELETE CASCADE,
    row_num             int NOT NULL,
    raw_account_code    text,
    raw_account_name    text,
    raw_debit           numeric(28,12),
    raw_credit          numeric(28,12),
    raw_balance         numeric(28,12),
    mapped_gl_account   text,
    mapping_confidence  numeric(5,4) DEFAULT 0,
    validation_notes    text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_row_batch
    ON acct_upload_row (batch_id, row_num);

-- =============================================================================
-- III. Mapping Templates — reusable GL account mapping configurations
-- =============================================================================

CREATE TABLE IF NOT EXISTS acct_mapping_template (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    name            text NOT NULL,
    description     text,
    mappings        jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- mappings format: [{"raw_account_code": "4000", "mapped_gl_account": "4000", "raw_account_name": "Rental Revenue"}]
    source_count    int DEFAULT 0,
    last_used_at    timestamptz,
    created_by      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mapping_template_env
    ON acct_mapping_template (env_id, business_id);

-- =============================================================================
-- IV. Self-referential FK for supersession (deferred to avoid chicken-and-egg)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_upload_batch_supersedes'
    ) THEN
        ALTER TABLE acct_upload_batch
            ADD CONSTRAINT fk_upload_batch_supersedes
            FOREIGN KEY (supersedes_batch_id) REFERENCES acct_upload_batch(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_upload_batch_template'
    ) THEN
        ALTER TABLE acct_upload_batch
            ADD CONSTRAINT fk_upload_batch_template
            FOREIGN KEY (mapping_template_id) REFERENCES acct_mapping_template(id);
    END IF;
END $$;
