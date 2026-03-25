-- 283_ecc_command_center.sql
-- Executive Command Center (ECC): deterministic command-center schema
-- for message routing, approvals, calendar, delegation, briefs, and audit.

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  name text NOT NULL,
  channels jsonb NOT NULL DEFAULT '{}'::jsonb,
  vip_tier int NOT NULL DEFAULT 0 CHECK (vip_tier BETWEEN 0 AND 3),
  sla_hours int NOT NULL DEFAULT 24 CHECK (sla_hours > 0),
  tags text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('email', 'sms', 'slack', 'whatsapp', 'manual', 'seed')),
  source_id text NOT NULL,
  sender_contact_id uuid NULL,
  sender_raw text NOT NULL,
  recipients_raw jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body_preview text NOT NULL DEFAULT '',
  body_full text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  vip_flag boolean NOT NULL DEFAULT false,
  vip_tier int NOT NULL DEFAULT 0 CHECK (vip_tier BETWEEN 0 AND 3),
  priority_score int NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
  requires_reply boolean NOT NULL DEFAULT false,
  sla_deadline timestamptz NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'snoozed', 'done')),
  snoozed_until timestamptz NULL,
  linked_task_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  linked_payable_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, source, source_id)
);

CREATE TABLE IF NOT EXISTS app.task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('pay', 'approve', 'reply', 'schedule', 'review', 'decide')),
  owner_user_id uuid NULL,
  delegated_to_user_id uuid NULL,
  due_by timestamptz NULL,
  amount numeric(18,2) NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'delegated', 'done')),
  linked_message_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  linked_payable_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  linked_event_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  confidence_score numeric(6,4) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  vendor_id uuid NULL,
  vendor_name_raw text NOT NULL,
  amount numeric(18,2) NOT NULL,
  due_date date NOT NULL,
  invoice_number text NULL,
  invoice_link text NULL,
  status text NOT NULL DEFAULT 'needs_approval'
    CHECK (status IN ('needs_approval', 'approved', 'declined', 'paid', 'overdue', 'needs_review')),
  approval_required boolean NOT NULL DEFAULT true,
  approval_note text NULL,
  source_message_id uuid NULL,
  source_doc_id uuid NULL,
  matched_transaction_id uuid NULL,
  match_confidence numeric(6,4) NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  customer_name_raw text NOT NULL,
  amount numeric(18,2) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'overdue', 'paid', 'disputed')),
  source_message_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.financial_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  account_name text NOT NULL,
  posted_at date NOT NULL,
  amount numeric(18,2) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  merchant text NOT NULL,
  memo text NOT NULL DEFAULT '',
  category text NULL,
  confidence_score numeric(6,4) NULL,
  linked_payable_id uuid NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  title text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  location text NULL,
  rsvp_status text NOT NULL DEFAULT 'needs_response'
    CHECK (rsvp_status IN ('needs_response', 'accepted', 'declined', 'tentative')),
  prep_notes text NULL,
  travel_buffer_minutes int NOT NULL DEFAULT 0 CHECK (travel_buffer_minutes >= 0),
  linked_message_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.delegation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('message', 'task', 'payable', 'event')),
  item_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'acknowledged', 'done')),
  context_notes text NOT NULL DEFAULT '',
  due_by timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.daily_brief (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('am', 'pm')),
  money_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_messages uuid[] NOT NULL DEFAULT '{}'::uuid[],
  top_approvals uuid[] NOT NULL DEFAULT '{}'::uuid[],
  top_events uuid[] NOT NULL DEFAULT '{}'::uuid[],
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, user_id, date, type)
);

CREATE TABLE IF NOT EXISTS app.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  actor_user_id uuid NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_state jsonb NULL,
  after_state jsonb NULL,
  source_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ecc_contact_env_idx
  ON app.contact (env_id, vip_tier DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ecc_message_env_priority_idx
  ON app.message (env_id, priority_score DESC, received_at DESC);
CREATE INDEX IF NOT EXISTS ecc_message_env_vip_idx
  ON app.message (env_id, vip_flag, sla_deadline);
CREATE INDEX IF NOT EXISTS ecc_message_env_status_idx
  ON app.message (env_id, status, snoozed_until);
CREATE INDEX IF NOT EXISTS ecc_task_env_status_idx
  ON app.task (env_id, status, due_by);
CREATE INDEX IF NOT EXISTS ecc_task_env_due_idx
  ON app.task (env_id, due_by);
CREATE INDEX IF NOT EXISTS ecc_payable_env_status_idx
  ON app.payable (env_id, status, due_date);
CREATE INDEX IF NOT EXISTS ecc_payable_env_due_idx
  ON app.payable (env_id, due_date);
CREATE INDEX IF NOT EXISTS ecc_receivable_env_status_idx
  ON app.receivable (env_id, status, due_date);
CREATE INDEX IF NOT EXISTS ecc_fin_txn_env_posted_idx
  ON app.financial_transaction (env_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS ecc_event_env_start_idx
  ON app.event (env_id, start_time);
CREATE INDEX IF NOT EXISTS ecc_delegation_env_due_idx
  ON app.delegation (env_id, status, due_by);
CREATE INDEX IF NOT EXISTS ecc_daily_brief_env_date_idx
  ON app.daily_brief (env_id, date DESC, type);
CREATE INDEX IF NOT EXISTS ecc_audit_log_env_created_idx
  ON app.audit_log (env_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ecc_event_log_env_created_idx
  ON app.event_log (env_id, created_at DESC);

INSERT INTO app.templates (key, label, description, departments, capabilities)
VALUES (
  'meridian_apex_holdings',
  'Meridian Apex Holdings',
  'Executive Command Center demo template for a multi-entity operator with seeded “messy day” decision flow.',
  '["executive","accounting","operations","legal","documents"]'::jsonb,
  '["ecc_command_center"]'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    departments = EXCLUDED.departments,
    capabilities = EXCLUDED.capabilities;
