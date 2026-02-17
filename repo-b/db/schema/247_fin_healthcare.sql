-- 247_fin_healthcare.sql
-- Healthcare/MSO capital, claims, and provider economics.

CREATE TABLE IF NOT EXISTS fin_mso (
  fin_mso_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  partition_id    uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_entity_id   uuid REFERENCES fin_entity(fin_entity_id),
  code            text NOT NULL,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, code)
);

CREATE TABLE IF NOT EXISTS fin_clinic (
  fin_clinic_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  partition_id    uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_mso_id      uuid REFERENCES fin_mso(fin_mso_id),
  fin_entity_id   uuid REFERENCES fin_entity(fin_entity_id),
  code            text NOT NULL,
  name            text NOT NULL,
  npi             text,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, code)
);

CREATE TABLE IF NOT EXISTS fin_provider (
  fin_provider_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  partition_id        uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_clinic_id       uuid REFERENCES fin_clinic(fin_clinic_id),
  fin_mso_id          uuid REFERENCES fin_mso(fin_mso_id),
  fin_participant_id  uuid REFERENCES fin_participant(fin_participant_id),
  provider_type       text,
  license_number      text,
  npi                 text,
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'inactive', 'terminated')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_provider_comp_plan (
  fin_provider_comp_plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id               uuid NOT NULL REFERENCES business(business_id),
  partition_id              uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_provider_id           uuid NOT NULL REFERENCES fin_provider(fin_provider_id),
  plan_name                 text NOT NULL,
  plan_formula              text NOT NULL,
  base_rate                 numeric(18,12) NOT NULL DEFAULT 0,
  incentive_rate            numeric(18,12) NOT NULL DEFAULT 0,
  effective_from            date NOT NULL,
  effective_to              date,
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_provider_id, plan_name, effective_from)
);

CREATE TABLE IF NOT EXISTS fin_provider_comp_run (
  fin_provider_comp_run_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id               uuid NOT NULL REFERENCES business(business_id),
  partition_id              uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_provider_id           uuid NOT NULL REFERENCES fin_provider(fin_provider_id),
  fin_provider_comp_plan_id uuid REFERENCES fin_provider_comp_plan(fin_provider_comp_plan_id),
  as_of_date                date NOT NULL,
  gross_collections         numeric(28,12) NOT NULL DEFAULT 0,
  net_collections           numeric(28,12) NOT NULL DEFAULT 0,
  compensation_amount       numeric(28,12) NOT NULL DEFAULT 0,
  status                    text NOT NULL DEFAULT 'completed'
                            CHECK (status IN ('running', 'completed', 'failed')),
  fin_run_id                uuid,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_claim (
  fin_claim_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  partition_id        uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_clinic_id       uuid REFERENCES fin_clinic(fin_clinic_id),
  fin_provider_id     uuid REFERENCES fin_provider(fin_provider_id),
  claim_number        text NOT NULL,
  service_date        date,
  billed_amount       numeric(28,12) NOT NULL DEFAULT 0,
  allowed_amount      numeric(28,12) NOT NULL DEFAULT 0,
  paid_amount         numeric(28,12) NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('submitted', 'paid', 'denied', 'partial', 'appealed')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, claim_number)
);

CREATE TABLE IF NOT EXISTS fin_claim_denial (
  fin_claim_denial_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  partition_id        uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_claim_id        uuid NOT NULL REFERENCES fin_claim(fin_claim_id),
  denial_code         text,
  denial_reason       text,
  denial_date         date,
  resolved_date       date,
  resolution_status   text NOT NULL DEFAULT 'open'
                      CHECK (resolution_status IN ('open', 'resolved', 'written_off')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_referral_source (
  fin_referral_source_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_entity_id          uuid REFERENCES fin_entity(fin_entity_id),
  source_name            text NOT NULL,
  source_type            text,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, source_name)
);

CREATE TABLE IF NOT EXISTS fin_referral_metric (
  fin_referral_metric_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  partition_id             uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_referral_source_id   uuid NOT NULL REFERENCES fin_referral_source(fin_referral_source_id),
  fin_clinic_id            uuid REFERENCES fin_clinic(fin_clinic_id),
  period_start             date NOT NULL,
  period_end               date NOT NULL,
  referral_count           int NOT NULL DEFAULT 0,
  conversion_count         int NOT NULL DEFAULT 0,
  net_revenue              numeric(28,12) NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now()
);
