-- 281_strategic_outreach_engine.sql
-- Strategic Outreach Engine for hypothesis-driven operator outreach.
-- Adds a non-sending intelligence layer on top of the Consulting Revenue OS.

CREATE TABLE IF NOT EXISTS cro_strategic_lead (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                      text NOT NULL,
    business_id                 uuid NOT NULL,
    lead_profile_id             uuid NOT NULL REFERENCES cro_lead_profile(id) ON DELETE CASCADE,
    crm_account_id              uuid NOT NULL REFERENCES crm_account(crm_account_id) ON DELETE CASCADE,
    employee_range              text NOT NULL,
    multi_entity_flag           boolean NOT NULL DEFAULT false,
    pe_backed_flag              boolean NOT NULL DEFAULT false,
    estimated_system_stack      jsonb NOT NULL DEFAULT '[]'::jsonb,
    ai_pressure_score           int NOT NULL CHECK (ai_pressure_score BETWEEN 1 AND 5),
    reporting_complexity_score  int NOT NULL CHECK (reporting_complexity_score BETWEEN 1 AND 5),
    governance_risk_score       int NOT NULL CHECK (governance_risk_score BETWEEN 1 AND 5),
    vendor_fragmentation_score  int NOT NULL CHECK (vendor_fragmentation_score BETWEEN 1 AND 5),
    trigger_boost_score         int NOT NULL DEFAULT 0 CHECK (trigger_boost_score BETWEEN 0 AND 20),
    composite_priority_score    int NOT NULL CHECK (composite_priority_score BETWEEN 0 AND 100),
    status                      text NOT NULL DEFAULT 'Identified'
                                CHECK (status IN (
                                    'Identified',
                                    'Hypothesis Built',
                                    'Outreach Drafted',
                                    'Sent',
                                    'Engaged',
                                    'Diagnostic Scheduled',
                                    'Deliverable Sent',
                                    'Closed'
                                )),
    last_trigger_detected_at    timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (lead_profile_id)
);

CREATE TABLE IF NOT EXISTS cro_lead_hypothesis (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                          text NOT NULL,
    business_id                     uuid NOT NULL,
    lead_profile_id                 uuid NOT NULL REFERENCES cro_lead_profile(id) ON DELETE CASCADE,
    ai_roi_leakage_notes            text,
    erp_integration_risk_notes      text,
    reconciliation_fragility_notes  text,
    governance_gap_notes            text,
    vendor_fatigue_exposure         int CHECK (vendor_fatigue_exposure BETWEEN 1 AND 5),
    primary_wedge_angle             text,
    top_2_capabilities              jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (lead_profile_id)
);

CREATE TABLE IF NOT EXISTS cro_strategic_contact (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    lead_profile_id     uuid NOT NULL REFERENCES cro_lead_profile(id) ON DELETE CASCADE,
    name                text NOT NULL,
    title               text NOT NULL,
    linkedin_url        text,
    email               text,
    buyer_type          text NOT NULL DEFAULT 'Other' CHECK (buyer_type IN ('CFO', 'COO', 'CIO', 'Other')),
    authority_level     text NOT NULL DEFAULT 'Medium' CHECK (authority_level IN ('High', 'Medium', 'Low')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cro_outreach_sequence (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    lead_profile_id     uuid NOT NULL REFERENCES cro_lead_profile(id) ON DELETE CASCADE,
    sequence_stage      int NOT NULL CHECK (sequence_stage BETWEEN 1 AND 3),
    draft_message       text NOT NULL,
    approved_message    text,
    sent_timestamp      timestamptz,
    response_status     text NOT NULL DEFAULT 'pending'
                        CHECK (response_status IN ('pending', 'approved', 'sent', 'engaged', 'no_response', 'closed')),
    followup_due_date   date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cro_trigger_signal (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    lead_profile_id     uuid NOT NULL REFERENCES cro_lead_profile(id) ON DELETE CASCADE,
    trigger_type        text NOT NULL CHECK (trigger_type IN (
                            'ERP_Announcement',
                            'AI_Initiative',
                            'CFO_Hire',
                            'Job_Posting',
                            'PE_Acquisition',
                            'Other'
                        )),
    source_url          text NOT NULL,
    summary             text NOT NULL,
    detected_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cro_diagnostic_session (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                          text NOT NULL,
    business_id                     uuid NOT NULL,
    lead_profile_id                 uuid NOT NULL REFERENCES cro_lead_profile(id) ON DELETE CASCADE,
    scheduled_date                  date NOT NULL,
    notes                           text,
    governance_findings             text,
    ai_readiness_score              int CHECK (ai_readiness_score BETWEEN 1 AND 5),
    reconciliation_risk_score       int CHECK (reconciliation_risk_score BETWEEN 1 AND 5),
    recommended_first_intervention  text,
    question_responses              jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cro_deliverable (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    lead_profile_id     uuid NOT NULL REFERENCES cro_lead_profile(id) ON DELETE CASCADE,
    file_path           text NOT NULL,
    summary             text NOT NULL,
    sent_date           date NOT NULL DEFAULT CURRENT_DATE,
    followup_status     text NOT NULL DEFAULT 'pending' CHECK (followup_status IN ('pending', 'scheduled', 'completed')),
    content_markdown    text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cro_strategic_lead_env
    ON cro_strategic_lead (env_id, business_id, composite_priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_cro_strategic_lead_status
    ON cro_strategic_lead (env_id, business_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cro_lead_hypothesis_env
    ON cro_lead_hypothesis (env_id, business_id);

CREATE INDEX IF NOT EXISTS idx_cro_strategic_contact_env
    ON cro_strategic_contact (env_id, business_id, lead_profile_id);

CREATE INDEX IF NOT EXISTS idx_cro_outreach_sequence_env
    ON cro_outreach_sequence (env_id, business_id, response_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cro_outreach_sequence_lead
    ON cro_outreach_sequence (lead_profile_id, sequence_stage);

CREATE INDEX IF NOT EXISTS idx_cro_trigger_signal_env
    ON cro_trigger_signal (env_id, business_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_cro_trigger_signal_lead
    ON cro_trigger_signal (lead_profile_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_cro_diagnostic_session_env
    ON cro_diagnostic_session (env_id, business_id, scheduled_date DESC);

CREATE INDEX IF NOT EXISTS idx_cro_deliverable_env
    ON cro_deliverable (env_id, business_id, sent_date DESC);
