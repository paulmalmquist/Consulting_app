-- 249_fin_security_governance.sql
-- Finance security, ACL, and sensitive data governance.

CREATE TABLE IF NOT EXISTS fin_role (
  fin_role_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  key             text NOT NULL,
  label           text NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, key)
);

CREATE TABLE IF NOT EXISTS fin_permission (
  fin_permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key               text NOT NULL UNIQUE,
  label             text NOT NULL,
  description       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_role_permission (
  fin_role_id       uuid NOT NULL REFERENCES fin_role(fin_role_id) ON DELETE CASCADE,
  fin_permission_id uuid NOT NULL REFERENCES fin_permission(fin_permission_id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fin_role_id, fin_permission_id)
);

CREATE TABLE IF NOT EXISTS fin_data_classification (
  fin_data_classification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                uuid NOT NULL REFERENCES business(business_id),
  key                        text NOT NULL,
  label                      text NOT NULL,
  severity                   text NOT NULL DEFAULT 'restricted'
                             CHECK (severity IN ('internal', 'confidential', 'restricted', 'regulated')),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, key)
);

CREATE TABLE IF NOT EXISTS fin_entity_acl (
  fin_entity_acl_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id            uuid NOT NULL REFERENCES business(business_id),
  partition_id           uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_entity_id          uuid NOT NULL REFERENCES fin_entity(fin_entity_id),
  principal_type         text NOT NULL CHECK (principal_type IN ('actor', 'role')),
  actor_id               uuid REFERENCES actor(actor_id),
  fin_role_id            uuid REFERENCES fin_role(fin_role_id),
  fin_permission_id      uuid NOT NULL REFERENCES fin_permission(fin_permission_id),
  allow                  boolean NOT NULL DEFAULT true,
  effective_from         timestamptz NOT NULL DEFAULT now(),
  effective_to           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (principal_type = 'actor' AND actor_id IS NOT NULL AND fin_role_id IS NULL)
    OR
    (principal_type = 'role' AND fin_role_id IS NOT NULL AND actor_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS fin_field_acl (
  fin_field_acl_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                 uuid NOT NULL REFERENCES business(business_id),
  partition_id                uuid NOT NULL REFERENCES fin_partition(partition_id),
  table_name                  text NOT NULL,
  column_name                 text NOT NULL,
  fin_data_classification_id  uuid REFERENCES fin_data_classification(fin_data_classification_id),
  fin_role_id                 uuid REFERENCES fin_role(fin_role_id),
  allow_read                  boolean NOT NULL DEFAULT false,
  allow_write                 boolean NOT NULL DEFAULT false,
  masked                      boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, table_name, column_name, fin_role_id)
);

CREATE TABLE IF NOT EXISTS fin_download_audit (
  fin_download_audit_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                 uuid NOT NULL REFERENCES business(business_id),
  partition_id                uuid NOT NULL REFERENCES fin_partition(partition_id),
  actor_id                    uuid REFERENCES actor(actor_id),
  fin_entity_id               uuid REFERENCES fin_entity(fin_entity_id),
  document_id                 uuid,
  fin_data_classification_id  uuid REFERENCES fin_data_classification(fin_data_classification_id),
  purpose                     text,
  ip_address                  inet,
  user_agent                  text,
  downloaded_at               timestamptz NOT NULL DEFAULT now()
);
