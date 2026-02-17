-- 244_fin_allocation_engine.sql
-- Structured deterministic allocation and waterfall engine tables.

CREATE TABLE IF NOT EXISTS fin_rule_book (
  fin_rule_book_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id      uuid NOT NULL REFERENCES business(business_id),
  partition_id     uuid NOT NULL REFERENCES fin_partition(partition_id),
  key              text NOT NULL,
  label            text NOT NULL,
  engine_kind      text NOT NULL,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, key)
);

CREATE TABLE IF NOT EXISTS fin_rule_version (
  fin_rule_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  partition_id        uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_rule_book_id    uuid NOT NULL REFERENCES fin_rule_book(fin_rule_book_id),
  version             int NOT NULL,
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'active', 'retired')),
  effective_from      date,
  checksum            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_rule_book_id, version)
);

CREATE TABLE IF NOT EXISTS fin_allocation_tier (
  fin_allocation_tier_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_rule_version_id    uuid NOT NULL REFERENCES fin_rule_version(fin_rule_version_id),
  tier_order             int NOT NULL,
  tier_type              text NOT NULL
                         CHECK (
                           tier_type IN (
                             'return_of_capital',
                             'preferred_return',
                             'catch_up',
                             'carry_split',
                             'fee',
                             'contingency',
                             'provider_comp',
                             'revenue_share',
                             'custom'
                           )
                         ),
  hurdle_rate            numeric(18,12),
  catchup_rate           numeric(18,12),
  split_method           text NOT NULL DEFAULT 'pro_rata',
  is_compounding         boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_rule_version_id, tier_order)
);

CREATE TABLE IF NOT EXISTS fin_allocation_tier_split (
  fin_allocation_tier_split_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                  uuid NOT NULL REFERENCES business(business_id),
  partition_id                 uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_allocation_tier_id       uuid NOT NULL REFERENCES fin_allocation_tier(fin_allocation_tier_id),
  fin_participant_id           uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  split_pct                    numeric(18,12) NOT NULL CHECK (split_pct >= 0 AND split_pct <= 1),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_allocation_tier_id, fin_participant_id)
);

CREATE TABLE IF NOT EXISTS fin_allocation_run (
  fin_allocation_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  partition_id          uuid NOT NULL REFERENCES fin_partition(partition_id),
  engine_kind           text NOT NULL,
  fin_rule_version_id   uuid REFERENCES fin_rule_version(fin_rule_version_id),
  dataset_version_id    uuid REFERENCES dataset_version(dataset_version_id),
  source_table          text NOT NULL,
  source_id             uuid NOT NULL,
  as_of_date            date NOT NULL,
  status                text NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'completed', 'failed')),
  deterministic_hash    text NOT NULL,
  fin_run_id            uuid,
  idempotency_key       text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  error_message         text,
  UNIQUE (tenant_id, business_id, partition_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS fin_allocation_line (
  fin_allocation_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_allocation_run_id  uuid NOT NULL REFERENCES fin_allocation_run(fin_allocation_run_id),
  fin_allocation_tier_id uuid REFERENCES fin_allocation_tier(fin_allocation_tier_id),
  line_number            int NOT NULL,
  fin_participant_id     uuid REFERENCES fin_participant(fin_participant_id),
  fin_entity_id          uuid REFERENCES fin_entity(fin_entity_id),
  allocation_label       text NOT NULL,
  amount                 numeric(28,12) NOT NULL,
  currency_code          text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_allocation_run_id, line_number)
);

CREATE TABLE IF NOT EXISTS fin_clawback_position (
  fin_clawback_position_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  partition_id             uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_participant_id       uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  fin_entity_id            uuid REFERENCES fin_entity(fin_entity_id),
  as_of_date               date NOT NULL,
  liability_amount         numeric(28,12) NOT NULL DEFAULT 0,
  settled_amount           numeric(28,12) NOT NULL DEFAULT 0,
  outstanding_amount       numeric(28,12) NOT NULL DEFAULT 0,
  fin_run_id               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    tenant_id,
    business_id,
    partition_id,
    fin_participant_id,
    fin_entity_id,
    as_of_date
  )
);

CREATE TABLE IF NOT EXISTS fin_promote_position (
  fin_promote_position_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id             uuid NOT NULL REFERENCES business(business_id),
  partition_id            uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_participant_id      uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  fin_entity_id           uuid REFERENCES fin_entity(fin_entity_id),
  as_of_date              date NOT NULL,
  promote_earned          numeric(28,12) NOT NULL DEFAULT 0,
  promote_paid            numeric(28,12) NOT NULL DEFAULT 0,
  promote_outstanding     numeric(28,12) NOT NULL DEFAULT 0,
  fin_run_id              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    tenant_id,
    business_id,
    partition_id,
    fin_participant_id,
    fin_entity_id,
    as_of_date
  )
);
