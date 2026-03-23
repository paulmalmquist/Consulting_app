-- Occupancy vs NOI per asset (latest quarter)
-- Source: re_asset_quarter_state
-- Expected columns: asset_name, occupancy, noi

SELECT a.name AS asset_name, aqs.occupancy, aqs.noi
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
          AND aqs.quarter = (
              SELECT MAX(quarter) FROM re_asset_quarter_state WHERE env_id = %s
          )
        ORDER BY a.name
