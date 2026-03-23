-- 242_fin_accounting_core.sql
-- Deterministic unified accounting core for all finance engines.

CREATE TABLE IF NOT EXISTS fin_posting_batch (
  fin_posting_batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id          uuid NOT NULL REFERENCES business(business_id),
  partition_id         uuid NOT NULL REFERENCES fin_partition(partition_id),
  posting_date         date NOT NULL,
  source_type          text NOT NULL,
  source_id            uuid NOT NULL,
  idempotency_key      text NOT NULL,
  status               text NOT NULL DEFAULT 'posted'
                       CHECK (status IN ('pending', 'posted', 'failed', 'reversed')),
  created_by           uuid REFERENCES actor(actor_id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS fin_journal_entry (
  fin_journal_entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id          uuid NOT NULL REFERENCES business(business_id),
  partition_id         uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_posting_batch_id uuid NOT NULL REFERENCES fin_posting_batch(fin_posting_batch_id),
  entry_date           date NOT NULL,
  reference            text,
  memo                 text,
  status               text NOT NULL DEFAULT 'posted'
                       CHECK (status IN ('posted', 'reversed')),
  reversal_of_entry_id uuid REFERENCES fin_journal_entry(fin_journal_entry_id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_journal_line (
  fin_journal_line_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id          uuid NOT NULL REFERENCES business(business_id),
  partition_id         uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_journal_entry_id uuid NOT NULL REFERENCES fin_journal_entry(fin_journal_entry_id),
  line_number          int NOT NULL,
  gl_account_code      text NOT NULL,
  debit                numeric(28,12) NOT NULL DEFAULT 0,
  credit               numeric(28,12) NOT NULL DEFAULT 0,
  currency_code        text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  fin_entity_id        uuid REFERENCES fin_entity(fin_entity_id),
  fin_participant_id   uuid REFERENCES fin_participant(fin_participant_id),
  memo                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_journal_entry_id, line_number),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0)),
  CHECK (debit > 0 OR credit > 0)
);

CREATE TABLE IF NOT EXISTS fin_source_link (
  fin_source_link_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id          uuid NOT NULL REFERENCES business(business_id),
  partition_id         uuid NOT NULL REFERENCES fin_partition(partition_id),
  source_table         text NOT NULL,
  source_id            uuid NOT NULL,
  fin_journal_entry_id uuid NOT NULL REFERENCES fin_journal_entry(fin_journal_entry_id),
  fin_run_id           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, source_table, source_id, fin_journal_entry_id)
);

CREATE TABLE IF NOT EXISTS fin_reconciliation_run (
  fin_reconciliation_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id               uuid NOT NULL REFERENCES business(business_id),
  partition_id              uuid NOT NULL REFERENCES fin_partition(partition_id),
  period_start              date NOT NULL,
  period_end                date NOT NULL,
  status                    text NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'completed', 'failed')),
  difference                numeric(28,12) NOT NULL DEFAULT 0,
  created_by                uuid REFERENCES actor(actor_id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  completed_at              timestamptz
);

CREATE TABLE IF NOT EXISTS fin_period_close_lock (
  fin_period_close_lock_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id              uuid NOT NULL REFERENCES business(business_id),
  partition_id             uuid NOT NULL REFERENCES fin_partition(partition_id),
  period_year              int NOT NULL,
  period_month             int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status                   text NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'closing', 'closed')),
  locked_by                uuid REFERENCES actor(actor_id),
  locked_at                timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, period_year, period_month)
);

CREATE OR REPLACE FUNCTION fin_block_closed_period_journal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_year  int;
  v_month int;
  v_lock  text;
BEGIN
  v_year := EXTRACT(YEAR FROM NEW.entry_date)::int;
  v_month := EXTRACT(MONTH FROM NEW.entry_date)::int;

  SELECT status
  INTO v_lock
  FROM fin_period_close_lock
  WHERE tenant_id = NEW.tenant_id
    AND business_id = NEW.business_id
    AND partition_id = NEW.partition_id
    AND period_year = v_year
    AND period_month = v_month;

  IF COALESCE(v_lock, 'open') = 'closed' THEN
    RAISE EXCEPTION 'Cannot post to a closed period (%-%).', v_year, lpad(v_month::text, 2, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_block_closed_period_journal ON fin_journal_entry;
CREATE TRIGGER trg_fin_block_closed_period_journal
BEFORE INSERT ON fin_journal_entry
FOR EACH ROW
EXECUTE FUNCTION fin_block_closed_period_journal();

CREATE OR REPLACE FUNCTION fin_validate_journal_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id uuid;
  v_debit    numeric(28,12);
  v_credit   numeric(28,12);
BEGIN
  v_entry_id := COALESCE(NEW.fin_journal_entry_id, OLD.fin_journal_entry_id);

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO v_debit, v_credit
  FROM fin_journal_line
  WHERE fin_journal_entry_id = v_entry_id;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Journal entry % is unbalanced: debit=% credit=%', v_entry_id, v_debit, v_credit;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_validate_journal_balance ON fin_journal_line;
CREATE CONSTRAINT TRIGGER trg_fin_validate_journal_balance
AFTER INSERT OR UPDATE OR DELETE ON fin_journal_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fin_validate_journal_balance();

CREATE OR REPLACE FUNCTION fin_prevent_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fin_journal_entry is append-only. Use reversal entries.';
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_prevent_entry_update ON fin_journal_entry;
CREATE TRIGGER trg_fin_prevent_entry_update
BEFORE UPDATE OR DELETE ON fin_journal_entry
FOR EACH ROW
EXECUTE FUNCTION fin_prevent_entry_mutation();

CREATE OR REPLACE FUNCTION fin_prevent_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fin_journal_line is append-only. Use reversal entries.';
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_prevent_line_update ON fin_journal_line;
CREATE TRIGGER trg_fin_prevent_line_update
BEFORE UPDATE OR DELETE ON fin_journal_line
FOR EACH ROW
EXECUTE FUNCTION fin_prevent_line_mutation();
