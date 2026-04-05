-- 410_ir_drafts_seed.sql
-- Seed demo IR drafts for the governance / IR review pages.

DO $$
DECLARE
    v_env_id uuid := 'a1b2c3d4-0001-0001-0003-000000000001';
    v_business_id uuid := 'a1b2c3d4-0001-0001-0001-000000000001';
    v_fund_id uuid;
    v_fund_name text;
BEGIN
    SELECT fund_id, name
    INTO v_fund_id, v_fund_name
    FROM repe_fund
    WHERE business_id = v_business_id
      AND name IN ('Irongate Fund VII', 'Meridian Core-Plus Income')
    ORDER BY CASE
        WHEN name = 'Irongate Fund VII' THEN 0
        WHEN name = 'Meridian Core-Plus Income' THEN 1
        ELSE 2
    END,
    name
    LIMIT 1;

    IF v_fund_id IS NULL THEN
        SELECT fund_id, name
        INTO v_fund_id, v_fund_name
        FROM repe_fund
        WHERE business_id = v_business_id
        ORDER BY name
        LIMIT 1;
    END IF;

    IF v_fund_id IS NULL THEN
        RAISE NOTICE '410: No repe_fund found for business %, skipping IR draft seed', v_business_id;
        RETURN;
    END IF;

    INSERT INTO re_ir_drafts
        (env_id, business_id, fund_id, quarter, draft_type, status, content_json, narrative_text, generated_by, created_at)
    VALUES
        (
            v_env_id,
            v_business_id,
            v_fund_id,
            '2026Q1',
            'lp_letter',
            'draft',
            jsonb_build_object(
                'fund_name', v_fund_name,
                'quarter', '2026Q1',
                'fund_summary', jsonb_build_object('nav', 487000000, 'gross_irr', 0.162, 'tvpi', 1.34)
            ),
            format(
                $fmt$Dear %s Partners,

We are pleased to report continued strong performance in Q1 2026. The fund achieved a gross IRR of 16.2%% and a TVPI of 1.34x, driven by NOI growth across the industrial portfolio and favorable cap rate compression in our Southeast multifamily assets.

Top performers include Parkview Office (12%% NOI above plan) and Harbor Industrial (occupancy reached 98%%). We remain cautious on office repositioning timelines given macro uncertainty.

Capital activity: $12.4M called for the Lakeview acquisition closing in April. Distributions of $8.2M were paid from the Harbor Industrial refinancing.

We look forward to discussing these results at the upcoming Advisory Committee meeting.

Sincerely,
Meridian Capital Management$fmt$,
                v_fund_name
            ),
            'winston',
            now() - interval '5 days'
        ),
        (
            v_env_id,
            v_business_id,
            v_fund_id,
            '2025Q4',
            'lp_letter',
            'approved',
            jsonb_build_object(
                'fund_name', v_fund_name,
                'quarter', '2025Q4',
                'fund_summary', jsonb_build_object('nav', 472000000, 'gross_irr', 0.158, 'tvpi', 1.31)
            ),
            format(
                $fmt$Dear %s Partners,

Q4 2025 marked a strong close to the year with gross IRR at 15.8%% and TVPI of 1.31x.

Sincerely,
Meridian Capital Management$fmt$,
                v_fund_name
            ),
            'winston',
            now() - interval '95 days'
        ),
        (
            v_env_id,
            v_business_id,
            v_fund_id,
            '2026Q1',
            'capital_statement',
            'pending_review',
            jsonb_build_object(
                'fund_name', v_fund_name,
                'quarter', '2026Q1',
                'lp_count', 7
            ),
            NULL,
            'winston',
            now() - interval '3 days'
        )
    ON CONFLICT DO NOTHING;
END $$;
