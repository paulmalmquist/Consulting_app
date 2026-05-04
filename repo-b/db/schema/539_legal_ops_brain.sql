-- 539_legal_ops_brain.sql
-- Winston Legal — reference implementation of the AI-assisted legal operating layer.
-- Adds: playbooks, clause library, approval rules, prior decisions (Legal Memory),
-- policy sources, intake requests, evidence-grounded review findings, decision packets,
-- attorney dispositions, outside counsel packets, approver registry.
--
-- These tables back the adapter Protocols defined in backend/app/services/legal_adapters/.
-- A client adopting Winston Legal would replace the default impls with adapters that
-- read/write their own enterprise systems (Jira/ServiceNow for intake, SharePoint/iManage
-- for documents, Okta/AD for approvers, Splunk for audit, etc.).
--
-- Style: matches 275_legal_ops_core.sql / 320_legal_ops_expansion.sql — uuid PKs,
-- env_id+business_id FKs to app.environments / business, no RLS (backend enforces
-- tenant isolation via WHERE clauses), source/version_no/metadata_json/timestamps.

-- ── Playbooks & playbook positions ───────────────────────────────────────────
-- Reference module: First-Pass Contract Review playbook source.
-- Adapter: KnowledgeBaseAdapter (default reads these tables).

CREATE TABLE IF NOT EXISTS legal_playbooks (
  playbook_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  name                  text NOT NULL,
  contract_type         text NOT NULL,
  jurisdiction          text,
  owner                 text,
  status                text NOT NULL DEFAULT 'active',
  effective_from        date,
  effective_to          date,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, name, version_no)
);

COMMENT ON TABLE legal_playbooks IS
  'Winston Legal: contract-type playbooks (NDA, MSA, DPA, …). Reference impl for what a client''s playbook library would contain.';

CREATE TABLE IF NOT EXISTS legal_playbook_positions (
  position_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                     uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  playbook_id                uuid NOT NULL REFERENCES legal_playbooks(playbook_id) ON DELETE CASCADE,
  clause_key                 text NOT NULL,
  clause_label               text NOT NULL,
  preferred_text             text,
  fallback_text              text,
  deal_breaker_text          text,
  sample_external_comment    text,
  internal_escalation_note   text,
  approval_required_if       jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity                   text NOT NULL DEFAULT 'medium',
  source_reference           text,
  source                     text NOT NULL DEFAULT 'manual',
  version_no                 int NOT NULL DEFAULT 1,
  metadata_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                 text,
  updated_by                 text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playbook_id, clause_key)
);

COMMENT ON TABLE legal_playbook_positions IS
  'Winston Legal: per-clause company position (preferred / fallback / deal-breaker). Drives First-Pass Contract Review.';

CREATE INDEX IF NOT EXISTS idx_legal_playbook_positions_lookup
  ON legal_playbook_positions (env_id, business_id, playbook_id, clause_key);

-- ── Clause library ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_clause_library (
  clause_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  clause_key            text NOT NULL,
  clause_label          text NOT NULL,
  canonical_text        text,
  tags_json             jsonb NOT NULL DEFAULT '[]'::jsonb,
  jurisdiction          text,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, clause_key, version_no)
);

COMMENT ON TABLE legal_clause_library IS
  'Winston Legal: canonical clause text by clause_key. Pattern for a client''s clause library / standards repo.';

-- ── Approval rules ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_approval_rules (
  rule_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  rule_name             text NOT NULL,
  contract_type         text,
  trigger_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_approver     text NOT NULL,
  escalation_level      text NOT NULL DEFAULT 'standard',
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, rule_name)
);

COMMENT ON TABLE legal_approval_rules IS
  'Winston Legal: when a clause/threshold triggers required approval. Reference for client authority matrix.';

-- ── Approver registry ────────────────────────────────────────────────────────
-- Default backing for ApproverRegistryAdapter. Clients fork to read Okta/AD/Workday.

CREATE TABLE IF NOT EXISTS legal_approver_registry (
  approver_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  role_label            text NOT NULL,
  person_name           text,
  contact               text,
  scope_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, role_label)
);

COMMENT ON TABLE legal_approver_registry IS
  'Winston Legal: default backing for ApproverRegistryAdapter. Clients replace with Okta / AD / Workday / native authz.';

-- ── Prior decisions (Legal Memory) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_prior_decisions (
  decision_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                     uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id                  uuid REFERENCES legal_matters(matter_id) ON DELETE SET NULL,
  contract_type              text,
  clause_key                 text,
  accepted_text              text,
  rejected_text              text,
  decided_by                 text,
  decided_at                 timestamptz,
  rationale                  text,
  attorney_disposition_id    uuid,
  outside_counsel_guidance   text,
  source                     text NOT NULL DEFAULT 'manual',
  version_no                 int NOT NULL DEFAULT 1,
  metadata_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                 text,
  updated_by                 text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE legal_prior_decisions IS
  'Winston Legal: Legal Memory — the organization''s accumulated dispositions, accepted/rejected positions, attorney rationale. The defensible asset; not a model output.';

CREATE INDEX IF NOT EXISTS idx_legal_prior_decisions_lookup
  ON legal_prior_decisions (env_id, business_id, contract_type, clause_key);

-- ── Policy sources ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_policy_sources (
  policy_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  title                 text NOT NULL,
  source_url            text,
  document_id           uuid,
  effective_from        date,
  version_history       jsonb NOT NULL DEFAULT '[]'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE legal_policy_sources IS
  'Winston Legal: pointers to policy documents (privacy, security, code of conduct, …) referenced by review/intake.';

-- ── Intake requests ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_intake_requests (
  intake_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  request_text           text NOT NULL,
  requestor              text,
  urgency_input          text,
  classification_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  classification_status  text NOT NULL DEFAULT 'pending',
  null_reason            text,
  matter_id              uuid REFERENCES legal_matters(matter_id) ON DELETE SET NULL,
  source_adapter         text NOT NULL DEFAULT 'winston',
  source_external_id     text,
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE legal_intake_requests IS
  'Winston Legal: structured intake. Default backing for IntakeSourceAdapter. Clients fork to Jira / ServiceNow / email / Slack / Workday.';

CREATE INDEX IF NOT EXISTS idx_legal_intake_lookup
  ON legal_intake_requests (env_id, business_id, classification_status, created_at DESC);

-- ── Review findings (Evidence-Grounded Findings) ─────────────────────────────

CREATE TABLE IF NOT EXISTS legal_review_findings (
  finding_id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                      uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                 uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id                   uuid NOT NULL REFERENCES legal_matters(matter_id) ON DELETE CASCADE,
  document_id                 uuid,
  contract_type               text,
  clause_key                  text NOT NULL,
  status                      text NOT NULL CHECK (status IN ('acceptable','issue','missing','not_applicable','needs_human','deal_breaker')),
  evidence_quote              text,
  evidence_offset             int,
  evidence_page               int,
  evidence_section            text,
  extraction_confidence       numeric(5,4),
  suggested_redline           text,
  suggested_external_comment  text,
  suggested_internal_note     text,
  playbook_position_id        uuid REFERENCES legal_playbook_positions(position_id) ON DELETE SET NULL,
  prior_decision_id           uuid REFERENCES legal_prior_decisions(decision_id) ON DELETE SET NULL,
  risk_score                  numeric(5,4),
  confidence                  numeric(5,4),
  null_reason                 text,
  source                      text NOT NULL DEFAULT 'ai',
  version_no                  int NOT NULL DEFAULT 1,
  metadata_json               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                  text,
  updated_by                  text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE legal_review_findings IS
  'Winston Legal: Evidence-Grounded Findings. Every row must cite an evidence_quote or carry null_reason. Fail-closed contract — no fabricated evidence permitted.';

CREATE INDEX IF NOT EXISTS idx_legal_review_findings_matter
  ON legal_review_findings (env_id, business_id, matter_id, status);

CREATE INDEX IF NOT EXISTS idx_legal_review_findings_doc
  ON legal_review_findings (env_id, business_id, matter_id, document_id);

-- ── Decision packets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_decision_packets (
  packet_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                   uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id              uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id                uuid NOT NULL REFERENCES legal_matters(matter_id) ON DELETE CASCADE,
  packet_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  executive_summary        text,
  approval_required        text,
  recommended_next_step    text,
  generated_at             timestamptz NOT NULL DEFAULT now(),
  null_reason              text,
  source                   text NOT NULL DEFAULT 'ai',
  version_no               int NOT NULL DEFAULT 1,
  metadata_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by               text,
  updated_by               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matter_id)
);

COMMENT ON TABLE legal_decision_packets IS
  'Winston Legal: Decision Packet — the prepared file an attorney reviews. One per matter (upsert). Cited finding_ids in source_evidence are validated against legal_review_findings.';

-- ── Attorney dispositions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_attorney_dispositions (
  disposition_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id             uuid NOT NULL REFERENCES legal_matters(matter_id) ON DELETE CASCADE,
  finding_id            uuid REFERENCES legal_review_findings(finding_id) ON DELETE SET NULL,
  action                text NOT NULL CHECK (action IN ('approve','revise','escalate','request_info','close')),
  reviewer              text NOT NULL,
  notes                 text,
  payload_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE legal_attorney_dispositions IS
  'Winston Legal: Attorney Workbench actions. Final judgment lives here — every Winston output that mattered ends in a row of this table.';

CREATE INDEX IF NOT EXISTS idx_legal_attorney_dispositions_matter
  ON legal_attorney_dispositions (env_id, business_id, matter_id, created_at DESC);

-- ── Outside counsel packets ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legal_outside_counsel_packets (
  oc_packet_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id             uuid NOT NULL REFERENCES legal_matters(matter_id) ON DELETE CASCADE,
  packet_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_for_firm    text,
  null_reason           text,
  source                text NOT NULL DEFAULT 'ai',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE legal_outside_counsel_packets IS
  'Winston Legal: prepared internal context for outside counsel. Output is fact/timeline/issues/desired-outcome — never advice phrasing (banned-phrase regex enforced before persistence).';

CREATE INDEX IF NOT EXISTS idx_legal_outside_counsel_packets_matter
  ON legal_outside_counsel_packets (env_id, business_id, matter_id, created_at DESC);

-- ── FK linkage (now that all tables exist) ───────────────────────────────────

DO $$ BEGIN
  ALTER TABLE legal_prior_decisions
    ADD CONSTRAINT fk_legal_prior_decisions_disposition
    FOREIGN KEY (attorney_disposition_id) REFERENCES legal_attorney_dispositions(disposition_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
