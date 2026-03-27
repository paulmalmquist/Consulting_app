import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * Convert a quarter string like "2026Q1" to a start and end date.
 */
function quarterToDateRange(quarter: string): [string, string] | null {
  const match = quarter.match(/^(\d{4})Q([1-4])$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const q = parseInt(match[2], 10);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return [startDate, endDate];
}

const VALID_REPORT_TYPES = [
  "snapshot",
  "pnl",
  "trial_balance",
  "transactions",
  "occupancy",
  "audit",
] as const;

type ReportType = (typeof VALID_REPORT_TYPES)[number];

export async function POST(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "DB not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const { report_type, quarter, format } = body as {
    report_type?: string;
    quarter?: string;
    format?: string;
  };

  if (!report_type || !VALID_REPORT_TYPES.includes(report_type as ReportType)) {
    return Response.json(
      {
        error: `report_type required. Must be one of: ${VALID_REPORT_TYPES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const assetId = params.assetId;
  const reportQuarter = quarter || "2026Q1";
  const range = quarterToDateRange(reportQuarter);

  if (!range) {
    return Response.json(
      { error: "Invalid quarter format. Expected e.g. 2026Q1" },
      { status: 400 }
    );
  }

  const [startDate, endDate] = range;

  try {
    // Fetch asset header for all report types
    const assetRes = await pool.query(
      `SELECT
         a.asset_id::text,
         a.name,
         a.asset_type,
         COALESCE(a.asset_status, 'active') AS status,
         pa.property_type,
         pa.units,
         pa.market,
         pa.address,
         COALESCE(pa.square_feet, pa.gross_sf) AS square_feet,
         d.deal_id::text AS investment_id,
         d.name AS investment_name,
         d.fund_id::text,
         f.name AS fund_name
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       JOIN repe_fund f ON f.fund_id = d.fund_id
       LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
       WHERE a.asset_id = $1::uuid`,
      [assetId]
    );

    if (!assetRes.rows[0]) {
      return Response.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    const assetHeader = assetRes.rows[0];
    const reportPayload: Record<string, unknown> = {
      report_type,
      quarter: reportQuarter,
      format: format || "json",
      generated_at: new Date().toISOString(),
      asset: assetHeader,
    };

    // ------- Snapshot -------
    if (report_type === "snapshot") {
      const qsRes = await pool.query(
        `SELECT quarter, noi, revenue, opex, capex, occupancy, asset_value, nav,
                debt_balance, cash_balance, valuation_method
         FROM re_asset_quarter_state
         WHERE asset_id = $1::uuid AND scenario_id IS NULL
         ORDER BY quarter DESC LIMIT 1`,
        [assetId]
      );
      reportPayload.quarter_state = qsRes.rows[0] || null;
    }

    // ------- P&L -------
    if (report_type === "pnl") {
      const pnlRes = await pool.query(
        `SELECT line_code, SUM(amount) AS amount
         FROM acct_normalized_noi_monthly
         WHERE asset_id = $1::uuid
           AND period_month >= $2::date
           AND period_month <= $3::date
         GROUP BY line_code
         ORDER BY line_code`,
        [assetId, startDate, endDate]
      );
      reportPayload.pnl = pnlRes.rows;
    }

    // ------- Trial Balance -------
    if (report_type === "trial_balance") {
      const tbRes = await pool.query(
        `SELECT gl.gl_account AS account_code, coa.name AS account_name,
                coa.category, coa.is_balance_sheet, SUM(gl.amount) AS balance
         FROM acct_gl_balance_monthly gl
         JOIN acct_chart_of_accounts coa ON coa.gl_account = gl.gl_account
         WHERE gl.asset_id = $1::uuid
           AND gl.period_month >= $2::date
           AND gl.period_month <= $3::date
         GROUP BY gl.gl_account, coa.name, coa.category, coa.is_balance_sheet
         ORDER BY coa.category, gl.gl_account`,
        [assetId, startDate, endDate]
      );
      reportPayload.trial_balance = tbRes.rows;
    }

    // ------- Transactions -------
    if (report_type === "transactions") {
      const txRes = await pool.query(
        `SELECT gl.period_month, gl.gl_account, coa.name, coa.category,
                gl.amount, gl.source_id AS source
         FROM acct_gl_balance_monthly gl
         JOIN acct_chart_of_accounts coa ON coa.gl_account = gl.gl_account
         WHERE gl.asset_id = $1::uuid
           AND gl.period_month >= $2::date
           AND gl.period_month <= $3::date
         ORDER BY gl.period_month DESC, gl.gl_account
         LIMIT 500`,
        [assetId, startDate, endDate]
      );
      reportPayload.transactions = txRes.rows;
    }

    // ------- Occupancy -------
    if (report_type === "occupancy") {
      // Pull occupancy trend from quarter state
      const occRes = await pool.query(
        `SELECT quarter, occupancy, noi, revenue
         FROM re_asset_quarter_state
         WHERE asset_id = $1::uuid AND scenario_id IS NULL
         ORDER BY quarter ASC`,
        [assetId]
      );
      reportPayload.occupancy_trend = occRes.rows;

      // Also pull current property-level occupancy
      const propRes = await pool.query(
        `SELECT occupancy, current_noi, units
         FROM repe_property_asset
         WHERE asset_id = $1::uuid`,
        [assetId]
      );
      reportPayload.property_occupancy = propRes.rows[0] || null;
    }

    // ------- Audit -------
    if (report_type === "audit") {
      // Compile a comprehensive audit payload: quarter state + GL + NOI
      const qsRes = await pool.query(
        `SELECT quarter, noi, revenue, opex, capex, occupancy, asset_value, nav,
                debt_balance, cash_balance, inputs_hash, run_id::text, created_at
         FROM re_asset_quarter_state
         WHERE asset_id = $1::uuid AND scenario_id IS NULL
         ORDER BY quarter DESC`,
        [assetId]
      );
      reportPayload.quarter_states = qsRes.rows;

      const glRes = await pool.query(
        `SELECT gl.period_month, gl.gl_account, coa.name, coa.category,
                gl.amount, gl.source_id AS source
         FROM acct_gl_balance_monthly gl
         JOIN acct_chart_of_accounts coa ON coa.gl_account = gl.gl_account
         WHERE gl.asset_id = $1::uuid
           AND gl.period_month >= $2::date
           AND gl.period_month <= $3::date
         ORDER BY gl.period_month, gl.gl_account`,
        [assetId, startDate, endDate]
      );
      reportPayload.gl_entries = glRes.rows;

      const noiRes = await pool.query(
        `SELECT period_month, line_code, amount
         FROM acct_normalized_noi_monthly
         WHERE asset_id = $1::uuid
           AND period_month >= $2::date
           AND period_month <= $3::date
         ORDER BY period_month, line_code`,
        [assetId, startDate, endDate]
      );
      reportPayload.noi_entries = noiRes.rows;

      // Variance data if available
      const varRes = await pool.query(
        `SELECT quarter, line_code, actual_amount, plan_amount,
                variance_amount, variance_pct
         FROM re_asset_variance_qtr
         WHERE asset_id = $1::uuid AND quarter = $2
         ORDER BY line_code`,
        [assetId, reportQuarter]
      );
      reportPayload.variance = varRes.rows;
    }

    return Response.json(reportPayload);
  } catch (err) {
    console.error("[re/v2/assets/[assetId]/reports] DB error", err);
    return Response.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
