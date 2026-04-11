-- Migration 465: Add null_reasons JSONB column to re_fund_metrics_qtr
--
-- Stores structured reasons when net metrics cannot be computed (e.g. waterfall
-- not defined, authoritative snapshot not released, period coherence violation).
-- A CHECK constraint ensures every row either carries a full metric set OR
-- documents why metrics are missing — no silently half-written rows.
--
-- Idempotent: uses DO $$ ... END $$ with column existence checks.

DO $$
BEGIN
    -- Add null_reasons JSONB column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 're_fund_metrics_qtr'
          AND column_name = 'null_reasons'
    ) THEN
        ALTER TABLE re_fund_metrics_qtr
            ADD COLUMN null_reasons JSONB DEFAULT NULL;

        COMMENT ON COLUMN re_fund_metrics_qtr.null_reasons IS
            'Structured map of metric name → null_reason string for every metric '
            'that could not be computed.  Populated by compute_return_metrics when '
            'waterfall is unavailable (out_of_scope_requires_waterfall) or when the '
            'authoritative snapshot is not yet released (authoritative_state_not_released). '
            'NULL here means all metrics are present.';
    END IF;

    -- Add CHECK constraint if it doesn't exist
    -- The constraint enforces: every row must either have all core metrics present
    -- OR must document why they are missing in null_reasons.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_re_fund_metrics_qtr_complete_or_documented'
    ) THEN
        ALTER TABLE re_fund_metrics_qtr
            ADD CONSTRAINT chk_re_fund_metrics_qtr_complete_or_documented
            CHECK (
                -- Either all core metrics are present
                (gross_irr IS NOT NULL AND dpi IS NOT NULL AND gross_tvpi IS NOT NULL)
                -- Or null_reasons is populated explaining why they are missing
                OR null_reasons IS NOT NULL
            );
    END IF;
END $$;
