-- 264_re_special_servicing.sql
-- Real Estate Special Servicing wedge in app schema (Business OS operational layer).

CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 're_servicer_status'
  ) THEN
    CREATE TYPE app.re_servicer_status AS ENUM (
      'performing',
      'watchlist',
      'special_servicing',
      'matured',
      'paid_off',
      'resolved'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 're_event_type'
  ) THEN
    CREATE TYPE app.re_event_type AS ENUM (
      'payment_default',
      'maturity_default',
      'covenant_breach',
      'cash_trap',
      'valuation_change',
      'tenant_roll',
      'inspection',
      'servicing_note',
      'other'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 're_event_severity'
  ) THEN
    CREATE TYPE app.re_event_severity AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 're_workout_case_status'
  ) THEN
    CREATE TYPE app.re_workout_case_status AS ENUM (
      'open',
      'in_review',
      'negotiating',
      'approved',
      'closed'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 're_workout_action_status'
  ) THEN
    CREATE TYPE app.re_workout_action_status AS ENUM (
      'open',
      'in_progress',
      'completed',
      'cancelled'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 're_workout_action_type'
  ) THEN
    CREATE TYPE app.re_workout_action_type AS ENUM (
      'collect_docs',
      'borrower_outreach',
      'site_inspection',
      'cashflow_reforecast',
      'term_sheet',
      'committee_memo',
      'forbearance',
      'modification',
      'note_sale',
      'other'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS app.re_trusts (
  trust_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  name             text NOT NULL,
  external_ids     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.re_loans (
  loan_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id               uuid NOT NULL REFERENCES app.re_trusts(trust_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  loan_identifier        text NOT NULL,
  external_ids           jsonb NOT NULL DEFAULT '{}'::jsonb,
  original_balance_cents bigint NOT NULL DEFAULT 0,
  current_balance_cents  bigint NOT NULL DEFAULT 0,
  rate_decimal           numeric(12,8),
  maturity_date          date,
  servicer_status        app.re_servicer_status NOT NULL DEFAULT 'performing',
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trust_id, loan_identifier)
);

CREATE TABLE IF NOT EXISTS app.re_properties (
  property_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id           uuid NOT NULL REFERENCES app.re_loans(loan_id) ON DELETE CASCADE,
  business_id       uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  address_line1     text,
  address_line2     text,
  city              text,
  state             text,
  postal_code       text,
  country           text NOT NULL DEFAULT 'US',
  property_type     text,
  square_feet       numeric(18,2),
  unit_count        int,
  metadata_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.re_borrowers (
  borrower_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id           uuid NOT NULL REFERENCES app.re_loans(loan_id) ON DELETE CASCADE,
  business_id       uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  name              text NOT NULL,
  sponsor           text,
  contacts_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.re_surveillance_periods (
  surveillance_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id            uuid NOT NULL REFERENCES app.re_loans(loan_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  period_end_date    date NOT NULL,
  metrics_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  dscr               numeric(12,6),
  occupancy          numeric(12,6),
  noi_cents          bigint,
  notes              text,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, period_end_date)
);

CREATE TABLE IF NOT EXISTS app.re_covenants (
  covenant_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             uuid NOT NULL REFERENCES app.re_loans(loan_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  covenant_type       text NOT NULL,
  threshold_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  measurement_method  text,
  frequency           text,
  active              boolean NOT NULL DEFAULT true,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.re_events (
  event_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             uuid NOT NULL REFERENCES app.re_loans(loan_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  event_type          app.re_event_type NOT NULL,
  event_date          date NOT NULL,
  severity            app.re_event_severity NOT NULL DEFAULT 'low',
  description         text NOT NULL,
  document_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.re_workout_cases (
  case_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             uuid NOT NULL REFERENCES app.re_loans(loan_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  case_status         app.re_workout_case_status NOT NULL DEFAULT 'open',
  opened_at           timestamptz NOT NULL DEFAULT now(),
  closed_at           timestamptz,
  assigned_to         text,
  summary             text,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.re_workout_actions (
  action_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              uuid NOT NULL REFERENCES app.re_workout_cases(case_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  action_type          app.re_workout_action_type NOT NULL,
  status               app.re_workout_action_status NOT NULL DEFAULT 'open',
  due_date             date,
  owner                text,
  summary              text,
  audit_log_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_ids         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.re_underwrite_runs (
  underwrite_run_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id               uuid NOT NULL REFERENCES app.re_loans(loan_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  execution_id          uuid REFERENCES app.executions(execution_id) ON DELETE SET NULL,
  run_at                timestamptz NOT NULL DEFAULT now(),
  inputs_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_ids          jsonb NOT NULL DEFAULT '[]'::jsonb,
  diff_from_run_id      uuid REFERENCES app.re_underwrite_runs(underwrite_run_id) ON DELETE SET NULL,
  created_by            text,
  version               int NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, version)
);

CREATE INDEX IF NOT EXISTS re_trusts_business_created_idx
  ON app.re_trusts (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS re_loans_business_trust_idx
  ON app.re_loans (business_id, trust_id, created_at DESC);
CREATE INDEX IF NOT EXISTS re_loans_business_status_idx
  ON app.re_loans (business_id, servicer_status, created_at DESC);
CREATE INDEX IF NOT EXISTS re_properties_loan_idx
  ON app.re_properties (loan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS re_borrowers_loan_idx
  ON app.re_borrowers (loan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS re_surveillance_loan_period_idx
  ON app.re_surveillance_periods (loan_id, period_end_date DESC);
CREATE INDEX IF NOT EXISTS re_covenants_loan_active_idx
  ON app.re_covenants (loan_id, active, created_at DESC);
CREATE INDEX IF NOT EXISTS re_events_loan_date_idx
  ON app.re_events (loan_id, event_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS re_workout_cases_loan_opened_idx
  ON app.re_workout_cases (loan_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS re_workout_actions_case_created_idx
  ON app.re_workout_actions (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS re_underwrite_runs_loan_version_idx
  ON app.re_underwrite_runs (loan_id, version DESC);

ALTER TABLE IF EXISTS app.executions
  ADD COLUMN IF NOT EXISTS execution_type text;

ALTER TABLE IF EXISTS app.executions
  ADD COLUMN IF NOT EXISTS result_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS app.executions
  ADD COLUMN IF NOT EXISTS logs_json jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO app.departments (key, label, icon, sort_order)
VALUES ('real-estate', 'Real Estate', 'building', 15)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
VALUES
  ((SELECT department_id FROM app.departments WHERE key='real-estate'), 're_command_center', 'Loan Command Center', 'action', 10, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='real-estate'), 're_surveillance', 'Surveillance', 'action', 20, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='real-estate'), 're_underwriting', 'Re-Underwriting', 'action', 30, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='real-estate'), 're_workouts', 'Workout Management', 'action', 40, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='real-estate'), 're_events', 'Event Log', 'action', 50, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='real-estate'), 're_documents', 'Documents', 'document_view', 90, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='real-estate'), 're_history', 'Run History', 'history', 95, '{}'::jsonb)
ON CONFLICT (department_id, key) DO NOTHING;

INSERT INTO app.templates (key, label, description, departments, capabilities)
VALUES (
  'real_estate_special_servicing',
  'Real Estate Special Servicing',
  'Real estate trust/loan surveillance, re-underwriting, workouts, and event management.',
  '["real-estate", "finance", "legal"]'::jsonb,
  '["re_command_center", "re_surveillance", "re_underwriting", "re_workouts", "re_events", "re_documents", "re_history", "finance_documents", "finance_history", "legal_documents", "legal_history"]'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  departments = EXCLUDED.departments,
  capabilities = EXCLUDED.capabilities;
