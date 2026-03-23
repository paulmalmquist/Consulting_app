-- ============================================================================
-- 332 – Execution Pattern Intelligence (EPI)
-- Tenant-wide consulting intelligence layer that aggregates approved outputs
-- from upstream domain workspaces into anonymized cross-engagement patterns,
-- predictions, recommendations, and case-feed drafts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Engagements registry (links to upstream environment / business)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS epi_engagement (
    engagement_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          UUID NOT NULL,
    business_id     UUID NOT NULL,
    client_name     TEXT,
    industry        TEXT,
    sub_industry    TEXT,
    engagement_stage TEXT DEFAULT 'active',
    started_at      TIMESTAMPTZ DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_engagement_env ON epi_engagement (env_id);
CREATE INDEX IF NOT EXISTS idx_epi_engagement_industry ON epi_engagement (industry);

-- ---------------------------------------------------------------------------
-- 2. Source artifacts – approved upstream outputs ingested into EPI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS epi_source_artifact (
    artifact_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    source_env_id   UUID NOT NULL,
    source_record_id UUID NOT NULL,
    source_type     TEXT NOT NULL,  -- discovery_account, data_studio_profile, workflow_observation, vendor_stack, metric_definition, pilot_outcome, architecture_outcome, case_insight
    approved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    version         INT NOT NULL DEFAULT 1,
    provenance      JSONB DEFAULT '{}',
    payload         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_source_artifact_engagement ON epi_source_artifact (engagement_id);
CREATE INDEX IF NOT EXISTS idx_epi_source_artifact_type ON epi_source_artifact (source_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_epi_source_artifact_record_version
    ON epi_source_artifact (source_env_id, source_record_id, version);

-- ---------------------------------------------------------------------------
-- 3. Raw observation tables (append-only, RLS-protected, keyed to engagement)
-- ---------------------------------------------------------------------------

-- Vendor observations
CREATE TABLE IF NOT EXISTS epi_vendor_observation (
    observation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    artifact_id     UUID REFERENCES epi_source_artifact(artifact_id),
    vendor_name     TEXT NOT NULL,
    vendor_family   TEXT,
    product_name    TEXT,
    category        TEXT,
    version_info    TEXT,
    contract_value  NUMERIC,
    renewal_date    DATE,
    problems        TEXT[],
    tags            TEXT[],
    payload         JSONB DEFAULT '{}',
    observed_at     TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_vendor_obs_engagement ON epi_vendor_observation (engagement_id);
CREATE INDEX IF NOT EXISTS idx_epi_vendor_obs_family ON epi_vendor_observation (vendor_family);

-- Workflow observations
CREATE TABLE IF NOT EXISTS epi_workflow_observation (
    observation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    artifact_id     UUID REFERENCES epi_source_artifact(artifact_id),
    workflow_name   TEXT NOT NULL,
    canonical_name  TEXT,
    steps           JSONB DEFAULT '[]',
    step_count      INT,
    handoff_count   INT,
    manual_steps    INT,
    automated_steps INT,
    cycle_time_hours NUMERIC,
    bottleneck_step TEXT,
    industry        TEXT,
    tags            TEXT[],
    payload         JSONB DEFAULT '{}',
    observed_at     TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_workflow_obs_engagement ON epi_workflow_observation (engagement_id);
CREATE INDEX IF NOT EXISTS idx_epi_workflow_obs_canonical ON epi_workflow_observation (canonical_name);

-- Metric observations
CREATE TABLE IF NOT EXISTS epi_metric_observation (
    observation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    artifact_id     UUID REFERENCES epi_source_artifact(artifact_id),
    metric_name     TEXT NOT NULL,
    canonical_key   TEXT,
    formula         TEXT,
    formula_ast     JSONB,
    unit            TEXT,
    source_system   TEXT,
    report_usage    TEXT[],
    industry        TEXT,
    tags            TEXT[],
    payload         JSONB DEFAULT '{}',
    observed_at     TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_metric_obs_engagement ON epi_metric_observation (engagement_id);
CREATE INDEX IF NOT EXISTS idx_epi_metric_obs_canonical ON epi_metric_observation (canonical_key);

-- Architecture observations
CREATE TABLE IF NOT EXISTS epi_architecture_observation (
    observation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    artifact_id     UUID REFERENCES epi_source_artifact(artifact_id),
    architecture_name TEXT NOT NULL,
    modules         JSONB DEFAULT '[]',
    inputs          TEXT[],
    outputs         TEXT[],
    replaced_vendors TEXT[],
    phase_count     INT,
    status          TEXT DEFAULT 'proposed',  -- proposed, in_progress, completed, abandoned
    business_outcome_score  NUMERIC,
    adoption_score          NUMERIC,
    time_to_value_score     NUMERIC,
    stability_score         NUMERIC,
    schedule_adherence_score NUMERIC,
    weighted_success_score  NUMERIC,  -- computed: 0.40*business + 0.20*adoption + 0.20*ttv + 0.10*stability + 0.10*schedule
    industry        TEXT,
    tags            TEXT[],
    payload         JSONB DEFAULT '{}',
    observed_at     TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_arch_obs_engagement ON epi_architecture_observation (engagement_id);

-- Pilot observations
CREATE TABLE IF NOT EXISTS epi_pilot_observation (
    observation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    artifact_id     UUID REFERENCES epi_source_artifact(artifact_id),
    pilot_name      TEXT NOT NULL,
    pilot_type      TEXT,
    target_workflow TEXT,
    target_vendor   TEXT,
    modules_used    TEXT[],
    duration_weeks  INT,
    status          TEXT DEFAULT 'proposed',  -- proposed, active, completed, abandoned
    business_outcome_score  NUMERIC,
    adoption_score          NUMERIC,
    time_to_value_score     NUMERIC,
    stability_score         NUMERIC,
    schedule_adherence_score NUMERIC,
    weighted_success_score  NUMERIC,
    industry        TEXT,
    tags            TEXT[],
    payload         JSONB DEFAULT '{}',
    observed_at     TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_pilot_obs_engagement ON epi_pilot_observation (engagement_id);

-- Failure observations
CREATE TABLE IF NOT EXISTS epi_failure_observation (
    observation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    artifact_id     UUID REFERENCES epi_source_artifact(artifact_id),
    failure_mode    TEXT NOT NULL,
    category        TEXT,  -- reporting_fragmentation, manual_consolidation, data_drift, vendor_lock_in, metric_conflict
    severity        TEXT DEFAULT 'medium',  -- low, medium, high, critical
    related_vendors TEXT[],
    related_workflows TEXT[],
    related_metrics TEXT[],
    root_cause      TEXT,
    resolution      TEXT,
    industry        TEXT,
    tags            TEXT[],
    payload         JSONB DEFAULT '{}',
    observed_at     TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_failure_obs_engagement ON epi_failure_observation (engagement_id);
CREATE INDEX IF NOT EXISTS idx_epi_failure_obs_category ON epi_failure_observation (category);

-- ---------------------------------------------------------------------------
-- 4. Pattern tables (shared benchmark layer, anonymized)
-- ---------------------------------------------------------------------------

-- Base pattern
CREATE TABLE IF NOT EXISTS epi_pattern (
    pattern_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_type        TEXT NOT NULL,  -- vendor, workflow, metric, architecture, pilot
    pattern_description TEXT NOT NULL,
    confidence_score    NUMERIC NOT NULL DEFAULT 0,
    support_count       INT NOT NULL DEFAULT 0,
    industry_tags       TEXT[],
    related_vendors     TEXT[],
    related_workflows   TEXT[],
    first_seen_at       TIMESTAMPTZ DEFAULT now(),
    last_seen_at        TIMESTAMPTZ DEFAULT now(),
    status              TEXT DEFAULT 'emerging',  -- emerging, confirmed, declining, archived
    visibility_scope    TEXT DEFAULT 'internal',  -- internal, shared, published
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_pattern_type ON epi_pattern (pattern_type);
CREATE INDEX IF NOT EXISTS idx_epi_pattern_status ON epi_pattern (status);
CREATE INDEX IF NOT EXISTS idx_epi_pattern_confidence ON epi_pattern (confidence_score DESC);

-- Pattern support junction (links pattern to supporting engagements)
CREATE TABLE IF NOT EXISTS epi_pattern_support (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id      UUID NOT NULL REFERENCES epi_pattern(pattern_id) ON DELETE CASCADE,
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    observation_id  UUID,
    contribution_weight NUMERIC DEFAULT 1.0,
    added_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE (pattern_id, engagement_id, observation_id)
);

CREATE INDEX IF NOT EXISTS idx_epi_pattern_support_pattern ON epi_pattern_support (pattern_id);

-- ---------------------------------------------------------------------------
-- 5. Pattern subtypes
-- ---------------------------------------------------------------------------

-- Vendor patterns
CREATE TABLE IF NOT EXISTS epi_vendor_pattern (
    vendor_pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id      UUID NOT NULL REFERENCES epi_pattern(pattern_id) ON DELETE CASCADE,
    vendor_family   TEXT NOT NULL,
    typical_stack   TEXT[],
    typical_problems TEXT[],
    co_occurring_vendors TEXT[],
    replacement_frequency NUMERIC,
    avg_contract_value NUMERIC,
    industries      TEXT[],
    payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_epi_vendor_pattern_family ON epi_vendor_pattern (vendor_family);

-- Workflow patterns
CREATE TABLE IF NOT EXISTS epi_workflow_pattern (
    workflow_pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id      UUID NOT NULL REFERENCES epi_pattern(pattern_id) ON DELETE CASCADE,
    canonical_name  TEXT NOT NULL,
    typical_steps   JSONB DEFAULT '[]',
    avg_step_count  NUMERIC,
    avg_cycle_time_hours NUMERIC,
    common_bottlenecks TEXT[],
    automation_potential NUMERIC,
    industries      TEXT[],
    payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_epi_workflow_pattern_name ON epi_workflow_pattern (canonical_name);

-- Metric patterns (conflicts)
CREATE TABLE IF NOT EXISTS epi_metric_pattern (
    metric_pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id      UUID NOT NULL REFERENCES epi_pattern(pattern_id) ON DELETE CASCADE,
    canonical_key   TEXT NOT NULL,
    number_of_variants INT DEFAULT 0,
    common_formula_variations JSONB DEFAULT '[]',
    conflicting_report_usage TEXT[],
    recommended_formula TEXT,
    industries      TEXT[],
    payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_epi_metric_pattern_key ON epi_metric_pattern (canonical_key);

-- Architecture patterns
CREATE TABLE IF NOT EXISTS epi_architecture_pattern (
    architecture_pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id      UUID NOT NULL REFERENCES epi_pattern(pattern_id) ON DELETE CASCADE,
    architecture_name TEXT NOT NULL,
    typical_modules JSONB DEFAULT '[]',
    typical_inputs  TEXT[],
    typical_outputs TEXT[],
    replaced_vendors TEXT[],
    avg_success_score NUMERIC,
    avg_phase_count NUMERIC,
    industries      TEXT[],
    payload         JSONB DEFAULT '{}'
);

-- Pilot patterns
CREATE TABLE IF NOT EXISTS epi_pilot_pattern (
    pilot_pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id      UUID NOT NULL REFERENCES epi_pattern(pattern_id) ON DELETE CASCADE,
    pilot_type      TEXT NOT NULL,
    target_workflow TEXT,
    target_vendor   TEXT,
    typical_modules TEXT[],
    avg_duration_weeks NUMERIC,
    avg_success_score NUMERIC,
    success_rate    NUMERIC,
    industries      TEXT[],
    payload         JSONB DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- 6. Knowledge graph
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS epi_graph_node (
    node_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_type       TEXT NOT NULL,  -- vendor, capability, workflow, metric, industry, architecture, pilot, module, failure_mode, pattern
    node_label      TEXT NOT NULL,
    properties      JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (node_type, node_label)
);

CREATE INDEX IF NOT EXISTS idx_epi_graph_node_type ON epi_graph_node (node_type);

CREATE TABLE IF NOT EXISTS epi_graph_edge (
    edge_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id  UUID NOT NULL REFERENCES epi_graph_node(node_id) ON DELETE CASCADE,
    target_node_id  UUID NOT NULL REFERENCES epi_graph_node(node_id) ON DELETE CASCADE,
    edge_type       TEXT NOT NULL,  -- uses, causes, resolves, replaces, depends_on, co_occurs, produces, consumes
    weight          NUMERIC DEFAULT 1.0,
    confidence      NUMERIC DEFAULT 0.5,
    provenance      JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_graph_edge_source ON epi_graph_edge (source_node_id);
CREATE INDEX IF NOT EXISTS idx_epi_graph_edge_target ON epi_graph_edge (target_node_id);
CREATE INDEX IF NOT EXISTS idx_epi_graph_edge_type ON epi_graph_edge (edge_type);

-- ---------------------------------------------------------------------------
-- 7. Predictions & recommendations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS epi_account_prediction (
    prediction_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    prediction_type TEXT DEFAULT 'early_warning',
    industry        TEXT,
    vendor_stack    TEXT[],
    workflows       TEXT[],
    company_profile JSONB DEFAULT '{}',
    likely_issues   JSONB DEFAULT '[]',  -- [{issue, confidence, matched_pattern_id, evidence}]
    recommended_discovery_requests JSONB DEFAULT '[]',
    matched_patterns UUID[],
    overall_confidence NUMERIC,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_prediction_engagement ON epi_account_prediction (engagement_id);

CREATE TABLE IF NOT EXISTS epi_recommendation_result (
    recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id   UUID NOT NULL REFERENCES epi_engagement(engagement_id) ON DELETE CASCADE,
    recommendation_type TEXT NOT NULL,  -- pilot, architecture, module, discovery_request
    title           TEXT NOT NULL,
    description     TEXT,
    confidence      NUMERIC,
    matched_patterns UUID[],
    evidence        JSONB DEFAULT '[]',  -- [{pattern_id, support_count, why_match}]
    rank            INT DEFAULT 0,
    status          TEXT DEFAULT 'pending',  -- pending, accepted, rejected, implemented
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_recommendation_engagement ON epi_recommendation_result (engagement_id);

-- ---------------------------------------------------------------------------
-- 8. Case feed (approval queue)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS epi_case_feed_item (
    item_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    summary         TEXT,
    industry        TEXT,
    draft_body      TEXT,
    status          TEXT DEFAULT 'draft',  -- draft, pending_review, approved, published, rejected
    source_type     TEXT,  -- pattern, architecture, pilot
    generated_from_pattern UUID REFERENCES epi_pattern(pattern_id),
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epi_case_feed_status ON epi_case_feed_item (status);

CREATE TABLE IF NOT EXISTS epi_case_feed_pattern_link (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id         UUID NOT NULL REFERENCES epi_case_feed_item(item_id) ON DELETE CASCADE,
    pattern_id      UUID NOT NULL REFERENCES epi_pattern(pattern_id) ON DELETE CASCADE,
    UNIQUE (item_id, pattern_id)
);

-- ---------------------------------------------------------------------------
-- 9. Dashboard rollups (materialized by nightly job)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS epi_dashboard_rollup (
    rollup_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry        TEXT NOT NULL,
    rollup_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    total_engagements INT DEFAULT 0,
    total_patterns  INT DEFAULT 0,
    total_predictions INT DEFAULT 0,
    prediction_hit_rate NUMERIC,
    top_vendor_stacks JSONB DEFAULT '[]',
    top_workflow_bottlenecks JSONB DEFAULT '[]',
    top_metric_conflicts JSONB DEFAULT '[]',
    top_failure_modes JSONB DEFAULT '[]',
    top_successful_pilots JSONB DEFAULT '[]',
    top_architectures JSONB DEFAULT '[]',
    reporting_delay_patterns JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (industry, rollup_date)
);

CREATE INDEX IF NOT EXISTS idx_epi_dashboard_rollup_industry ON epi_dashboard_rollup (industry);
