-- Asset value by quarter
-- Source: re_asset_quarter_state
-- Expected columns: quarter, total_asset_value

SELECT quarter, SUM(asset_value) AS total_asset_value
        FROM re_asset_quarter_state
        WHERE env_id = %s
        GROUP BY quarter
        ORDER BY quarter
