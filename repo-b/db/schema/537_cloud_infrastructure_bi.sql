-- 537_cloud_infrastructure_bi.sql
-- Vultr Cloud Intelligence OS — schema for the cloud_infra environment template.
--
-- Purpose: BI-grade operating console for a usage-based cloud / GPU compute
-- business. Reconciles platform usage, billing, NetSuite-style accounting,
-- Salesforce-style CRM, support, and infra telemetry.
--
-- Conventions:
--   - Prefixes `dim_cloud_*` and `fact_cloud_*` use the durable `dim_`/`fact_`
--     prefixes approved in ARCHITECTURE.md lines 25-26.
--   - All tables are tenant-scoped: env_id TEXT NOT NULL, business_id UUID NOT NULL.
--   - All tables have RLS enabled with tenant_isolation_<table> policy bound to
--     current_setting('app.env_id', true).
--   - Static reference data (regions, products, SKUs, support categories) is
--     seeded at the bottom of this migration and is env-agnostic seed pattern:
--     each env that uses cloud_infra gets its own copy via the seed pack.
--   - Customer/usage/billing/etc. rows live in
--     backend/app/services/environment_seed_packs_v2/cloud_infra_starter.py.
--
-- Indexes (named, with documented query path):
--   - <table>_env_customer_period_idx         — customer × period scans
--   - <table>_env_region_period_idx           — regional rollups
--   - fact_cloud_gpu_utilization_grid_idx     — region × sku × hour DESC
--                                              (drives GPU Command Graph filter)
--
-- Pairs with:
--   - 538_environment_templates_cloud_infra.sql (template registration)
--   - backend/app/services/environment_seed_packs_v2/cloud_infra_starter.py
--   - backend/app/routes/vultr.py
--   - repo-b/src/app/lab/env/[envId]/vultr/

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- DIMENSION TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- Customer / account master
CREATE TABLE IF NOT EXISTS dim_cloud_customer (
  env_id              TEXT NOT NULL,
  business_id         UUID NOT NULL,
  customer_id         TEXT NOT NULL,
  account_id          TEXT,
  parent_account_id   TEXT,
  display_name        TEXT NOT NULL,
  signup_date         DATE,
  country             TEXT,
  segment             TEXT NOT NULL CHECK (segment IN (
                        'self_service','smb','enterprise','ai_customer','reseller','startup'
                      )),
  salesforce_owner_id TEXT,
  contract_type       TEXT,
  account_status      TEXT NOT NULL DEFAULT 'active',
  support_tier        TEXT,
  kyc_status          TEXT,
  risk_flags          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (env_id, customer_id)
);
COMMENT ON TABLE dim_cloud_customer IS
  'Vultr Cloud Intelligence OS: customer / account master. Owned by cloud_infra environment template.';
ALTER TABLE dim_cloud_customer ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_customer ON dim_cloud_customer
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Product family master
CREATE TABLE IF NOT EXISTS dim_cloud_product (
  env_id          TEXT NOT NULL,
  business_id     UUID NOT NULL,
  product_key     TEXT NOT NULL,
  family          TEXT NOT NULL CHECK (family IN (
                    'compute','gpu','bare_metal','k8s','object_storage',
                    'block_storage','managed_db','load_balancer','bandwidth','cdn'
                  )),
  display_name    TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  PRIMARY KEY (env_id, product_key)
);
COMMENT ON TABLE dim_cloud_product IS
  'Vultr Cloud Intelligence OS: product family master.';
ALTER TABLE dim_cloud_product ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_product ON dim_cloud_product
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Per-SKU detail
CREATE TABLE IF NOT EXISTS dim_cloud_sku (
  env_id                   TEXT NOT NULL,
  business_id              UUID NOT NULL,
  sku_key                  TEXT NOT NULL,
  product_key              TEXT NOT NULL,
  display_name             TEXT NOT NULL,
  gpu_model                TEXT,
  cpu_cores                INT,
  ram_gb                   INT,
  storage_gb               INT,
  list_price_per_hour_usd  NUMERIC(12,4) NOT NULL,
  cost_per_hour_usd        NUMERIC(12,4),
  power_w                  INT,
  marked_demo              BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (env_id, sku_key),
  FOREIGN KEY (env_id, product_key) REFERENCES dim_cloud_product(env_id, product_key)
);
COMMENT ON TABLE dim_cloud_sku IS
  'Vultr Cloud Intelligence OS: per-SKU detail (price, cost, hardware shape).';
ALTER TABLE dim_cloud_sku ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_sku ON dim_cloud_sku
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Region / geo master
CREATE TABLE IF NOT EXISTS dim_cloud_region (
  env_id            TEXT NOT NULL,
  business_id       UUID NOT NULL,
  region_key        TEXT NOT NULL,
  region_name       TEXT NOT NULL,
  country           TEXT,
  latitude          NUMERIC(8,4),
  longitude         NUMERIC(8,4),
  data_center_count INT NOT NULL DEFAULT 1,
  power_capacity_mw NUMERIC(8,2),
  tier              TEXT NOT NULL CHECK (tier IN ('tier1','tier2','edge')),
  PRIMARY KEY (env_id, region_key)
);
COMMENT ON TABLE dim_cloud_region IS
  'Vultr Cloud Intelligence OS: region / geographic master.';
ALTER TABLE dim_cloud_region ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_region ON dim_cloud_region
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Data center facility
CREATE TABLE IF NOT EXISTS dim_cloud_data_center (
  env_id              TEXT NOT NULL,
  business_id         UUID NOT NULL,
  dc_key              TEXT NOT NULL,
  region_key          TEXT NOT NULL,
  name                TEXT NOT NULL,
  rack_count          INT,
  commissioned_at     DATE,
  power_capacity_kw   NUMERIC(10,2),
  cooling_capacity_btu NUMERIC(14,2),
  PRIMARY KEY (env_id, dc_key),
  FOREIGN KEY (env_id, region_key) REFERENCES dim_cloud_region(env_id, region_key)
);
COMMENT ON TABLE dim_cloud_data_center IS
  'Vultr Cloud Intelligence OS: data center facility detail.';
ALTER TABLE dim_cloud_data_center ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_data_center ON dim_cloud_data_center
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Provisioned resource instance
CREATE TABLE IF NOT EXISTS dim_cloud_resource (
  env_id          TEXT NOT NULL,
  business_id     UUID NOT NULL,
  resource_key    TEXT NOT NULL,
  customer_id     TEXT NOT NULL,
  sku_key         TEXT NOT NULL,
  region_key      TEXT NOT NULL,
  provisioned_at  TIMESTAMPTZ NOT NULL,
  terminated_at   TIMESTAMPTZ,
  current_state   TEXT NOT NULL DEFAULT 'running' CHECK (current_state IN (
                    'running','stopped','terminated','suspended','provisioning'
                  )),
  PRIMARY KEY (env_id, resource_key)
);
COMMENT ON TABLE dim_cloud_resource IS
  'Vultr Cloud Intelligence OS: provisioned resource instance (VM, GPU, storage).';
ALTER TABLE dim_cloud_resource ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_resource ON dim_cloud_resource
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS dim_cloud_resource_env_customer_idx
  ON dim_cloud_resource (env_id, customer_id);

-- Salesforce-style sales rep master
CREATE TABLE IF NOT EXISTS dim_cloud_sales_rep (
  env_id      TEXT NOT NULL,
  business_id UUID NOT NULL,
  rep_key     TEXT NOT NULL,
  name        TEXT NOT NULL,
  team        TEXT,
  region      TEXT,
  quota_usd   NUMERIC(14,2),
  PRIMARY KEY (env_id, rep_key)
);
COMMENT ON TABLE dim_cloud_sales_rep IS
  'Vultr Cloud Intelligence OS: sales rep master (Salesforce-style).';
ALTER TABLE dim_cloud_sales_rep ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_sales_rep ON dim_cloud_sales_rep
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Marketing campaign master
CREATE TABLE IF NOT EXISTS dim_cloud_campaign (
  env_id       TEXT NOT NULL,
  business_id  UUID NOT NULL,
  campaign_key TEXT NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN (
                  'paid_search','content','devrel','conf','free_credit','partner','organic'
                )),
  name         TEXT NOT NULL,
  start_date   DATE,
  end_date     DATE,
  spend_usd    NUMERIC(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (env_id, campaign_key)
);
COMMENT ON TABLE dim_cloud_campaign IS
  'Vultr Cloud Intelligence OS: marketing campaign master.';
ALTER TABLE dim_cloud_campaign ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_campaign ON dim_cloud_campaign
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Customer contract / commitment
CREATE TABLE IF NOT EXISTS dim_cloud_contract (
  env_id              TEXT NOT NULL,
  business_id         UUID NOT NULL,
  contract_key        TEXT NOT NULL,
  customer_id         TEXT NOT NULL,
  contract_type       TEXT NOT NULL CHECK (contract_type IN (
                        'self_service','committed','reserved','enterprise'
                      )),
  committed_amount_usd NUMERIC(14,2),
  start_date          DATE NOT NULL,
  end_date            DATE,
  discount_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (env_id, contract_key)
);
COMMENT ON TABLE dim_cloud_contract IS
  'Vultr Cloud Intelligence OS: customer contract / commitment.';
ALTER TABLE dim_cloud_contract ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_contract ON dim_cloud_contract
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS dim_cloud_contract_env_customer_idx
  ON dim_cloud_contract (env_id, customer_id);

-- Invoice header
CREATE TABLE IF NOT EXISTS dim_cloud_invoice (
  env_id         TEXT NOT NULL,
  business_id    UUID NOT NULL,
  invoice_key    TEXT NOT NULL,
  customer_id    TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  status         TEXT NOT NULL CHECK (status IN (
                   'draft','issued','paid','overdue','void','disputed'
                 )),
  PRIMARY KEY (env_id, invoice_key)
);
COMMENT ON TABLE dim_cloud_invoice IS
  'Vultr Cloud Intelligence OS: invoice header.';
ALTER TABLE dim_cloud_invoice ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_invoice ON dim_cloud_invoice
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS dim_cloud_invoice_env_customer_period_idx
  ON dim_cloud_invoice (env_id, customer_id, period_start);

-- Support taxonomy
CREATE TABLE IF NOT EXISTS dim_cloud_support_category (
  env_id            TEXT NOT NULL,
  business_id       UUID NOT NULL,
  category_key      TEXT NOT NULL,
  category          TEXT NOT NULL,
  subcategory       TEXT,
  severity_default  TEXT NOT NULL DEFAULT 'normal' CHECK (severity_default IN (
                      'low','normal','high','urgent','critical'
                    )),
  PRIMARY KEY (env_id, category_key)
);
COMMENT ON TABLE dim_cloud_support_category IS
  'Vultr Cloud Intelligence OS: support ticket taxonomy.';
ALTER TABLE dim_cloud_support_category ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_dim_cloud_support_category ON dim_cloud_support_category
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FACT TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- Hourly resource usage
CREATE TABLE IF NOT EXISTS fact_cloud_resource_usage_hourly (
  env_id            TEXT NOT NULL,
  business_id       UUID NOT NULL,
  usage_id          UUID NOT NULL DEFAULT gen_random_uuid(),
  resource_key      TEXT NOT NULL,
  customer_id       TEXT NOT NULL,
  sku_key           TEXT NOT NULL,
  region_key        TEXT NOT NULL,
  usage_hour        TIMESTAMPTZ NOT NULL,
  usage_quantity    NUMERIC(14,4) NOT NULL,
  usage_unit        TEXT NOT NULL,
  source_system     TEXT NOT NULL DEFAULT 'platform_telemetry_demo',
  source_record_id  TEXT,
  source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (env_id, usage_id)
);
COMMENT ON TABLE fact_cloud_resource_usage_hourly IS
  'Vultr Cloud Intelligence OS: hourly resource usage fact (resource × hour grain).';
ALTER TABLE fact_cloud_resource_usage_hourly ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_resource_usage_hourly ON fact_cloud_resource_usage_hourly
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_resource_usage_hourly_env_customer_hour_idx
  ON fact_cloud_resource_usage_hourly (env_id, customer_id, usage_hour);
CREATE INDEX IF NOT EXISTS fact_cloud_resource_usage_hourly_env_region_hour_idx
  ON fact_cloud_resource_usage_hourly (env_id, region_key, usage_hour);

-- Rated billing line item
CREATE TABLE IF NOT EXISTS fact_cloud_billing_line_item (
  env_id              TEXT NOT NULL,
  business_id         UUID NOT NULL,
  line_id             UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id         TEXT NOT NULL,
  sku_key             TEXT NOT NULL,
  region_key          TEXT,
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  rated_amount_usd    NUMERIC(14,2) NOT NULL,
  quantity            NUMERIC(14,4) NOT NULL,
  unit_price_usd      NUMERIC(12,4) NOT NULL,
  discount_amount_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
  source_system       TEXT NOT NULL DEFAULT 'billing_engine_demo',
  source_record_id    TEXT,
  PRIMARY KEY (env_id, line_id)
);
COMMENT ON TABLE fact_cloud_billing_line_item IS
  'Vultr Cloud Intelligence OS: rated billing line items.';
ALTER TABLE fact_cloud_billing_line_item ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_billing_line_item ON fact_cloud_billing_line_item
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_billing_line_item_env_customer_period_idx
  ON fact_cloud_billing_line_item (env_id, customer_id, period_start);
CREATE INDEX IF NOT EXISTS fact_cloud_billing_line_item_env_region_period_idx
  ON fact_cloud_billing_line_item (env_id, region_key, period_start);

-- Invoice line (monthly)
CREATE TABLE IF NOT EXISTS fact_cloud_invoice (
  env_id             TEXT NOT NULL,
  business_id        UUID NOT NULL,
  invoice_line_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  invoice_key        TEXT NOT NULL,
  customer_id        TEXT NOT NULL,
  period_start       DATE NOT NULL,
  invoice_amount_usd NUMERIC(14,2) NOT NULL,
  tax_usd            NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'USD',
  issued_at          TIMESTAMPTZ NOT NULL,
  paid_at            TIMESTAMPTZ,
  status             TEXT NOT NULL,
  source_system      TEXT NOT NULL DEFAULT 'netsuite_demo',
  source_record_id   TEXT,
  PRIMARY KEY (env_id, invoice_line_id)
);
COMMENT ON TABLE fact_cloud_invoice IS
  'Vultr Cloud Intelligence OS: invoice line fact (monthly).';
ALTER TABLE fact_cloud_invoice ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_invoice ON fact_cloud_invoice
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_invoice_env_customer_period_idx
  ON fact_cloud_invoice (env_id, customer_id, period_start);

-- Payment fact
CREATE TABLE IF NOT EXISTS fact_cloud_payment (
  env_id        TEXT NOT NULL,
  business_id   UUID NOT NULL,
  payment_id    TEXT NOT NULL,
  invoice_key   TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  paid_at       TIMESTAMPTZ NOT NULL,
  amount_usd    NUMERIC(14,2) NOT NULL,
  method        TEXT NOT NULL CHECK (method IN (
                  'credit_card','wire','ach','check','crypto','credit_note'
                )),
  failed_reason TEXT,
  PRIMARY KEY (env_id, payment_id)
);
COMMENT ON TABLE fact_cloud_payment IS
  'Vultr Cloud Intelligence OS: payment events.';
ALTER TABLE fact_cloud_payment ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_payment ON fact_cloud_payment
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_payment_env_customer_paid_idx
  ON fact_cloud_payment (env_id, customer_id, paid_at);

-- NetSuite-style monthly revenue recognition
CREATE TABLE IF NOT EXISTS fact_cloud_revenue_recognition (
  env_id                  TEXT NOT NULL,
  business_id             UUID NOT NULL,
  recognition_id          UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id             TEXT NOT NULL,
  period_month            DATE NOT NULL,
  recognized_revenue_usd  NUMERIC(14,2) NOT NULL,
  deferred_revenue_usd    NUMERIC(14,2) NOT NULL DEFAULT 0,
  source_system           TEXT NOT NULL DEFAULT 'netsuite_demo',
  source_record_id        TEXT,
  posted_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (env_id, recognition_id)
);
COMMENT ON TABLE fact_cloud_revenue_recognition IS
  'Vultr Cloud Intelligence OS: NetSuite-style monthly revenue recognition.';
ALTER TABLE fact_cloud_revenue_recognition ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_revenue_recognition ON fact_cloud_revenue_recognition
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_revenue_recognition_env_customer_period_idx
  ON fact_cloud_revenue_recognition (env_id, customer_id, period_month);

-- Sales pipeline / opportunity snapshot
CREATE TABLE IF NOT EXISTS fact_cloud_sales_pipeline (
  env_id                  TEXT NOT NULL,
  business_id             UUID NOT NULL,
  opportunity_id          TEXT NOT NULL,
  customer_id             TEXT NOT NULL,
  rep_key                 TEXT NOT NULL,
  stage                   TEXT NOT NULL CHECK (stage IN (
                            'prospect','qualified','proposal','negotiation','closed_won','closed_lost'
                          )),
  amount_usd              NUMERIC(14,2) NOT NULL DEFAULT 0,
  close_probability       NUMERIC(5,2) NOT NULL DEFAULT 0,
  expected_close_date     DATE,
  committed_capacity_usd  NUMERIC(14,2),
  lost_reason             TEXT,
  snapshot_date           DATE NOT NULL,
  PRIMARY KEY (env_id, opportunity_id, snapshot_date)
);
COMMENT ON TABLE fact_cloud_sales_pipeline IS
  'Vultr Cloud Intelligence OS: sales opportunity snapshot (Salesforce-style).';
ALTER TABLE fact_cloud_sales_pipeline ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_sales_pipeline ON fact_cloud_sales_pipeline
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_sales_pipeline_env_customer_idx
  ON fact_cloud_sales_pipeline (env_id, customer_id, snapshot_date);

-- Customer × day snapshot
CREATE TABLE IF NOT EXISTS fact_cloud_customer_daily_snapshot (
  env_id                       TEXT NOT NULL,
  business_id                  UUID NOT NULL,
  customer_id                  TEXT NOT NULL,
  snapshot_date                DATE NOT NULL,
  daily_usage_revenue_usd      NUMERIC(14,2),
  daily_recognized_revenue_usd NUMERIC(14,2),
  outstanding_ar_usd           NUMERIC(14,2),
  support_tickets_open         INT NOT NULL DEFAULT 0,
  churn_risk_score             NUMERIC(5,2),
  null_reason                  TEXT,
  PRIMARY KEY (env_id, customer_id, snapshot_date)
);
COMMENT ON TABLE fact_cloud_customer_daily_snapshot IS
  'Vultr Cloud Intelligence OS: customer × day snapshot (rev, AR, support, risk).';
ALTER TABLE fact_cloud_customer_daily_snapshot ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_customer_daily_snapshot ON fact_cloud_customer_daily_snapshot
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Region × SKU × day capacity
CREATE TABLE IF NOT EXISTS fact_cloud_capacity_daily (
  env_id                  TEXT NOT NULL,
  business_id             UUID NOT NULL,
  region_key              TEXT NOT NULL,
  sku_key                 TEXT NOT NULL,
  capacity_date           DATE NOT NULL,
  available_units         NUMERIC(14,4) NOT NULL,
  utilized_units          NUMERIC(14,4) NOT NULL,
  reserved_units          NUMERIC(14,4) NOT NULL DEFAULT 0,
  oversubscription_ratio  NUMERIC(8,4),
  PRIMARY KEY (env_id, region_key, sku_key, capacity_date)
);
COMMENT ON TABLE fact_cloud_capacity_daily IS
  'Vultr Cloud Intelligence OS: region × SKU × day capacity fact.';
ALTER TABLE fact_cloud_capacity_daily ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_capacity_daily ON fact_cloud_capacity_daily
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_capacity_daily_env_region_date_idx
  ON fact_cloud_capacity_daily (env_id, region_key, capacity_date);

-- Region × GPU SKU × hour utilization (drives the GPU Command Graph)
CREATE TABLE IF NOT EXISTS fact_cloud_gpu_utilization (
  env_id                          TEXT NOT NULL,
  business_id                     UUID NOT NULL,
  region_key                      TEXT NOT NULL,
  sku_key                         TEXT NOT NULL,
  usage_hour                      TIMESTAMPTZ NOT NULL,
  available_gpu_hours             NUMERIC(14,4) NOT NULL,
  utilized_gpu_hours              NUMERIC(14,4) NOT NULL,
  reserved_gpu_hours              NUMERIC(14,4) NOT NULL DEFAULT 0,
  realized_price_per_hour_usd     NUMERIC(12,4),
  cost_per_hour_usd               NUMERIC(12,4),
  PRIMARY KEY (env_id, region_key, sku_key, usage_hour)
);
COMMENT ON TABLE fact_cloud_gpu_utilization IS
  'Vultr Cloud Intelligence OS: GPU utilization fact (region × GPU SKU × hour). Drives GPU Command Graph.';
ALTER TABLE fact_cloud_gpu_utilization ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_gpu_utilization ON fact_cloud_gpu_utilization
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_gpu_utilization_grid_idx
  ON fact_cloud_gpu_utilization (env_id, region_key, sku_key, usage_hour DESC);

-- Support ticket
CREATE TABLE IF NOT EXISTS fact_cloud_support_ticket (
  env_id                TEXT NOT NULL,
  business_id           UUID NOT NULL,
  ticket_id             TEXT NOT NULL,
  customer_id           TEXT NOT NULL,
  category_key          TEXT NOT NULL,
  opened_at             TIMESTAMPTZ NOT NULL,
  resolved_at           TIMESTAMPTZ,
  severity              TEXT NOT NULL,
  sla_breached          BOOLEAN NOT NULL DEFAULT FALSE,
  escalated             BOOLEAN NOT NULL DEFAULT FALSE,
  region_key            TEXT,
  sku_key               TEXT,
  customer_satisfaction NUMERIC(4,2),
  PRIMARY KEY (env_id, ticket_id)
);
COMMENT ON TABLE fact_cloud_support_ticket IS
  'Vultr Cloud Intelligence OS: support ticket fact.';
ALTER TABLE fact_cloud_support_ticket ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_support_ticket ON fact_cloud_support_ticket
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_support_ticket_env_customer_opened_idx
  ON fact_cloud_support_ticket (env_id, customer_id, opened_at);

-- Infra incident
CREATE TABLE IF NOT EXISTS fact_cloud_incident (
  env_id              TEXT NOT NULL,
  business_id         UUID NOT NULL,
  incident_id         TEXT NOT NULL,
  region_key          TEXT NOT NULL,
  sku_key             TEXT,
  started_at          TIMESTAMPTZ NOT NULL,
  resolved_at         TIMESTAMPTZ,
  severity            TEXT NOT NULL,
  customers_impacted  INT NOT NULL DEFAULT 0,
  root_cause          TEXT,
  PRIMARY KEY (env_id, incident_id)
);
COMMENT ON TABLE fact_cloud_incident IS
  'Vultr Cloud Intelligence OS: infrastructure incident fact.';
ALTER TABLE fact_cloud_incident ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_incident ON fact_cloud_incident
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_incident_env_region_started_idx
  ON fact_cloud_incident (env_id, region_key, started_at);

-- Marketing attribution (customer × campaign)
CREATE TABLE IF NOT EXISTS fact_cloud_marketing_attribution (
  env_id                  TEXT NOT NULL,
  business_id             UUID NOT NULL,
  attribution_id          UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id             TEXT NOT NULL,
  campaign_key            TEXT NOT NULL,
  first_touch_at          TIMESTAMPTZ,
  last_touch_at           TIMESTAMPTZ,
  signup_at               TIMESTAMPTZ,
  activation_at           TIMESTAMPTZ,
  attributed_revenue_usd  NUMERIC(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (env_id, attribution_id)
);
COMMENT ON TABLE fact_cloud_marketing_attribution IS
  'Vultr Cloud Intelligence OS: marketing attribution (customer × campaign).';
ALTER TABLE fact_cloud_marketing_attribution ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_marketing_attribution ON fact_cloud_marketing_attribution
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_marketing_attribution_env_customer_idx
  ON fact_cloud_marketing_attribution (env_id, customer_id);

-- Product activation (customer × product first-use)
CREATE TABLE IF NOT EXISTS fact_cloud_product_activation (
  env_id              TEXT NOT NULL,
  business_id         UUID NOT NULL,
  customer_id         TEXT NOT NULL,
  product_key         TEXT NOT NULL,
  first_deployed_at   TIMESTAMPTZ NOT NULL,
  days_to_activation  INT,
  PRIMARY KEY (env_id, customer_id, product_key)
);
COMMENT ON TABLE fact_cloud_product_activation IS
  'Vultr Cloud Intelligence OS: customer × product first-use activation.';
ALTER TABLE fact_cloud_product_activation ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_product_activation ON fact_cloud_product_activation
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reconciliation exception
CREATE TABLE IF NOT EXISTS fact_cloud_reconciliation_exception (
  env_id          TEXT NOT NULL,
  business_id     UUID NOT NULL,
  exception_id    TEXT NOT NULL,
  customer_id     TEXT NOT NULL,
  exception_type  TEXT NOT NULL CHECK (exception_type IN (
                    'usage_not_invoiced','invoice_no_usage','contract_mismatch',
                    'discount_mismatch','recognition_lag','cash_not_collected'
                  )),
  severity        TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  amount_usd      NUMERIC(14,2),
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  notes           TEXT,
  PRIMARY KEY (env_id, exception_id)
);
COMMENT ON TABLE fact_cloud_reconciliation_exception IS
  'Vultr Cloud Intelligence OS: reconciliation exception (6-stage bridge breaks).';
ALTER TABLE fact_cloud_reconciliation_exception ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_fact_cloud_reconciliation_exception ON fact_cloud_reconciliation_exception
    USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS fact_cloud_reconciliation_exception_env_customer_period_idx
  ON fact_cloud_reconciliation_exception (env_id, customer_id, period_start);

COMMIT;
