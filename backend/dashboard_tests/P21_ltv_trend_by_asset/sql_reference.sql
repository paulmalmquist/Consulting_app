-- Weighted LTV and DSCR by quarter
-- Source: re_fund_quarter_state
-- Expected columns: quarter, weighted_ltv, weighted_dscr

SELECT quarter, weighted_ltv, weighted_dscr
        FROM re_fund_quarter_state
        WHERE fund_id = %s
        ORDER BY quarter
