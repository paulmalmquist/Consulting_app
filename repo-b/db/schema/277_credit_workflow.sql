-- 277_credit_workflow.sql
-- Credit decisioning workflow, audit, and scenario model.
-- Parallel to 267_repe_fund_workflow.sql.
-- Implements: decision policies, decision logs, exception queues,
--             portfolio scenarios, knowledge corpus, citation chains.

-- ============================================================
-- KNOWLEDGE CORPUS — the walled garden document registry
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_corpus_document (
  document_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  document_ref          text NOT NULL,
  title                 text NOT NULL,
  document_type         text NOT NULL
                        CHECK (document_type IN (
                          'policy','procedure','rate_sheet','regulatory_guidance',
                          'internal_memo','servicing_guide','compliance_bulletin','other'
                        )),
  version_no            int NOT NULL DEFAULT 1,
  effective_from        date,
  effective_to          date,
  content_hash          text,
  passage_count         int NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','superseded','archived')),
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at           timestamptz NOT NULL DEFAULT now(),
  created_by            text,
  UNIQUE (env_id, business_id, document_ref, version_no)
);

CREATE TABLE IF NOT EXISTS cc_corpus_passage (
  passage_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           uuid NOT NULL REFERENCES cc_corpus_document(document_id) ON DELETE CASCADE,
  passage_ref           text NOT NULL,
  section_path          text,
  content_text          text NOT NULL,
  embedding_vector      jsonb,
  token_count           int,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, passage_ref)
);

CREATE INDEX IF NOT EXISTS cc_corpus_passage_doc_idx
  ON cc_corpus_passage (document_id);

-- ============================================================
-- DECISION POLICIES — codified underwriting rules (waterfall-equivalent)
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_decision_policy (
  policy_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  portfolio_id          uuid REFERENCES cc_portfolio(portfolio_id) ON DELETE SET NULL,
  name                  text NOT NULL,
  policy_type           text NOT NULL DEFAULT 'underwriting'
                        CHECK (policy_type IN ('underwriting','modification','collection','exception_handling')),
  version_no            int NOT NULL DEFAULT 1,
  rules_json            jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- rules_json schema:
  -- [
  --   {
  --     "rule_id": "R001",
  --     "description": "Auto-approve prime borrowers",
  --     "condition": { "fico_min": 720, "dti_max": 0.36, "income_verified": true },
  --     "action": "auto_approve|auto_decline|exception_route|manual_review",
  --     "route_to": "senior_underwriter",
  --     "explanation_template": "Approved: FICO {fico} >= 720, DTI {dti} <= 36%",
  --     "adverse_action_code": "AA01",
  --     "source_document_ref": "POL-2025-042",
  --     "source_passage_ref": "section_4.2.1"
  --   }
  -- ]
  is_active             boolean NOT NULL DEFAULT false,
  effective_from        date,
  effective_to          date,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, name, version_no)
);

-- Only one active policy per portfolio per type
CREATE UNIQUE INDEX IF NOT EXISTS cc_decision_policy_one_active_uidx
  ON cc_decision_policy (portfolio_id, policy_type)
  WHERE is_active = true;

-- ============================================================
-- DECISION LOG — immutable audit trail for every decision
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_decision_log (
  decision_log_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  loan_id               uuid REFERENCES cc_loan(loan_id) ON DELETE SET NULL,
  policy_id             uuid NOT NULL REFERENCES cc_decision_policy(policy_id) ON DELETE RESTRICT,
  policy_version_no     int NOT NULL,
  decision              text NOT NULL
                        CHECK (decision IN (
                          'auto_approve','auto_decline','exception_route',
                          'manual_approve','manual_decline','insufficient_evidence'
                        )),
  rules_evaluated_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- rules_evaluated_json schema:
  -- [
  --   {
  --     "rule_id": "R001",
  --     "attribute": "fico_at_origination",
  --     "threshold": 720,
  --     "observed_value": 685,
  --     "result": "PASS|FAIL",
  --     "source_document_ref": "POL-2025-042",
  --     "source_passage_ref": "section_4.2.1"
  --   }
  -- ]
  explanation           text NOT NULL,
  adverse_action_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_snapshot_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  citation_chain_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- citation_chain_json schema:
  -- [
  --   {
  --     "step": 1,
  --     "document_id": "uuid",
  --     "document_ref": "POL-2025-042",
  --     "passage_ref": "section_4.2.1",
  --     "excerpt": "exact quoted text",
  --     "relevance": "DIRECT|RELATED"
  --   }
  -- ]
  chain_status          text NOT NULL DEFAULT 'COMPLETE'
                        CHECK (chain_status IN ('COMPLETE','PARTIAL','BROKEN')),
  reasoning_steps_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- reasoning_steps_json: full chain-of-thought log
  -- [
  --   { "step_number": 1, "step_type": "decompose", "input": {}, "output": {}, "timestamp": "ISO" },
  --   { "step_number": 2, "step_type": "retrieve", ... },
  --   { "step_number": 3, "step_type": "validate", ... },
  --   { "step_number": 4, "step_type": "synthesize", ... },
  --   { "step_number": 5, "step_type": "audit", ... }
  -- ]
  format_lock           text,
  schema_valid          boolean NOT NULL DEFAULT true,
  decided_by            text NOT NULL DEFAULT 'system',
  override_reason       text,
  latency_ms            int,
  decided_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Immutable: no UPDATE trigger, no updated_at column.
-- Decision logs are append-only.

CREATE INDEX IF NOT EXISTS cc_decision_log_loan_idx
  ON cc_decision_log (loan_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS cc_decision_log_policy_idx
  ON cc_decision_log (policy_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS cc_decision_log_chain_status_idx
  ON cc_decision_log (chain_status)
  WHERE chain_status != 'COMPLETE';

-- ============================================================
-- EXCEPTION QUEUE — routed decisions awaiting human review
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_exception_queue (
  exception_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  loan_id               uuid REFERENCES cc_loan(loan_id) ON DELETE SET NULL,
  decision_log_id       uuid NOT NULL REFERENCES cc_decision_log(decision_log_id) ON DELETE RESTRICT,
  route_to              text NOT NULL,
  priority              text NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low','medium','high','critical')),
  reason                text NOT NULL,
  failing_rules_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [ { "rule_id": "R002", "attribute": "dti", "threshold": 0.36, "observed": 0.42, "gap": 0.06 } ]
  recommended_action    text,
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','assigned','in_review','resolved','escalated','expired')),
  assigned_to           text,
  resolution            text CHECK (resolution IN ('approved','declined','modified','escalated','withdrawn')),
  resolution_note       text,
  resolution_citation_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  sla_deadline          timestamptz,
  opened_at             timestamptz NOT NULL DEFAULT now(),
  assigned_at           timestamptz,
  resolved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_exception_queue_status_idx
  ON cc_exception_queue (status, priority, opened_at)
  WHERE status IN ('open','assigned','in_review');

CREATE INDEX IF NOT EXISTS cc_exception_queue_sla_idx
  ON cc_exception_queue (sla_deadline)
  WHERE status IN ('open','assigned','in_review') AND sla_deadline IS NOT NULL;

-- ============================================================
-- PORTFOLIO SCENARIOS — stress, base, custom loss scenarios
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_portfolio_scenario (
  scenario_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  portfolio_id          uuid NOT NULL REFERENCES cc_portfolio(portfolio_id) ON DELETE CASCADE,
  name                  text NOT NULL,
  scenario_type         text NOT NULL DEFAULT 'base'
                        CHECK (scenario_type IN ('base','stress','upside','downside','custom')),
  is_base               boolean NOT NULL DEFAULT false,
  assumptions_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- assumptions_json schema:
  -- {
  --   "pd_curve_multiplier": 1.0,
  --   "lgd_override": null,
  --   "prepayment_speed_cpr": 0.06,
  --   "recovery_lag_months": 12,
  --   "unemployment_rate": 0.04,
  --   "hpa_rate": 0.02,
  --   "notes": "Base case using historical averages"
  -- }
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','archived')),
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, name)
);

-- One base scenario per portfolio
CREATE UNIQUE INDEX IF NOT EXISTS cc_portfolio_scenario_one_base_uidx
  ON cc_portfolio_scenario (portfolio_id)
  WHERE is_base = true AND status = 'active';

-- ============================================================
-- AUDIT RECORDS — immutable chain-of-thought reasoning logs
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_audit_record (
  audit_record_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  query_id              uuid,
  query_text            text,
  operator_id           text NOT NULL DEFAULT 'system',
  mode                  text NOT NULL
                        CHECK (mode IN ('decisioning','monitoring','forecasting','attribution','query')),
  timestamp_start       timestamptz NOT NULL,
  timestamp_end         timestamptz,
  latency_ms            int,
  reasoning_steps_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  citation_chains_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_output_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  suppressed            boolean NOT NULL DEFAULT false,
  suppression_reason    text,
  format_lock           text,
  schema_valid          boolean,
  corpus_documents_searched jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Immutable: append-only, no updates.

CREATE INDEX IF NOT EXISTS cc_audit_record_env_idx
  ON cc_audit_record (env_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cc_audit_record_suppressed_idx
  ON cc_audit_record (suppressed)
  WHERE suppressed = true;
