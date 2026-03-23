-- 261_reporting_runtime.sql
-- Runtime query, permissions, lineage, and materialization controls for reporting.

CREATE TABLE IF NOT EXISTS metric_permission (
  metric_permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(tenant_id),
  metric_id            uuid NOT NULL REFERENCES metric(metric_id) ON DELETE CASCADE,
  role_id              uuid REFERENCES role(role_id) ON DELETE CASCADE,
  actor_id             uuid REFERENCES actor(actor_id) ON DELETE CASCADE,
  can_read             boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (role_id IS NOT NULL OR actor_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS report_run (
  report_run_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id          uuid NOT NULL REFERENCES business(business_id),
  report_id            uuid NOT NULL REFERENCES report(report_id) ON DELETE CASCADE,
  report_version_id    uuid REFERENCES report_version(report_version_id),
  run_id               uuid REFERENCES run(run_id),
  status               text NOT NULL DEFAULT 'completed'
                       CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  query_hash           text,
  requested_by         uuid REFERENCES actor(actor_id),
  error_message        text,
  started_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_result_cache (
  report_result_cache_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  report_id              uuid NOT NULL REFERENCES report(report_id) ON DELETE CASCADE,
  report_run_id          uuid REFERENCES report_run(report_run_id) ON DELETE CASCADE,
  query_hash             text NOT NULL,
  result_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS number_trace (
  number_trace_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id          uuid NOT NULL REFERENCES business(business_id),
  report_run_id        uuid NOT NULL REFERENCES report_run(report_run_id) ON DELETE CASCADE,
  metric_id            uuid NOT NULL REFERENCES metric(metric_id),
  dimension_key        text,
  dimension_value      text,
  grain                text,
  date_key             int REFERENCES dim_date(date_key),
  value                numeric(28,12) NOT NULL,
  dataset_version_id   uuid REFERENCES dataset_version(dataset_version_id),
  rule_version_id      uuid REFERENCES rule_version(rule_version_id),
  run_id               uuid REFERENCES run(run_id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS number_trace_row (
  number_trace_row_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number_trace_id      uuid NOT NULL REFERENCES number_trace(number_trace_id) ON DELETE CASCADE,
  source_table         text NOT NULL,
  source_row_id        uuid,
  source_ref           text,
  contribution_value   numeric(28,12),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_materialization_job (
  report_materialization_job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                   uuid NOT NULL REFERENCES business(business_id),
  idempotency_key               text NOT NULL,
  event_type                    text NOT NULL,
  event_payload                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                        text NOT NULL DEFAULT 'queued'
                                CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts                      int NOT NULL DEFAULT 0,
  error_message                 text,
  started_at                    timestamptz,
  completed_at                  timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, idempotency_key)
);
