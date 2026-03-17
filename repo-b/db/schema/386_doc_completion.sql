-- 386_doc_completion.sql
-- Document Completion Agent — core tables for automated document collection.
-- Tracks loan files, borrower contacts, document requirements, outreach,
-- uploads, escalations, and audit logs.

-- ============================================================
-- DC_BORROWERS — borrower contact info for outreach
-- ============================================================

CREATE TABLE IF NOT EXISTS dc_borrower (
  borrower_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  email                 text,
  mobile                text,
  preferred_channel     text NOT NULL DEFAULT 'email'
                        CHECK (preferred_channel IN ('sms','email','both')),
  timezone              text NOT NULL DEFAULT 'America/New_York',
  consent_sms           boolean NOT NULL DEFAULT false,
  consent_email         boolean NOT NULL DEFAULT true,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dc_borrower_business_idx
  ON dc_borrower (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dc_borrower_email_idx
  ON dc_borrower (email) WHERE email IS NOT NULL;

-- ============================================================
-- DC_LOAN_FILES — core file tracking per application
-- ============================================================

CREATE TABLE IF NOT EXISTS dc_loan_file (
  loan_file_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  borrower_id           uuid NOT NULL REFERENCES dc_borrower(borrower_id) ON DELETE CASCADE,
  external_application_id text NOT NULL,
  loan_type             text NOT NULL DEFAULT 'mortgage'
                        CHECK (loan_type IN ('mortgage','auto','personal','heloc','student','commercial','other')),
  loan_stage            text NOT NULL DEFAULT 'processing'
                        CHECK (loan_stage IN ('application','processing','underwriting','closing','funded','servicing')),
  status                text NOT NULL DEFAULT 'new'
                        CHECK (status IN (
                          'new',
                          'awaiting_initial_outreach',
                          'waiting_on_borrower',
                          'partial_docs_received',
                          'followup_scheduled',
                          'escalated',
                          'complete',
                          'closed_manually'
                        )),
  assigned_processor_id text,
  upload_token          text,
  upload_token_expires  timestamptz,
  followup_count        int NOT NULL DEFAULT 0,
  max_followups         int NOT NULL DEFAULT 3,
  followup_cadence_json jsonb NOT NULL DEFAULT '{"hours": [24, 48, 72]}'::jsonb,
  allowed_send_start    int NOT NULL DEFAULT 8,   -- hour in borrower timezone
  allowed_send_end      int NOT NULL DEFAULT 20,  -- hour in borrower timezone
  webhook_url           text,
  opened_at             timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  escalated_at          timestamptz,
  last_activity_at      timestamptz NOT NULL DEFAULT now(),
  last_outreach_at      timestamptz,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'api',
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, external_application_id)
);

CREATE INDEX IF NOT EXISTS dc_loan_file_business_idx
  ON dc_loan_file (business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS dc_loan_file_status_idx
  ON dc_loan_file (status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS dc_loan_file_processor_idx
  ON dc_loan_file (assigned_processor_id) WHERE assigned_processor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dc_loan_file_token_idx
  ON dc_loan_file (upload_token) WHERE upload_token IS NOT NULL;

-- ============================================================
-- DC_DOC_REQUIREMENT — per-file required documents
-- ============================================================

CREATE TABLE IF NOT EXISTS dc_doc_requirement (
  requirement_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_file_id          uuid NOT NULL REFERENCES dc_loan_file(loan_file_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  doc_type              text NOT NULL,
  display_name          text NOT NULL,
  is_required           boolean NOT NULL DEFAULT true,
  status                text NOT NULL DEFAULT 'required'
                        CHECK (status IN ('required','requested','uploaded','rejected','accepted','waived')),
  notes                 text,
  uploaded_at           timestamptz,
  accepted_at           timestamptz,
  rejected_at           timestamptz,
  waived_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_file_id, doc_type)
);

CREATE INDEX IF NOT EXISTS dc_doc_requirement_file_idx
  ON dc_doc_requirement (loan_file_id, status);

-- ============================================================
-- DC_MESSAGE_EVENT — all outreach messages sent
-- ============================================================

CREATE TABLE IF NOT EXISTS dc_message_event (
  message_event_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_file_id          uuid NOT NULL REFERENCES dc_loan_file(loan_file_id) ON DELETE CASCADE,
  borrower_id           uuid NOT NULL REFERENCES dc_borrower(borrower_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  channel               text NOT NULL CHECK (channel IN ('sms','email')),
  message_type          text NOT NULL CHECK (message_type IN ('initial_request','followup','escalation_notice','completion_confirm','manual')),
  subject               text,
  content_snapshot      text NOT NULL,
  external_message_id   text,
  sent_at               timestamptz,
  delivered_at          timestamptz,
  opened_at             timestamptz,
  clicked_at            timestamptz,
  failed_at             timestamptz,
  failure_reason        text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dc_message_event_file_idx
  ON dc_message_event (loan_file_id, created_at DESC);

-- ============================================================
-- DC_UPLOAD_EVENT — borrower upload tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS dc_upload_event (
  upload_event_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_file_id          uuid NOT NULL REFERENCES dc_loan_file(loan_file_id) ON DELETE CASCADE,
  requirement_id        uuid NOT NULL REFERENCES dc_doc_requirement(requirement_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  filename              text NOT NULL,
  file_type             text NOT NULL,
  file_size_bytes       bigint,
  storage_path          text,
  upload_status         text NOT NULL DEFAULT 'pending'
                        CHECK (upload_status IN ('pending','stored','rejected','accepted')),
  uploader_ip           text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dc_upload_event_file_idx
  ON dc_upload_event (loan_file_id, created_at DESC);

-- ============================================================
-- DC_ESCALATION_EVENT — escalation tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS dc_escalation_event (
  escalation_event_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_file_id          uuid NOT NULL REFERENCES dc_loan_file(loan_file_id) ON DELETE CASCADE,
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  reason                text NOT NULL,
  priority              text NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('critical','high','medium','low')),
  assigned_to           text,
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  resolution_note       text,
  triggered_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dc_escalation_event_file_idx
  ON dc_escalation_event (loan_file_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS dc_escalation_event_status_idx
  ON dc_escalation_event (status, priority);

-- ============================================================
-- DC_AUDIT_LOG — immutable action log
-- ============================================================

CREATE TABLE IF NOT EXISTS dc_audit_log (
  audit_log_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  entity_type           text NOT NULL CHECK (entity_type IN (
    'loan_file','doc_requirement','message_event','upload_event','escalation_event','borrower'
  )),
  entity_id             uuid NOT NULL,
  action                text NOT NULL,
  actor_type            text NOT NULL DEFAULT 'system'
                        CHECK (actor_type IN ('system','staff','borrower','cron','api')),
  actor_id              text,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dc_audit_log_entity_idx
  ON dc_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dc_audit_log_file_idx
  ON dc_audit_log ((metadata_json->>'loan_file_id')) WHERE metadata_json->>'loan_file_id' IS NOT NULL;
