-- 408_ai_decision_audit_seed.sql
-- Seed demo audit records so the governance dashboard shows data on first load.

INSERT INTO ai_decision_audit_log
    (business_id, env_id, actor, decision_type, tool_name, latency_ms, success, confidence, grounding_score, tags, created_at)
VALUES
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'finance.assemble_lp_report', 342, true, 0.9500, 0.9200, '{repe,finance,report}', now() - interval '14 days'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'finance.generate_gp_narrative', 1420, true, 0.9100, 0.8800, '{repe,finance,report}', now() - interval '14 days' + interval '2 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'response', NULL, 2100, true, NULL, 0.9000, '{}', now() - interval '14 days' + interval '5 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'classification', NULL, 45, true, 0.9200, NULL, '{}', now() - interval '10 days'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'finance.noi_variance', 280, true, 0.8800, 0.9500, '{repe,analysis}', now() - interval '10 days' + interval '1 second'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'finance.compare_waterfall_runs', 510, true, 0.8500, 0.9100, '{repe,analysis}', now() - interval '10 days' + interval '3 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'response', NULL, 1800, true, NULL, 0.9300, '{}', now() - interval '10 days' + interval '6 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'classification', NULL, 38, true, 0.7600, NULL, '{}', now() - interval '7 days'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'response', NULL, 950, true, NULL, 0.3200, '{}', now() - interval '7 days' + interval '2 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'repe.get_fund_metrics', 190, true, 0.9300, 0.9800, '{repe,finance}', now() - interval '5 days'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'repe.get_noi_trend', 220, true, 0.9000, 0.9500, '{repe,analysis}', now() - interval '5 days' + interval '1 second'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'repe.get_capital_activity', 175, true, 0.9200, 0.9600, '{repe,finance}', now() - interval '5 days' + interval '2 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'response', NULL, 2400, true, NULL, 0.9600, '{}', now() - interval '5 days' + interval '5 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'finance.assemble_lp_report', 380, true, 0.9400, 0.9100, '{repe,finance,report}', now() - interval '3 days'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'fast_path', NULL, 1320, true, 0.9000, 0.8500, '{}', now() - interval '3 days' + interval '3 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'repe.get_fund_metrics', 205, true, 0.9100, 0.9700, '{repe,finance}', now() - interval '1 day'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'finance.noi_variance', 310, true, 0.8700, 0.9400, '{repe,analysis}', now() - interval '1 day' + interval '1 second'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'finance.compare_waterfall_runs', 480, true, 0.8600, 0.8900, '{repe,analysis}', now() - interval '1 day' + interval '3 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'response', NULL, 2050, true, NULL, 0.9100, '{}', now() - interval '1 day' + interval '6 seconds'),
    ('a1b2c3d4-0001-0001-0001-000000000001', 'a1b2c3d4-0001-0001-0003-000000000001', 'winston', 'tool_call', 'repe.get_fund_metrics', 198, false, 0.9200, NULL, '{repe,finance}', now() - interval '12 hours')
ON CONFLICT DO NOTHING;
