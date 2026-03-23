-- 248_fin_construction.sql
-- Construction cost control, commitments, and deterministic forecasting.

CREATE TABLE IF NOT EXISTS fin_construction_project (
  fin_construction_project_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                 uuid NOT NULL REFERENCES business(business_id),
  partition_id                uuid NOT NULL REFERENCES fin_partition(partition_id),
  project_id                  uuid REFERENCES project(project_id),
  code                        text NOT NULL,
  name                        text NOT NULL,
  status                      text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('planning', 'active', 'closed', 'archived')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, code)
);

CREATE TABLE IF NOT EXISTS fin_budget (
  fin_budget_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                uuid NOT NULL REFERENCES business(business_id),
  partition_id               uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_construction_project_id uuid NOT NULL REFERENCES fin_construction_project(fin_construction_project_id),
  name                       text NOT NULL,
  currency_code              text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  base_budget                numeric(28,12) NOT NULL DEFAULT 0,
  status                     text NOT NULL DEFAULT 'active'
                             CHECK (status IN ('draft', 'active', 'superseded', 'closed')),
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_budget_version (
  fin_budget_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  partition_id          uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_budget_id         uuid NOT NULL REFERENCES fin_budget(fin_budget_id),
  version_no            int NOT NULL,
  effective_date        date,
  notes                 text,
  is_active             boolean NOT NULL DEFAULT false,
  dataset_version_id    uuid REFERENCES dataset_version(dataset_version_id),
  rule_version_id       uuid REFERENCES rule_version(rule_version_id),
  fin_run_id            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_budget_id, version_no)
);

CREATE TABLE IF NOT EXISTS fin_budget_line_csi (
  fin_budget_line_csi_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_budget_version_id  uuid NOT NULL REFERENCES fin_budget_version(fin_budget_version_id),
  csi_division           text NOT NULL,
  cost_code              text NOT NULL,
  description            text,
  original_budget        numeric(28,12) NOT NULL DEFAULT 0,
  approved_changes       numeric(28,12) NOT NULL DEFAULT 0,
  revised_budget         numeric(28,12) NOT NULL DEFAULT 0,
  committed_cost         numeric(28,12) NOT NULL DEFAULT 0,
  actual_cost            numeric(28,12) NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_budget_version_id, csi_division, cost_code)
);

CREATE TABLE IF NOT EXISTS fin_change_order_version (
  fin_change_order_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                 uuid NOT NULL REFERENCES business(business_id),
  partition_id                uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_construction_project_id uuid NOT NULL REFERENCES fin_construction_project(fin_construction_project_id),
  change_order_ref            text NOT NULL,
  version_no                  int NOT NULL,
  status                      text NOT NULL DEFAULT 'proposed'
                              CHECK (status IN ('proposed', 'approved', 'rejected', 'implemented')),
  cost_impact                 numeric(28,12) NOT NULL DEFAULT 0,
  schedule_impact_days        int NOT NULL DEFAULT 0,
  submitted_at                timestamptz,
  approved_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_construction_project_id, change_order_ref, version_no)
);

CREATE TABLE IF NOT EXISTS fin_contract_commitment (
  fin_contract_commitment_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                 uuid NOT NULL REFERENCES business(business_id),
  partition_id                uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_construction_project_id uuid NOT NULL REFERENCES fin_construction_project(fin_construction_project_id),
  fin_participant_id          uuid REFERENCES fin_participant(fin_participant_id),
  contract_number             text NOT NULL,
  original_value              numeric(28,12) NOT NULL DEFAULT 0,
  approved_changes            numeric(28,12) NOT NULL DEFAULT 0,
  current_value               numeric(28,12) NOT NULL DEFAULT 0,
  committed_to_date           numeric(28,12) NOT NULL DEFAULT 0,
  paid_to_date                numeric(28,12) NOT NULL DEFAULT 0,
  status                      text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('draft', 'active', 'closed', 'terminated')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_construction_project_id, contract_number)
);

CREATE TABLE IF NOT EXISTS fin_forecast_snapshot (
  fin_forecast_snapshot_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                 uuid NOT NULL REFERENCES business(business_id),
  partition_id                uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_construction_project_id uuid NOT NULL REFERENCES fin_construction_project(fin_construction_project_id),
  as_of_date                  date NOT NULL,
  forecast_at_completion      numeric(28,12) NOT NULL DEFAULT 0,
  total_budget                numeric(28,12) NOT NULL DEFAULT 0,
  total_committed             numeric(28,12) NOT NULL DEFAULT 0,
  total_actual                numeric(28,12) NOT NULL DEFAULT 0,
  total_remaining             numeric(28,12) NOT NULL DEFAULT 0,
  status                      text NOT NULL DEFAULT 'completed'
                              CHECK (status IN ('running', 'completed', 'failed')),
  fin_run_id                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_construction_project_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS fin_forecast_line (
  fin_forecast_line_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id               uuid NOT NULL REFERENCES business(business_id),
  partition_id              uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_forecast_snapshot_id  uuid NOT NULL REFERENCES fin_forecast_snapshot(fin_forecast_snapshot_id),
  csi_division              text NOT NULL,
  cost_code                 text NOT NULL,
  forecast_cost             numeric(28,12) NOT NULL DEFAULT 0,
  variance_amount           numeric(28,12) NOT NULL DEFAULT 0,
  variance_pct              numeric(18,12),
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_forecast_snapshot_id, csi_division, cost_code)
);

CREATE TABLE IF NOT EXISTS fin_lien_waiver_status (
  fin_lien_waiver_status_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id               uuid NOT NULL REFERENCES business(business_id),
  partition_id              uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_construction_project_id uuid NOT NULL REFERENCES fin_construction_project(fin_construction_project_id),
  fin_participant_id        uuid REFERENCES fin_participant(fin_participant_id),
  period_start              date NOT NULL,
  period_end                date NOT NULL,
  status                    text NOT NULL DEFAULT 'missing'
                            CHECK (status IN ('missing', 'partial', 'received', 'approved')),
  document_id               uuid,
  received_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);
