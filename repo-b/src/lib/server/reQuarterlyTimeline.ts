import type { Pool } from "pg";

type Queryable = Pick<Pool, "query">;

export type QuarterlyTimelineRow = {
  quarter: string;
  // Fund state
  portfolio_nav: number;
  total_committed: number;
  total_called: number;
  total_distributed: number;
  // Returns
  gross_irr: number | null;
  net_irr: number | null;
  tvpi: number | null;
  dpi: number | null;
  rvpi: number | null;
  // Cash flows (period amounts)
  contributions: number;
  distributions: number;
  fees_and_expenses: number;
  // Gross-net bridge
  gross_return: number;
  mgmt_fees: number;
  fund_expenses: number;
  net_return: number;
};

export type QuarterlyTimeline = {
  fund_id: string;
  scenario_id: string | null;
  from_quarter: string;
  to_quarter: string;
  rows: QuarterlyTimelineRow[];
};

function toNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function computeQuarterlyTimeline({
  pool,
  fundId,
  fromQuarter,
  toQuarter,
  scenarioId,
}: {
  pool: Queryable;
  fundId: string;
  fromQuarter: string;
  toQuarter: string;
  scenarioId?: string | null;
}): Promise<QuarterlyTimeline> {
  const scenarioClause = scenarioId ? `AND scenario_id = $3::uuid` : "";
  const baseParams: unknown[] = scenarioId ? [fundId, fromQuarter, toQuarter, scenarioId] : [fundId, fromQuarter, toQuarter];
  const scenarioParamIdx = scenarioId ? "$4::uuid" : "";

  // 1. Fund quarter state
  const fundStateResult = await pool.query(
    `SELECT DISTINCT ON (quarter)
       quarter,
       portfolio_nav::float8,
       total_committed::float8,
       total_called::float8,
       total_distributed::float8,
       dpi::float8,
       rvpi::float8,
       tvpi::float8,
       gross_irr::float8,
       net_irr::float8
     FROM re_fund_quarter_state
     WHERE fund_id = $1::uuid
       AND quarter >= $2 AND quarter <= $3
       ${scenarioId ? `AND scenario_id = ${scenarioParamIdx}` : ""}
     ORDER BY quarter, created_at DESC`,
    baseParams
  );
  const fundStateByQtr = new Map(
    (fundStateResult.rows as Record<string, unknown>[]).map((r) => [r.quarter as string, r])
  );

  // 2. Fund metrics per quarter (gross/net bridge, etc.)
  const metricsResult = await pool.query(
    `SELECT DISTINCT ON (quarter)
       quarter,
       gross_irr::float8 AS metrics_gross_irr,
       net_irr::float8 AS metrics_net_irr,
       gross_tvpi::float8,
       net_tvpi::float8,
       dpi::float8 AS metrics_dpi,
       rvpi::float8 AS metrics_rvpi
     FROM re_fund_metrics_qtr
     WHERE fund_id = $1::uuid
       AND quarter >= $2 AND quarter <= $3
     ORDER BY quarter, created_at DESC`,
    [fundId, fromQuarter, toQuarter]
  );
  const metricsByQtr = new Map(
    (metricsResult.rows as Record<string, unknown>[]).map((r) => [r.quarter as string, r])
  );

  // 3. Capital ledger aggregation by quarter
  const capitalResult = await pool.query(
    `SELECT
       quarter,
       SUM(CASE WHEN entry_type = 'contribution' THEN amount ELSE 0 END)::float8 AS contributions,
       SUM(CASE WHEN entry_type = 'distribution' THEN amount ELSE 0 END)::float8 AS distributions
     FROM re_capital_ledger_entry
     WHERE fund_id = $1::uuid
       AND quarter >= $2 AND quarter <= $3
       AND entry_type IN ('contribution', 'distribution')
     GROUP BY quarter
     ORDER BY quarter`,
    [fundId, fromQuarter, toQuarter]
  );
  const capitalByQtr = new Map(
    (capitalResult.rows as Record<string, unknown>[]).map((r) => [r.quarter as string, r])
  );

  // 4. Gross-net bridge per quarter
  const bridgeResult = await pool.query(
    `SELECT DISTINCT ON (quarter)
       quarter,
       gross_return::float8,
       mgmt_fees::float8,
       fund_expenses::float8,
       net_return::float8
     FROM re_gross_net_bridge_qtr
     WHERE fund_id = $1::uuid
       AND quarter >= $2 AND quarter <= $3
     ORDER BY quarter, created_at DESC`,
    [fundId, fromQuarter, toQuarter]
  );
  const bridgeByQtr = new Map(
    (bridgeResult.rows as Record<string, unknown>[]).map((r) => [r.quarter as string, r])
  );

  // 5. Fee + expense aggregation by quarter
  const feeResult = await pool.query(
    `SELECT quarter, SUM(amount)::float8 AS total_fees
     FROM re_fee_accrual_qtr
     WHERE fund_id = $1::uuid AND quarter >= $2 AND quarter <= $3
     GROUP BY quarter`,
    [fundId, fromQuarter, toQuarter]
  );
  const feeByQtr = new Map(
    (feeResult.rows as Record<string, unknown>[]).map((r) => [r.quarter as string, r])
  );

  const expenseResult = await pool.query(
    `SELECT quarter, SUM(amount)::float8 AS total_expenses
     FROM re_fund_expense_qtr
     WHERE fund_id = $1::uuid AND quarter >= $2 AND quarter <= $3
     GROUP BY quarter`,
    [fundId, fromQuarter, toQuarter]
  );
  const expenseByQtr = new Map(
    (expenseResult.rows as Record<string, unknown>[]).map((r) => [r.quarter as string, r])
  );

  // Build a sorted set of all quarters
  const allQuarters = new Set<string>();
  for (const m of [fundStateByQtr, metricsByQtr, capitalByQtr, bridgeByQtr, feeByQtr, expenseByQtr]) {
    for (const k of m.keys()) allQuarters.add(k);
  }
  const sortedQuarters = [...allQuarters].sort();

  const rows: QuarterlyTimelineRow[] = sortedQuarters.map((qtr) => {
    const state = fundStateByQtr.get(qtr);
    const metrics = metricsByQtr.get(qtr);
    const capital = capitalByQtr.get(qtr);
    const bridge = bridgeByQtr.get(qtr);
    const fee = feeByQtr.get(qtr);
    const expense = expenseByQtr.get(qtr);

    return {
      quarter: qtr,
      portfolio_nav: toNumber(state?.portfolio_nav),
      total_committed: toNumber(state?.total_committed),
      total_called: toNumber(state?.total_called),
      total_distributed: toNumber(state?.total_distributed),
      gross_irr: state?.gross_irr != null ? toNumber(state.gross_irr) : (metrics?.metrics_gross_irr != null ? toNumber(metrics.metrics_gross_irr) : null),
      net_irr: state?.net_irr != null ? toNumber(state.net_irr) : (metrics?.metrics_net_irr != null ? toNumber(metrics.metrics_net_irr) : null),
      tvpi: state?.tvpi != null ? toNumber(state.tvpi) : null,
      dpi: state?.dpi != null ? toNumber(state.dpi) : (metrics?.metrics_dpi != null ? toNumber(metrics.metrics_dpi) : null),
      rvpi: state?.rvpi != null ? toNumber(state.rvpi) : (metrics?.metrics_rvpi != null ? toNumber(metrics.metrics_rvpi) : null),
      contributions: toNumber(capital?.contributions),
      distributions: toNumber(capital?.distributions),
      fees_and_expenses: toNumber(fee?.total_fees) + toNumber(expense?.total_expenses),
      gross_return: toNumber(bridge?.gross_return),
      mgmt_fees: toNumber(bridge?.mgmt_fees),
      fund_expenses: toNumber(bridge?.fund_expenses),
      net_return: toNumber(bridge?.net_return),
    };
  });

  return {
    fund_id: fundId,
    scenario_id: scenarioId ?? null,
    from_quarter: fromQuarter,
    to_quarter: toQuarter,
    rows,
  };
}
