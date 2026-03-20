-- 404_cp_draw_audit_log.sql
-- Immutable append-only audit trail for all draw operations.
-- UPDATE and DELETE are prohibited by trigger.

CREATE TABLE IF NOT EXISTS cp_draw_audit_log (
  audit_id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                     uuid NOT NULL,
  business_id                uuid NOT NULL,
  project_id                 uuid NOT NULL,
  draw_request_id            uuid,
  invoice_id                 uuid,
  entity_type                text NOT NULL,
  entity_id                  uuid NOT NULL,
  action                     text NOT NULL,
  previous_state             jsonb,
  new_state                  jsonb,
  actor                      text NOT NULL,
  hitl_approval              boolean NOT NULL DEFAULT false,
  ip_address                 text,
  metadata_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

-- Enforce immutability: no UPDATE or DELETE allowed
CREATE OR REPLACE FUNCTION fn_cp_draw_audit_immutable()
  RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'cp_draw_audit_log is append-only: % operations are not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cp_draw_audit_no_update ON cp_draw_audit_log;
CREATE TRIGGER trg_cp_draw_audit_no_update
  BEFORE UPDATE ON cp_draw_audit_log FOR EACH ROW
  EXECUTE FUNCTION fn_cp_draw_audit_immutable();

DROP TRIGGER IF EXISTS trg_cp_draw_audit_no_delete ON cp_draw_audit_log;
CREATE TRIGGER trg_cp_draw_audit_no_delete
  BEFORE DELETE ON cp_draw_audit_log FOR EACH ROW
  EXECUTE FUNCTION fn_cp_draw_audit_immutable();
