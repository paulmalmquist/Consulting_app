-- Pipeline deals grouped by stage
-- Source: repe_deal
-- Expected columns: stage, deal_count, total_committed

SELECT stage, COUNT(*) AS deal_count,
               SUM(committed_capital) AS total_committed
        FROM repe_deal
        WHERE fund_id = %s
        GROUP BY stage
        ORDER BY deal_count DESC
