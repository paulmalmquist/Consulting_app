-- 995_fin_views.sql
-- Convenience views for finance execution explainability and statements.

CREATE OR REPLACE VIEW v_fin_run_detail AS
SELECT
  r.fin_run_id,
  r.tenant_id,
  r.business_id,
  r.partition_id,
  p.key AS partition_key,
  p.partition_type,
  r.engine_kind,
  r.status,
  r.idempotency_key,
  r.deterministic_hash,
  r.as_of_date,
  r.dataset_version_id,
  r.fin_rule_version_id,
  r.input_ref_table,
  r.input_ref_id,
  r.started_at,
  r.completed_at,
  r.error_message,
  r.created_at
FROM fin_run r
JOIN fin_partition p ON p.partition_id = r.partition_id;

CREATE OR REPLACE VIEW v_fin_capital_rollforward_latest AS
SELECT DISTINCT ON (
  c.tenant_id,
  c.business_id,
  c.partition_id,
  c.fin_entity_id,
  c.fin_participant_id
)
  c.fin_capital_rollforward_id,
  c.tenant_id,
  c.business_id,
  c.partition_id,
  c.fin_entity_id,
  c.fin_participant_id,
  c.as_of_date,
  c.opening_balance,
  c.contributions,
  c.distributions,
  c.fees,
  c.accruals,
  c.clawbacks,
  c.closing_balance,
  c.fin_run_id,
  c.created_at
FROM fin_capital_rollforward c
ORDER BY
  c.tenant_id,
  c.business_id,
  c.partition_id,
  c.fin_entity_id,
  c.fin_participant_id,
  c.as_of_date DESC,
  c.created_at DESC;
