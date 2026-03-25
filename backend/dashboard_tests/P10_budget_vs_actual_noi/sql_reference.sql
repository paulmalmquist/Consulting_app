-- Actual vs plan NOI from variance table
-- Source: re_asset_variance_qtr
-- Expected columns: quarter, line_code, actual, plan, variance

SELECT quarter, line_code,
               SUM(actual_amount) AS actual,
               SUM(plan_amount) AS plan,
               SUM(variance_amount) AS variance
        FROM re_asset_variance_qtr
        WHERE env_id = %s AND line_code = 'NOI'
        GROUP BY quarter, line_code
        ORDER BY quarter
