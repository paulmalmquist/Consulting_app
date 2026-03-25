-- DSCR by asset by quarter
-- Source: re_asset_quarter_state
-- Expected columns: quarter, asset_name, dscr

SELECT aqs.quarter, a.name AS asset_name, aqs.dscr
        FROM re_asset_quarter_state aqs
        JOIN repe_asset a ON a.asset_id = aqs.asset_id
        WHERE aqs.env_id = %s
        ORDER BY aqs.quarter, a.name
