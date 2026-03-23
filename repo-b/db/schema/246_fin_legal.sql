-- 246_fin_legal.sql
-- Legal matter economics and trust accounting model.

CREATE TABLE IF NOT EXISTS fin_matter (
  fin_matter_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  matter_number          text NOT NULL,
  name                   text NOT NULL,
  fin_entity_id_client   uuid REFERENCES fin_entity(fin_entity_id),
  responsible_actor_id   uuid REFERENCES actor(actor_id),
  contingency_fee_rate   numeric(18,12),
  trust_required         boolean NOT NULL DEFAULT false,
  status                 text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'hold', 'closed')),
  opened_at              date NOT NULL,
  closed_at              date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, matter_number)
);

CREATE TABLE IF NOT EXISTS fin_time_capture (
  fin_time_capture_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_matter_id          uuid NOT NULL REFERENCES fin_matter(fin_matter_id),
  fin_participant_id     uuid REFERENCES fin_participant(fin_participant_id),
  entry_date             date NOT NULL,
  hours                  numeric(18,4) NOT NULL CHECK (hours >= 0),
  hourly_rate            numeric(28,12) NOT NULL DEFAULT 0,
  billed_amount          numeric(28,12) NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'posted', 'billed', 'written_off')),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_realization_event (
  fin_realization_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  partition_id             uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_matter_id            uuid NOT NULL REFERENCES fin_matter(fin_matter_id),
  event_date               date NOT NULL,
  billed_amount            numeric(28,12) NOT NULL DEFAULT 0,
  collected_amount         numeric(28,12) NOT NULL DEFAULT 0,
  writeoff_amount          numeric(28,12) NOT NULL DEFAULT 0,
  adjustment_amount        numeric(28,12) NOT NULL DEFAULT 0,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_contingency_case (
  fin_contingency_case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id             uuid NOT NULL REFERENCES business(business_id),
  partition_id            uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_matter_id           uuid NOT NULL REFERENCES fin_matter(fin_matter_id),
  as_of_date              date NOT NULL,
  settlement_amount       numeric(28,12) NOT NULL DEFAULT 0,
  expense_amount          numeric(28,12) NOT NULL DEFAULT 0,
  net_recovery            numeric(28,12) NOT NULL DEFAULT 0,
  client_share            numeric(28,12) NOT NULL DEFAULT 0,
  firm_fee                numeric(28,12) NOT NULL DEFAULT 0,
  status                  text NOT NULL DEFAULT 'modeled'
                          CHECK (status IN ('modeled', 'resolved', 'closed')),
  fin_allocation_run_id   uuid REFERENCES fin_allocation_run(fin_allocation_run_id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_trust_account (
  fin_trust_account_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_matter_id          uuid NOT NULL REFERENCES fin_matter(fin_matter_id),
  fin_entity_id          uuid REFERENCES fin_entity(fin_entity_id),
  account_number_masked  text,
  bank_name              text,
  currency_code          text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'closed', 'frozen')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, fin_matter_id)
);

CREATE TABLE IF NOT EXISTS fin_trust_transaction (
  fin_trust_transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  partition_id             uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_trust_account_id     uuid NOT NULL REFERENCES fin_trust_account(fin_trust_account_id),
  fin_matter_id            uuid NOT NULL REFERENCES fin_matter(fin_matter_id),
  txn_date                 date NOT NULL,
  txn_type                 text NOT NULL
                           CHECK (txn_type IN ('deposit', 'disbursement', 'transfer_in', 'transfer_out', 'adjustment')),
  direction                text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount                   numeric(28,12) NOT NULL CHECK (amount >= 0),
  memo                     text,
  fin_posting_batch_id     uuid REFERENCES fin_posting_batch(fin_posting_batch_id),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION fin_enforce_trust_matter_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_matter_id uuid;
BEGIN
  SELECT fin_matter_id INTO v_matter_id
  FROM fin_trust_account
  WHERE fin_trust_account_id = NEW.fin_trust_account_id;

  IF v_matter_id IS NULL THEN
    RAISE EXCEPTION 'Trust account % not found.', NEW.fin_trust_account_id;
  END IF;

  IF v_matter_id <> NEW.fin_matter_id THEN
    RAISE EXCEPTION 'Cross-matter trust transaction is prohibited.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_trust_matter_match ON fin_trust_transaction;
CREATE TRIGGER trg_fin_trust_matter_match
BEFORE INSERT OR UPDATE ON fin_trust_transaction
FOR EACH ROW
EXECUTE FUNCTION fin_enforce_trust_matter_match();

CREATE TABLE IF NOT EXISTS fin_redline_version (
  fin_redline_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_matter_id          uuid NOT NULL REFERENCES fin_matter(fin_matter_id),
  document_id            uuid,
  version_label          text NOT NULL,
  diff_summary           text,
  created_by             uuid REFERENCES actor(actor_id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, fin_matter_id, version_label)
);
