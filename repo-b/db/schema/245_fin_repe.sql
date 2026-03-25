-- 245_fin_repe.sql
-- Real Estate Private Equity (REPE) deterministic operating model.

CREATE TABLE IF NOT EXISTS fin_fund (
  fin_fund_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id        uuid NOT NULL REFERENCES business(business_id),
  partition_id       uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_entity_id      uuid REFERENCES fin_entity(fin_entity_id),
  fund_code          text NOT NULL,
  name               text NOT NULL,
  strategy           text NOT NULL,
  vintage_date       date,
  term_years         int,
  currency_code      text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  pref_rate          numeric(18,12) NOT NULL DEFAULT 0,
  pref_is_compound   boolean NOT NULL DEFAULT false,
  catchup_rate       numeric(18,12) NOT NULL DEFAULT 1,
  carry_rate         numeric(18,12) NOT NULL DEFAULT 0.2,
  waterfall_style    text NOT NULL DEFAULT 'european'
                     CHECK (waterfall_style IN ('american', 'european')),
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, fund_code)
);

CREATE TABLE IF NOT EXISTS fin_fund_vehicle (
  fin_fund_vehicle_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  partition_id        uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_fund_id         uuid NOT NULL REFERENCES fin_fund(fin_fund_id),
  fin_entity_id       uuid NOT NULL REFERENCES fin_entity(fin_entity_id),
  vehicle_role        text NOT NULL
                      CHECK (vehicle_role IN ('master_fund', 'spv', 'feeder', 'co_invest')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_fund_id, fin_entity_id, vehicle_role)
);

CREATE TABLE IF NOT EXISTS fin_asset_investment (
  fin_asset_investment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id             uuid NOT NULL REFERENCES business(business_id),
  partition_id            uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_fund_id             uuid NOT NULL REFERENCES fin_fund(fin_fund_id),
  fin_entity_id           uuid REFERENCES fin_entity(fin_entity_id),
  asset_name              text NOT NULL,
  acquisition_date        date,
  cost_basis              numeric(28,12) NOT NULL DEFAULT 0,
  current_valuation       numeric(28,12),
  exit_date               date,
  exit_proceeds           numeric(28,12),
  status                  text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('pipeline', 'active', 'exited', 'written_off')),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_commitment (
  fin_commitment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  partition_id        uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_fund_id         uuid NOT NULL REFERENCES fin_fund(fin_fund_id),
  fin_participant_id  uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  fin_entity_id       uuid REFERENCES fin_entity(fin_entity_id),
  commitment_role     text NOT NULL CHECK (commitment_role IN ('lp', 'gp', 'co_invest')),
  commitment_date     date NOT NULL,
  committed_amount    numeric(28,12) NOT NULL CHECK (committed_amount >= 0),
  currency_code       text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'closed', 'defaulted')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, fin_fund_id, fin_participant_id)
);

CREATE TABLE IF NOT EXISTS fin_capital_call (
  fin_capital_call_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  partition_id        uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_fund_id         uuid NOT NULL REFERENCES fin_fund(fin_fund_id),
  call_number         int NOT NULL,
  call_date           date NOT NULL,
  due_date            date,
  amount_requested    numeric(28,12) NOT NULL CHECK (amount_requested >= 0),
  purpose             text,
  status              text NOT NULL DEFAULT 'issued'
                      CHECK (status IN ('draft', 'issued', 'closed', 'cancelled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, fin_fund_id, call_number)
);

CREATE TABLE IF NOT EXISTS fin_contribution (
  fin_contribution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  partition_id        uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_fund_id         uuid NOT NULL REFERENCES fin_fund(fin_fund_id),
  fin_capital_call_id uuid REFERENCES fin_capital_call(fin_capital_call_id),
  fin_participant_id  uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  contribution_date   date NOT NULL,
  amount_contributed  numeric(28,12) NOT NULL CHECK (amount_contributed >= 0),
  status              text NOT NULL DEFAULT 'collected'
                      CHECK (status IN ('pending', 'collected', 'failed', 'waived')),
  source_payment_id   uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_distribution_event (
  fin_distribution_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id               uuid NOT NULL REFERENCES business(business_id),
  partition_id              uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_fund_id               uuid NOT NULL REFERENCES fin_fund(fin_fund_id),
  fin_asset_investment_id   uuid REFERENCES fin_asset_investment(fin_asset_investment_id),
  event_date                date NOT NULL,
  gross_proceeds            numeric(28,12) NOT NULL CHECK (gross_proceeds >= 0),
  net_distributable         numeric(28,12) NOT NULL CHECK (net_distributable >= 0),
  event_type                text NOT NULL
                            CHECK (event_type IN ('sale', 'partial_sale', 'refinance', 'operating_distribution', 'other')),
  reference                 text,
  status                    text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processed', 'cancelled')),
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_distribution_payout (
  fin_distribution_payout_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                uuid NOT NULL REFERENCES business(business_id),
  partition_id               uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_fund_id                uuid NOT NULL REFERENCES fin_fund(fin_fund_id),
  fin_distribution_event_id  uuid NOT NULL REFERENCES fin_distribution_event(fin_distribution_event_id),
  fin_participant_id         uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  payout_type                text NOT NULL
                             CHECK (
                               payout_type IN (
                                 'return_of_capital',
                                 'preferred_return',
                                 'catch_up',
                                 'carry',
                                 'fee',
                                 'clawback_settlement',
                                 'other'
                               )
                             ),
  amount                     numeric(28,12) NOT NULL,
  payout_date                date NOT NULL,
  currency_code              text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  fin_allocation_run_id      uuid REFERENCES fin_allocation_run(fin_allocation_run_id),
  created_at                 timestamptz NOT NULL DEFAULT now()
);
