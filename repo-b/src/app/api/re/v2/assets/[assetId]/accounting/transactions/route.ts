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
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500);
  const offset = parseInt(searchParams.get("offset") || "0", 10) || 0;

  try {
    const conditions: string[] = ["gl.asset_id = $1::uuid"];
    const values: (string | number)[] = [params.assetId];
    let idx = 2;

    if (quarter) {
      const range = quarterToDateRange(quarter);
      if (!range) {
        return Response.json(
          { error: "Invalid quarter format. Expected e.g. 2026Q1" },
          { status: 400 }
        );
      }
      conditions.push(`gl.period_month >= $${idx}::date`);
      values.push(range[0]);
      idx++;
      conditions.push(`gl.period_month <= $${idx}::date`);
      values.push(range[1]);
      idx++;
    }

    if (category) {
      conditions.push(`coa.category = $${idx}`);
      values.push(category);
      idx++;
    }

    const limitParam = `$${idx}`;
    values.push(limit);
    idx++;
    const offsetParam = `$${idx}`;
    values.push(offset);

    const whereClause = conditions.join(" AND ");

    const res = await pool.query(
      `SELECT
         gl.period_month,
         gl.gl_account,
         coa.name,
         coa.category,
         gl.amount,
         gl.source_id AS source
       FROM acct_gl_balance_monthly gl
       JOIN acct_chart_of_accounts coa ON coa.gl_account = gl.gl_account
       WHERE ${whereClause}
       ORDER BY gl.period_month DESC, gl.gl_account
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/assets/[assetId]/accounting/transactions] DB error", err);
    return Response.json([], { status: 200 });
  }
}
