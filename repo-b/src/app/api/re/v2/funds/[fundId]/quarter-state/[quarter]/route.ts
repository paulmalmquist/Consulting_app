import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { fundId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { detail: { error_code: "NOT_FOUND", message: "No state" } },
      { status: 404 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const scenarioId = searchParams.get("scenario_id");
    const versionId = searchParams.get("version_id");

    const res = await pool.query(
      `WITH ranked_state AS (
         SELECT
           s.id::text,
           s.fund_id::text,
           s.quarter,
           s.scenario_id::text,
           s.version_id::text,
           s.run_id::text,
           s.portfolio_nav,
           s.total_committed,
           s.total_called,
           s.total_distributed,
           s.dpi,
           s.rvpi,
           s.tvpi,
           s.gross_irr,
           s.net_irr,
           s.weighted_ltv,
           s.weighted_dscr,
           s.inputs_hash,
           s.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY s.fund_id, s.quarter
             ORDER BY
               CASE
                 WHEN $4::uuid IS NOT NULL AND s.version_id = $4::uuid THEN 0
                 WHEN s.version_id IS NULL THEN 1
                 ELSE 2
               END,
               s.created_at DESC
           ) AS version_rank
         FROM re_fund_quarter_state s
         WHERE s.fund_id = $1::uuid
           AND s.quarter = $2
           AND (
             ($3::uuid IS NULL AND s.scenario_id IS NULL)
             OR s.scenario_id = $3::uuid
           )
           AND (
             $4::uuid IS NULL
             OR s.version_id = $4::uuid
             OR s.version_id IS NULL
           )
       )
       SELECT
         id,
         fund_id,
         quarter,
         scenario_id,
         version_id,
         run_id,
         portfolio_nav,
         total_committed,
         total_called,
         total_distributed,
         dpi,
         rvpi,
         tvpi,
         gross_irr,
         net_irr,
         weighted_ltv,
         weighted_dscr,
         inputs_hash,
         created_at
       FROM ranked_state
       WHERE version_rank = 1
       ORDER BY created_at DESC
       LIMIT 1`,
      [params.fundId, params.quarter, scenarioId, versionId]
    );

    if (!res.rows[0]) {
      return Response.json(
        { detail: { error_code: "NOT_FOUND", message: "No state for this quarter" } },
        { status: 404 }
      );
    }

    return Response.json(res.rows[0]);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/quarter-state/[quarter]] DB error", err);
    return Response.json(
      { detail: { error_code: "NOT_FOUND", message: "No state" } },
      { status: 404 }
    );
  }
}
