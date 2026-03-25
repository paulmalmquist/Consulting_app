-- 274_credit_core.sql
-- Credit Risk Hub minimal complete lifecycle model.

CREATE TABLE IF NOT EXISTS credit_cases (
  case_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  case_number          text NOT NULL,
  borrower_name        text NOT NULL,
  facility_type        text,
  stage                text NOT NULL DEFAULT 'intake',
  requested_amount     numeric(28,12) NOT NULL DEFAULT 0,
  approved_amount      numeric(28,12) NOT NULL DEFAULT 0,
  risk_grade           text,
  status               text NOT NULL DEFAULT 'active',
  source               text NOT NULL DEFAULT 'manual',
  version_no           int NOT NULL DEFAULT 1,
  metadata_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by           text,
  updated_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, case_number)
);

CREATE TABLE IF NOT EXISTS credit_underwriting_versions (
  underwriting_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                  uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id             uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  case_id                 uuid NOT NULL REFERENCES credit_cases(case_id) ON DELETE CASCADE,
  version_no              int NOT NULL,
  pd                      numeric(18,12),
  lgd                     numeric(18,12),
  ead                     numeric(28,12),
  score                   numeric(18,12),
  recommendation          text,
  source                  text NOT NULL DEFAULT 'manual',
  metadata_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by              text,
  updated_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, version_no)
);

CREATE TABLE IF NOT EXISTS credit_committee_decisions (
  committee_decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  case_id               uuid NOT NULL REFERENCES credit_cases(case_id) ON DELETE CASCADE,
  decision_status       text NOT NULL DEFAULT 'pending',
  decision_date         date,
  conditions_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale             text,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_facilities (
  facility_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  case_id               uuid NOT NULL REFERENCES credit_cases(case_id) ON DELETE CASCADE,
  facility_ref          text NOT NULL,
  principal_amount      numeric(28,12) NOT NULL DEFAULT 0,
  outstanding_amount    numeric(28,12) NOT NULL DEFAULT 0,
  maturity_date         date,
  status                text NOT NULL DEFAULT 'active',
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, facility_ref)
);

CREATE TABLE IF NOT EXISTS credit_covenants (
  covenant_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  case_id               uuid NOT NULL REFERENCES credit_cases(case_id) ON DELETE CASCADE,
  covenant_name         text NOT NULL,
  threshold_value       numeric(28,12),
  current_value         numeric(28,12),
  breached              boolean NOT NULL DEFAULT false,
  as_of_date            date,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_monitoring_events (
  monitoring_event_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  case_id               uuid NOT NULL REFERENCES credit_cases(case_id) ON DELETE CASCADE,
  event_date            date NOT NULL,
  event_type            text NOT NULL,
  severity              text NOT NULL DEFAULT 'medium',
  summary               text NOT NULL,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_watchlist_cases (
  watchlist_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  case_id               uuid NOT NULL REFERENCES credit_cases(case_id) ON DELETE CASCADE,
  watch_reason          text,
  opened_at             timestamptz NOT NULL DEFAULT now(),
  status                text NOT NULL DEFAULT 'open',
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_workout_cases (
  workout_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  case_id               uuid NOT NULL REFERENCES credit_cases(case_id) ON DELETE CASCADE,
  strategy              text,
  recovery_estimate     numeric(28,12) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'open',
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
