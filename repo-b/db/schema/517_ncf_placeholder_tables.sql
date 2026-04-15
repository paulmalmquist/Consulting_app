-- 517_ncf_placeholder_tables.sql
-- NCF Reporting & Stewardship Model: placeholder structure only.
-- Establishes the reporting-lens dimension as a first-class column on every
-- fact table so downstream surfaces never have to infer a lens from context.
-- No seed rows; tables exist so UI scaffolds don't break when data is wired.

CREATE TABLE IF NOT EXISTS ncf_reporting_lens (
  lens_key     text PRIMARY KEY,
  label        text NOT NULL,
  description  text NOT NULL
);

COMMENT ON TABLE ncf_reporting_lens IS
  'Reference table for the three governed reporting lenses (financial, operational, impact). Every NCF fact table carries a lens FK so downstream callers never have to infer which lens a number is answering.';

INSERT INTO ncf_reporting_lens (lens_key, label, description) VALUES
  ('financial_reporting', 'Financial reporting', 'Audited consolidated view. Answers the question leadership asks in financial statements and board materials.'),
  ('operational_reporting', 'Operational reporting', 'Internal workflow truth. Answers the question operators ask when running stewardship, grants, and office performance.'),
  ('impact_reporting', 'Impact reporting', 'Externally communicated story. Answers the question donors, grantees, and the public hear about charitable outcomes.')
ON CONFLICT (lens_key) DO NOTHING;


CREATE TABLE IF NOT EXISTS ncf_donor (
  donor_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id       uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id  uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  donor_type   text NOT NULL,
  region       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ncf_donor IS
  'NCF donor record (individual, family, corporate, foundation). Confidential; visible only to stewardship and finance scopes.';

ALTER TABLE ncf_donor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncf_donor_env_isolation ON ncf_donor;
CREATE POLICY ncf_donor_env_isolation ON ncf_donor
  USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
  WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);


CREATE TABLE IF NOT EXISTS ncf_fund (
  fund_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id       uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id  uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  donor_id     uuid REFERENCES ncf_donor(donor_id) ON DELETE SET NULL,
  balance      numeric(18, 2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ncf_fund IS
  'NCF donor-advised fund. Balance reflects governed close-of-period value; lens-specific views derive from ncf_metric.';

ALTER TABLE ncf_fund ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncf_fund_env_isolation ON ncf_fund;
CREATE POLICY ncf_fund_env_isolation ON ncf_fund
  USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
  WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);


CREATE TABLE IF NOT EXISTS ncf_office (
  office_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id       uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id  uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  region       text NOT NULL,
  display_name text NOT NULL,
  activity_flag boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ncf_office IS
  'NCF local office as a rollup dimension. Local context is preserved; national rollups are derived from this table, never by flattening it.';

ALTER TABLE ncf_office ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncf_office_env_isolation ON ncf_office;
CREATE POLICY ncf_office_env_isolation ON ncf_office
  USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
  WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);


CREATE TABLE IF NOT EXISTS ncf_contribution (
  contribution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id          uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  donor_id        uuid REFERENCES ncf_donor(donor_id) ON DELETE SET NULL,
  fund_id         uuid REFERENCES ncf_fund(fund_id) ON DELETE SET NULL,
  office_id       uuid REFERENCES ncf_office(office_id) ON DELETE SET NULL,
  contributed_at  date NOT NULL,
  contribution_type text NOT NULL,
  value_amount    numeric(18, 2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'received',
  reporting_lens  text NOT NULL REFERENCES ncf_reporting_lens(lens_key),
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ncf_contribution IS
  'NCF contribution fact table. reporting_lens is first-class so the same underlying gift can surface under financial, operational, or impact lenses without ambiguity.';

ALTER TABLE ncf_contribution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncf_contribution_env_isolation ON ncf_contribution;
CREATE POLICY ncf_contribution_env_isolation ON ncf_contribution
  USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
  WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);


CREATE TABLE IF NOT EXISTS ncf_grant (
  grant_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id          uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  fund_id         uuid REFERENCES ncf_fund(fund_id) ON DELETE SET NULL,
  office_id       uuid REFERENCES ncf_office(office_id) ON DELETE SET NULL,
  charity_id      uuid,
  stage           text NOT NULL,
  recommended_at  date,
  approved_at     date,
  paid_at         date,
  value_amount    numeric(18, 2) NOT NULL DEFAULT 0,
  reporting_lens  text NOT NULL REFERENCES ncf_reporting_lens(lens_key),
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ncf_grant IS
  'NCF grant lifecycle fact table. Stage progression (recommended -> qualified -> approved -> paid) is preserved as discrete rows/updates so operational friction stays visible. reporting_lens lets the same grant surface under operational or financial views.';

ALTER TABLE ncf_grant ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncf_grant_env_isolation ON ncf_grant;
CREATE POLICY ncf_grant_env_isolation ON ncf_grant
  USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
  WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);


CREATE TABLE IF NOT EXISTS ncf_metric (
  metric_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id       uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  metric_key        text NOT NULL,
  value_numeric     numeric(24, 4),
  value_text        text,
  period_start      date,
  period_end        date,
  reporting_lens    text NOT NULL REFERENCES ncf_reporting_lens(lens_key),
  source_table      text NOT NULL,
  source_query_hash text,
  owner_role        text,
  lineage_notes     jsonb NOT NULL DEFAULT '[]'::jsonb,
  refreshed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, metric_key, reporting_lens, period_start, period_end)
);

COMMENT ON TABLE ncf_metric IS
  'NCF governed metric layer. Every KPI shown in the executive view resolves through this table. reporting_lens + source_table + source_query_hash + owner_role + lineage_notes travel with the value so provenance is intrinsic to the metric, not bolted on.';

ALTER TABLE ncf_metric ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncf_metric_env_isolation ON ncf_metric;
CREATE POLICY ncf_metric_env_isolation ON ncf_metric
  USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
  WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid);
