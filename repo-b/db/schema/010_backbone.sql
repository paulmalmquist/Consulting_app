-- 010_backbone.sql
-- ALWAYS ON: Tenancy, identity, object system, data lineage.
-- All tenant-scoped tables carry tenant_id for RLS enforcement.

-- ═══════════════════════════════════════════════════════
-- TENANCY & IDENTITY
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant (
  tenant_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business (
  business_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  name        text NOT NULL,
  slug        text NOT NULL,
  region      text NOT NULL DEFAULT 'us',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS actor (
  actor_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  email       citext,
  display_name text,
  external_subject text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS role (
  role_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  key         text NOT NULL,
  label       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS actor_role (
  actor_id    uuid NOT NULL REFERENCES actor(actor_id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES role(role_id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES actor(actor_id),
  PRIMARY KEY (actor_id, role_id)
);

CREATE TABLE IF NOT EXISTS permission (
  permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,
  label         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permission (
  role_id       uuid NOT NULL REFERENCES role(role_id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permission(permission_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ═══════════════════════════════════════════════════════
-- OBJECT SYSTEM (append-only versioned entities)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS object_type (
  object_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text NOT NULL UNIQUE,
  label          text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS object (
  object_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id    uuid NOT NULL REFERENCES business(business_id),
  object_type_id uuid NOT NULL REFERENCES object_type(object_type_id),
  external_ref   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Append-only: rows are never updated or deleted by application code.
-- valid_to is set only via close_object_version() SECURITY DEFINER function.
CREATE TABLE IF NOT EXISTS object_version (
  object_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id         uuid NOT NULL REFERENCES object(object_id),
  version           int  NOT NULL,
  valid_from        timestamptz NOT NULL DEFAULT now(),
  valid_to          timestamptz,
  payload_hash      text,
  payload_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id          uuid REFERENCES actor(actor_id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, version)
);

-- Only one open (current) version per object at a time.
CREATE UNIQUE INDEX IF NOT EXISTS object_version_current_uidx
  ON object_version (object_id) WHERE valid_to IS NULL;

-- SECURITY DEFINER function to close old version and insert new one.
-- This is the ONLY path that sets valid_to; direct UPDATE is revoked.
CREATE OR REPLACE FUNCTION close_and_create_version(
  p_object_id     uuid,
  p_payload_json  jsonb,
  p_payload_hash  text DEFAULT NULL,
  p_actor_id      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_version int;
  v_new_version_id  uuid;
BEGIN
  -- Close the current open version
  UPDATE object_version
  SET valid_to = now()
  WHERE object_id = p_object_id AND valid_to IS NULL
  RETURNING version INTO v_current_version;

  -- Insert next version
  INSERT INTO object_version (
    object_id, version, valid_from, payload_hash, payload_json, actor_id
  ) VALUES (
    p_object_id,
    COALESCE(v_current_version, 0) + 1,
    now(),
    p_payload_hash,
    p_payload_json,
    p_actor_id
  ) RETURNING object_version_id INTO v_new_version_id;

  RETURN v_new_version_id;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- EVENT LOG (append-only audit/activity stream)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS event_log (
  event_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id uuid REFERENCES business(business_id),
  object_id   uuid REFERENCES object(object_id),
  actor_id    uuid REFERENCES actor(actor_id),
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- ATTACHMENTS & TAGS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS attachment (
  attachment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  object_id       uuid REFERENCES object(object_id),
  bucket          text NOT NULL,
  object_key      text NOT NULL,
  original_filename text,
  mime_type       text,
  size_bytes      bigint,
  content_hash    text,
  created_by      uuid REFERENCES actor(actor_id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tag (
  tag_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  key         text NOT NULL,
  label       text NOT NULL,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS object_tag (
  object_id   uuid NOT NULL REFERENCES object(object_id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES tag(tag_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_id, tag_id)
);

-- ═══════════════════════════════════════════════════════
-- DATA CONTRACTS & LINEAGE
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dataset (
  dataset_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  key         text NOT NULL,
  label       text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS dataset_version (
  dataset_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id         uuid NOT NULL REFERENCES dataset(dataset_id),
  version            int  NOT NULL,
  row_count          bigint,
  checksum           text,
  snapshot_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, version)
);

CREATE TABLE IF NOT EXISTS rule_set (
  rule_set_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(tenant_id),
  key         text NOT NULL,
  label       text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS rule_version (
  rule_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id     uuid NOT NULL REFERENCES rule_set(rule_set_id),
  version         int  NOT NULL,
  definition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  checksum        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_set_id, version)
);

CREATE TABLE IF NOT EXISTS run (
  run_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id        uuid REFERENCES business(business_id),
  dataset_version_id uuid REFERENCES dataset_version(dataset_version_id),
  rule_version_id    uuid REFERENCES rule_version(rule_version_id),
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','completed','failed','cancelled')),
  started_at         timestamptz,
  completed_at       timestamptz,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS run_output (
  run_output_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES run(run_id),
  output_key    text NOT NULL,
  output_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, output_key)
);
