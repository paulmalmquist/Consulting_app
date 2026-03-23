-- 990_views.sql
-- Convenience views for "current state" derived from append-only tables.
-- All views are deterministic and read-only.

-- ═══════════════════════════════════════════════════════
-- OBJECT SYSTEM: current version per object
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_object_current_version AS
SELECT
  o.object_id,
  o.tenant_id,
  o.business_id,
  ot.key AS object_type_key,
  ot.label AS object_type_label,
  o.external_ref,
  ov.object_version_id,
  ov.version,
  ov.valid_from,
  ov.payload_hash,
  ov.payload_json,
  ov.actor_id AS last_actor_id,
  ov.created_at AS version_created_at,
  o.created_at AS object_created_at
FROM object o
JOIN object_type ot ON ot.object_type_id = o.object_type_id
JOIN object_version ov ON ov.object_id = o.object_id AND ov.valid_to IS NULL;

-- ═══════════════════════════════════════════════════════
-- PROJECT: current state (if project data stored via object_version)
-- This view joins project table with its object's current version payload.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_project_current AS
SELECT
  p.project_id,
  p.tenant_id,
  p.business_id,
  p.code,
  p.name,
  p.description,
  p.status,
  p.start_date,
  p.target_end,
  p.actual_end,
  p.budget,
  p.currency_code,
  p.manager_id,
  p.object_id,
  ov.payload_json AS object_payload,
  ov.version AS object_version,
  p.created_at
FROM project p
LEFT JOIN object_version ov
  ON ov.object_id = p.object_id AND ov.valid_to IS NULL;

-- ═══════════════════════════════════════════════════════
-- PROPERTY: current state with object version
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_property_current AS
SELECT
  pr.property_id,
  pr.tenant_id,
  pr.business_id,
  pr.code,
  pr.name,
  pr.property_type,
  pr.address_line1,
  pr.city,
  pr.state_province,
  pr.postal_code,
  pr.country,
  pr.square_feet,
  pr.year_built,
  pr.status,
  pr.object_id,
  ov.payload_json AS object_payload,
  ov.version AS object_version,
  pr.created_at
FROM property pr
LEFT JOIN object_version ov
  ON ov.object_id = pr.object_id AND ov.valid_to IS NULL;

-- ═══════════════════════════════════════════════════════
-- LEASE: active leases with tenant party info
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_lease_active AS
SELECT
  l.lease_id,
  l.tenant_id,
  l.business_id,
  l.property_id,
  l.unit_id,
  l.tenant_party_id,
  tp.name AS tenant_party_name,
  l.lease_number,
  l.lease_type,
  l.start_date,
  l.end_date,
  l.monthly_rent,
  l.currency_code,
  l.status
FROM lease l
JOIN tenant_party tp ON tp.tenant_party_id = l.tenant_party_id
WHERE l.status = 'active';

-- ═══════════════════════════════════════════════════════
-- MILESTONE INSTANCE: with template info
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_milestone_instance_detail AS
SELECT
  mi.milestone_instance_id,
  mi.tenant_id,
  mi.business_id,
  mi.object_id,
  mi.name,
  mi.due_date,
  mi.status,
  mi.completed_at,
  mi.completed_by,
  mi.notes,
  mt.key AS template_key,
  mt.name AS template_name,
  mi.created_at
FROM milestone_instance mi
LEFT JOIN milestone_template mt
  ON mt.milestone_template_id = mi.milestone_template_id;

-- ═══════════════════════════════════════════════════════
-- RUN: latest runs with lineage info
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_run_detail AS
SELECT
  r.run_id,
  r.tenant_id,
  r.business_id,
  r.status,
  r.started_at,
  r.completed_at,
  r.error_message,
  dv.dataset_id,
  d.key AS dataset_key,
  dv.version AS dataset_version,
  rv.rule_set_id,
  rs.key AS rule_set_key,
  rv.version AS rule_version,
  r.created_at
FROM run r
LEFT JOIN dataset_version dv ON dv.dataset_version_id = r.dataset_version_id
LEFT JOIN dataset d ON d.dataset_id = dv.dataset_id
LEFT JOIN rule_version rv ON rv.rule_version_id = r.rule_version_id
LEFT JOIN rule_set rs ON rs.rule_set_id = rv.rule_set_id;
