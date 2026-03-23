-- 240_fin_partitioning.sql
-- Canonical finance partitioning and snapshot model.

CREATE TABLE IF NOT EXISTS fin_partition (
  partition_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id             uuid NOT NULL REFERENCES business(business_id),
  key                     text NOT NULL,
  partition_type          text NOT NULL
                          CHECK (partition_type IN ('live', 'scenario', 'snapshot')),
  base_partition_id       uuid REFERENCES fin_partition(partition_id),
  is_read_only            boolean NOT NULL DEFAULT false,
  status                  text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'archived')),
  created_by              uuid REFERENCES actor(actor_id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, key)
);

CREATE UNIQUE INDEX IF NOT EXISTS fin_partition_one_live_uidx
  ON fin_partition (tenant_id, business_id)
  WHERE partition_type = 'live' AND status = 'active';

CREATE TABLE IF NOT EXISTS fin_snapshot (
  snapshot_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id             uuid NOT NULL REFERENCES business(business_id),
  live_partition_id       uuid NOT NULL REFERENCES fin_partition(partition_id),
  snapshot_partition_id   uuid NOT NULL REFERENCES fin_partition(partition_id),
  snapshot_as_of          date NOT NULL,
  dataset_version_id      uuid REFERENCES dataset_version(dataset_version_id),
  rule_version_id         uuid REFERENCES rule_version(rule_version_id),
  created_by              uuid REFERENCES actor(actor_id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (live_partition_id, snapshot_partition_id)
);

CREATE TABLE IF NOT EXISTS fin_partition_clone_map (
  partition_clone_map_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id             uuid NOT NULL REFERENCES business(business_id),
  source_partition_id     uuid NOT NULL REFERENCES fin_partition(partition_id),
  target_partition_id     uuid NOT NULL REFERENCES fin_partition(partition_id),
  source_table            text NOT NULL,
  source_row_id           uuid NOT NULL,
  target_row_id           uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    source_partition_id,
    target_partition_id,
    source_table,
    source_row_id
  )
);
