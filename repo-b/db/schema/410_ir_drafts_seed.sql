-- 410_ir_drafts_seed.sql
-- Seed demo IR drafts for the governance / IR review pages.

INSERT INTO re_ir_drafts
    (env_id, business_id, fund_id, quarter, draft_type, status, content_json, narrative_text, generated_by, created_at)
VALUES
    (
        'a1b2c3d4-0001-0001-0003-000000000001',
        'a1b2c3d4-0001-0001-0001-000000000001',
        'a1b2c3d4-0003-0030-0001-000000000001',
        '2026Q1',
        'lp_letter',
        'draft',
        '{"fund_name":"Irongate Fund VII","quarter":"2026Q1","fund_summary":{"nav":487000000,"gross_irr":0.162,"tvpi":1.34}}'::jsonb,
        E'Dear Irongate Fund VII Partners,\n\nWe are pleased to report continued strong performance in Q1 2026. The fund achieved a gross IRR of 16.2% and a TVPI of 1.34x, driven by NOI growth across the industrial portfolio and favorable cap rate compression in our Southeast multifamily assets.\n\nTop performers include Parkview Office (12% NOI above plan) and Harbor Industrial (occupancy reached 98%). We remain cautious on office repositioning timelines given macro uncertainty.\n\nCapital activity: $12.4M called for the Lakeview acquisition closing in April. Distributions of $8.2M were paid from the Harbor Industrial refinancing.\n\nWe look forward to discussing these results at the upcoming Advisory Committee meeting.\n\nSincerely,\nMeridian Capital Management',
        'winston',
        now() - interval '5 days'
    ),
    (
        'a1b2c3d4-0001-0001-0003-000000000001',
        'a1b2c3d4-0001-0001-0001-000000000001',
        'a1b2c3d4-0003-0030-0001-000000000001',
        '2025Q4',
        'lp_letter',
        'approved',
        '{"fund_name":"Irongate Fund VII","quarter":"2025Q4","fund_summary":{"nav":472000000,"gross_irr":0.158,"tvpi":1.31}}'::jsonb,
        E'Dear Irongate Fund VII Partners,\n\nQ4 2025 marked a strong close to the year with gross IRR at 15.8% and TVPI of 1.31x.\n\nSincerely,\nMeridian Capital Management',
        'winston',
        now() - interval '95 days'
    ),
    (
        'a1b2c3d4-0001-0001-0003-000000000001',
        'a1b2c3d4-0001-0001-0001-000000000001',
        'a1b2c3d4-0003-0030-0001-000000000001',
        '2026Q1',
        'capital_statement',
        'pending_review',
        '{"fund_name":"Irongate Fund VII","quarter":"2026Q1","lp_count":7}'::jsonb,
        NULL,
        'winston',
        now() - interval '3 days'
    )
ON CONFLICT DO NOTHING;
