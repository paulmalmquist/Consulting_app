-- 409_re_ir_drafts.sql
-- IR draft letters and capital statements for review/approval workflow.

CREATE TABLE IF NOT EXISTS re_ir_drafts (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id             text NOT NULL,
    business_id        uuid NOT NULL,
    fund_id            uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
    quarter            text NOT NULL,
    draft_type         text NOT NULL DEFAULT 'lp_letter'
      CHECK (draft_type IN ('lp_letter', 'capital_statement', 'quarterly_update')),
    status             text NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected')),
    content_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
    narrative_text     text,
    generated_by       text NOT NULL DEFAULT 'winston',
    reviewed_by        text,
    reviewed_at        timestamptz,
    review_notes       text,
    version            int NOT NULL DEFAULT 1,
    report_id          uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_ir_drafts_fund_qtr
    ON re_ir_drafts (fund_id, quarter);
CREATE INDEX IF NOT EXISTS idx_re_ir_drafts_status
    ON re_ir_drafts (status);
CREATE INDEX IF NOT EXISTS idx_re_ir_drafts_business
    ON re_ir_drafts (business_id);
