-- 313_pds_executive_automation.sql
-- PDS executive automation core entities, queue, outcomes, and KPI tracking.

CREATE TABLE IF NOT EXISTS pds_exec_decision_catalog (
  decision_code          text PRIMARY KEY,
  decision_title         text NOT NULL,
  category               text NOT NULL,
  description            text,
  trigger_metadata_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_key           text NOT NULL DEFAULT 'pds_command',
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pds_exec_decision_code_format CHECK (decision_code ~ '^D[0-9]{2}$')
);

CREATE TABLE IF NOT EXISTS pds_exec_threshold_policy (
  policy_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  decision_code      text REFERENCES pds_exec_decision_catalog(decision_code) ON DELETE SET NULL,
  policy_key         text NOT NULL,
  threshold_value    numeric(28,12),
  threshold_unit     text,
  is_enabled         boolean NOT NULL DEFAULT true,
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         text,
  updated_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, decision_code, policy_key)
);

CREATE TABLE IF NOT EXISTS pds_exec_signal_event (
  signal_event_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  decision_code      text REFERENCES pds_exec_decision_catalog(decision_code) ON DELETE SET NULL,
  signal_type        text NOT NULL,
  severity           text NOT NULL DEFAULT 'medium',
  signal_time        timestamptz NOT NULL DEFAULT now(),
  project_id         uuid REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  source_key         text,
  correlation_key    text,
  status             text NOT NULL DEFAULT 'open',
  payload_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         text,
  updated_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pds_exec_signal_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT chk_pds_exec_signal_status CHECK (status IN ('open', 'acknowledged', 'closed'))
);

CREATE TABLE IF NOT EXISTS pds_exec_queue_item (
  queue_item_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  decision_code          text NOT NULL REFERENCES pds_exec_decision_catalog(decision_code) ON DELETE RESTRICT,
  title                  text NOT NULL,
  summary                text,
  priority               text NOT NULL DEFAULT 'medium',
  status                 text NOT NULL DEFAULT 'open',
  project_id             uuid REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  signal_event_id        uuid REFERENCES pds_exec_signal_event(signal_event_id) ON DELETE SET NULL,
  recommended_action     text,
  recommended_owner      text,
  due_at                 timestamptz,
  risk_score             numeric(18,6),
  context_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_analysis_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pds_exec_queue_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT chk_pds_exec_queue_status CHECK (status IN ('open', 'in_review', 'approved', 'delegated', 'escalated', 'deferred', 'rejected', 'closed'))
);

CREATE TABLE IF NOT EXISTS pds_exec_queue_action (
  queue_action_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id        uuid NOT NULL REFERENCES pds_exec_queue_item(queue_item_id) ON DELETE CASCADE,
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  action_type          text NOT NULL,
  actor                text,
  rationale            text,
  delegate_to          text,
  action_payload_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pds_exec_action_type CHECK (action_type IN ('approve', 'delegate', 'escalate', 'defer', 'reject', 'close'))
);

CREATE TABLE IF NOT EXISTS pds_exec_outcome (
  outcome_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id        uuid NOT NULL REFERENCES pds_exec_queue_item(queue_item_id) ON DELETE CASCADE,
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  decision_code        text NOT NULL REFERENCES pds_exec_decision_catalog(decision_code) ON DELETE RESTRICT,
  outcome_status       text NOT NULL DEFAULT 'unknown',
  observed_at          timestamptz NOT NULL DEFAULT now(),
  latency_hours        numeric(18,6),
  kpi_impact_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_item_id),
  CONSTRAINT chk_pds_exec_outcome_status CHECK (outcome_status IN ('success', 'partial', 'failure', 'unknown'))
);

CREATE TABLE IF NOT EXISTS pds_exec_narrative_draft (
  draft_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  draft_type             text NOT NULL,
  title                  text,
  body_text              text NOT NULL,
  guardrail_flags_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                 text NOT NULL DEFAULT 'draft',
  source_run_id          text,
  model_used             text,
  fallback_used          boolean NOT NULL DEFAULT false,
  approved_by            text,
  approved_at            timestamptz,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pds_exec_draft_type CHECK (
    draft_type IN ('earnings_call', 'press_release', 'internal_memo', 'conference_talking_points', 'board_briefing', 'investor_briefing')
  ),
  CONSTRAINT chk_pds_exec_draft_status CHECK (status IN ('draft', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS pds_exec_briefing_pack (
  briefing_pack_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id             uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  briefing_type           text NOT NULL,
  period                  text NOT NULL,
  title                   text,
  sections_json           jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_text            text,
  status                  text NOT NULL DEFAULT 'draft',
  generated_from_run_id   text,
  approved_by             text,
  approved_at             timestamptz,
  published_at            timestamptz,
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by              text,
  updated_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pds_exec_briefing_type CHECK (briefing_type IN ('board', 'investor')),
  CONSTRAINT chk_pds_exec_briefing_status CHECK (status IN ('draft', 'approved', 'published'))
);

CREATE TABLE IF NOT EXISTS pds_exec_kpi_daily (
  kpi_daily_id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  kpi_date                           date NOT NULL,
  decision_latency_hours             numeric(18,6),
  risk_detection_lead_hours          numeric(18,6),
  delivery_reliability_delta         numeric(18,6),
  pipeline_visibility_delta          numeric(18,6),
  admin_workload_delta               numeric(18,6),
  queue_sla_compliance               numeric(18,6),
  recommendation_alignment           numeric(18,6),
  created_at                         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, kpi_date)
);

CREATE INDEX IF NOT EXISTS idx_pds_exec_signal_open
  ON pds_exec_signal_event (env_id, business_id, status, signal_time DESC);

CREATE INDEX IF NOT EXISTS idx_pds_exec_queue_open
  ON pds_exec_queue_item (env_id, business_id, status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_exec_queue_decision
  ON pds_exec_queue_item (env_id, business_id, decision_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_exec_action_queue
  ON pds_exec_queue_action (queue_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_exec_narrative_recent
  ON pds_exec_narrative_draft (env_id, business_id, draft_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pds_exec_briefing_recent
  ON pds_exec_briefing_pack (env_id, business_id, briefing_type, period, created_at DESC);

INSERT INTO pds_exec_decision_catalog
  (decision_code, decision_title, category, description, trigger_metadata_json, template_key)
VALUES
  ('D01', 'Market Expansion', 'strategy', 'Evaluate expansion into new geographies or sectors.', '{"default_frequency":"quarterly"}'::jsonb, 'pds_command'),
  ('D02', 'Sector Focus', 'strategy', 'Prioritize sectors based on growth, profitability, and demand.', '{"default_frequency":"monthly"}'::jsonb, 'pds_command'),
  ('D03', 'Strategic Partnerships', 'strategy', 'Prioritize partner relationships with developers and investors.', '{"default_frequency":"monthly"}'::jsonb, 'pds_command'),
  ('D04', 'Pursuit Approval', 'pipeline', 'Approve or decline pursuit of new opportunities.', '{"signal":"new_opportunity"}'::jsonb, 'pds_command'),
  ('D05', 'Proposal Strategy', 'pipeline', 'Set pricing and term strategy for proposals.', '{"signal":"proposal_window"}'::jsonb, 'pds_command'),
  ('D06', 'Pipeline Prioritization', 'pipeline', 'Rank opportunities for resource allocation.', '{"default_frequency":"weekly"}'::jsonb, 'pds_command'),
  ('D07', 'Project Escalation', 'portfolio', 'Escalate troubled projects for executive intervention.', '{"schedule_slip_pct":0.10,"budget_overrun_pct":0.07}'::jsonb, 'pds_command'),
  ('D08', 'Change Order Strategy', 'portfolio', 'Approve, renegotiate, or escalate major change orders.', '{"pending_change_order_count":3}'::jsonb, 'pds_command'),
  ('D09', 'Contractor Replacement', 'portfolio', 'Replace or renegotiate underperforming contractors.', '{"contractor_dispute_threshold":1}'::jsonb, 'pds_command'),
  ('D10', 'Project Staffing', 'portfolio', 'Assign PM and leadership team to projects.', '{"utilization_threshold":1.10}'::jsonb, 'pds_command'),
  ('D11', 'PM Promotion', 'org', 'Identify PM promotion candidates.', '{"review_frequency":"quarterly"}'::jsonb, 'pds_command'),
  ('D12', 'PM Intervention', 'org', 'Trigger mentoring/intervention for struggling PMs.', '{"risk_project_threshold":2}'::jsonb, 'pds_command'),
  ('D13', 'Hiring Decisions', 'org', 'Approve hiring for capacity and skill gaps.', '{"utilization_threshold":0.90}'::jsonb, 'pds_command'),
  ('D14', 'Workload Allocation', 'org', 'Rebalance workload across PMs and regions.', '{"utilization_threshold":1.10}'::jsonb, 'pds_command'),
  ('D15', 'Executive Client Engagement', 'client', 'Prioritize executive touchpoints with strategic clients.', '{"nps_drop_threshold":1.0}'::jsonb, 'pds_command'),
  ('D16', 'Client Recovery', 'client', 'Drive recovery actions for dissatisfied clients.', '{"client_complaint_threshold":1}'::jsonb, 'pds_command'),
  ('D17', 'Strategic Client Investment', 'client', 'Allocate focused investment toward top-tier clients.', '{"review_frequency":"monthly"}'::jsonb, 'pds_command'),
  ('D18', 'Litigation Risk Response', 'risk', 'Engage legal/insurance on emerging claims and disputes.', '{"claim_exposure_threshold":250000}'::jsonb, 'pds_command'),
  ('D19', 'Market Risk Adjustment', 'risk', 'Adjust pursuit posture based on macro volatility.', '{"rate_volatility_threshold":0.5}'::jsonb, 'pds_command'),
  ('D20', 'Reputation Protection', 'risk', 'Decline or risk-manage reputationally sensitive work.', '{"reputation_signal":"required"}'::jsonb, 'pds_command')
ON CONFLICT (decision_code) DO UPDATE SET
  decision_title = EXCLUDED.decision_title,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  trigger_metadata_json = EXCLUDED.trigger_metadata_json,
  template_key = EXCLUDED.template_key,
  updated_at = now();
