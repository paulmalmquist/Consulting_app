-- NOI bridge: Revenue → Opex → NOI
-- Source: re_asset_quarter_state
-- Expected columns: egi, total_opex, noi

SELECT
            SUM(revenue) AS egi,
            SUM(opex) AS total_opex,
            SUM(noi) AS noi
        FROM re_asset_quarter_state
        WHERE env_id = %s
          AND quarter = (
              SELECT MAX(quarter) FROM re_asset_quarter_state WHERE env_id = %s
          )
