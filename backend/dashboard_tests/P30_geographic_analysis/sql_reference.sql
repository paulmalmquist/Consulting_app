-- NOI grouped by market
-- Source: re_asset_quarter_state
-- Expected columns: market, total_noi

SELECT pa.market, SUM(aqs.noi) AS total_noi
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
        WHERE aqs.env_id = %s
          AND aqs.quarter = (
              SELECT MAX(quarter) FROM re_asset_quarter_state WHERE env_id = %s
          )
        GROUP BY pa.market
        ORDER BY total_noi DESC
