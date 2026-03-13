-- Assets with negative NOI variance (latest quarter)
-- Source: re_asset_variance_qtr
-- Expected columns: asset_name, actual_amount, plan_amount, variance_amount, variance_pct

SELECT a.name AS asset_name,
               v.actual_amount, v.plan_amount, v.variance_amount, v.variance_pct
        FROM re_asset_variance_qtr v
        JOIN repe_asset a ON a.asset_id = v.asset_id
        WHERE v.env_id = %s
          AND v.line_code = 'NOI'
          AND v.variance_amount < 0
          AND v.quarter = (
              SELECT MAX(quarter) FROM re_asset_variance_qtr WHERE env_id = %s
          )
        ORDER BY v.variance_amount ASC
