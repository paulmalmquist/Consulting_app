-- 020_reporting.sql
-- ALWAYS ON: Reporting dimensions, metrics, dashboards, and fact tables.
-- Global dimension tables (dim_date, dim_currency) do NOT carry tenant_id.
-- Metric/dashboard/insight tables are tenant-scoped.

-- ═══════════════════════════════════════════════════════
-- GLOBAL DIMENSIONS (no tenant_id)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dim_date (
  date_key    int PRIMARY KEY,            -- YYYYMMDD
  full_date   date NOT NULL UNIQUE,
  year        int NOT NULL,
  quarter     int NOT NULL,
  month       int NOT NULL,
  day         int NOT NULL,
  day_of_week int NOT NULL,               -- 1=Mon..7=Sun (ISO)
  week_of_year int NOT NULL,
  is_weekend  boolean NOT NULL DEFAULT false,
  fiscal_year int,
  fiscal_quarter int,
  fiscal_month int
);

CREATE TABLE IF NOT EXISTS dim_currency (
  currency_code text PRIMARY KEY,          -- ISO 4217 e.g. 'USD'
  name          text NOT NULL,
  symbol        text,
  decimal_places int NOT NULL DEFAULT 2
);

CREATE TABLE IF NOT EXISTS fx_rate (
  fx_rate_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL REFERENCES dim_currency(currency_code),
  to_currency   text NOT NULL REFERENCES dim_currency(currency_code),
  rate_date     date NOT NULL,
  rate          numeric(18,8) NOT NULL,
  source        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_currency, to_currency, rate_date)
);

-- ═══════════════════════════════════════════════════════
-- METRIC DEFINITIONS (tenant-scoped)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS metric (
  metric_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  key         text NOT NULL,
  label       text NOT NULL,
  description text,
  unit        text,                        -- e.g. 'USD', '%', 'days'
  aggregation text NOT NULL DEFAULT 'sum'
              CHECK (aggregation IN ('sum','avg','min','max','count','last')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS metric_version (
  metric_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id         uuid NOT NULL REFERENCES metric(metric_id),
  version           int  NOT NULL,
  formula_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_id, version)
);

-- ═══════════════════════════════════════════════════════
-- DIMENSIONS (tenant-scoped slicing axes)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dimension (
  dimension_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(tenant_id),
  key          text NOT NULL,
  label        text NOT NULL,
  source_table text,
  source_column text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

-- ═══════════════════════════════════════════════════════
-- REPORTS & DASHBOARDS (tenant-scoped)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report (
  report_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  key         text NOT NULL,
  label       text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS report_version (
  report_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES report(report_id),
  version           int  NOT NULL,
  config_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, version)
);

CREATE TABLE IF NOT EXISTS dashboard (
  dashboard_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(tenant_id),
  key          text NOT NULL,
  label        text NOT NULL,
  description  text,
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS dashboard_version (
  dashboard_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id         uuid NOT NULL REFERENCES dashboard(dashboard_id),
  version              int  NOT NULL,
  layout_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dashboard_id, version)
);

CREATE TABLE IF NOT EXISTS insight (
  insight_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id uuid REFERENCES business(business_id),
  metric_id   uuid REFERENCES metric(metric_id),
  run_id      uuid REFERENCES run(run_id),
  headline    text NOT NULL,
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity    text NOT NULL DEFAULT 'info'
              CHECK (severity IN ('info','warning','critical')),
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_query (
  saved_query_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenant(tenant_id),
  actor_id       uuid REFERENCES actor(actor_id),
  label          text NOT NULL,
  query_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- FACT TABLES (tenant-scoped, fully traceable)
-- ═══════════════════════════════════════════════════════

-- Generic measurement fact: every row traces to dataset + rule + run.
CREATE TABLE IF NOT EXISTS fact_measurement (
  fact_measurement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  metric_id           uuid NOT NULL REFERENCES metric(metric_id),
  dimension_key       text,
  dimension_value     text,
  date_key            int REFERENCES dim_date(date_key),
  value               numeric(18,4) NOT NULL,
  currency_code       text REFERENCES dim_currency(currency_code),
  -- Traceability: REQUIRED for computed facts
  dataset_version_id  uuid NOT NULL REFERENCES dataset_version(dataset_version_id),
  rule_version_id     uuid NOT NULL REFERENCES rule_version(rule_version_id),
  run_id              uuid NOT NULL REFERENCES run(run_id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Status timeline fact: tracks state transitions over time.
CREATE TABLE IF NOT EXISTS fact_status_timeline (
  fact_status_timeline_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id             uuid NOT NULL REFERENCES business(business_id),
  object_id               uuid NOT NULL REFERENCES object(object_id),
  from_status             text,
  to_status               text NOT NULL,
  transitioned_at         timestamptz NOT NULL DEFAULT now(),
  actor_id                uuid REFERENCES actor(actor_id),
  created_at              timestamptz NOT NULL DEFAULT now()
);
