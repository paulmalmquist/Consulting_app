import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { fundId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { detail: { error_code: "NOT_FOUND", message: "No metrics" } },
      { status: 404 }
    );
  }

  try {
    const res = await pool.query(
      `SELECT
         id::text,
         fund_id::text,
         quarter,
         scenario_id::text,
         run_id::text,
         contributed_to_date,
         distributed_to_date,
         nav,
         dpi,
         tvpi,
         irr,
         created_at
       FROM re_fund_quarter_metrics
       WHERE fund_id = $1::uuid
         AND quarter = $2
         AND scenario_id IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [params.fundId, params.quarter]
    );

    if (!res.rows[0]) {
      return Response.json(
        { detail: { error_code: "NOT_FOUND", message: "No metrics for this quarter" } },
        { status: 404 }
      );
    }

    return Response.json(res.rows[0]);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/metrics/[quarter]] DB error", err);
    return Response.json(
      { detail: { error_code: "NOT_FOUND", message: "No metrics" } },
      { status: 404 }
    );
  }
}
