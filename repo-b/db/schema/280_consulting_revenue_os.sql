-- 280_consulting_revenue_os.sql
-- Consulting Revenue OS: deterministic pipeline, outreach, proposals,
-- client lifecycle, engagement delivery, revenue scheduling, and metrics.
--
-- Extends the canonical CRM tables (260_crm_native.sql) via foreign keys
-- rather than duplicating account/contact/opportunity data.

-- ─── 1. Lead Profile Extension ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_lead_profile (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    crm_account_id      uuid NOT NULL REFERENCES crm_account(crm_account_id) ON DELETE CASCADE,
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    ai_maturity         text CHECK (ai_maturity IN ('none','exploring','piloting','scaling','embedded')),
    pain_category       text CHECK (pain_category IN (
        'ai_roi','erp_failure','reporting_chaos','governance_gap',
        'revenue','efficiency','risk','compliance','growth','other'
    )),
    lead_score          int NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
    lead_source         text CHECK (lead_source IN ('manual','research_loop','referral','inbound','outbound','event','partner','scrape')),
    company_size        text CHECK (company_size IN ('1_10','10_50','50_200','200_1000','1000_plus')),
    revenue_band        text,
    erp_system          text,
    estimated_budget    numeric(28,12),
    qualification_notes text,
    qualified_at        timestamptz,
    disqualified_at     timestamptz,
    disqualified_reason text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (crm_account_id)
);

-- ─── 2. Contact Profile Extension ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_contact_profile (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    crm_contact_id      uuid NOT NULL REFERENCES crm_contact(crm_contact_id) ON DELETE CASCADE,
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    linkedin_url        text,
    relationship_strength text CHECK (relationship_strength IN ('cold','warm','hot','champion')),
    decision_role       text CHECK (decision_role IN ('champion','decision_maker','influencer','blocker','user')),
    last_outreach_at    timestamptz,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (crm_contact_id)
);

-- ─── 3. Outreach Templates ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_outreach_template (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    name                text NOT NULL,
    channel             text NOT NULL CHECK (channel IN ('email','linkedin','phone','other')),
    category            text,
    subject_template    text,
    body_template       text NOT NULL,
    is_active           boolean NOT NULL DEFAULT true,
    use_count           int NOT NULL DEFAULT 0,
    reply_count         int NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. Outreach Log ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_outreach_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    crm_activity_id     uuid REFERENCES crm_activity(crm_activity_id) ON DELETE SET NULL,
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    crm_account_id      uuid REFERENCES crm_account(crm_account_id),
    crm_contact_id      uuid REFERENCES crm_contact(crm_contact_id),
    template_id         uuid REFERENCES cro_outreach_template(id) ON DELETE SET NULL,
    channel             text NOT NULL CHECK (channel IN ('email','linkedin','phone','meeting','other')),
    direction           text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
    subject             text,
    body_preview        text,
    sent_at             timestamptz NOT NULL DEFAULT now(),
    replied_at          timestamptz,
    reply_sentiment     text CHECK (reply_sentiment IN ('positive','neutral','negative')),
    meeting_booked      boolean NOT NULL DEFAULT false,
    bounce              boolean NOT NULL DEFAULT false,
    sent_by             text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. Proposals ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_proposal (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    crm_opportunity_id  uuid REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE SET NULL,
    crm_account_id      uuid REFERENCES crm_account(crm_account_id),
    title               text NOT NULL,
    version             int NOT NULL DEFAULT 1,
    status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','viewed','accepted','rejected','expired')),
    pricing_model       text CHECK (pricing_model IN ('fixed','time_materials','retainer','milestone','hybrid')),
    total_value         numeric(28,12) NOT NULL DEFAULT 0,
    cost_estimate       numeric(28,12) NOT NULL DEFAULT 0,
    margin_pct          numeric(28,12),
    valid_until         date,
    sent_at             timestamptz,
    accepted_at         timestamptz,
    rejected_at         timestamptz,
    rejection_reason    text,
    scope_summary       text,
    risk_notes          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 6. Clients ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_client (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    crm_account_id      uuid NOT NULL REFERENCES crm_account(crm_account_id),
    crm_opportunity_id  uuid REFERENCES crm_opportunity(crm_opportunity_id),
    proposal_id         uuid REFERENCES cro_proposal(id),
    client_status       text NOT NULL DEFAULT 'active'
                        CHECK (client_status IN ('active','paused','churned','completed')),
    account_owner       text,
    start_date          date NOT NULL DEFAULT CURRENT_DATE,
    lifetime_value      numeric(28,12) NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (crm_account_id, env_id)
);

-- ─── 7. Engagements ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_engagement (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    client_id           uuid NOT NULL REFERENCES cro_client(id) ON DELETE CASCADE,
    proposal_id         uuid REFERENCES cro_proposal(id),
    name                text NOT NULL,
    engagement_type     text NOT NULL CHECK (engagement_type IN (
        'strategy','implementation','audit','retainer','training','workshop','other'
    )),
    status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('planning','active','paused','completed','cancelled')),
    start_date          date,
    end_date            date,
    budget              numeric(28,12) NOT NULL DEFAULT 0,
    actual_spend        numeric(28,12) NOT NULL DEFAULT 0,
    margin_pct          numeric(28,12),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 8. Revenue Schedule ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_revenue_schedule (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    engagement_id       uuid NOT NULL REFERENCES cro_engagement(id) ON DELETE CASCADE,
    client_id           uuid NOT NULL REFERENCES cro_client(id),
    period_date         date NOT NULL,
    amount              numeric(28,12) NOT NULL DEFAULT 0,
    currency            text NOT NULL DEFAULT 'USD',
    invoice_status      text NOT NULL DEFAULT 'scheduled'
                        CHECK (invoice_status IN ('scheduled','invoiced','paid','overdue','written_off')),
    invoiced_at         timestamptz,
    paid_at             timestamptz,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 9. Revenue Metrics Snapshot ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_revenue_metrics_snapshot (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    snapshot_date       date NOT NULL DEFAULT CURRENT_DATE,
    -- Pipeline
    weighted_pipeline   numeric(28,12) NOT NULL DEFAULT 0,
    unweighted_pipeline numeric(28,12) NOT NULL DEFAULT 0,
    open_opportunities  int NOT NULL DEFAULT 0,
    -- Close rate (rolling 90d)
    close_rate_90d      numeric(28,12),
    won_count_90d       int NOT NULL DEFAULT 0,
    lost_count_90d      int NOT NULL DEFAULT 0,
    -- Outreach (rolling 30d)
    outreach_count_30d  int NOT NULL DEFAULT 0,
    response_rate_30d   numeric(28,12),
    meetings_30d        int NOT NULL DEFAULT 0,
    -- Revenue
    revenue_mtd         numeric(28,12) NOT NULL DEFAULT 0,
    revenue_qtd         numeric(28,12) NOT NULL DEFAULT 0,
    forecast_90d        numeric(28,12) NOT NULL DEFAULT 0,
    -- Engagements
    avg_deal_size       numeric(28,12),
    avg_margin_pct      numeric(28,12),
    active_engagements  int NOT NULL DEFAULT 0,
    active_clients      int NOT NULL DEFAULT 0,
    -- Metadata
    computed_at         timestamptz NOT NULL DEFAULT now(),
    input_hash          text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 10. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cro_lead_profile_env
    ON cro_lead_profile (env_id, business_id);

CREATE INDEX IF NOT EXISTS idx_cro_lead_profile_score
    ON cro_lead_profile (env_id, business_id, lead_score DESC);

CREATE INDEX IF NOT EXISTS idx_cro_contact_profile_env
    ON cro_contact_profile (env_id, business_id);

CREATE INDEX IF NOT EXISTS idx_cro_outreach_template_env
    ON cro_outreach_template (env_id, business_id, is_active);

CREATE INDEX IF NOT EXISTS idx_cro_outreach_log_env
    ON cro_outreach_log (env_id, business_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_cro_outreach_log_account
    ON cro_outreach_log (crm_account_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_cro_proposal_env
    ON cro_proposal (env_id, business_id, status);

CREATE INDEX IF NOT EXISTS idx_cro_proposal_opp
    ON cro_proposal (crm_opportunity_id);

CREATE INDEX IF NOT EXISTS idx_cro_client_env
    ON cro_client (env_id, business_id, client_status);

CREATE INDEX IF NOT EXISTS idx_cro_engagement_client
    ON cro_engagement (client_id, status);

CREATE INDEX IF NOT EXISTS idx_cro_engagement_env
    ON cro_engagement (env_id, business_id, status);

CREATE INDEX IF NOT EXISTS idx_cro_revenue_schedule_engagement
    ON cro_revenue_schedule (engagement_id, period_date);

CREATE INDEX IF NOT EXISTS idx_cro_revenue_schedule_client
    ON cro_revenue_schedule (client_id, period_date);

CREATE INDEX IF NOT EXISTS idx_cro_revenue_schedule_status
    ON cro_revenue_schedule (env_id, business_id, invoice_status, period_date);

CREATE INDEX IF NOT EXISTS idx_cro_metrics_snapshot_env
    ON cro_revenue_metrics_snapshot (env_id, business_id, snapshot_date DESC);
