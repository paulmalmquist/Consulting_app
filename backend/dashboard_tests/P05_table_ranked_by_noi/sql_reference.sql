-- Top N assets ranked by NOI (latest quarter)
-- Source: re_asset_quarter_state
-- Expected columns: asset_name, noi

SELECT a.name AS asset_name, aqs.noi
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
          AND aqs.quarter = (
              SELECT MAX(quarter) FROM re_asset_quarter_state WHERE env_id = %s
          )
        ORDER BY aqs.noi DESC
        LIMIT 10
