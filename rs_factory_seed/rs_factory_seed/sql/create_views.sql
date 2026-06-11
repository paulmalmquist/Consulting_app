CREATE VIEW IF NOT EXISTS v_revision_first_pass_yield AS
WITH operation_result AS (
  SELECT
    o.op_id,
    o.op_revision AS revision,
    MIN(CASE WHEN i.first_pass = 1 THEN 1 ELSE 0 END) AS first_pass
  FROM raw_mes_operation_executions o
  JOIN raw_qms_inspection_results i ON i.op_id = o.op_id
  WHERE o.scenario_id = 'SCN-004-REV-C-YIELD-IMPROVEMENT'
  GROUP BY o.op_id, o.op_revision
)
SELECT
  revision,
  SUM(first_pass) AS first_pass_operations,
  COUNT(*) AS completed_operations,
  ROUND(1.0 * SUM(first_pass) / COUNT(*), 2) AS first_pass_yield
FROM operation_result
GROUP BY revision;

CREATE VIEW IF NOT EXISTS v_aged_open_ncr_by_owner AS
SELECT owner_team, COUNT(*) AS aged_open_ncrs
FROM raw_qms_ncrs
WHERE status IN ('open', 'eng_review_open')
  AND julianday('2026-06-08') - julianday(opened_date) >= 21
GROUP BY owner_team;

CREATE VIEW IF NOT EXISTS v_rejected_ai_recommendations AS
SELECT
  f.feedback_id,
  f.prediction_id,
  p.model_key,
  p.scored_entity_type,
  p.scored_entity_id,
  p.decision_this_informs
FROM fact_human_feedback f
JOIN fact_ml_prediction p ON p.prediction_id = f.prediction_id
WHERE f.label = 'rejected';
