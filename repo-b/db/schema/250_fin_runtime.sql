-- 250_fin_runtime.sql
-- Deterministic financial execution runtime metadata.

CREATE TABLE IF NOT EXISTS fin_run (
  fin_run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id         uuid NOT NULL REFERENCES business(business_id),
  partition_id        uuid NOT NULL REFERENCES fin_partition(partition_id),
  engine_kind         text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  idempotency_key     text NOT NULL,
  deterministic_hash  text NOT NULL,
  as_of_date          date NOT NULL,
  dataset_version_id  uuid REFERENCES dataset_version(dataset_version_id),
  fin_rule_version_id uuid REFERENCES fin_rule_version(fin_rule_version_id),
  input_ref_table     text,
  input_ref_id        uuid,
  started_at          timestamptz,
  completed_at        timestamptz,
  error_message       text,
  created_by          uuid REFERENCES actor(actor_id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS fin_run_result_ref (
  fin_run_result_ref_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fin_run_id            uuid NOT NULL REFERENCES fin_run(fin_run_id),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  partition_id          uuid NOT NULL REFERENCES fin_partition(partition_id),
  result_table          text NOT NULL,
  result_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fin_run_id, result_table, result_id)
);

CREATE TABLE IF NOT EXISTS fin_run_event (
  fin_run_event_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fin_run_id         uuid NOT NULL REFERENCES fin_run(fin_run_id),
  tenant_id          uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id        uuid NOT NULL REFERENCES business(business_id),
  partition_id       uuid NOT NULL REFERENCES fin_partition(partition_id),
  status             text NOT NULL,
  message            text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Backlink hooks for runtime IDs where tables already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_posting_batch' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_posting_batch ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_source_link' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_source_link ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_capital_event' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_capital_event ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_capital_rollforward' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_capital_rollforward ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_irr_result' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_irr_result ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_allocation_run' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_allocation_run ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_clawback_position' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_clawback_position ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_promote_position' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_promote_position ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_provider_comp_run' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_provider_comp_run ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_forecast_snapshot' AND column_name = 'fin_run_id'
  ) THEN
    ALTER TABLE fin_forecast_snapshot ADD COLUMN fin_run_id uuid REFERENCES fin_run(fin_run_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;
