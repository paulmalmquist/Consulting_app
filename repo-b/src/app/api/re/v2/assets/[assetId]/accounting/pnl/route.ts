import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
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
         n.line_code,
         SUM(n.amount) AS amount
       FROM acct_normalized_noi_monthly n
       WHERE n.asset_id = $1::uuid
         AND n.period_month >= $2::date
         AND n.period_month <= $3::date
       GROUP BY n.line_code
       ORDER BY n.line_code`,
      [params.assetId, startDate, endDate]
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/assets/[assetId]/accounting/pnl] DB error", err);
    return Response.json([], { status: 200 });
  }
}
