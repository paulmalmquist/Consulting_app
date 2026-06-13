-- Q01 Why is TR-003 not launch ready?
SELECT vehicle_id, scenario_open_ncr_count, unresolved_anomaly_count,
       missing_inspection_signoff_count, readiness_score
FROM gold_vehicle_launch_readiness WHERE vehicle_id = 'VEH-TR-003';

-- Q02 Which serialized parts on TR-003 have open quality issues?
SELECT serial_id, part_id, open_ncr_count
FROM gold_serial_part_readiness
WHERE vehicle_id = 'VEH-TR-003' AND open_ncr_count > 0
ORDER BY open_ncr_count DESC, serial_id;

-- Q03 Which material lots are associated with the highest defect rate?
SELECT lot_id, supplier_name, serials_exposed, serials_with_ncr, defect_rate
FROM gold_supplier_material_risk
ORDER BY defect_rate DESC, serials_with_ncr DESC, lot_id LIMIT 10;

-- Q04 Which supplier has the highest cost of poor quality this quarter?
SELECT supplier_name, SUM(cost_of_poor_quality_usd) AS cost_of_poor_quality_usd
FROM gold_cost_of_poor_quality
GROUP BY supplier_name ORDER BY cost_of_poor_quality_usd DESC LIMIT 1;

-- Q05 Which work orders are stale or incorrectly closed?
SELECT wo_id, status, closed_with_open_ncr, dq_defect_tag
FROM gold_work_order_exceptions
WHERE closed_with_open_ncr = 1 OR dq_defect_tag = 'MES_STALE_72H'
ORDER BY wo_id;

-- Q06 Which operations used expired calibration equipment?
SELECT o.op_id, o.wo_id, o.machine_id, m.calibration_due_date
FROM raw_mes_operation_executions o
JOIN dim_machine m ON m.machine_id = o.machine_id
WHERE m.calibration_overdue = 1
ORDER BY o.op_id;

-- Q07 Which machine is most associated with weld-depth NCRs?
SELECT o.machine_id, COUNT(*) AS weld_depth_ncrs
FROM raw_qms_ncrs n
JOIN raw_mes_operation_executions o ON o.op_id = n.op_id
WHERE n.defect_code = 'weld_depth'
GROUP BY o.machine_id ORDER BY weld_depth_ncrs DESC, o.machine_id LIMIT 1;

-- Q08 Which test runs look similar to TEST-HOTFIRE-2026-00088?
SELECT run_id, nearest_match_run, anomaly_score
FROM gold_test_anomaly_review
WHERE run_id = 'TEST-HOTFIRE-2026-00088';

-- Q09 What changed between the last passing and failing test?
SELECT result, run_id, started_date, pattern, test_stand
FROM (
  SELECT result, run_id, started_date, pattern, test_stand
  FROM raw_test_runs WHERE result = 'pass'
  ORDER BY started_date DESC, run_id DESC LIMIT 1
)
UNION ALL
SELECT result, run_id, started_date, pattern, test_stand
FROM (
  SELECT result, run_id, started_date, pattern, test_stand
  FROM raw_test_runs WHERE result = 'fail'
  ORDER BY started_date DESC, run_id DESC LIMIT 1
);

-- Q10 Generate the morning factory handoff.
SELECT * FROM gold_daily_factory_report WHERE report_date = '2026-06-08';

-- Q11 Which AI recommendations were rejected by engineers?
SELECT * FROM v_rejected_ai_recommendations ORDER BY feedback_id LIMIT 25;

-- Q12 Which part revisions improved first-pass yield?
SELECT * FROM v_revision_first_pass_yield ORDER BY revision;
