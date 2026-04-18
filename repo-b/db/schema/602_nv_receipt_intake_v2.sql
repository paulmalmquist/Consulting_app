-- 602_nv_receipt_intake_v2.sql
-- Receipt Intake v2 — spend-type split + subscription occurrences ledger.
--
-- Adds:
--   - nv_subscription_occurrence  (per-period fact row for subscription ledger)
--   - parse_result.spend_type     (subscription_fixed | api_usage | one_off | reimbursable_client | ambiguous)
--   - subscription_ledger.spend_type (inherited from its occurrences)
--
-- Builds on 600_nv_receipt_intake.sql. Idempotent.

-- =============================================================================
-- I. spend_type columns on parse_result + subscription_ledger
-- =============================================================================

ALTER TABLE nv_receipt_parse_result
    ADD COLUMN IF NOT EXISTS spend_type text
        CHECK (spend_type IN ('subscription_fixed','api_usage','one_off','reimbursable_client','ambiguous'));

COMMENT ON COLUMN nv_receipt_parse_result.spend_type IS
    'Economic classification: fixed subscription vs variable API usage vs one-off purchase vs client-reimbursable vs ambiguous.';

ALTER TABLE nv_subscription_ledger
    ADD COLUMN IF NOT EXISTS spend_type text
        CHECK (spend_type IN ('subscription_fixed','api_usage','one_off','reimbursable_client','ambiguous'));

COMMENT ON COLUMN nv_subscription_ledger.spend_type IS
    'Economic classification propagated from first occurrence. API-usage ledger rows exist for vendor-level aggregation (e.g. OpenAI API).';

CREATE INDEX IF NOT EXISTS idx_nv_parse_spend_type
    ON nv_receipt_parse_result (env_id, business_id, spend_type, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_nv_sub_spend_type
    ON nv_subscription_ledger (env_id, business_id, spend_type, is_active);

-- =============================================================================
-- II. nv_subscription_occurrence — one row per confirmed billing period
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_subscription_occurrence (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    subscription_id     uuid NOT NULL REFERENCES nv_subscription_ledger(id) ON DELETE CASCADE,
    intake_id           uuid REFERENCES nv_receipt_intake(id) ON DELETE SET NULL,
    occurrence_date     date NOT NULL,
    amount              numeric(14,4),
    currency            text DEFAULT 'USD',
    expected_amount     numeric(14,4),
    price_delta_pct     numeric(7,4),
    days_since_last     int,
    source_signals      jsonb NOT NULL DEFAULT '[]'::jsonb,
    review_state        text NOT NULL DEFAULT 'auto'
                        CHECK (review_state IN ('auto','confirmed','manual','rejected','non_business','mixed')),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE nv_subscription_occurrence IS
    'Per-period fact row in the subscription ledger. Confirmed subscription-like intakes write one occurrence; review_state tracks operator decisions (confirmed/non_business/mixed/rejected).';

CREATE INDEX IF NOT EXISTS idx_nv_occ_sub
    ON nv_subscription_occurrence (subscription_id, occurrence_date DESC);
CREATE INDEX IF NOT EXISTS idx_nv_occ_intake
    ON nv_subscription_occurrence (intake_id);
CREATE INDEX IF NOT EXISTS idx_nv_occ_env_date
    ON nv_subscription_occurrence (env_id, business_id, occurrence_date DESC);

-- Triple-signal dedup: one occurrence per (subscription, occurrence_date)
-- even if the same period arrives via file + transaction + provider export.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nv_occ_period
    ON nv_subscription_occurrence (subscription_id, occurrence_date);

ALTER TABLE nv_subscription_occurrence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_subscription_occurrence_tenant_isolation ON nv_subscription_occurrence;
CREATE POLICY nv_subscription_occurrence_tenant_isolation ON nv_subscription_occurrence
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );
