import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/period-close?env_id=X&business_id=Y&fund_id=Z&quarter=2026Q1&status=completed
 *
 * Returns period close history with optional filters plus latest fund quarter
 * state for each fund.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = {
    runs: [] as Record<string, unknown>[],
    fund_states: [] as Record<string, unknown>[],
  };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const fundId = searchParams.get("fund_id");
  const quarter = searchParams.get("quarter");
  const status = searchParams.get("status");

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    // ── Close runs from re_run_provenance ───────────────────────────────
    const conditions: string[] = ["f.business_id = $1::uuid", "rp.run_type = 'QUARTER_CLOSE'"];
    const params: (string | null)[] = [businessId];
    let paramIndex = 2;

    if (fundId) {
      conditions.push(`rp.fund_id = $${paramIndex}::uuid`);
      params.push(fundId);
      paramIndex++;
    }
    if (quarter) {
      conditions.push(`rp.metadata_json->>'quarter' = $${paramIndex}`);
      params.push(quarter);
      paramIndex++;
    }
    if (status) {
      conditions.push(`rp.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const where = conditions.join(" AND ");

    const runsRes = await pool.query(
      `SELECT
         rp.id::text AS run_id,
         rp.fund_id::text,
         f.name AS fund_name,
         rp.metadata_json->>'quarter' AS quarter,
         rp.status,
         rp.triggered_by,
         rp.started_at::text,
         rp.completed_at::text,
         rp.error_message
       FROM re_run_provenance rp
       JOIN repe_fund f ON f.fund_id = rp.fund_id
       WHERE ${where}
       ORDER BY rp.started_at DESC`,
      params
    );

    // ── Latest fund quarter state per fund ──────────────────────────────
    const stateRes = await pool.query(
      `SELECT DISTINCT ON (fqs.fund_id)
         fqs.id::text,
         fqs.fund_id::text,
         f.name AS fund_name,
         fqs.quarter,
         fqs.portfolio_nav::text,
         fqs.total_committed::text,
         fqs.total_called::text,
         fqs.total_distributed::text,
         fqs.dpi::text,
         fqs.rvpi::text,
         fqs.tvpi::text,
         fqs.gross_irr::text,
         fqs.net_irr::text,
         fqs.created_at::text
       FROM re_fund_quarter_state fqs
       JOIN repe_fund f ON f.fund_id = fqs.fund_id
       WHERE f.business_id = $1::uuid AND fqs.scenario_id IS NULL
       ORDER BY fqs.fund_id, fqs.quarter DESC`,
      [businessId]
    );

    return Response.json({
      runs: runsRes.rows,
      fund_states: stateRes.rows,
    });
  } catch (err) {
    console.error("[re/v2/period-close] DB error", err);
    return Response.json(empty);
  }
}
