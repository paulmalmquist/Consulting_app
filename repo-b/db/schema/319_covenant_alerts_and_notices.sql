-- 319_covenant_alerts_and_notices.sql
-- Supporting tables for BUILD-01 (Covenant Alerts), BUILD-02 (LP Reports),
-- BUILD-03 (DDQ Responses), BUILD-04 (Notices), BUILD-07 (Operating Extraction)

-- ── BUILD-01: Materialized covenant alerts ────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_covenant_alert (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    loan_id         uuid NOT NULL,
    asset_id        uuid,
    quarter         text NOT NULL,
    run_id          uuid NOT NULL,
    metric          text NOT NULL,            -- DSCR, LTV, DEBT_YIELD
    current_value   numeric(18,6),
    threshold       numeric(18,6) NOT NULL,
    comparator      text NOT NULL DEFAULT '>=',
    headroom        numeric(18,6),
    severity        text NOT NULL DEFAULT 'warning', -- warning | breach | critical
    projected_breach_date date,
    resolved        boolean NOT NULL DEFAULT false,
    resolved_at     timestamptz,
    resolved_by     text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_covenant_alert_fund_qtr ON re_covenant_alert (fund_id, quarter);
CREATE INDEX IF NOT EXISTS idx_covenant_alert_severity ON re_covenant_alert (severity) WHERE NOT resolved;

-- ── BUILD-02: LP report metadata ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_lp_report (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    quarter         text NOT NULL,
    status          text NOT NULL DEFAULT 'draft', -- draft | review | approved | sent
    report_json     jsonb,
    narrative_text  text,
    generated_by    text,
    approved_by     text,
    approved_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (fund_id, quarter, status)
);

-- ── BUILD-03: DDQ workflow results ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS re_ddq_response (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    document_id     uuid NOT NULL,
    status          text NOT NULL DEFAULT 'processing', -- processing | completed | failed
    total_questions int,
    answered        int DEFAULT 0,
    needs_input     int DEFAULT 0,
    questions_json  jsonb,                    -- [{question, draft_answer, sources, confidence, needs_input}]
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── BUILD-04: Capital call / distribution notices ─────────────────────────────
CREATE TABLE IF NOT EXISTS re_notice (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    partner_id      uuid NOT NULL,
    notice_type     text NOT NULL,            -- capital_call | distribution
    source_entry_id uuid,                     -- re_capital_ledger_entry.entry_id
    amount          numeric(28,12) NOT NULL,
    currency        text NOT NULL DEFAULT 'USD',
    due_date        date,
    fund_name       text,
    partner_name    text,
    wire_instructions jsonb,
    template_json   jsonb,
    status          text NOT NULL DEFAULT 'draft', -- draft | pending_review | approved | sent
    approved_by     text,
    approved_at     timestamptz,
    sent_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notice_fund_type ON re_notice (fund_id, notice_type);
CREATE INDEX IF NOT EXISTS idx_notice_status ON re_notice (status) WHERE status != 'sent';
