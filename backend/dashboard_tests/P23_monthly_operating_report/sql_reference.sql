-- NOI by quarter across all assets
-- Source: re_asset_quarter_state
-- Expected columns: quarter, total_noi

SELECT quarter, SUM(noi) AS total_noi
        FROM re_asset_quarter_state
        WHERE env_id = %s
        GROUP BY quarter
        ORDER BY quarter
