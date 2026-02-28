import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * Convert a quarter string like "2026Q1" to a start and end date.
 * Returns [startDate, endDate] as ISO date strings.
 */
function quarterToDateRange(quarter: string): [string, string] | null {
  const match = quarter.match(/^(\d{4})Q([1-4])$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const q = parseInt(match[2], 10);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  // Last day of end month
  const lastDay = new Date(year, endMonth, 0).getDate();
  const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return [startDate, endDate];
}

export async function GET(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");

  if (!quarter) {
    return Response.json(
      { error: "quarter parameter required (e.g. 2026Q1)" },
      { status: 400 }
    );
  }

  const range = quarterToDateRange(quarter);
  if (!range) {
    return Response.json(
      { error: "Invalid quarter format. Expected e.g. 2026Q1" },
      { status: 400 }
    );
  }

  const [startDate, endDate] = range;

  try {
    const res = await pool.query(
      `SELECT
         gl.gl_account AS account_code,
         coa.name AS account_name,
         coa.category,
         coa.is_balance_sheet,
         SUM(gl.amount) AS balance
       FROM acct_gl_balance_monthly gl
       JOIN acct_chart_of_accounts coa ON coa.gl_account = gl.gl_account
       WHERE gl.asset_id = $1::uuid
         AND gl.period_month >= $2::date
         AND gl.period_month <= $3::date
       GROUP BY gl.gl_account, coa.name, coa.category, coa.is_balance_sheet
       ORDER BY coa.category, gl.gl_account`,
      [params.assetId, startDate, endDate]
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/assets/[assetId]/accounting/trial-balance] DB error", err);
    return Response.json([], { status: 200 });
  }
}
