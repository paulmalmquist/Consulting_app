-- 243_fin_capital_accounts.sql
-- Deterministic capital account ledger and rollforward outputs.

CREATE TABLE IF NOT EXISTS fin_capital_account (
  fin_capital_account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_entity_id          uuid NOT NULL REFERENCES fin_entity(fin_entity_id),
  fin_participant_id     uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  currency_code          text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  status                 text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'closed')),
  opened_at              date NOT NULL,
  closed_at              date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    tenant_id,
    business_id,
    partition_id,
    fin_entity_id,
    fin_participant_id,
    currency_code
  )
);

CREATE TABLE IF NOT EXISTS fin_capital_event (
  fin_capital_event_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_capital_account_id uuid REFERENCES fin_capital_account(fin_capital_account_id),
  fin_entity_id          uuid NOT NULL REFERENCES fin_entity(fin_entity_id),
  fin_participant_id     uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  event_type             text NOT NULL
                         CHECK (
                           event_type IN (
                             'commitment',
                             'capital_call',
                             'contribution',
                             'distribution',
                             'fee',
                             'accrual',
                             'clawback'
                           )
                         ),
  event_date             date NOT NULL,
  amount                 numeric(28,12) NOT NULL CHECK (amount >= 0),
  direction              text NOT NULL CHECK (direction IN ('debit', 'credit')),
  source_table           text,
  source_id              uuid,
  fin_run_id             uuid,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_capital_rollforward (
  fin_capital_rollforward_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                uuid NOT NULL REFERENCES business(business_id),
  partition_id               uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_entity_id              uuid NOT NULL REFERENCES fin_entity(fin_entity_id),
  fin_participant_id         uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  as_of_date                 date NOT NULL,
  opening_balance            numeric(28,12) NOT NULL DEFAULT 0,
  contributions              numeric(28,12) NOT NULL DEFAULT 0,
  distributions              numeric(28,12) NOT NULL DEFAULT 0,
  fees                       numeric(28,12) NOT NULL DEFAULT 0,
  accruals                   numeric(28,12) NOT NULL DEFAULT 0,
  clawbacks                  numeric(28,12) NOT NULL DEFAULT 0,
  closing_balance            numeric(28,12) NOT NULL DEFAULT 0,
  fin_run_id                 uuid,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    tenant_id,
    business_id,
    partition_id,
    fin_entity_id,
    fin_participant_id,
    as_of_date
  )
);

CREATE TABLE IF NOT EXISTS fin_irr_result (
  fin_irr_result_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_entity_id          uuid REFERENCES fin_entity(fin_entity_id),
  fin_participant_id     uuid REFERENCES fin_participant(fin_participant_id),
  as_of_date             date NOT NULL,
  irr                    numeric(18,12),
  method                 text NOT NULL DEFAULT 'xirr_act_365f',
  cashflow_count         int NOT NULL DEFAULT 0,
  fin_run_id             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    tenant_id,
    business_id,
    partition_id,
    fin_entity_id,
    fin_participant_id,
    as_of_date,
    method
  )
);
