-- Fund KPIs: NAV, TVPI, DPI, IRR
-- Source: re_fund_quarter_state
-- Expected columns: quarter, portfolio_nav, tvpi, dpi, gross_irr, net_irr

SELECT quarter, portfolio_nav, tvpi, dpi, gross_irr, net_irr
        FROM re_fund_quarter_state
        WHERE fund_id = %s
        ORDER BY quarter DESC
        LIMIT 1
